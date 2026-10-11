# Tasks

## 1. Shared types and permission

- [x] 1.1 Add AI types to `shared/types.ts`: `AiOutputKind`, `AiSettingDefinition`/`AiSettingValue` (secret as `{set: boolean, fromEnv?: boolean}`), `AiProviderInfo`, `AiTask`, `AiTaskOptions`, `AiRun`, `AiRunSummary`, `PhotoAiResult`, `AiObject`; add `aiProviders` to `PluginInfo`. Verify: `npm run build` type-checks.
- [x] 1.2 Add `ai.run` to `PERMISSIONS` in `server/src/auth/permissions.ts` (after `people.manage`), its label/description in `server/src/auth/texts.ts`, and update `plugins.manage`'s description; extend `roles.test.ts` so `editor` and `admin` have `ai.run` and `viewer` does not, and `GET /api/admin/permissions` lists nine. Verify: `npm test -- roles adminRoutes`.

## 2. AI provider contribution in the plugin API

- [x] 2.1 Extend `server/src/plugins/api.ts` with `AiProviderDefinition`, `AiSettingDefinition`, `AiContext`, `AiRequest`, `AiAnswer` and `AiProviderError` (design §1); add `aiProviders` to `PluginContributions`.
- [x] 2.2 Validate AI providers in `contributions.ts` (id format, label, settings types/defaults, model options via the existing param checker with `rect` rejected, `listModels`/`run` functions); add `aiProviders` to `KNOWN_KEYS`. Tests in `contributions.test.ts`: valid provider, missing label → warning, invalid setting type, `rect` model option rejected. Verify: `npm test -- contributions`.
- [x] 2.3 Register AI providers in `registry.ts` with clash resolution like auth providers (bundled first, then external by id) and expose them in `GET /api/plugins` (`aiProviders: [{id, label}]`). Tests in `registry.test.ts` / `routes/plugins.test.ts`: duplicate `openai` from an external plugin → warning, bundled wins; switched-off plugin → provider gone. Verify: `npm test -- registry plugins`.
- [x] 2.4 Answer validation helper (`server/src/ai/answer.ts`): clip rects to 0..1, drop empty tags/labels and zero-area rects, clamp confidences, trim text. Tests in `answer.test.ts` covering the ai-providers "Box outside the image" and "Empty tag" scenarios. Verify: `npm test -- answer`.
- [x] 2.5 Document AI providers in `docs/plugins.md` (contract, settings, model options, errors) with a minimal example provider; extend `docsExample.test.ts` so the example's provider is accepted. Verify: `npm test -- docsExample`.

## 3. AI store: provider settings and tasks

- [x] 3.1 `server/src/ai/store.ts`: load/save `<dataDir>/ai.json` atomically with mode 0600; unreadable file → logged, defaults. Tests (temp dir): round-trip, mode 0600, corrupt file → defaults. Verify: `npm test -- ai/store`.
- [x] 3.2 Provider settings logic: type checking per definition, secret keep/replace/remove semantics, env fallback via the provider's `missingSettings`, status `configured`/`not configured` with missing names, redaction for API output. Tests for each ai-providers settings/secret scenario. Verify: `npm test -- ai/providerSettings`.
- [x] 3.3 Tasks logic (`server/src/ai/tasks.ts`): built-in defaults for `tags`, `objects`, `description` (prompts using `{language}`, `{maxTags}`, `{libraryTags}`), merging stored built-ins with defaults, custom task create/update/delete, reset (keeps provider and model), option ranges, readiness with reason, fingerprint (design §3). Tests: reset, delete built-in → 409, reset custom → 409, image size 4000 → 400, rename keeps fingerprint, prompt change changes it, not-ready when plugin off. Verify: `npm test -- ai/tasks`.
- [x] 3.4 Prompt placeholder expansion (`{language}`, `{maxTags}`, `{photoTags}`, `{description}`, `{libraryTags}` top 300; unknown left as is). Tests for the ai-tasks placeholder scenarios. Verify: `npm test -- ai/prompt`.
- [x] 3.5 Routes in `server/src/routes/ai.ts`: `GET /api/ai/providers`, `PUT /api/ai/providers/:id/settings`, `GET /api/ai/providers/:id/models` (502 on provider error), `POST /api/ai/providers/:id/test`, `GET/POST /api/ai/tasks`, `PATCH/DELETE /api/ai/tasks/:id`, `POST /api/ai/tasks/:id/reset`, with permission guards (add an "any of" guard for `GET /api/ai/tasks`). Route tests with a fake provider plugin: 403 for editor on config, 404 unknown, 400 naming the field, secret never in any response. Verify: `npm test -- routes/ai`.

## 4. Bundled OpenAI plugin

- [x] 4.1 Create `plugins/ai-openai/` (`paloma-plugin.json` with names/descriptions in all UI languages, level `normal`, `package.json`, `index.js` with `// @ts-check`): settings, `missingSettings`, model options, `listModels` (`GET /models`), `test`, `run` via `/chat/completions` with an image data URL and JSON-schema output per kind, fallback without `response_format`, error mapping 401/403 → auth, 429 → rate-limit with retry-after, network/timeout → unreachable (design §2).
- [x] 4.2 `plugins/ai-openai/index.test.ts` with a mocked `fetch`: request shape (model, base URL, detail, schema per output kind), env key fallback, key required only for the default base URL, parsing of tags/objects/text answers, error kinds, fallback without `response_format`. Verify: `npm test -- ai-openai`.

## 5. Results storage and the run job

