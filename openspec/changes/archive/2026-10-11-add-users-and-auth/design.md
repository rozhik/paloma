# Design

## Context

See proposal.md (Why) and the delta specs for required behavior. These parts of the current code shape the approach:

- **Server**: one Express app (`server/src/index.ts`) with `cors()` open to every origin and all routes in `server/src/routes/index.ts`, about 50 of them. Routes call service functions in `server/src/services/*Api.ts` that query SQLite through drizzle (`db/query.ts` async helpers). There is no request context. Services read the whole library.
- **Library data**: `folders`/`photos` hold the scanned folders. Albums are keyed by token (`folder_albums`, `album_photos`) and mirrored in folder sidecar files. Stars, captions, keywords, edits, locations and people are written to sidecars, so they are shared state by nature.
- **Images**: thumbnails, previews, originals, face crops and avatars are served from `/api/...` URLs that `<img>` tags load. Two routes are keyed by file hash, not photo id (`/cache/thumbnail/:fileHash`, `/cache/preview/:fileHash`).
- **Export and movies**: they write under `config.exportDir`, guarded by `resolveInside()` from `services/outputPaths.ts`.
- **Plugins**: `server/src/plugins/` discovers, switches and loads plugins (`registry.ts`). `activate(host)` returns `PluginContributions` (only `filters` today). Unknown contribution keys are ignored with a warning, and on/off state is kept in the data directory.
- **Client**: no URL routing. The current view is in the Zustand store and the navigation comes from `shell/navigation.ts`. Control visibility comes from `CONTROL_LEVELS` / `useAllows()` in `client/src/levels/controls.ts`. In dev, Vite proxies `/api` to the server (same origin), and `api/http.ts` wraps `fetch`.
- **Child PIN / levels**: client-only and per browser. This change leaves them as they are.

## Goals / Non-Goals

**Goals:**
- With auth off, behavior is byte-for-byte the same as today: one code path with a synthetic "everything" principal, no forks in services.
- One place decides who the caller is (middleware), one table decides what each route needs (permission map), and one helper turns a user's library access into a SQL condition that every query uses.
- Credential checks live in plugins. Users, sessions, roles, permissions, ACL and quotas live in core.
- No new npm dependencies.

**Non-Goals:**
- OAuth/OIDC and other redirect-based login. The provider contract reserves room for them, but `redirect` providers are rejected in this version.
- Upload and an upload quota. The quota model is generic, so it can be added later.
- Per-user stars, albums, edits or people. They stay shared, because they live in sidecars.
- Public share links, partner sharing, audit log, 2FA, e-mail (invitations, password reset by mail).
- Per-user UI settings or a per-user cap on the complexity level. UI settings and the Child PIN stay per browser.
- TLS termination. Use a reverse proxy. Cookies get `Secure` when the request is HTTPS.

## Decisions

### 1. Principal on every request; synthetic principal when auth is off
An `authenticate` middleware runs before the router and sets `res.locals.principal`:
`{ user, permissions: Set<Permission>, access: 'all' | { folderPaths, albumTokens }, via: 'off' | 'session' | 'token', sessionId?, tokenId? }`.
With `PALOMA_AUTH=off`, it sets a constant principal with every permission and `access: 'all'`. Services always receive a principal or scope. *Alternative*: skip the middleware when auth is off. Rejected, because it would add `if (authOn)` branches to every service and leave the off path untested.

Resolution order when auth is on: (1) `Authorization: Bearer …` goes to the enabled `bearer` providers in plugin order; (2) the `paloma_session` cookie goes to the core session store. If neither applies, only the public auth endpoints are allowed and everything else gets 401. Each request reloads the user and role (one indexed lookup each, cached per request), so role changes, disabling and revocation take effect at the next request without any session invalidation logic.

### 2. A guard on every route, enforced by a test
Every route starts with `need(requirement, { sessionOnly? })` from `server/src/auth/middleware.ts`, where the requirement is a `Permission`, `'authenticated'` or `'public'`. `routes/guards.test.ts` walks `router.stack` and fails for any route without exactly one guard as its first handler. It also pins the public routes and the routes that are closed to tokens. *Alternative (planned first)*: a separate `METHOD path` → permission table. Dropped during implementation because the table would duplicate every path, while the test already prevents a forgotten route from staying open.

