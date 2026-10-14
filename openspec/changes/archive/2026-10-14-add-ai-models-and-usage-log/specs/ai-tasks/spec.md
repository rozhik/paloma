# Spec Delta

## MODIFIED Requirements

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
