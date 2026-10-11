# Tasks

## 1. Shared types, config and database

- [x] 1.1 Add `Permission` (union + ordered constant list), `BuiltInRoleId`, `UserInfo`, `RoleInfo`, `LibraryAccess`, `QuotaInfo`, `SessionInfo`, `ApiTokenInfo`, `AuthStatus`, `MeResponse` and `AuthProviderInfo` to `shared/types.ts`; verify `npm run build` type-checks
- [x] 1.2 Add `PALOMA_AUTH` (off|on, invalid value stops startup), `PALOMA_CLIENT_ORIGIN`, `PALOMA_SESSION_DAYS` (default 30) and `PALOMA_RATE_LIMIT` (default 600, 0 = unlimited) to `server/src/config.ts` and `.env.example`; verify with cases in `config.test.ts` (defaults, invalid `PALOMA_AUTH` throws with the allowed values)
- [x] 1.3 Add `createAuthTables()` in `server/src/db/columns.ts` (users, roles, role_permissions, user_access, user_identities, sessions, api_tokens, user_quotas), call it from `openDatabase()` and add the drizzle definitions to `schema.ts`; verify with a test that opening an existing pre-change database creates the tables and keeps photo data

## 2. Core auth: users, roles, principal

- [x] 2.1 Implement `server/src/auth/roles.ts`: built-in roles as constants, custom role CRUD, permission resolution that ignores unknown stored permissions, built-in roles refused with 409, deleting a role in use refused with 409 naming the user count; verify with `roles.test.ts`
- [x] 2.2 Implement `server/src/auth/users.ts`: create, change, disable/enable, delete (sessions + tokens removed, export folder kept), username rules (3–32, allowed chars, case-insensitive unique), `mustChangePassword` flag, and the "at least one enabled administrator" and "not yourself" guards inside transactions; verify with `users.test.ts` covering every scenario of the `users` spec
- [x] 2.3 Implement `server/src/auth/principal.ts`: the synthetic principal for auth off and building a principal from a user (+ optional token scopes as intersection with the role); verify with `principal.test.ts` (off = all permissions/whole library, token scopes intersect, administrators always get `access: 'all'`)
- [x] 2.4 Implement `server/src/auth/sessions.ts`: random id → hashed storage, cookie set/clear (`HttpOnly`, `SameSite=Strict`, `Secure` on HTTPS), idle expiry with ≤1 write/minute, list/revoke own, end all others, prune expired; verify with `sessions.test.ts` (expiry, revoke, hash-only storage)

## 3. Auth provider plugin contract and bundled plugins

- [x] 3.1 Extend `server/src/plugins/api.ts` with `CredentialsProvider`, `BearerProvider`, `AuthContext` and `PluginContributions.authProviders`. Add `PluginHost.auth` (findUserByUsername, per-provider identity store, verifyApiToken, hashSecret/verifySecret using scrypt + timingSafeEqual); verify `npm run build` and a `contributions.test.ts` case that a valid provider is accepted
- [x] 3.2 Validate providers in `contributions.ts` and register them in `registry.ts`: unknown kind and duplicate id give a warning naming the provider (bundled first, then folder order), and providers are listed in `GET /api/plugins` with id, kind and localized label; verify with `registry.test.ts` and `plugins.test.ts` cases for each `plugins` delta scenario
- [x] 3.3 Add the "last login provider stays on" guard to `pluginApi.switchPlugin` (409 `last_login_provider` when auth is on) and the startup log when no `credentials` provider is active; verify with a `plugins.test.ts` case
- [x] 3.4 Create bundled `plugins/auth-password` (manifest, `credentials` provider `password`, scrypt hash in its identity record, dummy-hash verification for unknown users, `setSecret`); verify with a test that a correct password logs in, case-insensitive username works, unknown/disabled users fail the same way, and the password text never appears in the database
- [x] 3.5 Create bundled `plugins/auth-token` (manifest, `bearer` provider `token` accepting only `pal_…` and delegating to `verifyApiToken`); verify with a test that a valid token resolves its owner and scopes, and the plugin being off makes the token give 401
- [x] 3.6 Document auth providers in `docs/plugins.md` (contract, both kinds, identity store, security note that a provider can name any user) and check that the documented example compiles in `docsExample.test.ts`

## 4. Authentication endpoints and middleware

