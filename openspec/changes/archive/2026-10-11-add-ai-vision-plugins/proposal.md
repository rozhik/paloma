# Proposal

## Why

Paloma can find faces, but nothing else in a photo: tagging and describing a large library by hand is the main reason tags stay empty. Vision-capable AI models can now classify a photo, find objects with boxes and write a description, but every user wants a different service and model (OpenAI, a local OpenAI-compatible server, others later), so this must come through plugins rather than be built into Paloma.

## What Changes

- Plugin API v1 gets a new kind of contribution, **AI providers**: a provider declares its settings (e.g. an API key), lists its models, declares the model options it supports, and answers one request per photo with tags, object boxes or text. Unknown contribution keys were already ignored, so the API version stays 1.
- A new bundled plugin **OpenAI** (`ai-openai`) contributes a provider for the OpenAI API and any OpenAI-compatible server (configurable base URL).
- Provider settings are entered in a new **AI** section of Server settings and kept in Paloma's data directory; secrets are never returned by the API. The section can test a provider's connection.
- **AI tasks** are named, server-wide configurations of what to ask: a provider + model selector, an editable prompt with placeholders, provider model options (e.g. temperature, image detail) and Paloma options (image size, minimum confidence, maximum tags, language, parallel requests). Three built-in tasks (Tags, Objects, Description) can be edited and reset; users can add custom tasks with their own prompt and an output kind (tags, objects or text).
- **AI processing** runs a task on photos as one server background job at a time, with a progress ring like face detection, cancel, resume (photos already processed with the same task configuration and content are skipped) and an option to run again.
- Results are kept in the library database per photo and task (provider, model, raw output, token usage). Tags are **added to the photo's tags automatically** (written to `.paloma.json` like tags typed by the user); text results fill the description according to the task (only when empty, always, or never); object boxes stay in the database.
- An **AI** menu is added everywhere face detection is offered today: the library, album, tag, person and memory grid headers and the sidebar entry menu. The viewer gets an **Objects** toggle that draws object boxes with labels, and the Info panel gets an AI section with the photo's results and a per-task Run button.
- A new permission **`ai.run`** (run AI tasks on photos) is added; configuring providers and tasks needs `plugins.manage`.

## Capabilities

### New Capabilities
- `ai-providers`: AI providers contributed by plugins, their settings and secrets, model listing, connection test, and the bundled OpenAI plugin.
- `ai-tasks`: configuration of AI tasks — built-in and custom tasks, provider and model choice, prompts and placeholders, model and Paloma options — and their part of the AI section in Server settings.
- `ai-processing`: running a task on photos as a background job, skipping and re-running, storing results, applying tags and descriptions, object boxes in the viewer, the AI section of the Info panel, and the AI menus.

### Modified Capabilities
- `plugins`: plugins can contribute AI providers; `GET /api/plugins` lists them.
- `server-settings`: the Server settings view gets an AI section.
- `access-control`: the permission list gains `ai.run`.
- `library-entries`: the entry menu offers the AI tasks next to Find faces.
- `photo-viewer`: the navigation bar shows the Objects toggle.

## Impact

- Server: `server/src/plugins/` (new contribution kind, validation, registry), new `server/src/ai/` (settings store, tasks, job runner, results), new routes under `/api/ai/*` and `/api/photos/:id/ai`, new DB tables `ai_results` and `ai_objects`, permission list in `server/src/auth/permissions.ts`.
- New bundled plugin folder `plugins/ai-openai/` (uses Node's built-in `fetch`; no new npm dependency).
- Client: Server settings AI section, AI menu next to `FaceDetectionButton` in the five grid headers and in `shell/entryMenu.ts`, progress ring, viewer Objects frames (reusing the face-frame transform), Info panel AI section, locale strings in all languages.
- `shared/types.ts`: AI provider, task, run and result types.
- Data directory: new `ai.json` with provider settings (including secrets) and tasks.
- Photo folders: `.paloma.json` gains tags and descriptions written by AI tasks; photo files are only read.
- Privacy and cost: photos are sent to the configured service; the AI section says so.
