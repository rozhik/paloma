# Spec Delta

## Purpose

Defines AI providers: services contributed by plugins that look at a photo and answer with tags, object boxes or text, how their settings and secrets are kept and entered, how their models are listed, and the bundled OpenAI provider.

## ADDED Requirements

### Requirement: Plugins contribute AI providers
A plugin's module SHALL be able to contribute AI providers. Each SHALL have an id unique across plugins (lowercase letters, digits and hyphens), a label, a list of settings, a way to list its models, optional model options, and a way to answer a request about one photo. A provider whose id is taken or whose definition is invalid SHALL NOT be available, and its plugin SHALL show a warning naming it.

#### Scenario: Bundled OpenAI provider
- **WHEN** Paloma starts with the bundled plugins on
- **THEN** `GET /api/plugins` lists `ai-openai` with the AI provider `openai`

#### Scenario: Duplicate provider id
- **WHEN** an enabled external plugin contributes an AI provider with the id `openai`
- **THEN** the bundled `openai` provider keeps working and the external plugin shows a warning naming `openai`

#### Scenario: Invalid provider
- **WHEN** an enabled external plugin contributes an AI provider without a label
- **THEN** that provider is not available, the plugin's other contributions still work, and the plugin shows a warning naming it

### Requirement: Provider settings
A provider SHALL declare its settings, each with a name, a label, a type (`text`, `secret`, `number`, `boolean` or `choice`), whether it is required, and optionally a default and a help text. A provider SHALL be `configured` when every required setting has a value and the provider names no other missing setting for the current values, and `not configured` otherwise.

#### Scenario: OpenAI without a key
- **WHEN** no API key is saved for `openai` and the environment gives none
- **THEN** `openai` is listed as not configured, naming the API key as missing

#### Scenario: OpenAI with a key
- **WHEN** an administrator saves an API key for `openai`
- **THEN** `openai` is listed as configured

### Requirement: Provider settings are kept on the server
Saved provider settings SHALL be kept in Paloma's data directory and survive restarts. They SHALL apply to every user. Switching a plugin off or on SHALL keep its providers' settings.

#### Scenario: Settings survive a restart
- **WHEN** an administrator saves a base URL for `openai` and the server restarts
- **THEN** `openai` has the same base URL

#### Scenario: Plugin switched off and on
- **WHEN** an administrator switches `ai-openai` off and on again
- **THEN** its saved API key and base URL are unchanged

### Requirement: Secrets are never sent to clients
The value of a `secret` setting SHALL NOT be returned by any API or written to logs. The API SHALL return only whether it is set. Saving the settings without a secret's value SHALL keep the saved value; saving it as an empty string SHALL remove it.

#### Scenario: Read settings with a key
- **WHEN** an administrator requests the settings of `openai` after saving an API key
- **THEN** the response says the API key is set and does not contain the key

#### Scenario: Change only the base URL
- **WHEN** an administrator saves `openai` settings with a new base URL and no API key value
- **THEN** the saved API key is kept

#### Scenario: Remove the key
- **WHEN** an administrator saves `openai` settings with an empty API key
- **THEN** the API key is no longer set and `openai` is not configured

### Requirement: Provider settings API
`GET /api/ai/providers` SHALL return every available AI provider with its id, plugin id, label, settings with their definitions and values (secrets only as set or not set), status (`configured` or `not configured` with the missing settings), and model options. `PUT /api/ai/providers/:id/settings` SHALL save settings and respond with the provider. Both SHALL need `plugins.manage` when auth is on and otherwise fail with 403. An unknown provider SHALL fail with 404; a value of the wrong type or a missing required value SHALL fail with 400 naming the setting.

#### Scenario: Editor reads providers
- **WHEN** auth is on and an editor requests `GET /api/ai/providers`
- **THEN** the server responds 403 naming `plugins.manage`

#### Scenario: Wrong type
- **WHEN** an administrator saves the `number` setting `timeoutSeconds` of a provider as `"fast"`
- **THEN** the server responds 400 naming `timeoutSeconds` and nothing is saved

