# Spec Delta

## ADDED Requirements

### Requirement: Named provider instances
An administrator SHALL be able to create any number of AI providers from the provider types that plugins contribute. Each provider SHALL have a generated id that never changes, a required name unique among providers (1 to 60 characters, compared ignoring case), its type, and its own settings. An administrator SHALL be able to rename and delete a provider.

#### Scenario: Two servers of the same type
- **WHEN** an administrator creates `OpenAI` and `Local Ollama`, both from the type `openai`, with different addresses
- **THEN** both are listed with their own settings and each can be chosen by a task

#### Scenario: Name required and unique
- **WHEN** an administrator creates a provider with an empty name, or with the name `openai` when `OpenAI` exists
- **THEN** the server responds 400 naming the name and nothing is created

#### Scenario: Plugin of the type switched off
- **WHEN** `ai-openai` is switched off
- **THEN** providers made from `openai` stay listed, not available, with their settings and models kept

### Requirement: Deleting a provider
A provider used by a task SHALL NOT be deleted. Deleting a provider SHALL delete its saved settings and model list but not its usage records.

#### Scenario: Delete a provider in use
- **WHEN** the Tags task uses the provider `Local Ollama` and an administrator deletes it
- **THEN** the server responds 409 naming Tags and the provider remains

#### Scenario: Delete an unused provider
- **WHEN** no task uses `Local Ollama` and an administrator deletes it
- **THEN** its settings and models are gone and its earlier usage records remain

### Requirement: Existing provider becomes an instance
When Paloma starts with settings saved for the type `openai` before providers had names, it SHALL turn them into one provider with the id `openai` and the name `OpenAI`, keeping the saved settings. Tasks that name `openai` SHALL keep working.

#### Scenario: Upgrade
- **WHEN** an earlier version saved an API key for `openai` and the Tags task uses `openai`
- **THEN** after the upgrade a provider `OpenAI` with the same key exists and Tags is still ready

## MODIFIED Requirements

### Requirement: Provider settings API
`GET /api/ai/providers` SHALL return every AI provider with its id, name, type, plugin id, settings with their definitions and values (secrets only as set or not set), status (`configured` or `not configured` with the missing settings), and model options. `POST /api/ai/providers` SHALL create a provider from a type and a name, `PATCH /api/ai/providers/:id` SHALL rename it, `DELETE /api/ai/providers/:id` SHALL delete it, and `PUT /api/ai/providers/:id/settings` SHALL save settings and respond with the provider. All SHALL need `plugins.manage` when auth is on and otherwise fail with 403. An unknown provider SHALL fail with 404; a value of the wrong type or a missing required value SHALL fail with 400 naming the setting.

#### Scenario: Editor reads providers
- **WHEN** auth is on and an editor requests `GET /api/ai/providers`
- **THEN** the server responds 403 naming `plugins.manage`

#### Scenario: Wrong type
- **WHEN** an administrator saves the `number` setting `timeoutSeconds` of a provider as `"fast"`
- **THEN** the server responds 400 naming `timeoutSeconds` and nothing is saved

#### Scenario: Create a provider
- **WHEN** an administrator sends `POST /api/ai/providers` with the type `openai` and the name `Local Ollama`
- **THEN** the server responds with the new provider, not configured until its settings are saved

### Requirement: Bundled OpenAI plugin
Paloma SHALL ship the plugin `ai-openai`, on by default, with the provider type `openai` for the OpenAI API and servers compatible with it. Its settings SHALL be an API key (`secret`), a base URL (default `https://api.openai.com/v1`) and a request timeout in seconds; the API key SHALL be required only while the base URL is the default. A provider made from it SHALL use the server's `OPENAI_API_KEY` and `OPENAI_BASE_URL` environment variables for a missing key or address only when it is the provider with the id `openai`, and the AI section SHALL say that the value comes from the environment. It SHALL list models from `/models`, read one from `/models/{model}`, and report token usage as described by the usage log.

#### Scenario: Local compatible server
- **WHEN** an administrator sets the base URL of a provider of type `openai` to `http://localhost:11434/v1`, leaves the API key empty, and runs a task
- **THEN** the photos are sent to `http://localhost:11434/v1` and not to OpenAI

#### Scenario: Key from the environment
- **WHEN** the server runs with `OPENAI_API_KEY` set and no key is saved for the provider `OpenAI`
- **THEN** `OpenAI` is configured and the AI section says the API key comes from the environment

#### Scenario: Environment does not leak to other providers
- **WHEN** `OPENAI_API_KEY` is set and an administrator creates `Local Ollama` from the type `openai` without a key
- **THEN** `Local Ollama` does not use the environment key

### Requirement: Providers in the AI section
The AI section of Server settings SHALL list every AI provider by name with its type, plugin, status, a form for its settings (a secret shown only as set or not set, with a way to replace or remove it), Save and Test connection buttons, and buttons to add, rename and delete providers. It SHALL say that photos processed with a provider are sent to the service at its address. When no provider type is available, it SHALL say that an AI plugin must be switched on in the Plugins section.

#### Scenario: Enter the OpenAI key
- **WHEN** an administrator opens the AI section, types an API key for `OpenAI` and saves
- **THEN** the form shows the API key as set, the field is empty, and `OpenAI` shows as configured

#### Scenario: Add a provider
- **WHEN** an administrator chooses Add provider, picks the type `openai` and names it `Local Ollama`
- **THEN** `Local Ollama` appears in the list with an empty settings form

#### Scenario: No provider
- **WHEN** `ai-openai` is switched off and no other plugin contributes an AI provider
- **THEN** the AI section says that an AI plugin must be switched on in the Plugins section
