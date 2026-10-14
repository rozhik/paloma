# Spec Delta

## Purpose

Defines the model catalogue of each AI provider: what is known about a model, which models may be used, what they cost per token and how well they do each kind of work, and who can see and change this.

## ADDED Requirements

### Requirement: Providers keep a model list
Each AI provider SHALL keep a list of models, each with an id. Administrators SHALL be able to refresh the list from the provider, which adds models the provider reports and keeps the models it no longer reports, marked as not listed by the provider. They SHALL also be able to add a model by typing its id.

#### Scenario: Refresh from the service
- **WHEN** an administrator refreshes the models of `Local Ollama` and the service lists `llava` and `moondream`
- **THEN** the provider's model list contains `llava` and `moondream`

#### Scenario: Model disappears from the service
- **WHEN** a stored model is no longer reported by the service on refresh
- **THEN** the model stays in the list marked as not listed by the provider, with its prices and capabilities

#### Scenario: Service unreachable
- **WHEN** the refresh fails
- **THEN** the server responds 502 with the provider's message and the stored list is unchanged

### Requirement: Model information
For each model Paloma SHALL keep the information the provider reports for it (from its model list and, when it offers one, its single-model endpoint, e.g. `/v1/models/{model}`): at least the id and, when reported, the owner and creation date. Every user who can view the library SHALL be able to read it. Refreshing SHALL update it.

#### Scenario: User reads model information
- **WHEN** a viewer requests the models of a provider
- **THEN** the response has each enabled model's id, description, information, prices and capabilities

#### Scenario: Details unavailable
- **WHEN** the provider offers no single-model endpoint
- **THEN** the model keeps the information from the model list

### Requirement: Enabling and disabling models
Each model SHALL be enabled or disabled. A model found by a refresh SHALL start disabled; a model added by typing its id SHALL start enabled. Only administrators (`plugins.manage`) SHALL change it. Users without `plugins.manage` SHALL see only enabled models. A disabled model SHALL NOT be chosen for a task, and a task that uses it SHALL NOT be ready.

#### Scenario: New model starts disabled
- **WHEN** a refresh finds the model `gpt-x`
- **THEN** `gpt-x` is disabled and tasks cannot select it

#### Scenario: Disable a model in use
- **WHEN** an administrator disables the model of the Tags task
- **THEN** Tags is not ready and says its model is disabled, and runs already started finish

#### Scenario: Viewer sees enabled only
- **WHEN** a viewer requests the models of a provider that has one enabled and one disabled model
- **THEN** only the enabled model is returned

### Requirement: Model description
Each model SHALL have a description that an administrator can edit and that every user who can view the library can read. It SHALL start empty.

#### Scenario: Edit description
- **WHEN** an administrator saves the description `Fast, good at tags` for `llava`
- **THEN** every user sees that description for `llava`

#### Scenario: Description too long
- **WHEN** an administrator saves a description longer than 2000 characters
- **THEN** the server responds 400 and nothing is saved

### Requirement: Token prices
Each model SHALL have a price in credits per 1,000,000 tokens for each token kind: `prompt_tokens` and `completion_tokens`. A price SHALL be a number of at least 0 and SHALL default to 0. Every user who can view the library SHALL be able to read the prices; only administrators SHALL change them. A price change SHALL apply to later calls only.

#### Scenario: Set prices
- **WHEN** an administrator sets `prompt_tokens` to 0.15 and `completion_tokens` to 0.60 for `gpt-4o-mini`
- **THEN** every user sees those prices for `gpt-4o-mini`

#### Scenario: Negative price
- **WHEN** an administrator sets a price of -1
- **THEN** the server responds 400 naming the token kind and nothing is saved

#### Scenario: Editor cannot change prices
- **WHEN** an editor tries to change a price
- **THEN** the server responds 403 naming `plugins.manage`

### Requirement: Model capabilities
Each model SHALL have a list of capabilities, each a name and a grade from 0 to 100. Administrators SHALL add, grade and remove capabilities of a model; every user who can view the library SHALL read them. Names SHALL be unique within a model and at most 40 characters; a grade SHALL be a whole number from 0 to 100.

#### Scenario: Grade a model
- **WHEN** an administrator grades `llava` with `tags` 80 and `objects` 35
- **THEN** every user sees `tags: 80` and `objects: 35` for `llava`

#### Scenario: Grade out of range
- **WHEN** an administrator saves a capability with grade 120
- **THEN** the server responds 400 and nothing is saved

#### Scenario: Duplicate name
- **WHEN** an administrator adds the capability `tags` to a model that already has it
- **THEN** the server responds 400 and the list is unchanged

### Requirement: Models in the AI section
The AI section of Server settings SHALL show, for each provider, its models with their state, description, information, prices and capabilities. Administrators SHALL edit them there with a way to refresh, add a model by id, enable or disable it, and edit description, prices and capabilities. Other users SHALL see the enabled models, their descriptions, information, prices and capabilities read-only.

#### Scenario: Administrator edits a model
- **WHEN** an administrator opens a model, sets its prices and saves
- **THEN** the AI section shows the new prices

#### Scenario: Viewer reads a model
- **WHEN** a viewer opens the model information
- **THEN** it shows description, prices and graded capabilities with no editing controls

### Requirement: Existing models keep working
When Paloma starts with tasks that already name a provider and model, each such model SHALL be added to its provider's list as enabled, so those tasks stay ready.

#### Scenario: Upgrade
- **WHEN** Paloma starts after the upgrade and the Tags task uses `openai` with `gpt-4o-mini`
- **THEN** `gpt-4o-mini` is in the `openai` model list, enabled, with zero prices, and Tags is still ready
