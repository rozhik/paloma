# Spec Delta

## Purpose

Lets users give scripts and other apps access to Paloma's API with personal tokens, each one limited to some of the owner's permissions, with an optional expiry, and revocable.

## ADDED Requirements

### Requirement: Create a personal token
A user whose role has `account.tokens` SHALL be able to create a token with a name, a set of permissions and an optional expiry date. The permissions SHALL be a subset of the user's own. The token value SHALL be shown once, when it is created, and SHALL NOT be retrievable afterwards.

#### Scenario: Create a read-only token
- **WHEN** `anna`, an editor, creates token `frame` with permission `library.view` and no expiry
- **THEN** the token value is shown once, and the token list shows `frame` with `library.view` and no value

#### Scenario: Asking for more than the owner has
- **WHEN** a user with role `viewer` and `account.tokens` creates a token with `photos.edit`
- **THEN** the server responds 403 and no token is created

### Requirement: Token values are not stored readably
Paloma SHALL store only a hash of each token value. Token values SHALL start with `pal_` so they can be recognized in logs and by secret scanners.

#### Scenario: Value not in the database
- **WHEN** a token is created and the database is inspected
- **THEN** the token value does not appear in it

### Requirement: Bearer token authentication
The bundled `auth-token` plugin SHALL authenticate a request that carries `Authorization: Bearer <token>`. Such a request SHALL act as the token's owner with the owner's library access. Its permissions SHALL be those that the token and the owner's current role both have.

#### Scenario: Script lists photos
- **WHEN** a script sends `GET /api/photos` with the `frame` token
- **THEN** it gets the photos `anna` can see

#### Scenario: Token cannot do more than its permissions
- **WHEN** a script sends `PATCH /api/photos/12/star` with the `frame` token, which has only `library.view`
- **THEN** the server responds 403 and the star does not change

#### Scenario: Owner loses a permission
- **WHEN** `anna`'s role is changed to one without `export` while her token has `export`
- **THEN** export requests made with the token get 403

### Requirement: Tokens that stop working
A token SHALL get 401 when it is unknown, revoked, past its expiry date, when its owner is disabled or deleted, or when the `auth-token` plugin is off. Tokens SHALL be kept when the plugin is off and work again when it is switched back on.

#### Scenario: Expired token
- **WHEN** a token with expiry 2026-11-01 is used on 2026-11-02
- **THEN** the server responds 401

#### Scenario: Plugin switched off and on
- **WHEN** an administrator switches `auth-token` off, a script uses a token, and the administrator switches it on again
- **THEN** the script gets 401 while it is off, and the token works again after

### Requirement: Tokens cannot manage credentials
A request authenticated by a token SHALL NOT be able to create or revoke tokens, change a password, list or revoke sessions, or log in. Such requests SHALL get 403.

#### Scenario: Token creates a token
- **WHEN** a script sends `POST /api/auth/tokens` with a token
- **THEN** the server responds 403 and no token is created

### Requirement: List and revoke own tokens
The Account view SHALL list the user's own tokens with name, permissions, when each was created and last used, and its expiry. It SHALL let the user revoke a token, which SHALL stop working at once.

#### Scenario: Revoke a token
- **WHEN** `anna` revokes `frame`
- **THEN** `frame` is no longer listed, and the next request with it gets 401

#### Scenario: Last used
- **WHEN** a script uses `frame` and `anna` opens the Account view
- **THEN** `frame` shows when it was last used
