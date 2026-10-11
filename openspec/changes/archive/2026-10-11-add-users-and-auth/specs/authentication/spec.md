# Spec Delta

## Purpose

Decides who is making each request to Paloma: whether authentication is on, how the first administrator is created, how users log in and out through auth-provider plugins, and how browser sessions work.

## ADDED Requirements

### Requirement: Authentication mode
The `.env` setting `PALOMA_AUTH` SHALL turn authentication `off` (the default) or `on`. When it is off, Paloma SHALL behave as a single-user app with no login: every request SHALL be allowed, with every permission and access to the whole library. Any other value SHALL stop the server at startup with a message naming the allowed values.

#### Scenario: Default is off
- **WHEN** `.env` has no `PALOMA_AUTH` and the user opens Paloma
- **THEN** the library is shown without a login page, and the user menu has no Admin item

#### Scenario: Invalid value
- **WHEN** `.env` has `PALOMA_AUTH=yes`
- **THEN** the server does not start and logs that `PALOMA_AUTH` must be `off` or `on`

### Requirement: Auth status endpoint
`GET /api/auth/status` SHALL be answered without authentication. It SHALL return the mode, whether first-administrator setup is pending, and the enabled login providers with their ids, labels in the requested language and form fields.

#### Scenario: Status with auth on
- **WHEN** auth is on, users exist and `auth-password` is enabled, and a client requests `GET /api/auth/status`
- **THEN** the response has mode `on`, setup not pending, and the provider `password` with the fields `username` and `password`

### Requirement: Every request is authenticated when auth is on
When auth is on, every `/api` request except the auth status, setup and login endpoints SHALL need an authenticated user. This includes thumbnails, previews, original files, face crops and avatars. A request without a valid session or credential SHALL get 401 and SHALL NOT reveal any library data.

#### Scenario: Anonymous API call
- **WHEN** auth is on and a client without a session requests `GET /api/photos`
- **THEN** the server responds 401 and the body has no photos

#### Scenario: Anonymous image
- **WHEN** auth is on and a browser without a session opens a thumbnail URL
- **THEN** the server responds 401 and no image is sent

### Requirement: First administrator setup
When auth is on and no user exists, the server SHALL log a one-time setup code at startup, and the client SHALL show a setup page instead of the login page. The setup page SHALL ask for the setup code, a username, a display name and a password entered twice. It SHALL create a user with the `admin` role and log them in. Setup SHALL be refused once any user exists.

#### Scenario: Create the first administrator
- **WHEN** auth is on for the first time, and the user enters the logged setup code, username `anna` and the password `correct horse battery` twice
- **THEN** user `anna` exists with role `admin`, and the library is shown logged in as `anna`

#### Scenario: Wrong setup code
- **WHEN** the setup code entered does not match the logged one
- **THEN** no user is created and the page says the setup code is wrong

#### Scenario: Setup page in a small window
- **WHEN** the browser window is lower than the setup page
- **THEN** the page scrolls, so every field and the create button can be reached

#### Scenario: Setup after users exist
- **WHEN** a user exists and a client sends `POST /api/auth/setup`
- **THEN** the server responds 409 and no user is created

### Requirement: Login page
When auth is on and the browser has no valid session, the client SHALL show a login page instead of the library. The page SHALL have one form for each enabled login provider, in the active language. After a successful login, the client SHALL show the library. When a session ends while the app is open, the client SHALL show the login page, and after logging in again as the same user it SHALL return to the view that was open.

#### Scenario: Log in with a password
- **WHEN** auth is on, user `anna` has password `correct horse battery`, and she enters them on the login page
- **THEN** the library is shown and the user menu shows that she is logged in as `anna`

#### Scenario: Session ends while the map is open
- **WHEN** `anna` has the Map view open, her session expires, and she logs in again
- **THEN** the Map view is shown

### Requirement: Failed logins do not reveal accounts
A failed login SHALL get the same answer whether the username does not exist, the password is wrong or the account is disabled. The answer SHALL be 401 and the page SHALL say that the username or password is wrong.

#### Scenario: Unknown user
- **WHEN** someone logs in as `nobody`
- **THEN** the page says the username or password is wrong, exactly as for a wrong password

#### Scenario: Disabled user
- **WHEN** a disabled user enters the correct password
- **THEN** the page says the username or password is wrong and no session is created

