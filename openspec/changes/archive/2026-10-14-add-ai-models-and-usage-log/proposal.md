# Proposal

## Why

AI providers today are one fixed settings set per plugin type (`openai`), models are only a live list used by a task's selector, and nobody can see what a model costs, what it is good at, or who spent how much. Administrators need several named providers (OpenAI, a local Ollama, …), control over which models are usable and what they cost, and a durable record of every model call so usage can be attributed to a user and a task.

## What Changes

- **Named provider instances**: an administrator can create many AI providers, each with a required unique **name**, built from a plugin's provider type (e.g. `openai`, which also covers Ollama/LM Studio/vLLM). Each instance has its own settings and secrets. The existing single `openai` provider becomes the first instance; tasks that point to it keep working.
- **Model catalogue per provider**: each provider keeps a stored list of models, filled from the provider's `/v1/models` (and `/v1/models/{model}` for details) and by typing an id. Users can see each model's information; administrators can enable or disable a model and edit its description. Newly discovered models start disabled; only enabled models can be chosen for a task.
- **Prices**: each model has token prices in credits per 1M tokens, per token kind (`prompt_tokens`, `completion_tokens`; more kinds can be added later). Everyone can see them; administrators edit them.
- **Capabilities**: each model has a list of capabilities, each graded 0–100. Administrators edit them; users see them.
- **Usage reporting**: the bundled OpenAI-compatible provider asks for usage with `stream_options: {"include_usage": true}` on streamed Chat Completions, and every provider type must report token usage per call (or report none).
- **Usage log**: every model call stores a record with the queue task id, the AI task id, the user id, token stats and the credits used. Users can read their own records, administrators everyone's.
- Run summaries show the credits used.

## Capabilities

### New Capabilities
- `ai-models`: the per-provider model catalogue: model information, enabled state, descriptions, token prices, graded capabilities, who can see and edit them.
- `ai-usage-log`: the record of each model call (task, user, tokens, credits), how credits are computed, and who can read the log.

### Modified Capabilities
- `ai-providers`: providers become named, user-creatable instances of a plugin's provider type; the settings API and AI section work on instances; the bundled OpenAI provider reports usage through streaming usage stats.
- `ai-tasks`: the provider and model selector offers instances and only their enabled models; a task using a disabled model is not ready.

## Impact

- **Server**: `server/src/ai/store.ts` (`ai.json` gets provider instances; migrates the old `providers` map), `providerSettings.ts`, `routes/ai.ts`, `ai/runner.ts` (writes the usage log, resolves price), `plugins/api.ts` (provider answers report token kinds; optional model-detail call), `db/schema.ts` (three new tables), new `ai/models.ts` and `ai/usage.ts`.
- **Plugin**: `plugins/ai-openai` switches to streamed Chat Completions with usage.
- **Client**: AI section of Server settings (providers list, models table with prices/capabilities/description), task model selector, Info/Account usage view.
- **Shared types**: `shared/types.ts` (provider instance, model, price, capability, usage record).
- **Docs**: `docs/ai.md`, `docs/plugins.md` (AI provider contract).
- **Compatibility**: `GET /api/ai/providers` now lists instances (ids of existing `openai` are kept); the plugin AI provider contract gains optional fields only.
