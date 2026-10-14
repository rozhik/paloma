# Design

## Context

AI providers are contributed by plugins (`plugins/ai-openai`) and registered by id in `server/src/plugins/registry.ts`. Their settings live in `ai.json` (`providers[providerId]`, secrets included, mode 0600) next to the AI tasks (`server/src/ai/store.ts`); a task names `provider` (the id) and `model` (a free string). Models are never stored: `GET /api/ai/providers/:id/models` calls the plugin live. The runner (`ai/runner.ts`) calls `definition.run()` per photo and sums `inputTokens`/`outputTokens` into the queue task's details and into `ai_results`. The bundled provider does a non-streaming Chat Completions call. See proposal.md for motivation.

Answers to design questions already settled with the user: providers are **named instances** of a plugin's type; credits are **money-like** (price per 1M tokens per token kind); there is **no per-user credit quota** in this change.

## Goals / Non-Goals

**Goals:**
- Many named providers of the same type, each with its own settings.
- A stored, admin-curated model catalogue with description, prices and graded capabilities, visible to users.
- A durable per-call usage log with task, user, tokens and credits.

**Non-Goals:**
- Credit quotas or blocking runs when credits run out (a later change can build on the log).
- Choosing models automatically by capability grade (grades are informational).
- Currency conversion, billing, invoices, or reading real prices from providers.
- A charts/dashboard UI for usage; this change adds the API and a plain list/totals view.

## Decisions

**Instances in `ai.json`, not the database.** `ai.json` already owns provider secrets and tasks, and secrets must stay out of the SQLite file. It changes from `providers: { [typeId]: settings }` to `providers: [{ id, name, type, settings }]`. On load, an old map is converted: each key becomes an instance with `id = key`, `name` = the type's label (fallback: the key). Task `provider` fields keep pointing at the instance id, so no task migration is needed. Alternative: a `ai_providers` table — rejected because of secrets and because tasks/providers would then live in two stores.

**Registry stays per type.** `RegisteredAiProvider` (the type's definition) is looked up by `instance.type`; the runner builds `AiContext` from the instance's saved settings. The `OPENAI_*` environment fallback in `settingFromEnv` applies only to the instance with id `openai` (the migrated one), so new instances never silently use the host's key.

**Models, prices and capabilities in SQLite.** They are catalogue data that the usage log joins against and users read often. Tables: `ai_models(provider_id, model_id, enabled, description, info JSON, listed, prices JSON, updated_at)` with primary key `(provider_id, model_id)` and `ai_model_capabilities(provider_id, model_id, name, grade)` with a check `0..100`. Prices are a JSON map `{ "prompt_tokens": 0.15, "completion_tokens": 0.6 }` so further token kinds (cached, reasoning) need no schema change. `provider_id` has no foreign key to `ai.json`; deleting a provider deletes its rows in one transaction.

**Model discovery.** Plugin `listModels` is kept. A new optional `getModel(id, ctx)` returns details (`/models/{model}`); refresh calls `listModels`, then `getModel` for models it adds or whose data is missing, tolerating failures per model. Refresh upserts: new → `enabled = false`; missing from the list → `listed = false` (never deleted, prices kept). A typed model id inserts an enabled row. At startup, every `(provider, model)` pair used by a task is inserted as enabled if missing (migration for existing configs).

**Readiness.** `readyTask` additionally requires the model row to exist and be enabled. `GET /api/ai/models` is open to `library.view`; it returns enabled models only unless the caller has `plugins.manage`. It never returns provider settings or addresses — only provider id and name.

**Usage reporting.** `AiAnswer.usage` changes to `{ tokens: Record<string, number> }` keyed by token kind (`prompt_tokens`, `completion_tokens`); the old `inputTokens/outputTokens` shape is still accepted from external plugins and mapped. The bundled provider switches to `stream: true` with `stream_options: { include_usage: true }`, accumulating `choices[0].delta.content` and reading the final `usage` chunk. If the server rejects `stream_options` (400 naming it), it is dropped via the existing optional-parameter retry list; if a server rejects streaming, the provider falls back to a non-streaming call and reads `usage` from the body. Alternative considered: keep non-streaming (usage is always in the body of `/chat/completions`) — rejected because the requirement is explicit about `stream_options` and some compatible servers only report usage that way.

**Usage log table.** `ai_usage_log(id, created_at, queue_task_id, ai_task_id, user_id, provider_id, provider_name, model, tokens JSON | null, prices JSON, credits REAL, ok INTEGER, error TEXT null)`, indexed on `(user_id, created_at)` and `(ai_task_id)`. No foreign keys, so records outlive users, tasks and providers (names are copied). `queue_task_id` and `user_id` come from the queue task context the runner already holds. The runner writes one row per `run()` attempt, including each rate-limit retry and each failure (tokens null, credits 0). A write failure is logged and does not fail the photo. Credits are computed by a pure function `creditsFor(tokens, prices)` using prices read when the call is made, and stored together with the prices used. Tokens are stored as-is; a model with no price yields 0 credits. Logging happens per call rather than per photo so partial and failed calls are not lost.

**Credits in summaries.** The runner adds a `credits` sum to the queue task details alongside `inputTokens/outputTokens`; the client shows it in the existing summary.

**Read API.** `GET /api/ai/usage?from&to&userId&taskId&model` with totals; non-`users.manage` callers are always filtered to their own `user_id`. With auth off, all records belong to the single local user.

**Edits.** Descriptions, prices and capabilities are changed with `PATCH /api/ai/providers/:id/models/:model` (`plugins.manage`), validated server-side (price ≥ 0 and finite, grade integer 0–100, unique capability names, description ≤ 2000 chars). Model ids contain `/` and `:`, so routes take them URL-encoded.

**Photo folders.** This change reads and writes no files in the user's photo folders. It writes `ai.json` and the SQLite library database in the data directory only. Photos are still sent to providers exactly as before.

**MVP code.** Reused: `AiStore` (extended), `providerSettings.ts` (functions now take an instance), runner call loop, the plugin registry and `ai-openai` plugin (rewritten `run`, new `getModel`). Rewritten: provider routes and the client AI section (list of instances). Dropped: the assumption "provider id == plugin type id" in the routes, client and tests.

## Risks / Trade-offs

- [Streaming differs across compatible servers] → fall back to non-streaming; cover with plugin tests using a stub server for both paths and for a refused `stream_options`.
- [Servers that never report usage] → records with unknown tokens and 0 credits; the UI marks them so totals are understood as lower bounds.
- [Log grows without bound: one row per photo call] → rows are small and indexed; retention/pruning is left to a later change.
- [Price changes after the fact would rewrite history] → prices used are stored in each row.
- [Model ids with odd characters in URLs] → encode/decode in routes; test with `library/model:tag`.
- [Disabling a model breaks tasks] → intended; tasks say why they are not ready.

## Migration Plan

1. On start, convert an old `ai.json` `providers` map to instances (in memory; written on the next save, so a rollback to the previous version can still read an unsaved file).
2. Create the new tables with the existing SQLite schema bootstrap, then insert the task models as enabled.
3. Rollback: the previous version ignores the new tables; once `ai.json` has been saved in the new shape the older version would see no provider settings, so keep a one-time copy `ai.json.bak` made at the first conversion.

## Open Questions

- Whether capability names should later come from a fixed catalogue (e.g. `tags`, `objects`, `text`, `ocr`) to make future automatic model selection possible. This change accepts free names, with the three built-in output kinds suggested in the editor.
