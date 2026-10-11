# Design

## Context

- Plugins (`server/src/plugins/`) are folders with `paloma-plugin.json`; `activate(host)` returns contributions, checked by `contributions.ts` (`KNOWN_KEYS = filters, authProviders`; unknown keys warn). On/off choices live in `<dataDir>/plugins.json` (`state.ts`). The registry already resolves id clashes for filters and auth providers — AI providers follow the same pattern.
- Face detection runs **in the browser** (`client/src/faces/detector.ts`, face-api) driven by a zustand runner (`detectionRunner.ts`) that asks the server for pending ids and `PUT`s results per photo; results live in `face_detections`/`detected_faces`. The UI entry points are `FaceDetectionButton` in `LibraryHeader`, `AlbumHeader`, `TagHeader`, `PersonHeader` (Photos mode), `MemoryHeader`, and `findFaces` in `shell/entryMenu.ts`. The progress ring is `FaceDetectionProgress.tsx`.
- AI calls need a secret API key, so unlike face detection they must run on the server (decided with the user: server background job).
- Tags are written through `changePhotosKeywords` / sidecar patches under `withFolderLock`; descriptions through `updatePhoto`. Both already follow the photo-text and sidecar-files specs.
- Permissions are a code list (`server/src/auth/permissions.ts`); built-in roles derive from it, so `editor` and `admin` get a new permission automatically.

## Goals / Non-Goals

**Goals:**
- One generic AI provider contract in plugin API v1, good enough for OpenAI-compatible chat models and for later local detectors (YOLO, CLIP) without changing Paloma.
- Server-side job runner with per-photo persistence, safe to cancel and restart.
- Reuse face-frame geometry for object boxes.

**Non-Goals:**
- Search by object label or by AI result (tags already are searchable).
- Cost quotas or per-user AI budgets; only token usage is reported.
- Embeddings / semantic search, "similar photos", face recognition through AI providers.
- Queueing several runs; scheduled or on-import automatic runs.
- Video processing.
- Encrypting secrets at rest (no key management exists; file permissions protect them).

## Decisions

### 1. AI provider contract (plugin API v1, additive)

`PluginContributions` gains `aiProviders?: AiProviderDefinition[]`; `KNOWN_KEYS` gains `aiProviders`. `apiVersion` stays 1: older Paloma ignores the key with a warning, which is the forward-compatibility rule already in `api.ts`.

```ts
interface AiProviderDefinition {
  id: string; label: LocalizedText;
  settings: AiSettingDefinition[];               // text | secret | number | boolean | choice, required?, default?, help?
  missingSettings?(values): string[];           // conditional requirements (OpenAI: key only for the default URL)
  modelOptions?: ParamDefinition[];             // reuse number/boolean/choice from filters (rect rejected)
  listModels(ctx: AiContext): Promise<{ id: string; label?: string }[]>;
  test?(ctx: AiContext): Promise<void>;         // throws with a user-readable message; default: listModels()
  run(request: AiRequest, ctx: AiContext): Promise<AiAnswer>;
}
interface AiContext { settings: Record<string, unknown>; env: Record<string, string | undefined>; signal: AbortSignal; log: PluginLog }
interface AiRequest {
  model: string; prompt: string; output: 'tags' | 'objects' | 'text';
  image: { data: Buffer; mimeType: 'image/jpeg'; width: number; height: number };
  language: string; maxTags?: number; options: Record<string, unknown>;
}
interface AiAnswer {
  tags?: { name: string; confidence?: number }[];
  objects?: { label: string; rect: RelativeRect; confidence?: number }[];
  text?: string; usage?: { inputTokens?: number; outputTokens?: number };
}
class AiProviderError extends Error { kind: 'auth' | 'unreachable' | 'rate-limit' | 'bad-answer' | 'other'; retryAfterMs?: number }
```

- The provider builds the service-specific request (e.g. a JSON schema for structured output); Paloma only sends the prompt, output kind and image, then validates the answer (clip rects, drop empties — ai-providers spec). Rejected alternative: Paloma builds the JSON schema itself — ties Paloma to one family of APIs.
- `env` exposes only an allow-list (`OPENAI_API_KEY`, `OPENAI_BASE_URL`) declared by bundled plugins; external plugins get `process.env` anyway since they run with full access, so this is about clarity, not security.
- Error `kind` drives the runner: `rate-limit` → retry with backoff (≤3), `auth`/`unreachable` → count toward the 5-in-a-row stop rule.

Validation lives next to `checkProviders` in `contributions.ts`; id clashes resolved in `registry.ts` exactly like auth providers (bundled first, then external by id).

### 2. Bundled `plugins/ai-openai`