### Requirement: Repeated failed logins are slowed down
After 10 failed logins for the same username within 15 minutes, further logins for that username SHALL be refused with 429 for 15 minutes, even with the right password. The login page SHALL say how long to wait. A successful login SHALL reset the count.

#### Scenario: Too many attempts
- **WHEN** someone enters a wrong password for `anna` 10 times within 15 minutes and then the right one
- **THEN** the login is refused with 429 and the page shows the remaining wait

### Requirement: Browser sessions
A successful interactive login SHALL start a session that is kept in a cookie that page scripts cannot read and that is not sent with requests from other sites. A session SHALL end after it has not been used for the time set in `.env` (default 30 days), or when it is logged out or revoked. Each use SHALL extend it.

#### Scenario: Session survives a browser restart
- **WHEN** `anna` logs in, closes the browser and opens Paloma the next day
- **THEN** she is still logged in

#### Scenario: Idle session expires
- **WHEN** a session has not been used for longer than the configured lifetime
- **THEN** the next request gets 401 and the client shows the login page

### Requirement: Log out
The user menu SHALL offer Log out. Logging out SHALL end the current session on the server, and the client SHALL show the login page. Other sessions of the same user SHALL stay.

#### Scenario: Log out
- **WHEN** `anna` is logged in on a laptop and a phone and chooses Log out on the laptop
- **THEN** the laptop shows the login page and the phone stays logged in

### Requirement: Own sessions
A logged-in user SHALL be able to list their own sessions, each with when it was started and last used, the browser and address it was last used from, and which one is the current one. The user SHALL be able to revoke any of them. A revoked session SHALL stop working at its next request.

#### Scenario: Revoke the phone
- **WHEN** `anna` revokes her phone's session from the laptop
- **THEN** the phone's next request gets 401 and it shows the login page

### Requirement: Current user endpoint
`GET /api/auth/me` SHALL return the current user's id, username, display name, role, effective permissions, library access, quotas with their usage, and how the request was authenticated (`session` or `token`). With auth off it SHALL return mode `off` and every permission.

#### Scenario: Viewer asks who they are
- **WHEN** a user with role `viewer` requests `GET /api/auth/me`
- **THEN** the response lists only the `viewer` role's permissions

### Requirement: Auth providers come from plugins
Every way to log in or to authenticate a request SHALL be provided by an enabled plugin's auth provider. Core Paloma SHALL keep users, sessions, roles and permissions. A provider SHALL only check credentials and name the user they belong to. With no enabled provider, nobody SHALL be able to log in.

#### Scenario: Password plugin provides the login form
- **WHEN** the bundled `auth-password` plugin is on
- **THEN** the login page has a username and password form

#### Scenario: Provider names an unknown or disabled user
- **WHEN** a provider accepts credentials for a user that does not exist or is disabled
- **THEN** no session is created and the login fails as for wrong credentials

### Requirement: Bundled password provider
The bundled `auth-password` plugin SHALL let users log in with their username, case-insensitive, and password. Passwords SHALL have at least 8 characters. They SHALL be stored only as salted, slow hashes, never as text that can be read back.

#### Scenario: Username case
- **WHEN** user `anna` logs in as `Anna` with her password
- **THEN** the login succeeds

#### Scenario: Short password
- **WHEN** a password of 7 characters is set
- **THEN** it is refused with a message that passwords need at least 8 characters

#### Scenario: Password not readable
- **WHEN** `anna` sets the password `correct horse battery` and the database is inspected
- **THEN** the text `correct horse battery` does not appear in it

### Requirement: Change own password
A user logged in with a session SHALL be able to change their password by entering the current one and the new one twice. A successful change SHALL end all their other sessions. A user whose password was set by an administrator SHALL have to choose a new password right after their next login, before anything else is shown.

#### Scenario: Change password
- **WHEN** `anna` enters her current password and `new horse battery` twice
- **THEN** her password changes and her other sessions get 401

#### Scenario: Password reset by an administrator
- **WHEN** an administrator resets `ben`'s password and `ben` logs in with it
- **THEN** the client asks `ben` for a new password before showing the library

### Requirement: Cross-origin requests when auth is on
When auth is on, the server SHALL accept browser requests with credentials only from the client origin set in `.env`. Requests from other origins SHALL NOT be able to read responses.

#### Scenario: Other site
- **WHEN** auth is on and a page from another origin calls `GET /api/photos` with credentials
- **THEN** the browser does not let that page read the response
