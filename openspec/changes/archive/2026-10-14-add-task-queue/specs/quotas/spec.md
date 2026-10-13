# Spec Delta

## MODIFIED Requirements

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

## ADDED Requirements

### Requirement: Export runs as a task
`POST /api/export` SHALL check the request and the destination, add an `export` task to the queue and respond 202 with it. When the task ends, the user who started it SHALL see how many photos were exported, where, and the written files. Movies SHALL NOT be tasks.

#### Scenario: Export two photos
- **WHEN** `ben` exports two photos to `holiday`
- **THEN** the server responds 202 with an export task, and when it ends `ben` sees that 2 photos were exported to `holiday`

#### Scenario: Invalid destination is refused at once
- **WHEN** `ben` exports to `../anna`
- **THEN** the server responds 400 and no task is added
