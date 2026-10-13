# Spec Delta

## ADDED Requirements

### Requirement: Scans run as system tasks
The start-up scan of each configured folder SHALL run as a `scan` task started by Paloma. Changes the watchers find while the server runs SHALL be applied by a `scan` task for that configured folder; changes found while such a task waits SHALL join it. A new scan task SHALL be placed after the waiting scan tasks and before every waiting user task. Its progress SHALL count the files checked.

#### Scenario: Start-up scans
- **WHEN** the server starts with `PALOMA_PHOTOS_DIRS=/photos/a,/photos/b`
- **THEN** the Tasks view shows a scan task for `/photos/a` and one for `/photos/b`, started by Paloma, ahead of any user task

#### Scenario: Photos copied in during an AI task
- **WHEN** an AI task is running and 20 photos are copied into `/photos/a`
- **THEN** one scan task for `/photos/a` waits ahead of the user tasks, and the photos appear in the library after the AI task ends and the scan task has run

#### Scenario: More changes while waiting
- **WHEN** a scan task for `/photos/a` is waiting and another photo is copied into `/photos/a`
- **THEN** no second scan task is added and the waiting one also indexes the new photo

### Requirement: Pausing and cancelling a scan
A paused or cancelled scan task SHALL keep the photos indexed so far. Resuming a paused scan SHALL check the rest of its files. After a cancelled scan, files it did not check SHALL be checked by the next scan of that folder, at the latest at the next start.

#### Scenario: Cancel the start-up scan
- **WHEN** an administrator cancels the start-up scan of `/photos/a` after half of its photos were indexed
- **THEN** those photos stay in the library, and the rest appear after the next server start
