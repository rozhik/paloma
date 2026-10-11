# Spec Delta

## Purpose

Defines how AI tasks are run on photos: starting, following and cancelling a run, which photos are skipped, how results are stored, how tags and descriptions from AI reach the photos, and where AI results and actions appear in the library and the viewer.

## ADDED Requirements

### Requirement: Running a task on photos
A user with `ai.run` SHALL be able to run a ready task on a list of photos. The run SHALL happen on the server and continue when the browser is closed or reloaded. Only one run SHALL exist on the server at a time. Videos and photos the user cannot see SHALL be skipped.

#### Scenario: Run Tags on a folder
- **WHEN** a folder of 40 photos and 2 videos is shown and the user runs Tags on it
- **THEN** the server processes the 40 photos with the Tags task and skips the videos

#### Scenario: Second run
- **WHEN** a run is in progress and another user starts Objects
- **THEN** the server responds 409 and the AI menus do not offer starting a task until the run ends

#### Scenario: Task not ready
- **WHEN** a client starts Tags while its provider is not configured
- **THEN** the server responds 400 saying that Tags is not ready

### Requirement: Processed photos are skipped
A run SHALL skip photos that the same task already processed successfully with its current configuration on their current content, unless the user chose Run again, which SHALL process every photo of the list.

#### Scenario: Partly processed folder
- **WHEN** Tags already processed 10 of the 40 photos of a folder and the user runs Tags on it
- **THEN** the run processes the other 30 photos

#### Scenario: Run again
- **WHEN** the user chooses Run again for Tags on the same folder
- **THEN** the run processes all 40 photos

#### Scenario: Edited content
- **WHEN** the file `a.jpg` was replaced with different content after Tags processed it
- **THEN** the next Tags run processes `a.jpg`

### Requirement: Run progress
While a run exists, every browser of a user with `ai.run` SHALL show a circular progress indicator over the grid with the task's name, the share of photos done and the count, e.g. `12 / 30`. The grid SHALL stay usable. Activating the indicator SHALL offer to cancel the run. When the run ends, the indicator SHALL disappear and a message SHALL say how many photos were processed, how many tags were added, how many photos failed and, when the provider reported them, how many tokens were used.

#### Scenario: Progress after a reload
- **WHEN** a run of 30 photos has done 12 and the user reloads the page
- **THEN** the indicator shows `12 / 30` again

#### Scenario: Finished
- **WHEN** a Tags run over 30 photos ends after adding 95 tags with 2 photos failed
- **THEN** the indicator disappears and the message says 28 photos were processed, 95 tags were added and 2 photos failed

### Requirement: Cancelling and resuming a run
Cancelling SHALL stop the run after the requests in progress end, without starting new ones. Each photo's result SHALL be saved as soon as it arrives, so that a cancelled run, or a run ended by a server restart, loses at most the photos in progress, and a new run skips the photos already done.

#### Scenario: Cancel and restart
- **WHEN** the user cancels a Tags run of 30 photos after 12 and runs Tags again on the same grid
- **THEN** the new run processes the remaining 18 photos

### Requirement: Failures do not stop a run
When the provider fails on a photo, the photo SHALL count as failed with the provider's message and the run SHALL continue. When the service asks to slow down, the photo SHALL be retried after a wait, at most three times. When five photos in a row fail because the provider is not configured, refuses the credentials or cannot be reached, the run SHALL stop and its message SHALL show the provider's error.

#### Scenario: One unreadable photo
- **WHEN** one photo of a run cannot be read
- **THEN** that photo counts as failed and the other photos are processed

#### Scenario: Revoked key
- **WHEN** the OpenAI key was revoked and a run starts
- **THEN** the run stops after five failed photos and the message shows the service's error about the key

### Requirement: Results are stored in the library
For each photo and task, the last successful result SHALL be stored in the library database with the provider, model, time, the tags, objects or text returned, and the tokens used when reported. A new result of the same task SHALL replace the previous one. A result for content the photo no longer has SHALL NOT be shown. Storing results SHALL NOT create or change any file in the photo folders.

#### Scenario: Objects run on a Picasa folder
- **WHEN** Objects runs on a folder with `.picasa.ini` and no `.paloma.json`
- **THEN** no `.paloma.json` is created and `.picasa.ini` is unchanged

#### Scenario: Run again replaces
- **WHEN** Objects found a `dog` on `a.jpg` and a later Objects run on `a.jpg` finds a `cat` only
- **THEN** `a.jpg` has the Objects result `cat` only

### Requirement: Tags from AI are added to the photo
After a task with output `tags` processes a photo, the returned tags with no confidence or at least the task's minimum confidence, at most the task's maximum, SHALL be added to the photo's tags as when the user adds tags, ignoring case duplicates. The same SHALL apply to object labels when the Objects task adds labels as tags. AI SHALL NOT remove or change existing tags. When a folder cannot be written, the result SHALL be stored and the photo SHALL count as failed.