Mapping (summary): all `GET` library/image/geo/people/memories/stats/tags/plugins routes need `library.view`. Star, caption/keywords, edits, location and preview render need `photos.edit`. `/albums` writes need `albums.manage`. People/faces writes and detection need `people.manage`. `/export` and `/creation/movie` need `export`. `PATCH /plugins/:id` needs `plugins.manage`. `/admin/*` needs `users.manage`. `/auth/tokens` writes need `account.tokens` plus `via === 'session'`. `/auth/password` and `/auth/sessions` need `via === 'session'`.

### 3. Library ACL as one SQL condition
`authenticate()` runs the rest of each request inside the caller's access, kept in `AsyncLocalStorage` (`runWithAccess`). Code outside a request, such as the scanner, thumbnails and startup, sees the whole library. `server/src/auth/scope.ts` exports `visiblePhotoCondition(access = currentAccess())`. It returns `undefined` for `'all'`, and otherwise a drizzle `sql` fragment:
`photos.folder_id IN (SELECT id FROM folders WHERE path = ? OR path LIKE ? || '/%' …) OR photos.id IN (SELECT photo_id FROM album_photos WHERE album_token IN (…))`.
Grants are stored by **folder path** and **album token**, not numeric ids, because rescans can recreate folder and photo ids. The condition is applied at the shared choke points instead of a new parameter on every service: `photoFilters()` (lists, statistics, map, places), `getApiPhoto()` (single photos, info, images, face crops), `loadPhotos()` (batch changes, albums), and directly in the other queries: `photoApi.listPhotos/listFolders`, `photoStats`, `tagApi.listTags`, `memories`, `geoApi` points/places, `peopleApi` lists/person/faces, `faceDetectionApi`, `albumApi.listAlbums` (album photo counts and covers over visible photos only), `photoInfo`, `libraryImages`/`renderApi`/`faceImages`. Single-photo lookups return 404 when the photo is not visible. Hash-keyed cache routes check that some visible photo has that hash.

The folder tree for limited users: granted folders, plus ancestors returned as path-only nodes with zero own photos. Album writes require the album token in `albumTokens`, or `access === 'all'`. Creating an album adds its token to the creator's grants in the same transaction.

*Alternative*: filter in JavaScript after the query. Rejected because counts, pagination and statistics would be wrong, and it is slow on 100k photos.

### 4. Auth providers are a new plugin contribution (API version stays 1)
`api.ts` gains:
```ts
interface CredentialsProvider { id; label: LocalizedText; kind: 'credentials';
  fields: { name; label: LocalizedText; type: 'text' | 'password' }[];
  login(input: Record<string,string>, ctx: AuthContext): Promise<{ userId: string } | null>;
  setSecret?(userId: string, secret: string, ctx: AuthContext): Promise<void>; }   // password change/reset
interface BearerProvider { id; label; kind: 'bearer';
  authenticate(credential: string, ctx: AuthContext): Promise<{ userId: string; tokenId?: string; scopes?: Permission[] } | null>; }
PluginContributions.authProviders?: (CredentialsProvider | BearerProvider)[]
```
`AuthContext` (passed as the last argument of every provider call) offers `findUserByUsername`, a per-provider **identity store** (`getIdentity/setIdentity(userId, data)`, persisted in `user_identities` and namespaced by provider id), `verifyApiToken(value)`, and `hashSecret/verifySecret` (scrypt) so plugins don't roll their own crypto. The `{ userId }` a provider returns is always re-checked by core: the user must exist and be enabled. Adding a contribution key is backward compatible (older Paloma ignored it with a warning), so `PLUGIN_API_VERSION` stays 1. `checkContributions` validates the new shape. Provider id conflicts follow the filter-name rule (bundled first, then folder-name order).