- [x] 4.1 Implement the `authenticate` middleware (bearer providers, then session cookie; synthetic principal when off; user and role reloaded per request) and mount it in `server/src/index.ts` before the router, with CORS restricted to `PALOMA_CLIENT_ORIGIN` with credentials when auth is on; verify with a route test that auth off still answers `GET /api/photos` as before and auth on answers 401 without a session, including on a thumbnail URL
- [x] 4.2 Implement the setup code (generated and logged at startup when there are no users, kept in memory) and `POST /api/auth/setup` (constant-time check, transactional "no users" re-check, 409 once users exist); verify with `authRoutes.test.ts` for correct code, wrong code and setup after users exist
- [x] 4.3 Implement `GET /api/auth/status`, `POST /api/auth/login/:provider` (generic 401, sets the session cookie), `POST /api/auth/logout`, `GET /api/auth/me`, `POST /api/auth/password` (current password required, ends other sessions, clears `mustChangePassword`), and `GET/DELETE /api/auth/sessions[/:id]`; verify with `authRoutes.test.ts` covering each scenario of the `authentication` spec
- [x] 4.4 Implement login throttling (10 failures per username per 15 minutes → 429 with the seconds to wait, reset on success); verify with a test using a fake clock
- [x] 4.5 Add `npm --prefix server run reset-password <username>` (sets a password and `mustChangePassword`, for recovery) and verify it changes a test user's password

## 5. API tokens