#### Scenario: Tags added
- **WHEN** `a.jpg` has the tag `Family` and Tags returns `family` (0.9), `beach` (0.8) and `boat` (0.3) with minimum confidence 0.5
- **THEN** `a.jpg` has the tags `Family` and `beach`, and its folder's `.paloma.json` contains them

#### Scenario: Removed tag is added again
- **WHEN** the user removed the tag `beach` that Tags added to `a.jpg`, and Tags runs again on `a.jpg`
- **THEN** `a.jpg` has the tag `beach` again

### Requirement: Text from AI fills the description
After a task with output `text` processes a photo, its text SHALL become the photo's description when the task's option says the description when it is empty and the photo has no description, or when it says the description always. Otherwise the text SHALL only be stored as the result.

#### Scenario: Photo with a description
- **WHEN** `a.jpg` has the description `Grandma's birthday` and Description runs with its default option
- **THEN** the description of `a.jpg` is unchanged and its Description result shows the new text

#### Scenario: Photo without a description
- **WHEN** `b.jpg` has no description and Description returns `Two children on a sandy beach`
- **THEN** `b.jpg` has the description `Two children on a sandy beach`

### Requirement: AI results of a photo
`GET /api/photos/:id/ai` SHALL return the photo's shown results, one per task, with the task's id and name, the provider, model, time, the tags, objects or text, and the tokens used. It SHALL need `library.view` and SHALL respond 404 for a photo the user cannot see.

#### Scenario: Results of a photo
- **WHEN** Tags and Objects processed `a.jpg` and a client requests its AI results
- **THEN** the response has a Tags result with its tags and an Objects result with its objects and their rectangles

### Requirement: Runs API
`POST /api/ai/runs` with a task id, photo ids and whether to run again SHALL start a run and respond 202 with it. `GET /api/ai/runs/current` SHALL return the run in progress with its task, counts and state, or nothing, and the last run's summary. `DELETE /api/ai/runs/current` SHALL cancel it. They SHALL need `ai.run` and otherwise fail with 403; an unknown task SHALL fail with 404 and invalid photo ids with 400.

#### Scenario: Viewer starts a run
- **WHEN** auth is on and a viewer sends `POST /api/ai/runs`
- **THEN** the server responds 403 naming `ai.run`

### Requirement: AI menu in grid headers
Wherever a grid header offers Find faces, it SHALL also offer an AI menu, from the Normal level, to users with `ai.run`. The menu SHALL list the tasks offered in menus, each running on all photos the grid shows; tasks that are not ready SHALL be shown disabled with the reason. It SHALL offer Run again for each task, and to users with `plugins.manage` a link to the AI section. While a run exists, the tasks SHALL be disabled.

#### Scenario: Run Objects from an album
- **WHEN** album `Trip` is shown and the user chooses Objects in its AI menu
- **THEN** Objects runs on all photos of `Trip`

#### Scenario: Easy level
- **WHEN** the level is Easy
- **THEN** no grid header offers the AI menu

#### Scenario: No configured provider
- **WHEN** `openai` is not configured and the user opens the AI menu
- **THEN** every task is disabled and says that its provider is not configured

### Requirement: Object frames in the viewer
From the Normal level, the viewer SHALL have an Objects toggle that draws the shown object boxes of the photo, each labelled with its label and, when known, its confidence. Frames SHALL follow zoom, pan and the photo's crop, rotate and flip edits, as face frames do, and SHALL NOT be drawn when other edits move pixels. The toggle SHALL be remembered in this browser.

#### Scenario: Show objects
- **WHEN** Objects found a `dog` (0.92) and a `ball` on `a.jpg` and the user turns Objects on
- **THEN** a frame labelled `dog 92%` and a frame labelled `ball` are drawn over them

#### Scenario: Cropped photo
- **WHEN** `a.jpg` has a crop step and the user turns Objects on
- **THEN** the frames are drawn over the same objects in the cropped photo, and an object outside the crop is not drawn

### Requirement: AI section in the Info panel
From the Normal level, the Info panel SHALL have an AI section listing the photo's results, each with the task's name, the model, the date and the tags, object labels or text. Users with `ai.run` SHALL be able to run a ready task again on this photo from the section; its result SHALL appear when it arrives.

#### Scenario: Run Description on one photo
- **WHEN** the user opens the Info panel of `a.jpg` and runs Description from its AI section
- **THEN** a run of one photo starts, and when it ends the section shows the new Description result

#### Scenario: No results
- **WHEN** no task processed `a.jpg`
- **THEN** the AI section says that the photo has no AI results and offers the ready tasks to users with `ai.run`