*Alternative*: bake password and token auth into core and add plugins only for OAuth later. Rejected because the user explicitly wants authorization through plugins, and doing it now proves the contract with two real providers.

### 5. Bundled `auth-password` and `auth-token` plugins
- `plugins/auth-password`: `credentials` provider `password` with fields `username`/`password`. It keeps an scrypt hash in its identity record (`scrypt$N$r$p$salt$hash`, N=2^15, 16-byte salt, compared with `timingSafeEqual`). For unknown users it verifies against a dummy hash to keep timing the same. It implements `setSecret` for change/reset, and core enforces the 8-character minimum before calling it.
- `plugins/auth-token`: `bearer` provider `token`. It accepts only `pal_…` values and delegates to `ctx.verifyApiToken`. Token rows, creation, listing and revocation are **core** (`api_tokens` table, `/api/auth/tokens`, `/api/admin/tokens`), because administrators must see and revoke tokens even while the plugin is off, and the spec keeps tokens when the plugin is switched off.
- Both have level `normal` and no filters. The plugins state file already handles "bundled → on by default".
- Guard in `switchPlugin`: when auth is on, refuse turning off a plugin if the remaining active plugins contribute no `credentials` provider (409 `last_login_provider`).

### 6. Sessions
A random 32-byte id goes base64url in the cookie `paloma_session` (`HttpOnly; SameSite=Strict; Path=/; Secure` when `req.secure`). The DB stores `sha256(id)`, user id, created/last-used time, user-agent and IP. Idle lifetime comes from `PALOMA_SESSION_DAYS` (default 30). `last_used` is written at most once a minute per session to avoid a write on every image request. Expired rows are pruned on startup and hourly. `SameSite=Strict` plus the restricted CORS origin is the CSRF defense. `express.json()` already ignores non-JSON bodies, and state-changing routes read only JSON bodies. *Alternative*: JWT. Rejected because instant revocation and disabling would need a lookup anyway.

### 7. First-administrator setup code
When auth is on and the users table is empty, the server generates a random 10-character code at startup, logs it (`🔑 Setup code: …`) and keeps it only in memory. `POST /api/auth/setup` checks the code with a constant-time comparison and creates the admin inside a transaction that re-checks that no users exist. This prevents someone else on the network from claiming the instance before its owner. *Alternative*: allow setup only from localhost. Rejected because it breaks headless NAS installs behind a reverse proxy.

### 8. Roles and permissions storage
Permissions are a TypeScript union and constant list in `shared/types.ts`. Built-in roles are code constants (`admin`, `editor`, `viewer`) and are never stored. Custom roles go in `roles(id, name, description)` + `role_permissions(role_id, permission)`. `users.role_id` references either. Unknown permission strings in the DB, left over from a downgrade, are ignored. The "last administrator" check counts enabled users whose role resolves to `users.manage` and runs in the same transaction as the change.

### 9. Rate limiting and login throttling in memory
A fixed one-minute window counter keyed `user:<id>` for sessions and `token:<id>` for tokens. The limit is the user's `requests_per_minute` quota or `PALOMA_RATE_LIMIT` (default 600, and `0` means unlimited). It skips image routes (thumbnail, preview, raw, cache, face, avatar, plugin icon). Login throttling uses a map from lowercase username to failure timestamps. Both reset on restart, which is acceptable for a home server. *Alternative*: persist the counters in SQLite. Rejected because of the write load.

### 10. Export quota by measuring the user's folder
When auth is on, the export root is `resolveInside(config.exportDir, username)`, and the destination is resolved inside that. Usage is the sum of file sizes under the user's folder, walked asynchronously at the start of each export or movie. Each export file is rendered to a buffer first, checked against the remaining space, then written, so the export stops exactly before the file that would cross the limit (spec: Export space quota). Movies are written by ffmpeg to a temp name in the user's folder. If the result crosses the limit, the file is deleted and the request gets 409 `quota_exceeded`. Quotas are stored as `user_quotas(user_id, kind, limit)` with kinds `export_bytes` and `requests_per_minute`. An upload kind can be added later without a schema change. Usernames cannot be changed, so a user's export folder never moves.