- Plain `index.js` with `// @ts-check` and JSDoc types like `auth-token`; uses global `fetch` (Node ≥ 18) — no new dependency.
- `run` calls `POST {baseUrl}/chat/completions` with one user message: text prompt + `image_url` as a `data:image/jpeg;base64,…` URL and `detail` from model options; `response_format: { type: 'json_schema', … }` per output kind (tags: `{tags:[{name,confidence}]}`, objects: `{objects:[{label,confidence,box:{left,top,right,bottom}}]}` with fractions, text: `{text}`). Chat Completions is used rather than the Responses API because OpenAI-compatible local servers (Ollama, LM Studio, vLLM) implement it. If a server rejects `response_format`, the plugin retries once without it and parses the first JSON object in the reply.
- `listModels`: `GET {baseUrl}/models`, sorted by id. No filtering for vision capability (the API does not report it); the user may type an id.
- Model options: `temperature` (0–2, step 0.1, default 0.2), `detail` (`auto`/`low`/`high`, default `auto`), `maxOutputTokens` (64–4096, default 1024).
- Settings: `apiKey` (secret), `baseUrl` (text, default `https://api.openai.com/v1`), `timeoutSeconds` (number, 5–600, default 60). `missingSettings` requires `apiKey` only when `baseUrl` is the default and no `OPENAI_API_KEY` is in `env`.
- HTTP 401/403 → `auth`, 429 → `rate-limit` with `retry-after`, network errors/timeouts → `unreachable`.

### 3. Server-side AI store: `<dataDir>/ai.json`

```json
{ "providers": { "openai": { "baseUrl": "…", "apiKey": "sk-…" } },
  "tasks": [ { "id": "tags", "builtIn": true, "name": null, "output": "tags", "inMenu": true,
               "provider": "openai", "model": "gpt-…", "prompt": "…", "modelOptions": {},
               "options": { "imageSize": 1024, "language": "user", "parallel": 2, "maxTags": 10, "minConfidence": 0.5 } } ] }
```

