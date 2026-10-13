# Spec Delta

## MODIFIED Requirements

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
- `users.manage`: manage users, roles, sessions and tokens of all users, and pause, resume, cancel and move the tasks of all users and of the system.

#### Scenario: Permission list in the API
- **WHEN** an administrator requests `GET /api/admin/permissions`
- **THEN** the response lists these nine permissions, each with a label and a description in the requested language

#### Scenario: Editor runs AI tasks
- **WHEN** auth is on and `eve`, an editor, starts the Tags task on a folder
- **THEN** the run starts, because the built-in editor role has `ai.run`

#### Scenario: Existing custom role
- **WHEN** a custom role created before this change has `photos.edit` only
- **THEN** its users cannot start AI tasks until an administrator adds `ai.run` to the role