- [x] 5.1 Create tables `ai_results` and `ai_objects` (design §4) in `db/columns.ts` + `schema.ts`; test in `columns.test.ts` that they are created on an existing database. Verify: `npm test -- columns`.
- [x] 5.2 `server/src/ai/results.ts`: save a result (replace per photo+task in one transaction), list a photo's shown results (current `fileHash` only), processed-photo check by fingerprint+hash, delete a task's results. Tests incl. "Run again replaces" and "Edited content". Verify: `npm test -- ai/results`.
- [x] 5.3 Image preparation: original file → EXIF-oriented, long edge = image size, JPEG; videos excluded. Test with a rotated fixture that the sent image is upright and sized. Verify: `npm test -- ai/image`.
- [x] 5.4 Applying results: add tags (confidence filter, max, case-insensitive dedupe, add-only, object labels when enabled) and set the description per the text option, through the sidecar path with `withFolderLock`; read-only folder → result kept, photo failed. Tests on a temp folder: "Tags added", "Removed tag is added again", description empty/non-empty/always, Picasa-only folder gets `.paloma.json` only when tags are added, Objects alone writes no file. Verify: `npm test -- ai/apply`.
- [x] 5.5 Runner (`server/src/ai/runner.ts`): one run at a time, photo list resolved under the starter's access, skip processed unless `again`, promise pool of `parallel`, per-photo save, cancel after in-flight, retry on rate-limit ×3, stop after 5 consecutive auth/unreachable failures, summary with tags added, descriptions set, failures and tokens. Tests with a fake provider: second start → 409, cancel-and-resume processes the rest, one failure does not stop, revoked key stops after 5, rate-limit retried. Verify: `npm test -- ai/runner`.
- [x] 5.6 Routes: `POST /api/ai/runs` (202; 400 not ready / bad ids; 404 unknown task), `GET /api/ai/runs/current`, `DELETE /api/ai/runs/current` under `ai.run`; `GET /api/photos/:id/ai` under `library.view` (404 outside access). Route tests: viewer → 403 naming `ai.run`, limited-access user cannot process or read photos outside access. Verify: `npm test -- routes/ai`.

## 6. Client: Server settings AI section

- [x] 6.1 `client/src/api/ai.ts` for all AI endpoints and react-query hooks.
- [x] 6.2 `AiSection` in `ServerSettingsView`: providers panel (generated settings form, secret set/replace/remove, env hint, Save, Test connection, privacy note with the service address, "switch on an AI plugin" empty state). Test in `ServerSettingsView.test.tsx`: section shown, key field empty after save with "set" state. Verify: `npm test -- ServerSettingsView`.
- [x] 6.3 Tasks panel: list with readiness, add/edit/reset/delete; editor with provider + model combobox (listed models, free text, error shown), prompt textarea with placeholder list, model-option controls (reusing filter param controls) and task options by output kind. Component test: built-in task has no Delete and its output kind is fixed; invalid range shows the server error. Verify: `npm test -- AiSection`.

## 7. Client: running tasks and progress

- [x] 7.1 `client/src/ai/useAiRun.ts` store polling `GET /api/ai/runs/current` (1 s while running, 10 s idle), start/cancel, last summary; invalidates photo, tag and AI-result queries when a run ends. Tests with mocked API: progress after reload, summary on finish. Verify: `npm test -- useAiRun`.
- [x] 7.2 `AiRunProgress` ring (task name, `done / total`, cancel on activation, end message with processed/tags/failed/tokens), stacked with the face-detection ring. Verify: component test.
- [x] 7.3 `AiMenu` next to `FaceDetectionButton` in `LibraryHeader`, `AlbumHeader`, `TagHeader`, `PersonHeader` (Photos mode) and `MemoryHeader`: tasks in menu, disabled with reason when not ready or while a run exists, Run again, link to the AI section for `plugins.manage`. Add controls to `levels/controls.ts` (`normal`, `ai.run`). Tests: hidden at Easy and for viewers; disabled reason when provider not configured. Verify: `npm test -- AiMenu controls`.
- [x] 7.4 Entry menu: `ai` item with the task submenu and Run again in `shell/entryMenu.ts`, using the entry's photos like `detectEntryFaces`. Extend its tests: offered at Normal, not at Easy; running does not change the selected entry. Verify: `npm test -- entryMenu`.

## 8. Client: viewer and Info panel

- [x] 8.1 Generalize the face-frame geometry so `ObjectFrames` reuses it; Objects toggle in `NavBar` (level Normal, remembered in `uiSettings`), labels `label NN%`, no frames when other pixel-moving edits exist. Tests in `faceRects.test.ts`/new test: crop hides an outside object, rotate maps boxes. Verify: `npm test -- faceRects ObjectFrames`.
- [x] 8.2 AI section in `InfoPanel`: results per task (name, model, date, tags/labels/text), empty state, per-task Run on this photo for `ai.run` (run of one photo, `again: true`), refresh when it ends. Extend `InfoPanel.test.tsx`. Verify: `npm test -- InfoPanel`.

## 9. Localization and docs

- [x] 9.1 Add all new UI strings (AI section, tasks, options, placeholders help, menu, ring, messages, Objects toggle, Info panel, `ai.run` permission) to every locale in `client/src/i18n/locales/` and the server permission texts; the existing locale-completeness test passes. Verify: `npm test -- i18n`.
- [x] 9.2 Document the AI feature for administrators in `docs/plugins.md` (OpenAI setup, compatible local servers, `OPENAI_API_KEY`/`OPENAI_BASE_URL`, privacy) and add `ai.run` to `docs/users-and-auth.md`; mention the env vars in `.env.example`.

## 10. Final verification

- [ ] 10.1 Manual check with `npm run dev`: configure `openai` (or a local compatible server), run Tags, Objects and Description on a small folder, cancel and resume, view object frames and the Info panel results, confirm `.paloma.json` contains the added tags and no other folder file changed.
- [x] 10.2 Run `npm run build` and `npm test`; both pass.