### 11. Client
- `client/src/auth/`: an `authStore` (status and `me`), `AuthGate` that renders `SetupPage` / `LoginPage` / `ForcePasswordPage` / the app, and an `api/auth.ts`. `api/http.ts` reports 401 from non-auth endpoints to the store, which shows the login page but keeps `currentView`, so the user returns to the same view (spec: Session ends while the map is open).
- Permissions in the UI: a `CONTROL_PERMISSIONS: Partial<Record<ControlId, Permission>>` table next to `CONTROL_LEVELS`. `useAllows(id)` becomes `levelAllows && permissionAllows`, and `navItemsFor`/`useTray`/`useSidebarSections` already go through it, so every skin follows. A test asserts that every control that changes data has a permission entry.
- New `AppView` value `admin` (level `normal`, permission `users.manage`), with the view in `client/src/admin/`: `UsersSection` (with `AccessEditor` reusing `useFolderTree` and the album list, and `QuotaEditor`), `RolesSection`, `SessionsTokensSection` and `AuthProvidersSection`.
- `settings/AccountSection` (profile, password, sessions, tokens, quota usage, Log out) placed third in Settings.
- New strings and error codes go in every locale file (`client/src/i18n/locales/*.json`, 11 languages).

### 12. Database
New tables are created with `CREATE TABLE IF NOT EXISTS` in a new `createAuthTables()` in `db/columns.ts`, called from `openDatabase()`. The tables are `users`, `roles`, `role_permissions`, `user_access(user_id, kind 'folder'|'album', value)`, `user_identities(provider_id, user_id, data)`, `sessions`, `api_tokens(id, user_id, name, hash, permissions, created_at, last_used_at, expires_at)` and `user_quotas`. Matching drizzle definitions go in `schema.ts`. User ids are random UUIDs.

### Files in the user's photo folders
**None are read or written by this change.** Sidecar reads and writes (stars, captions, edits, albums, people) are unchanged and do not record which user made them. The new data lives in the SQLite database in `PALOMA_DATA_DIR`. Export and movie output goes to `PALOMA_EXPORT_DIR/<username>/…` when auth is on, and to `PALOMA_EXPORT_DIR/…` as today when it is off. Plugin folders stay read-only.

### MVP code: reused / rewritten / dropped
- **Reused as-is**: plugin discovery, manifest and state; `asyncRoute`, `apiError`, `resolveInside`, `db/query.ts` helpers; `uiSettings` and the Child PIN; `useFolderTree` (in the access editor).
- **Extended**: `plugins/api.ts`, `contributions.ts` and `registry.ts` (auth providers, `PluginHost.auth`, the last-provider guard); `pluginApi.switchPlugin`; every list/lookup service (scope parameter); `levels/controls.ts` (permission table); `shell/navigation.ts` (admin view); `api/http.ts` (401 handling); the Settings view (Account section).
- **Rewritten**: `server/src/index.ts` (CORS by mode, auth middleware, rate limiter, setup code at startup); `/export` and `/creation/movie` handlers (per-user root, quota-aware writing).
- **Dropped**: nothing.

### 13. User menu, Account, Admin and Server settings views
- Settings (`SettingsView`) keeps only browser settings: language, level, appearance and viewer bars.
- `shell/UserMenu.tsx`, a React Bootstrap dropdown, is rendered by every skin at the end of its navigation. It shows the user's initials, or a person icon with users off. Its items come from `useUserMenuItems()`, the same way `useNavigationItems()` feeds the views, so every skin offers the same items.
- `account`, `admin` and `server` are `AppView`s with control levels and permissions (`view.account` Easy, `view.admin` / `view.server` Normal with `users.manage` / `plugins.manage`), but they are not in `NAV_ITEMS`. `App` already falls back to the library when a view is not allowed.
- `AccountView` holds what was the Account section. `ServerSettingsView` holds a Server section from `GET /api/server/info` (`plugins.manage`; values from `config`, with the version from the root `package.json`) and the existing `PluginsList`.
- Pages shown instead of the app (setup, login, new password) scroll on their own (`vh-100 overflow-auto`, with the card centered by `m-auto`), because the app shell keeps `body` from scrolling.

