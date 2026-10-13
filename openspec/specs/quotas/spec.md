# quotas Specification

## Purpose

Limits how much each user can use Paloma: the disk space their exports and movies take, and how many API requests they can make per minute. It also shows them how much they have used.

## Requirements

### Requirement: Quotas apply only when auth is on
Quotas SHALL be kept on each user and SHALL apply only when auth is on. Each quota SHALL have a limit or be unlimited.

#### Scenario: Auth off
- **WHEN** auth is off
- **THEN** exports and requests are not limited

### Requirement: Each user exports into their own folder
When auth is on, exports and movies SHALL be written only inside a folder named after the user's username in the export folder set in `.env`. A destination entered in the app SHALL be relative to that folder. A destination that leads outside it SHALL be refused with 400.

#### Scenario: Export destination
- **WHEN** `ben` exports two photos to the destination `holiday`
- **THEN** the files are written to `<export folder>/ben/holiday`

#### Scenario: Escaping the user folder
- **WHEN** `ben` exports to the destination `../anna`
- **THEN** the server responds 400 and nothing is written

### Requirement: Export space quota
A user's export space quota SHALL limit the total size of the files in their export folder. An export or movie SHALL be refused with 409 when the folder is already at or over the limit when it is requested. An export task SHALL check the space again when it runs. If writing would go over the limit, Paloma SHALL stop before the file that would cross it. It SHALL keep the files already written and report how many were exported and that the quota is reached.

#### Scenario: Quota already used up
- **WHEN** `ben` has a 500 MB export quota, his export folder holds 500 MB, and he exports one photo
- **THEN** the server responds 409, no task is added, nothing is written, and the client says that his export space is full

#### Scenario: Quota reached during an export
- **WHEN** `ben` has 20 MB left and exports ten photos of 5 MB each
- **THEN** four photos are written, the export task ends, and its message says that 4 of 10 photos were exported because his export space is full

#### Scenario: Space used up while waiting
- **WHEN** `ben` queues two exports and the first one fills his export space
- **THEN** the second export task writes nothing and its message says that his export space is full

#### Scenario: Space freed on disk
- **WHEN** `ben` deletes files from his export folder outside Paloma
- **THEN** his next export counts only the files that remain

### Requirement: Request rate quota
A user's request rate quota SHALL limit the API requests per minute that their sessions make together, and, separately, that each of their tokens makes. Requests for images SHALL NOT count. Over the limit, requests SHALL get 429 with the seconds to wait until the next request is allowed. The default limit SHALL come from `.env`.

#### Scenario: Script over the limit
- **WHEN** `ben`'s limit is 120 requests per minute and his script sends 121 within a minute with one token
- **THEN** the 121st request gets 429 with the seconds to wait, and `ben`'s browser keeps working

#### Scenario: Thumbnails do not count
- **WHEN** `ben` scrolls through a folder that loads 500 thumbnails within a minute
- **THEN** no request gets 429

### Requirement: Quota usage is shown
The Account view SHALL show the user's export space used and its limit. The Admin view's user list SHALL show each user's export space used and limit. A quota near or at its limit SHALL be marked.

#### Scenario: Usage in Account
- **WHEN** `ben` has used 450 MB of 500 MB
- **THEN** the Account view shows `450 MB of 500 MB` marked as nearly full

### Requirement: Default quotas for new users
New users SHALL get unlimited export space and the default request rate unless the administrator sets other limits when creating them.

#### Scenario: New user
- **WHEN** an administrator creates `carol` without setting quotas
- **THEN** `carol` has unlimited export space and the request rate from `.env`

### Requirement: Export runs as a task
`POST /api/export` SHALL check the request and the destination, add an `export` task to the queue and respond 202 with it. When the task ends, the user who started it SHALL see how many photos were exported, where, and the written files. Movies SHALL NOT be tasks.

#### Scenario: Export two photos
- **WHEN** `ben` exports two photos to `holiday`
- **THEN** the server responds 202 with an export task, and when it ends `ben` sees that 2 photos were exported to `holiday`

#### Scenario: Invalid destination is refused at once
- **WHEN** `ben` exports to `../anna`
- **THEN** the server responds 400 and no task is added