- [x] 5.1 Implement core token storage and `GET/POST/DELETE /api/auth/tokens` (needs `account.tokens` and a session, permissions ⊆ the owner's, value `pal_…` shown once, hash only stored, optional expiry, last-used updated) and `GET/DELETE /api/admin/tokens`; verify with `tokens.test.ts` covering every `api-tokens` scenario (more than owner → 403, expired → 401, owner disabled → 401, a token request creating a token → 403, owner losing a permission)

## 6. Permissions and library access on every route

- [x] 6.1 Start every route with a `need()` guard from `server/src/auth/middleware.ts` (403 `permission_required` naming the permission, 403 `session_required` for tokens on session-only routes) and add `routes/guards.test.ts`, which walks `router.stack` and fails for any route without exactly one guard
- [x] 6.2 Implement `server/src/auth/scope.ts` (`visiblePhotoCondition`, folder grants with subfolders by path, album grants by token, visible folder tree with path-only ancestors) and verify with `scope.test.ts` on a fixture library
- [x] 6.3 Thread the scope through photo services (`photoApi` list/folders/update/star/keywords/location/edits, `photoInfo`, `photoStats`, `tagApi`, `memories`) and return 404 for invisible photos; verify with a limited-user route test that lists, statistics, tags and memories count only visible photos
- [x] 6.4 Thread the scope through album services (lists with visible photos only, writes need a granted album or whole-library access, created albums added to the creator's grants); verify with `albums.test.ts` cases for each album scenario of the `access-control` spec
- [x] 6.5 Thread the scope through people, faces and geo services (`peopleApi`, `faceDetectionApi`, `faceImages`, `geoApi`); verify that a person shown only on invisible photos gives 404 and map points exclude invisible photos
- [x] 6.6 Apply the scope to every image route (`/photos/:id/thumbnail|preview`, `/raw/:photoId`, `/cache/*/:fileHash` by checking a visible photo has the hash, face crops, avatars); verify with a route test that each answers 404 for an invisible photo and 200 for a visible one
- [x] 6.7 Implement `/api/admin/users` (CRUD, disable/enable, reset password, access and quota editing), `/api/admin/roles` and `/api/admin/permissions` (localized labels and descriptions); verify with `adminRoutes.test.ts` that editors get 403 and the administrator flows work

## 7. Quotas

- [x] 7.1 Implement `user_quotas` access (kinds `export_bytes`, `requests_per_minute`; defaults: unlimited export, rate from `.env`) and report usage in `GET /api/auth/me` and the admin user list; verify with `quotas.test.ts`
- [x] 7.2 Implement the per-key one-minute rate limiter (sessions per user, each token separately, image routes excluded, 429 with the seconds to wait, `0` = unlimited); verify with a fake-clock test including "thumbnails do not count" and "a token over the limit does not block the browser"
- [x] 7.3 Rewrite `/export` to use `<exportDir>/<username>` when auth is on (400 when escaping it), measure usage, render to a buffer and stop before the file that would cross the limit, and report exported/requested counts and `quota_exceeded`. Rewrite `/creation/movie` to delete a movie that crosses the limit and return 409. Verify with route tests for every `quotas` export scenario, plus auth off writing to `exportDir` as before

## 8. Client: auth flow

- [x] 8.1 Add `client/src/api/auth.ts` and an `authStore`. Make `api/http.ts` report 401 from non-auth endpoints to the store without changing `currentView`; verify with `http.test.ts` and an `authStore.test.ts`
- [x] 8.2 Add `AuthGate` with `SetupPage`, `LoginPage` (one form per `credentials` provider, generic error, wait time on 429) and `ForcePasswordPage`; verify with component tests for setup, login failure, and returning to the open view after the session ends
- [x] 8.3 Add the Settings `AccountSection` (third section when auth is on: name, role, display name, change password, sessions with revoke, tokens with create/revoke and one-time value display when `account.tokens`, export usage marked near/at limit, Log out); verify with component tests and the app-settings ordering scenarios

## 9. Client: permissions in the UI and Admin view

- [x] 9.1 Add `CONTROL_PERMISSIONS` next to `CONTROL_LEVELS`, combine both in `useAllows`, and give the Account tokens list and Admin view their levels (Normal) and the Account section its level (Child). Hide the Plugins section without `plugins.manage`. Verify with `controls.test.ts` (every data-changing control has a permission, viewer tray scenario, Child account scenario) in every skin
- [x] 9.2 Add the `admin` view to `AppView`/`NAV_ITEMS` (shown only with `users.manage` and auth on, falls back to the library when lost) and `client/src/admin/` with `UsersSection` (create, edit, disable/enable, reset, delete with confirmation that mentions the export folder), `AccessEditor` (whole library or folders from `useFolderTree` + albums), `QuotaEditor`, `RolesSection` (built-ins read-only), `SessionsTokensSection` and `AuthProvidersSection` (link to Settings → Plugins); verify with component tests for each `admin-panel` scenario
- [x] 9.3 Add all new strings and error codes (`permission_required`, `quota_exceeded`, `last_login_provider`, `last_admin`, `username_taken`, …) to all 11 locale files; verify with the existing locale completeness test

## 10. Documentation

- [x] 10.1 Write `docs/users-and-auth.md` (enabling auth, setup code, roles and permissions table, library access, quotas, tokens with a `curl` example, recovery with auth off / `reset-password`, reverse-proxy/HTTPS note). Link it from `AGENTS.md` and update `docs/complexity-levels.md` with the new controls; verify the links resolve

## 12. User menu, Server settings and scrolling pages

- [x] 12.1 Make the setup, login and new-password pages scroll when the window is lower than the page; verify with an AuthPages test that the page container scrolls and the card is not vertically centered by flex alone
- [x] 12.2 Add `GET /api/server/info` (`plugins.manage`) with users on/off, photo and excluded folders, export, data and plugins folders, session lifetime, default request rate and version; verify with a route test (403 for an editor, values with users off) and the guards test
- [x] 12.3 Add the `account`, `admin` and `server` views with their control levels and permissions, outside `NAV_ITEMS`; move the Account section into `AccountView`, and the Plugins section and a new Server section into `ServerSettingsView`; leave Settings with browser settings only; verify with controls, shell and Settings tests
- [x] 12.4 Add `UserMenu` (avatar with initials, or a person icon with users off) with `useUserMenuItems()` to every skin's navigation; verify with tests for the administrator, viewer, Child and users-off menus in every skin
- [x] 12.5 Add the new strings to all 11 locales and update `docs/users-and-auth.md`, `docs/plugins.md` and `docs/complexity-levels.md` (Settings → Server settings, the user menu); verify the catalog tests pass and the docs mention no Plugins section in Settings

## 13. Linked person and avatars

- [x] 13.1 Add `person_id` (unique where set) and `avatar_version` to `users`, with the migration for existing databases; link/unlink through `PATCH /api/admin/users/:id {personId}` (409 `person_linked` naming the user, 400 for an unknown person) and clear links when a person is deleted; verify with users and admin route tests
- [x] 13.2 Add avatar upload/remove (`PUT`/`DELETE /api/auth/avatar`, `DELETE /api/admin/users/:id/avatar`, `GET /api/users/:id/avatar`) storing a 256 px square WebP in `PALOMA_DATA_DIR/avatars`; add `personId`, `personName`, `avatarUrl` to `MeResponse.user` and `UserInfo`, and `user` to `GET /api/people/:id`; verify with route tests (bad file → 400 and unchanged, the person avatar fallback only for a visible person)
- [x] 13.3 Client: avatar image or person face in `UserMenuButton`, My photos in the user menu, avatar upload/remove and the linked person in the Account view, the person picker, avatar and linked person in the Admin user editor and list, and the linked user in `PersonHeader`; verify with component tests
- [x] 13.4 Add the new strings to all 11 locales and update `docs/users-and-auth.md`; verify the catalog tests pass

## 11. Integration check

- [x] 11.1 Run the app with `PALOMA_AUTH=on`: create the admin with the setup code, create a viewer limited to one album, log in as them in another browser, and check that only that album's photos, images and counts are reachable and the tray/viewer offer no editing. Then switch `PALOMA_AUTH=off` and check that the app behaves as before
- [x] 11.2 Verify `npm run build` and `npm test` pass