- Written atomically (temp file + rename) with mode `0600`. Follows `plugins.json`'s approach (file in data dir, unreadable → logged, defaults) rather than a DB table, because it is configuration, not library data, and is easy to back up or edit by hand.
- Built-in tasks missing from the file are filled from code defaults; `name: null` means "show the localized default name" (ai-tasks: Name in Ukrainian). Reset replaces everything except `provider`/`model`.
- Custom task ids: `t-` + 8 random base36 chars.
- **Configuration fingerprint**: SHA-256 of `{provider, model, prompt, modelOptions, imageSize, language}` (language resolved per run: `user` → the starter's UI language). Stored with each result; "processed" means same task id + fingerprint + `fileHash`.

### 4. Database

New tables, created in `db/columns.ts` like the other `create…Tables` helpers:

```
ai_results(photo_id → photos ON DELETE CASCADE, task_id TEXT, fingerprint TEXT, file_hash TEXT,
           provider TEXT, model TEXT, created_at TEXT, output TEXT /* JSON: tags | text */,
           input_tokens INT, output_tokens INT, PRIMARY KEY(photo_id, task_id))
ai_objects(id PK, photo_id → photos ON DELETE CASCADE, task_id TEXT, label TEXT, confidence REAL, rect TEXT /* JSON RelativeRect */)
  INDEX(photo_id)
```

Only the last successful result per (photo, task) is kept; failures are not stored (they are in the run summary). Deleting a task deletes its rows. `GET /api/photos/:id/ai` filters by `file_hash = photos.file_hash`.

### 5. Runner (`server/src/ai/runner.ts`)

- A module-level singleton `{ run | null, lastSummary }`. `POST /api/ai/runs` resolves the photo list **inside the request** (so `andVisible` applies the starter's library access), drops videos and ids already processed (unless `again`), snapshots the task (fingerprint, language) and the starter's id, and starts an async loop; responds 202.
- Concurrency = task's `parallel` via a small promise pool. Cancel stops scheduling new photos and lets in-flight requests finish (ai-processing: "after the requests in progress end"); the per-run `AbortController` is used only on server shutdown and for the provider timeout.
- Per photo: read the original with sharp (`.rotate()` for EXIF orientation, resize long edge to `imageSize`, JPEG q85) — the same unedited, oriented coordinate space as detected faces, so the viewer can reuse `faceRects.ts` for crop/rotate/flip mapping. Build the prompt (placeholders; `{libraryTags}` computed once per run from `photo_keywords`), call the provider, validate, then in one transaction replace `ai_results`/`ai_objects`, then apply tags/description through the existing sidecar path (`changePhotosKeywords`-style internal function and the caption patch with `withFolderLock`), bypassing the request scope because the ids were checked at start.
- Failures: retry `rate-limit` up to 3× with `retryAfterMs` or 2/4/8 s; 5 consecutive `auth`/`unreachable` failures stop the run with that message.
- Progress: `GET /api/ai/runs/current` polled by the client every 1 s while a run exists and every 10 s otherwise (cheap; no websocket infrastructure exists). Server restart loses the in-memory run; persisted results make the next run resume.
- Summary: processed, failed (with up to 20 messages), tags added, descriptions set, tokens.

Rejected alternative: browser-driven loop like face detection — leaks nothing secret if the server calls the provider, but stops when the tab closes and duplicates per-photo HTTP round-trips; the user chose the server job.

### 6. Permissions and routes

- Add `ai.run` to `PERMISSIONS` after `people.manage`; labels/descriptions in `auth/texts.ts` and all locales; client `levels/controls.ts` gets controls `ai.menu`, `ai.objects`, `ai.info` (level `normal`, permission `ai.run` for running; viewing results needs only `library.view`).
- Routes (`server/src/routes/ai.ts`): providers/tasks config under `need('plugins.manage')`; `GET /api/ai/tasks` under "any of `ai.run`, `plugins.manage`" (new small guard helper); runs under `need('ai.run')`; `GET /api/photos/:id/ai` under `need('library.view')`.

### 7. Client

- `client/src/ai/`: `api.ts`, `useAiRun.ts` (zustand store polling the current run, mirroring `useFaceDetection`'s shape so headers can check `running`), `AiMenu.tsx` (dropdown rendered next to `FaceDetectionButton` in each of the five headers; the face button itself is unchanged), `AiRunProgress.tsx` (ring; reuses `FaceDetectionProgress` styles), `ObjectFrames.tsx` (generalize `FaceFrames`' geometry from `faceRects.ts`), `InfoPanelAi.tsx`.
- `shell/entryMenu.ts`: new item id `ai` with a submenu of tasks + Run again; reuses the entry photo fetch used by `detectEntryFaces`.
- Server settings: `AiSection.tsx` with `ProvidersPanel` (settings form generated from definitions, Test, model list cache) and `TasksPanel` (list + editor modal: provider/model combobox with free text, prompt textarea with placeholder chips, generated model-option controls reusing the filter param controls, task options).
- When both rings exist (face detection and AI run), they stack.

### Files in photo folders

- **Read**: the photo file itself (decoded by sharp to build the image sent to the provider). `.paloma.json` / `.picasa.ini` are read as today when tags or descriptions are applied.
- **Written**: only the folder's `.paloma.json`, only when a task adds tags (`keywords`) or sets a description (`caption`), through the same code path and rules as a user edit (sidecar-files, photo-text specs) — so a Picasa-only folder gets a `.paloma.json` on the first applied tag, exactly like tagging by hand. Object boxes and results never touch folders. Photo files are never written.

### MVP code reused / rewritten / dropped

- Reused: plugin discovery, state, registry and contribution checking (extended); `ParamDefinition` validation for model options; sidecar keyword/caption patching and folder locks; `faceRects.ts` geometry; `FaceDetectionProgress` look; `entryMenu.ts` structure; `ServerSettingsView` section layout.
- Rewritten: none.
- Dropped: none. `FaceDetectionButton` and the face runner are untouched.

## Risks / Trade-offs

- [General chat models localize boxes poorly] → Objects is offered but labelled by model quality; the provider contract allows specialized local detector plugins later; prompts are editable.
- [Photos leave the computer; costs money] → AI section warns with the service address; `ai.run` is a separate permission; runs never start automatically; token usage is shown.
- [Secrets in plain JSON in the data dir] → file mode 0600, never returned or logged; env vars as an alternative.
- [Auto-added tags pollute the tag list] → minimum confidence and maximum tags options; `{libraryTags}` placeholder in the default prompt steers the model to existing vocabulary; tags are never removed, so undo is manual (bulk tag removal already exists).
- [Server restart loses the run state] → per-photo persistence makes a re-run resume; acceptable for a local app.
- [Concurrent user edits while a run writes tags] → writes go through `withFolderLock` and add-only keyword merging, the same as two users tagging at once.
- [Long runs hold provider rate limits] → `parallel` default 2, backoff on 429.

## Migration Plan

- New tables are created on startup if missing; no data migration. `ai.json` is created on the first save.
- Existing custom roles do not get `ai.run` (access-control spec); built-in roles do.
- Rollback: remove the plugin/routes; the extra tables and `ai.json` are ignored by older code; tags and descriptions written stay as ordinary sidecar data.

## Open Questions

- Default prompts' exact wording and the default OpenAI model suggestion — tuned during implementation against a few sample photos.
