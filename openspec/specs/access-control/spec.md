# access-control Specification

## Purpose

Decides what each authenticated user may see and do: a fixed list of permissions, built-in and custom roles made from them, per-user access to parts of the shared library, enforcement on the server and a UI that offers only what is allowed.

## Requirements

### Requirement: Permissions
Paloma SHALL have exactly these permissions:
- `library.view`: see photos, folders, albums, tags, people, places, memories and statistics.
- `photos.edit`: star photos and change their description, tags, edits and location.
- `albums.manage`: create, change and delete albums and add or remove their photos.
- `people.manage`: add, change and delete people, assign faces and run face detection.
- `ai.run`: run AI tasks on photos, which sends them to the configured AI service and adds tags and descriptions.
- `export`: export photos and make movies.
- `account.tokens`: create personal API tokens.
- `plugins.manage`: switch plugins on and off, and configure AI providers and tasks.
- `users.manage`: manage users, roles, sessions and tokens of all users.

#### Scenario: Permission list in the API
- **WHEN** an administrator requests `GET /api/admin/permissions`
- **THEN** the response lists these nine permissions, each with a label and a description in the requested language

#### Scenario: Editor runs AI tasks
- **WHEN** auth is on and `eve`, an editor, starts the Tags task on a folder
- **THEN** the run starts, because the built-in editor role has `ai.run`

#### Scenario: Existing custom role
- **WHEN** a custom role created before this change has `photos.edit` only
- **THEN** its users cannot start AI tasks until an administrator adds `ai.run` to the role

### Requirement: Built-in roles
Paloma SHALL ship three roles that cannot be changed or deleted. `admin` SHALL have every permission. `editor` SHALL have every permission except `plugins.manage` and `users.manage`. `viewer` SHALL have only `library.view`.

#### Scenario: Built-in role is read-only
- **WHEN** an administrator sends `PATCH /api/admin/roles/editor`
- **THEN** the server responds 409 and the role is unchanged

### Requirement: Custom roles
A user whose role has `users.manage` SHALL be able to create, change and delete roles with a unique name, a description and a set of permissions. Deleting a role that a user has SHALL be refused with 409 naming how many users have it. A changed role SHALL apply to its users at their next request.

#### Scenario: Create a "family" role
- **WHEN** an administrator creates role `family` with `library.view`, `photos.edit` and `albums.manage`, and gives it to `ben`
- **THEN** `ben` can star photos and create albums, and cannot export

#### Scenario: Delete a role in use
- **WHEN** an administrator deletes role `family` while `ben` has it
- **THEN** the server responds 409 and says one user has the role

### Requirement: Every request is checked against permissions
When auth is on, the server SHALL check the permission each API endpoint needs before doing anything. A request without that permission SHALL get 403 with the name of the missing permission, and SHALL change nothing.

#### Scenario: Viewer stars a photo
- **WHEN** `ben`, a viewer, sends `PATCH /api/photos/12/star`
- **THEN** the server responds 403 naming `photos.edit`, and the photo's star and its folder files are unchanged

#### Scenario: Editor manages users
- **WHEN** an editor requests `GET /api/admin/users`
- **THEN** the server responds 403 naming `users.manage`

### Requirement: Library access
Each user SHALL have access either to the whole library or to a list of folders and albums. Access to a folder SHALL include its subfolders. A user SHALL see a photo if it is in a folder they can access or in an album they can access. Users whose role has `users.manage` SHALL always have access to the whole library.

#### Scenario: Folder access includes subfolders
- **WHEN** `ben` has access to the folder `/photos/2024`
- **THEN** he sees the photos of `/photos/2024` and `/photos/2024/summer`, and none of `/photos/2023`

#### Scenario: Album access
- **WHEN** `ben` has access only to the album `Trip`, which has photos from `/photos/2023`
- **THEN** he sees the photos of `Trip` and no other photos of `/photos/2023`

### Requirement: Photos outside access do not exist for the user
Photos that a user cannot see SHALL NOT appear in any list, search, count, statistic, map point, memory, tag list, person's photo list or face list for that user. Their images and info SHALL NOT be served to them. Requests for such a photo SHALL get 404, as for a photo that does not exist.

#### Scenario: Statistics count only visible photos
- **WHEN** `ben` sees 120 of the library's 5000 photos and opens the library statistics
- **THEN** the statistics count 120 photos

#### Scenario: Image of a hidden photo
- **WHEN** `ben` requests the thumbnail of a photo outside his access
- **THEN** the server responds 404

#### Scenario: Tags of hidden photos
- **WHEN** the tag `work` is used only on photos outside `ben`'s access
- **THEN** `work` is not in `ben`'s tag list

### Requirement: What limited access shows of folders, albums and people
A user with limited access SHALL see in the folder tree only the folders they can access and the parent folders needed to reach them, showing only their accessible photos. They SHALL see the albums they can access, and other albums only if they contain a photo the user sees, with only those photos. They SHALL see people only if a visible photo shows them.

#### Scenario: Album with some visible photos
- **WHEN** `ben` has access to `/photos/2024`, and the album `Best` has 3 photos from there and 7 from elsewhere
- **THEN** `ben` sees `Best` with 3 photos

#### Scenario: Person outside access
- **WHEN** `Roy Avery` appears only on photos `ben` cannot see
- **THEN** `Roy Avery` is not in `ben`'s people list, and `GET /api/people/<his id>` gives 404 for `ben`

### Requirement: Changes need access to what they change
A user with limited access SHALL be able to change only photos they see. They SHALL be able to change the name, description, cover or photos of an album, or delete it, only if they have access to that album. An album they create SHALL be added to their access. Adding photos SHALL be limited to photos they see.

#### Scenario: Change an album seen through folder access
- **WHEN** `ben`, with `albums.manage` and access to `/photos/2024` only, renames the album `Best`
- **THEN** the server responds 403 and the album keeps its name

#### Scenario: New album is accessible to its creator
- **WHEN** `ben` creates the album `Ben's picks` and adds 2 of his visible photos
- **THEN** `Ben's picks` is in his access and he can rename it

### Requirement: The UI offers only what is allowed
When auth is on, the client SHALL hide every view, button, menu item, tray action and keyboard shortcut whose permission the current user lacks. It SHALL hide them in every skin, in the same way as controls hidden by the complexity level. A control SHALL be shown only when both the level and the permissions allow it.

#### Scenario: Viewer's tray
- **WHEN** `ben`, a viewer, selects two photos at level Normal
- **THEN** the tray offers Clear and Print, and does not offer Add to album, Add tags, Export, Collage, Movie or Remove location

#### Scenario: Viewer in the photo viewer
- **WHEN** `ben`, a viewer, opens a photo and presses keys that open filters
- **THEN** no edit bar is shown and no edit is made

### Requirement: Folder files stay shared
Changes that Paloma writes to the folder files of the photo folders SHALL be the same whoever makes them. Stars, descriptions, tags, edits, locations, albums and people SHALL be shared by all users.

#### Scenario: Star seen by others
- **WHEN** `anna` stars a photo that `ben` can see
- **THEN** `ben` sees the photo starred
