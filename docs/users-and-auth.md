# Users and logins

Paloma can be used by one person on their own computer, or shared, for example by a family on a home server. Users are **off** by default. With them off, Paloma works as a single-user app with no login.

## Switching users on

In `.env`:

```sh
PALOMA_AUTH=on
# Only when the web client is served from another address than the API:
#PALOMA_CLIENT_ORIGIN=https://photos.example.com
#PALOMA_SESSION_DAYS=30   # a login ends after this many days without use
#PALOMA_RATE_LIMIT=600    # default API requests per minute per user and per token; 0 = unlimited
```

Restart the server. While there are no users, it logs a one-time **setup code**:

```
🔑 No users yet. Create the first administrator in the browser with the setup code: K7MP2QXW9R
```

Open Paloma in the browser and enter the code, a username and a password. Only someone who can read the server log can create the first administrator. Each start logs a new code until the first administrator exists.

With users on, every API request needs a login or an API token, including thumbnails and original files. Requests from another web site cannot read the API. Only `PALOMA_CLIENT_ORIGIN` may call it with the login cookie.

**HTTPS.** Paloma does not terminate TLS. To reach it from outside your home network, put it behind a reverse proxy that does, such as Caddy or nginx, on the same machine. Paloma trusts the proxy's `X-Forwarded-*` headers from localhost and marks the login cookie `Secure` on HTTPS.

## Where to find it

The avatar at the end of the main navigation, in every skin, opens the **user menu**:

- **My photos** (for a user linked with a person they may see): the photos of that person.
- **Account**: your picture, name, password, logged-in devices, API tokens and export space.
- **Tasks** (from the Easy level): the [task queue](task-queue.md), with who started each task.
- **Admin panel** (for those with `users.manage`): users, roles, everyone's sessions and tokens, and the login methods.
- **Server settings** (for those with `plugins.manage`, or everyone with users off): the plugins, AI providers and tasks, and a read-only overview of the server's `.env` settings.
- **Log out**.

**Settings** in the navigation holds what is remembered in this browser: language, level, appearance and the viewer bars. Its Keyboard section is the exception: each user's [keymap](keybindings.md) is kept on the server, so it follows them to every browser. With users off, the user menu shows a person icon and offers only Tasks and Server settings.

## Users and people

An administrator can link a user with one person of the library in **Admin → Users → Edit**. Each person can be linked with at most one user. The link:

- offers **My photos** in the user menu,
- shows the person's face as the user's avatar while they have no picture of their own (only if they may see that person),
- shows the link in the Admin user list and on the person's page.

The link does not change what the user may see. Deleting the person removes the link.

## Pictures

Every user can upload a picture of themselves in **Account** (JPEG, PNG or WebP, at most 10 MB). Paloma keeps a 256×256 square copy in `PALOMA_DATA_DIR/avatars/`, never in the photo folders. Administrators can remove anyone's picture in **Admin → Users**.

## Roles and permissions

What a user may do comes from their role. A role is a set of these permissions:

| Permission | Allows |
| :--- | :--- |
| `library.view` | Seeing photos, folders, albums, tags, people, places, memories and statistics |
| `photos.edit` | Stars, descriptions, tags, edits and locations of photos |
| `albums.manage` | Creating, changing and deleting albums and their photos |
| `people.manage` | People, assigning faces and finding faces |
| `ai.run` | Running [AI tasks](ai.md) on photos, which sends them to the configured AI service and adds tags and descriptions |
| `export` | Export, movies and collages |
| `account.tokens` | Personal API tokens |
| `plugins.manage` | Switching plugins on and off, including login methods, and configuring AI providers and tasks |
| `users.manage` | The Admin view: users, roles, and everyone's sessions and tokens; pausing, cancelling and moving [everyone's tasks](task-queue.md) |

Paloma ships three roles that cannot be changed: **Administrator** (everything), **Editor** (everything except plugins and users) and **Viewer** (only `library.view`). Administrators can create more roles in **Admin → Roles**.

The server checks the permission of every request. The client hides what the user may not do in every skin, together with the [complexity level](complexity-levels.md): a control is shown only when both the level and the permissions allow it. A role change applies at the user's next request; the client notices within a minute.

At least one enabled user with `users.manage` always remains, and nobody can disable or delete their own account.

## Library access

Each user sees either **the whole library** or **only some folders and albums**:

- A folder includes its subfolders.
- An album shows all its photos, wherever they are.
- Photos outside the access do not exist for the user. They are not listed or counted, and their images are not served (404).
- Albums appear if they are granted, or if they have a photo the user sees (showing only those photos). People appear if they are on a photo the user sees.
- A user can change only photos they see. A user can change or delete only albums granted to them. Albums they create are granted to them.
- Users with `users.manage` always see the whole library.

Stars, descriptions, tags, edits, locations, albums and people are stored in the folders' `.paloma.json` files, so they are **shared by all users**. A user with `photos.edit` changes them for everyone who sees the photo.

## Quotas

Each user has two quotas, set in **Admin → Users**:

- **Export space**: exports and movies of a user go to their own folder, `PALOMA_EXPORT_DIR/<username>/`. When the files there reach the limit, exports stop before the file that would not fit, and movies that do not fit are removed. Deleting files from the folder outside Paloma frees space.
- **Requests per minute**: API requests per minute of all the user's browser sessions together, and separately of each of their API tokens. Images do not count. Empty uses `PALOMA_RATE_LIMIT`; `0` means no limit.

## API tokens

Users with `account.tokens` create tokens in **user menu → Account**. A token has a name, some of its owner's permissions and an optional expiry date. Its value is shown once:

```sh
curl -H "Authorization: Bearer pal_…" http://localhost:3001/api/photos?limit=10
```

A token acts as its owner, with the permissions both the token and the owner's role have, and the owner's library access. Tokens cannot create tokens, change passwords or manage sessions. Revoked or expired tokens, and tokens of disabled users, stop working at once. Switching off the `auth-token` plugin stops all tokens until it is switched on again. Administrators see and revoke everyone's tokens in **Admin → Sessions and tokens**.

## Login methods are plugins

Paloma keeps the users, roles, sessions and tokens. **Auth provider plugins** check credentials. Two are bundled:

- `auth-password`: username and password. Passwords are stored only as salted scrypt hashes.
- `auth-token`: the personal API tokens above.

Other methods, such as OAuth/OIDC, can be added as plugins. See [Writing Paloma plugins](plugins.md#auth-providers). While users are on, the last plugin with a login form cannot be switched off.

## Recovery

- **Forgotten password:** an administrator resets it in **Admin → Users**. The user then chooses their own at the next login. If the only administrator forgot theirs, run `npm --prefix server run reset-password <username>` on the server. It asks for the new password, or reads it from `PALOMA_NEW_PASSWORD`.
- **No way to log in** (for example, the password plugin fails to load): set `PALOMA_AUTH=off`, restart, fix the plugin in **user menu → Server settings → Plugins**, and switch users back on.
- **Rollback:** `PALOMA_AUTH=off` brings back the single-user app. The users stay in the database for later.

Users, sessions and tokens are kept only in Paloma's database in `PALOMA_DATA_DIR`, never in the photo folders. Deleting a user keeps their exported files.
