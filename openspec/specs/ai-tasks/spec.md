# ai-tasks Specification

## Purpose

Defines AI tasks: server-wide, editable descriptions of what to ask an AI provider about a photo — which provider and model, which prompt and options, and what kind of answer is expected — including the built-in Tags, Objects and Description tasks and tasks the user adds.

## Requirements

### Requirement: A task names what to ask and what comes back
An AI task SHALL have an id, a name, an output kind (`tags`, `objects` or `text`), whether it is offered in the AI menus, a provider and a model, a prompt, values for the provider's model options, and the Paloma options of its output kind. Tasks SHALL be kept in Paloma's data directory, survive restarts and apply to every user.

#### Scenario: Task survives a restart
- **WHEN** an administrator changes the prompt of the Tags task and the server restarts
- **THEN** the Tags task has the changed prompt

### Requirement: Built-in tasks
Paloma SHALL have three built-in tasks: `tags` (output `tags`, named Tags), `objects` (output `objects`, named Objects) and `description` (output `text`, named Description), each with a default prompt and options. A built-in task's output kind SHALL NOT change and it SHALL NOT be deleted. Its other fields SHALL be editable, and resetting it SHALL bring back its defaults except its provider and model. A built-in task whose name was never changed SHALL be shown in the active UI language.

#### Scenario: Reset Tags
- **WHEN** an administrator has changed the prompt of Tags and chooses Reset
- **THEN** Tags has its default prompt and options, and keeps its provider and model

#### Scenario: Delete a built-in task
- **WHEN** a client sends `DELETE /api/ai/tasks/tags`
- **THEN** the server responds 409 and Tags still exists

#### Scenario: Name in Ukrainian
- **WHEN** the UI language is Ukrainian and the Description task's name was never changed
- **THEN** the AI menu shows it as `Опис`

### Requirement: Custom tasks
An administrator SHALL be able to add a task with a name, an output kind, a provider, a model, a prompt and options, and to change or delete it. Deleting a task SHALL delete its stored results and object boxes, and SHALL NOT change any tag or description already written to photos.

#### Scenario: Add a task for landmarks
- **WHEN** an administrator adds a task `Landmarks` with output `tags` and the prompt `Name the famous landmarks in this photo`
- **THEN** `Landmarks` is offered in the AI menus

#### Scenario: Delete a custom task
- **WHEN** `Landmarks` added the tag `Eiffel Tower` to `a.jpg` and an administrator deletes `Landmarks`
- **THEN** `a.jpg` still has the tag `Eiffel Tower` and the Info panel of `a.jpg` shows no `Landmarks` result

### Requirement: Provider and model selector
Each task SHALL choose an available AI provider by name and one of its enabled models. The selector SHALL list the providers, then the enabled models of the chosen provider, and SHALL accept a typed model id, which adds that model to the provider as enabled. A task SHALL be ready when its provider is available and configured and it has a model that is enabled; a task that is not ready SHALL say why.

#### Scenario: Choose a model
- **WHEN** an administrator chooses the provider `OpenAI` for Objects and then an enabled model from the list
- **THEN** Objects uses that provider and model and is ready

#### Scenario: Plugin switched off
- **WHEN** Tags uses a provider of type `openai` and `ai-openai` is switched off
- **THEN** Tags is not ready, says that its provider is not available, and keeps its model

#### Scenario: Disabled model
- **WHEN** the model of Tags is disabled
- **THEN** Tags is not ready, says that its model is disabled, and keeps its model

#### Scenario: Disabled models are not offered
- **WHEN** a provider has the enabled model `llava` and the disabled model `bakllava`
- **THEN** the selector lists `llava` and not `bakllava`

### Requirement: Prompt placeholders
A prompt SHALL be able to contain these placeholders, replaced for each photo before it is sent: `{language}` (the English name of the task's language), `{maxTags}`, `{photoTags}` (the photo's current tags, comma-separated), `{description}` (the photo's current description) and `{libraryTags}` (the 300 tags used by the most photos, comma-separated). Other text in braces SHALL be sent unchanged.

#### Scenario: Reuse the library's tags
- **WHEN** the Tags prompt contains `Prefer these tags: {libraryTags}` and the library's most used tags are `family` and `sea`
- **THEN** the prompt sent for each photo contains `Prefer these tags: family, sea`

#### Scenario: Unknown placeholder
- **WHEN** a prompt contains `{camera}`
- **THEN** `{camera}` is sent as written

### Requirement: Task options
Every task SHALL have the options: image size (the long edge of the image sent, 256 to 2048 pixels, default 1024), language (the language of the user who starts the run, or a fixed language; default the user's) and parallel requests (1 to 8, default 2). Tasks with output `tags` SHALL also have maximum tags (1 to 50, default 10) and minimum confidence (0 to 1, default 0.5); `objects` SHALL have minimum confidence and whether labels are also added as tags (default off); `text` SHALL have where the text goes: the description when it is empty (default), the description always, or nowhere.

#### Scenario: Fixed language
- **WHEN** the Tags task's language is set to English and a Ukrainian user runs it
- **THEN** the prompt's `{language}` is replaced with `English`

#### Scenario: Out of range
- **WHEN** an administrator saves a task with image size 4000
- **THEN** the server responds 400 naming the image size and the task is unchanged

### Requirement: Changing a task makes it process photos again
A change of a task's provider, model, prompt, model options, image size or language SHALL make photos processed before by this task count as not processed by it. A change of only its name, its menu switch or its other options SHALL NOT.

#### Scenario: New prompt
- **WHEN** Tags processed folder `2024` and an administrator changes its prompt
- **THEN** running Tags on `2024` again processes all its photos

#### Scenario: Rename only
- **WHEN** an administrator renames Tags to `Keywords`
- **THEN** running it on `2024` again processes no photos

### Requirement: Tasks API
`GET /api/ai/tasks` SHALL return every task with its fields and readiness, and SHALL need `ai.run` or `plugins.manage`. `POST /api/ai/tasks`, `PATCH /api/ai/tasks/:id`, `DELETE /api/ai/tasks/:id` and `POST /api/ai/tasks/:id/reset` SHALL add, change, delete and reset tasks and SHALL need `plugins.manage`. Invalid fields SHALL fail with 400 naming the field, an unknown task with 404, and deleting or resetting what is not allowed with 409. Without the permission they SHALL fail with 403.

#### Scenario: Editor changes a prompt
- **WHEN** auth is on and an editor sends `PATCH /api/ai/tasks/tags` with a new prompt
- **THEN** the server responds 403 naming `plugins.manage`

#### Scenario: Reset a custom task
- **WHEN** a client sends `POST /api/ai/tasks/<id of Landmarks>/reset`
- **THEN** the server responds 409

### Requirement: Tasks in the AI section
The AI section of Server settings SHALL list the tasks with their name, output kind, provider, model and readiness, and SHALL let an administrator add a task and edit, reset or delete one as allowed. The task editor SHALL show the provider and model selector, the prompt in a multi-line field with the list of placeholders, the provider's model options and the task's options, all labelled in the active UI language.

#### Scenario: Edit the Objects prompt
- **WHEN** an administrator opens Objects in the AI section, changes the prompt and saves
- **THEN** the task list shows Objects as changed and the next run uses the new prompt