### 14. Linked person and avatars
- `users` gets `person_id` (a contact id, with a unique index where not null) and `avatar_version`. For existing databases, `createAuthTables()` adds the columns with `ALTER TABLE`. A person is valid when a `persons` row or a face on a photo has that contact id. `deletePerson` clears the link.
- An avatar arrives as the raw request body (`PUT /api/auth/avatar`, `Content-Type: image/jpeg|png|webp`, at most 10 MB through `express.raw`). sharp rotates it by its EXIF orientation, crops it to a centered square and resizes it to 256 px WebP at `PALOMA_DATA_DIR/avatars/<user id>.webp`. `avatar_version` (a hash of the result) goes into the URL `GET /api/users/:id/avatar?v=…`, which any logged-in user may load. `DELETE /api/auth/avatar` removes your own avatar, and `DELETE /api/admin/users/:id/avatar` removes anyone's.
- `MeResponse.user` and `UserInfo` get `personId`, `personName` and `avatarUrl`. For the current user, `avatarUrl` is the uploaded avatar, else `/api/people/:id/avatar?v=…` when the person is visible to them (checked within the request's access), else null, so the client shows initials. `GET /api/people/:id` gets `user` (display name and username) when auth is on.
- My photos uses `setSelectedPerson(personId)` and goes to the library, at the level of `people.choose` (Easy).

## Risks / Trade-offs

- [A query path misses the scope condition and leaks photos to limited users] → The condition lives in the shared helpers that almost every query goes through. `routes/access.test.ts` logs in as limited users and checks every list, statistic, image route, album, person and map endpoint against a fixture library. A new query on `photos` must use `visiblePhotoCondition()` or one of the helpers. (During implementation this caught the export and movie routes, which loaded photos by id without the check.)
- [External auth plugins can impersonate any user] → They are off until an administrator switches them on, the Plugins section already warns about full access, and core re-checks that the returned user exists and is enabled.
- [Last login provider fails to load and nobody can log in] → The server logs it loudly. Recovery: set `PALOMA_AUTH=off`, restart, fix the plugin, and set it back. This is documented in `docs/`.
- [Forgotten admin password] → Same recovery: auth off, set a new password via a documented CLI script (`npm --prefix server run reset-password <username>`).
- [In-memory throttles reset on restart] → Accepted for a home server. The limits are defense in depth, not the only protection.
- [Measuring the export folder on every export is slow for huge folders] → It is only walked at export or movie start, never per request. If needed, cache it per user and invalidate it on write.
- [A new user who reuses a deleted user's username inherits their export folder] → Documented. The Users section's delete confirmation says the export folder stays on disk.
- [Shared sidecar state means a limited user's edits are seen by everyone] → This is the chosen model (spec: Folder files stay shared). Permission `photos.edit` is the control.
- [Same-browser multi-user: UI settings and the Child PIN are per browser, not per user] → A deliberate non-goal for now. Logging out does not clear UI settings.

## Migration Plan

1. Deploy with the default `PALOMA_AUTH=off`. The new tables are created empty and nothing else changes. Existing API clients keep working.
2. To enable: set `PALOMA_AUTH=on` and `PALOMA_CLIENT_ORIGIN` (when the client is not served through the same origin) in `.env`, restart, take the setup code from the log, and create the admin in the browser.
3. Existing exports in the root of `PALOMA_EXPORT_DIR` belong to no user and don't count against quotas. Administrators can move them into a user's folder.
4. Rollback: set `PALOMA_AUTH=off` and restart. Auth tables stay unused. Downgrading to an older build ignores them.

## Open Questions

- Exact default for `PALOMA_RATE_LIMIT` (600/min assumed). Tune after measuring the client's request pattern on a large library.
- Whether the user list should show the request-rate usage live. The spec requires only export usage, and this can be added later.
