# Tasks

## 1. Provider instances

- [x] 1.1 Extend `shared/types.ts` with the provider instance (id, name, type, pluginId), model, price, capability and usage record types; verify `npm run build` type-checks.
- [x] 1.2 Change `AiStore` to keep `providers` as a list of `{ id, name, type, settings }`, convert the old map on load (id = key, name = type label), write `ai.json.bak` once before the first save in the new shape; verify with `store.test.ts` cases for old file, new file and unreadable file.
- [x] 1.3 Rework `providerSettings.ts`, the registry lookup and `aiContext` to take an instance, and restrict the `OPENAI_*` environment fallback to the instance with id `openai`; verify with `providerSettings.test.ts` (env does not leak to other instances).
- [x] 1.4 Add `POST /api/ai/providers`, `PATCH /api/ai/providers/:id`, `DELETE /api/ai/providers/:id` (name required, unique ignoring case, 1–60 chars; 409 when a task uses it; deletes settings and model rows); verify with route tests in `aiConfig.test.ts` including 400/403/404/409.
- [x] 1.5 Update the AI section of Server settings: provider list by name, add/rename/delete, per-instance settings form and Test connection; verify manually in the running app (`npm run dev`) and with a client test if the section has one.
- [x] 1.6 Update `docs/ai.md` and `docs/plugins.md` for named providers; verify the documented setup steps match the UI labels.

## 2. Model catalogue

- [x] 2.1 Add `ai_models` and `ai_model_capabilities` tables to `db/schema.ts` and the bootstrap; verify with a database test that primary keys and the grade check hold.
- [x] 2.2 Implement `ai/models.ts`: list, refresh (upsert: new → disabled, missing → not listed), add typed id (enabled), update description/enabled/prices/capabilities with validation, delete by provider, and the startup insertion of models used by tasks; verify with `models.test.ts` for each scenario in the `ai-models` spec.
- [x] 2.3 Add optional `getModel(id, ctx)` to the plugin AI provider contract and implement `/models/{model}` in `plugins/ai-openai`; verify with plugin tests using a stub server (details available, unavailable).
- [x] 2.4 Add `GET /api/ai/models` (`library.view`; enabled only unless `plugins.manage`), `POST /api/ai/providers/:id/models/refresh`, `POST /api/ai/providers/:id/models`, `PATCH /api/ai/providers/:id/models/:model` (`plugins.manage`, id URL-encoded); verify with route tests for 400, 403, 502 and an id like `library/model:tag`.
- [x] 2.5 Make `readyTask` require an enabled model and make the task model selector list enabled models only (typed id adds an enabled model); verify with `tasks.test.ts` (disabled model → not ready with a reason).
- [x] 2.6 Build the models UI: table with state, description, information, prices and capabilities, admin edit controls, read-only view for other users; verify manually and update `docs/ai.md`.

## 3. Usage reporting and log

- [x] 3.1 Change `AiAnswer.usage` to a token-kind map, still accepting `inputTokens/outputTokens` from external plugins; verify with `answer.test.ts`.
- [x] 3.2 Switch `plugins/ai-openai` to streamed Chat Completions with `stream_options: { include_usage: true }`, dropping `stream_options` or falling back to a non-streaming call when the server refuses; verify with plugin tests against a stub server for streaming, refused `stream_options`, refused streaming and no usage.
- [x] 3.3 Add the `ai_usage_log` table and `ai/usage.ts` with `creditsFor(tokens, prices)` and `recordCall`; verify with `usage.test.ts` (1,000,000 prompt + 500,000 completion at 0.15/0.60 = 0.45; unpriced kind = 0; stored prices unaffected by later changes).
- [x] 3.4 Write one log row per provider attempt in `runner.ts` (including retries and failures; log-write failure does not fail the photo) and add `credits` to the queue task details; verify with `aiRuns.test.ts` for success, failure, retry and missing usage.
- [x] 3.5 Add `GET /api/ai/usage` with filters and totals, own records for ordinary users and all for `users.manage`; verify with route tests including that no prompt, image or answer is returned.
- [x] 3.6 Show credits in the run summary and add a plain usage list with totals for the user (and all users for administrators); verify manually and update `docs/ai.md`.

## 4. Integration

- [x] 4.1 Run an end-to-end check against a stub OpenAI-compatible server: two named providers, refresh, enable a model, set prices, run Tags, and confirm the log row and the summary credits.
- [x] 4.2 Run `npm run build` and `npm test` and confirm both pass.
