# Spec Delta

## Purpose

Gives administrators one place in the app to manage users, roles, library access, quotas, sessions, tokens and the authentication providers.

## ADDED Requirements

### Requirement: Admin view
When auth is on, the user menu SHALL offer an Admin view to users whose role has `users.manage`. It SHALL have the sections Users, Roles, Sessions and tokens, and Authentication. All its texts and errors SHALL be in the active UI language. For other users, the user menu SHALL NOT list it. If the Admin view is open when the user loses `users.manage`, the client SHALL show the library.

#### Scenario: Administrator opens Admin
- **WHEN** `anna`, an administrator, chooses Admin in the user menu
- **THEN** the Admin view shows its Users section

#### Scenario: Viewer has no Admin
- **WHEN** `ben`, a viewer, is logged in
- **THEN** the user menu has no Admin item

#### Scenario: Administrator demoted while in Admin
- **WHEN** `carol` has the Admin view open and another administrator changes her role to `editor`
- **THEN** after her next request the library is shown and the user menu has no Admin item

#### Scenario: Auth off
- **WHEN** auth is off
- **THEN** the user menu has no Admin item

### Requirement: Users section
The Users section SHALL list every user with their avatar, username, display name, role, linked person, whether they are enabled, when they last logged in and their export space usage. It SHALL let the administrator create a user, change one, link or unlink them with a person chosen from the people of the library, remove their avatar, disable or enable one, reset their password and delete them after confirming. An action that the server refuses SHALL show the server's reason and keep the previous state.

#### Scenario: Create from the panel
- **WHEN** `anna` creates `carol` with role `editor` and an initial password
- **THEN** `carol` appears in the list as enabled, never logged in

#### Scenario: Refused change
- **WHEN** `anna` tries to disable her own account
- **THEN** the list keeps her enabled and shows that she cannot disable her own account

### Requirement: Library access editor
Editing a user SHALL offer whole-library access or a choice of folders from the folder tree and albums from the album list. For a role with `users.manage` it SHALL show that the user always has the whole library.

#### Scenario: Grant a folder and an album
- **WHEN** `anna` edits `ben`, chooses limited access, ticks the folder `/photos/2024` and the album `Trip`, and saves
- **THEN** `ben` sees the photos of `/photos/2024`, its subfolders and `Trip`

### Requirement: Quota editor
Editing a user SHALL let the administrator set the export space limit in megabytes or gigabytes, or unlimited, and the request rate per minute, or the default.

#### Scenario: Set an export limit
- **WHEN** `anna` sets `ben`'s export space to 1 GB
- **THEN** the user list shows `ben`'s usage out of 1 GB

### Requirement: Roles section
The Roles section SHALL list every role with its name, description, permissions and number of users. Built-in roles SHALL be shown as read-only. Administrators SHALL be able to create, change and delete custom roles by choosing permissions from the list, each with its label and description.

#### Scenario: Built-in roles shown read-only
- **WHEN** `anna` opens Roles
- **THEN** `admin`, `editor` and `viewer` are listed with their permissions and offer no edit or delete

### Requirement: Sessions and tokens section
The Sessions and tokens section SHALL list the active sessions and the tokens of all users, with owner, when each was created and last used, and, for tokens, name, permissions and expiry. Administrators SHALL be able to revoke any of them.

#### Scenario: Revoke another user's token
- **WHEN** `anna` revokes `ben`'s token `frame`
- **THEN** `frame` disappears from the list and requests with it get 401

### Requirement: Authentication section
The Authentication section SHALL list every auth provider of every plugin, with its label, kind, plugin and whether it is available. It SHALL link to the Server settings view, whose Plugins section switches providers on and off.

#### Scenario: Providers listed
- **WHEN** `anna` opens Authentication with the bundled plugins on
- **THEN** it lists `Password` from `auth-password` and `API token` from `auth-token`, both available