### Requirement: Listing models
`GET /api/ai/providers/:id/models` SHALL return the provider's models, each with an id and a label, as the provider reports them for the saved settings. It SHALL need `plugins.manage`. When the provider is not configured or the service fails, it SHALL respond 502 with the provider's error message, and the AI section SHALL still let the user type a model id.

#### Scenario: Models from OpenAI
- **WHEN** `openai` is configured with a valid key and an administrator opens the model selector
- **THEN** the selector lists the models the OpenAI API returns for that key

#### Scenario: Service unreachable
- **WHEN** the base URL of `openai` points to a server that does not answer
- **THEN** the model selector shows the error and accepts a typed model id

### Requirement: Connection test
`POST /api/ai/providers/:id/test` SHALL check that the provider can be reached with the saved settings and SHALL respond with success or with the provider's error message, without processing any photo. It SHALL need `plugins.manage`.

#### Scenario: Wrong key
- **WHEN** an administrator tests `openai` with an invalid API key
- **THEN** the AI section shows that the test failed with the service's message about the key

### Requirement: Model options
A provider SHALL be able to declare model options, each a `number` (minimum, maximum, step, default), `boolean` (default) or `choice` (options, default) with a name and a label. Tasks SHALL set values for them, and the provider SHALL receive each declared option with its default filled in when a task leaves it unset.

#### Scenario: OpenAI options
- **WHEN** an administrator edits a task that uses `openai`
- **THEN** the task offers the options temperature and image detail (`auto`, `low`, `high`)

### Requirement: Provider answers
A provider SHALL be asked about one photo at a time and SHALL answer with the output the task asks for: a list of tags (each a name and optionally a confidence from 0 to 1), a list of objects (each a label, a rectangle as fractions 0..1 of the image sent, and optionally a confidence), or a text. It MAY add the tokens used. Paloma SHALL check each answer: rectangles SHALL be clipped to the image, and empty labels, empty tags and rectangles with no area SHALL be dropped.

#### Scenario: Box outside the image
- **WHEN** a provider answers with an object `dog` whose rectangle has `right: 1.2`
- **THEN** the object `dog` is kept with `right: 1`

#### Scenario: Empty tag
- **WHEN** a provider answers with the tags `beach`, an empty string, and `sea`
- **THEN** the result has the tags `beach` and `sea`

### Requirement: Bundled OpenAI plugin
Paloma SHALL ship the plugin `ai-openai`, on by default, with the provider `openai` for the OpenAI API and servers compatible with it. Its settings SHALL be an API key (`secret`), a base URL (default `https://api.openai.com/v1`) and a request timeout in seconds; the API key SHALL be required only while the base URL is the default. When no API key or base URL is saved, it SHALL use the server's `OPENAI_API_KEY` and `OPENAI_BASE_URL` environment variables, and the AI section SHALL say that the value comes from the environment.

#### Scenario: Local compatible server
- **WHEN** an administrator sets the base URL of `openai` to `http://localhost:11434/v1`, leaves the API key empty, and runs a task
- **THEN** the photos are sent to `http://localhost:11434/v1` and not to OpenAI

#### Scenario: Key from the environment
- **WHEN** the server runs with `OPENAI_API_KEY` set and no key is saved in the AI section
- **THEN** `openai` is configured and the AI section says the API key comes from the environment

### Requirement: Providers in the AI section
The AI section of Server settings SHALL list every available AI provider with its plugin, its status, a form for its settings (a secret shown only as set or not set, with a way to replace or remove it), Save and Test connection buttons. It SHALL say that photos processed with a provider are sent to the service at its address. When no provider is available, it SHALL say that an AI plugin must be switched on in the Plugins section.

#### Scenario: Enter the OpenAI key
- **WHEN** an administrator opens the AI section, types an API key for `openai` and saves
- **THEN** the form shows the API key as set, the field is empty, and `openai` shows as configured

#### Scenario: No provider
- **WHEN** `ai-openai` is switched off and no other plugin contributes an AI provider
- **THEN** the AI section says that an AI plugin must be switched on in the Plugins section
