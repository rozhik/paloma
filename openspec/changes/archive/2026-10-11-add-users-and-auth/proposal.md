# Proposal

## Why

Paloma is a single-user app with an open API. Anyone who can reach the port can read and change the library. Families want to share one Paloma, for example on a home server or a NAS, with different people allowed to do different things. Scripts and other apps need a way to call the API without a browser login. Login methods differ between installs (password today, OAuth/OIDC and others later), so authentication has to be pluggable, not built into the core.

## What Changes

- **Authentication mode** in `.env`: off by default, so single-user localhost works exactly as today. When it is on, every API request and every image URL needs an authenticated user, and the first start offers to create the first administrator.
- **Users**: accounts with a username, display name, role, library access, quotas and an enabled flag. Accounts live in Paloma's data directory and are never written to photo folders.
- **Users and people**: an administrator can link a user with one person of the library. The user menu then offers My photos, shows the person's face when the user has no avatar of their own, and Admin and the person's page show the link. Users can upload their own **avatar**, which is stored in Paloma's data directory.
- **Roles and permissions**: a fixed list of permissions that matches Paloma's API (for example `photos.read`, `photos.edit`, `albums.manage`, `people.manage`, `export`, `plugins.manage`, `users.manage`). Built-in roles `admin`, `editor` and `viewer` ship with Paloma, and administrators can create custom roles from the permission list. The server enforces permissions on every route, and the client hides what the user may not do.
- **Library access (ACL)**: one shared library. Each user sees either the whole library or only the folders and albums they are granted. Photos outside the user's access are not listed, searched, counted or served.
- **Authentication through plugins**: a new plugin contribution kind, `authProviders`. Core Paloma owns users, sessions, roles and permissions. Providers only verify credentials and map them to a user. Two bundled plugins:
  - `auth-password`: username + password login that creates a browser session.
  - `auth-token`: personal API tokens sent as `Authorization: Bearer …`, each one narrowed to a subset of its owner's permissions, with an optional expiry, and revocable.
  - OAuth/OIDC and other providers can be added later as plugins without core changes. The provider interface reserves interactive (redirect-based) login for them.
- **Sessions**: an HTTP-only cookie session after an interactive login, with logout, expiry and a list of the user's own sessions that the user can revoke.
- **Quotas**, kept on the user and enforced on the server:
  - disk space for exports and movies written to `PALOMA_EXPORT_DIR` (per user subfolder);
  - request rate (requests per minute per user and per token).
  The quota model is generic, so an upload quota can be added when upload exists.
- **User menu** under an avatar at the end of the main navigation, in every skin: who is logged in, Account, Admin, Server settings and Log out, each where the level and permissions allow.
- **Account view** (from the user menu): profile, change password, personal API tokens, active sessions, quota usage, and Log out.
- **Admin panel**: a separate Admin view, from the user menu, with Users, Roles, Sessions/Tokens and Authentication (providers) sections.
- **Server settings**: a separate view, from the user menu, with the Plugins section (moved out of Settings) and a read-only overview of the server's `.env` configuration. **Settings** keeps only what is remembered in this browser.
- **BREAKING (only when auth is on)**: API clients must authenticate, and CORS is limited to the configured client origin. With auth off, nothing changes.

## Capabilities

### New Capabilities
- `authentication`: the authentication mode, first-administrator setup, login and logout, sessions, and the auth-provider plugin contract with the bundled password provider.
- `api-tokens`: personal API tokens: creation, scopes narrowed to the owner's permissions, expiry, revocation and use as a bearer credential.
- `users`: user accounts and their lifecycle (create, edit, disable, delete, reset password) and the user's own profile.
- `access-control`: permissions, built-in and custom roles, per-user library access to folders and albums, server-side enforcement and permission-aware UI.
- `quotas`: per-user export/movie disk-space and request-rate limits, usage reporting, and the errors shown when a limit is reached.
- `admin-panel`: the Admin view and its sections for users, roles, sessions and tokens, and authentication providers.
- `user-menu`: the avatar button in the main navigation and its menu of account, administration and server items.
- `server-settings`: the Server settings view, its read-only Server section and `GET /api/server/info`.

### Modified Capabilities
- `people`: a person linked with a user shows that user.
- `plugins`: plugins can contribute auth providers. Plugin management needs the `plugins.manage` permission when auth is on, and the last enabled login provider cannot be switched off. The Plugins section moves from Settings to Server settings.
- `app-settings`: the Settings view holds only the settings remembered in this browser; Plugins leave it.
- `complexity-levels`: levels for the new controls. The user menu with Log out is available from Child, the Account view from Easy, and the Admin and Server settings views from Normal.

## Impact

- **Server**: new `server/src/auth/` (mode, sessions, middleware, permission checks, provider registry), new DB tables (users, roles, role permissions, user library grants, identities, sessions, API tokens, quota usage), a permission guard on every route in `server/src/routes/index.ts`, ACL filtering in photo/album/folder/people/geo/memories/stats queries and image routes, export and movie paths per user, and a rate limiter.
- **Plugins**: `server/src/plugins/api.ts` gets an `authProviders` contribution and an extended `PluginHost`. Two new bundled plugins, `plugins/auth-password` and `plugins/auth-token`.
- **Client**: a login page, first-admin setup page, current-user store, permission-aware navigation/tray/menus, the user menu with the Account, Admin and Server settings views. All new texts are localized.
- **Shared types**: user, role, permission, token, session and quota types in `shared/types.ts`.
- **Config**: `.env.example` gets `PALOMA_AUTH`, `PALOMA_CLIENT_ORIGIN`, session lifetime and default rate limit.
- **Dependencies**: none planned. Password hashing uses Node's built-in `crypto.scrypt`.
- **Photo folders**: no new files are written there. Sidecar writes are unchanged and still shared by all users.
