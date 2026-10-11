# users Specification

## Purpose

Defines the people who use one Paloma: their accounts, how administrators create, change, disable and delete them, and what each user can see and change about their own account.

## Requirements

### Requirement: User accounts
A user SHALL have a username, a display name, a role, whether the account is enabled, library access, quotas, and when the account was created and last logged in. Usernames SHALL be 3 to 32 characters long, use only letters, digits, `.`, `_` and `-`, and be unique regardless of case. Accounts SHALL be kept in Paloma's data directory and SHALL NOT be written to the photo folders.

#### Scenario: Duplicate username
- **WHEN** user `anna` exists and an administrator creates `Anna`
- **THEN** the server responds 409 and the form says the username is taken

#### Scenario: Invalid username
- **WHEN** an administrator creates a user named `a b`
- **THEN** the server responds 400 and names the allowed characters

#### Scenario: Nothing in the photo folders
- **WHEN** users are created, changed and deleted
- **THEN** no file in any photo folder is created or changed

### Requirement: Create a user
A user whose role has `users.manage` SHALL be able to create a user with a username, display name, role, initial password, library access and quotas. The new user SHALL have to choose their own password at their first login.

#### Scenario: Create a viewer
- **WHEN** `anna` creates `ben` with role `viewer` and access to the album `Trip` only
- **THEN** `ben` can log in, must set a new password, and then sees only the album `Trip`

### Requirement: Change a user
A user whose role has `users.manage` SHALL be able to change another user's display name, role, library access and quotas. Changes SHALL apply to that user's next request, without them logging in again.

#### Scenario: Role changed while logged in
- **WHEN** `ben` is logged in as a viewer and `anna` changes his role to `editor`
- **THEN** after the next request `ben` can star photos

### Requirement: Disable a user
A user whose role has `users.manage` SHALL be able to disable and enable another user. A disabled user SHALL NOT be able to log in, and their sessions and tokens SHALL stop working at once. Enabling the user SHALL let them log in again. Their tokens SHALL work again, but their old sessions SHALL NOT.

#### Scenario: Disable a logged-in user
- **WHEN** `ben` is logged in and `anna` disables him
- **THEN** `ben`'s next request gets 401, and his login is refused

### Requirement: Reset a password
A user whose role has `users.manage` SHALL be able to set a new password for another user. It SHALL end that user's sessions, and the user SHALL have to choose a new password at their next login.

#### Scenario: Reset ben's password
- **WHEN** `anna` resets `ben`'s password while he is logged in
- **THEN** `ben`'s session gets 401, and after logging in with the new password he is asked for his own

### Requirement: Delete a user
A user whose role has `users.manage` SHALL be able to delete another user after confirming. Deleting SHALL remove the account, its sessions and its tokens. It SHALL NOT remove photos, albums, edits or files, including the user's export folder.

#### Scenario: Delete ben
- **WHEN** `anna` deletes `ben`, who had starred photos and exported files
- **THEN** `ben` is gone, the stars stay, and his exported files stay on disk

### Requirement: At least one administrator stays
Paloma SHALL refuse with 409 any change that would leave no enabled user whose role has `users.manage`. This covers deleting, disabling or changing the role of the last such user, and removing `users.manage` from their custom role. A user SHALL NOT be able to delete or disable their own account.

#### Scenario: Last administrator
- **WHEN** `anna` is the only administrator and tries to change her own role to `editor`
- **THEN** the server responds 409 and the form says that at least one administrator must remain

#### Scenario: Delete self
- **WHEN** `anna` tries to delete her own account
- **THEN** the server responds 409 and the account stays

### Requirement: Own account view
When auth is on, the user menu SHALL open an Account view. It SHALL show the logged-in user's username, display name and role. It SHALL let the user change their display name and password, and show their quotas with usage. It SHALL contain Log out, the user's sessions and, when their role has `account.tokens`, their tokens. The Settings view SHALL NOT contain any of this.

#### Scenario: Account view
- **WHEN** `ben`, a viewer, chooses Account in the user menu
- **THEN** the Account view shows `ben`, role `viewer`, Change password, his sessions and Log out, and no tokens list

#### Scenario: Change display name
- **WHEN** `ben` changes his display name to `Ben K.`
- **THEN** the user menu, the Account view and the Admin user list show `Ben K.`

### Requirement: Link a user with a person
A user whose role has `users.manage` SHALL be able to link another user, or themselves, with one person of the library, and to remove the link. A person SHALL be linked with at most one user; linking a person that another user has SHALL be refused with 409 naming that user. The link SHALL NOT change what the user may see. Deleting the person SHALL remove the link. The link SHALL be kept only in Paloma's data directory.

#### Scenario: Link ben with Ben Avery
- **WHEN** `anna` links `ben` with the person `Ben Avery`
- **THEN** the Admin user list shows `ben` linked with `Ben Avery`, and `ben`'s library access is unchanged

#### Scenario: Person already linked
- **WHEN** `Ben Avery` is linked with `ben` and `anna` links `carol` with `Ben Avery`
- **THEN** the server responds 409 naming `ben`, and `carol` stays unlinked

#### Scenario: Person deleted
- **WHEN** a user with `people.manage` deletes `Ben Avery`, who is linked with `ben`
- **THEN** `ben` is no longer linked with a person

### Requirement: Own avatar
A logged-in user SHALL be able to upload a JPEG, PNG or WebP image of at most 10 MB as their avatar, replace it and remove it. Paloma SHALL keep a square copy of at most 256×256 pixels in its data directory, never in the photo folders. A user whose role has `users.manage` SHALL be able to remove another user's avatar. Another file SHALL be refused with 400 and the avatar SHALL stay as it was.

#### Scenario: Upload an avatar
- **WHEN** `ben` uploads a 3000×2000 JPEG photo of himself in the Account view
- **THEN** the user menu, the Account view and the Admin user list show it as a square picture

#### Scenario: Not an image
- **WHEN** `ben` uploads a text file
- **THEN** the server responds 400, the Account view says the file is not a usable image, and his avatar does not change

#### Scenario: Remove an avatar
- **WHEN** `ben` removes his avatar
- **THEN** the user menu shows his person's face, or his initials when he is not linked with a person
