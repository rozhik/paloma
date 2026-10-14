# AI tasks

Paloma can send photos to an AI model that adds tags, finds objects with frames around them, or writes descriptions. The models come from **AI providers**: named services you set up, made from a provider type that a plugin contributes (see [Writing Paloma plugins](plugins.md#ai-providers)). The bundled `ai-openai` plugin offers the type `openai`, which talks to the OpenAI API and to any server that speaks the same API. You can have as many providers as you need, e.g. `OpenAI` and `Local Ollama`.

> **Photos leave the computer.** Each photo a task processes is sent, resized, to the provider's address. With OpenAI that is OpenAI's servers, and it costs money per photo. A local server such as Ollama keeps photos on your network. Nothing is sent until someone runs a task.

## Setting up OpenAI or a local server

Open **user menu → Server settings → AI**. This needs `plugins.manage` when users are on.

1. A provider named `OpenAI` exists from the start. To add another, e.g. for a local server, under **Providers** choose **Add provider**, pick the type `OpenAI` (the type that also covers compatible servers) and give it a name that is unique among your providers. You can rename a provider later; tasks keep using it.
2. Enter the settings of the provider and save:
   - **API key**: your OpenAI key. It is stored in `ai.json` in the data folder, readable only by the server's user, and is never shown again. Leave it empty for a local server.
   - **Server address**: `https://api.openai.com/v1` for OpenAI, or a compatible server, e.g. `http://localhost:11434/v1` for Ollama, `http://localhost:1234/v1` for LM Studio.
   - **Request timeout**: how long one photo may take.
3. Choose **Test connection**. It lists the server's models without sending any photo.
4. Open **Models** under the provider and choose **Refresh from the service**. Models found this way start **disabled**; enable the ones tasks may use (see below).
5. Under **Tasks**, edit **Tags**, **Objects** and **Description**: choose the provider and one of its enabled models, e.g. a vision model for a local server. A task shows **Ready** when it can run.

Only the provider named `OpenAI` (the one that exists from the start) can take its key and address from the server's environment: `OPENAI_API_KEY` and `OPENAI_BASE_URL` (see `.env.example`). A value saved in the AI section wins over the environment. Providers you add never borrow the server's key.

A provider can only be deleted when no task uses it. Deleting it removes its settings and models, not its [usage records](#usage-and-credits). If the plugin of its type is switched off, the provider stays listed as not available with everything it holds.

An older `ai.json` that kept settings by provider type is converted when Paloma starts: the settings of `openai` become the provider `OpenAI`. The first save in the new shape keeps a copy of the old file as `ai.json.bak`.

## Models, prices and capabilities

Each provider keeps a list of its **models**. **Refresh from the service** asks the server for its models (`/v1/models`, and `/v1/models/{model}` for details) and merges them into the list; a model the server stops listing stays, marked, with its prices. **Add model** adds one by its id, enabled. A model used by a task when you upgrade is added as enabled.

For each model an administrator can:

- **Enable or disable** it. A task whose model is disabled is not ready and says so; runs already started finish. Only enabled models are offered to other users.
- Write a **description**.
- Set **prices**: credits per 1,000,000 tokens, one for **prompt tokens** and one for **completion tokens** (default 0). A price change applies to later calls only.
- Grade its **capabilities**: free names such as `tags`, `objects` or `ocr`, each with a whole grade from 0 to 100. Grades are information for people choosing a model; Paloma does not choose models by them.

Everyone who can view the library sees the enabled models with their description, the information the provider reports, prices and capabilities: **AI menu → Models, prices and usage**. They cannot change anything there.

## Usage and credits

Every call to a model is stored as a record: the time, the id of the [queue task](task-queue.md), the AI task, the user who started the run, the provider (its name is copied) and model, the tokens by kind, the credits and whether the call worked. A call retried after rate limiting is a record of its own; a call that failed is stored too. Records contain no prompts, images or answers and stay after the task, provider or user is deleted.

The **credits** of a call are the sum, over token kinds, of the tokens times the model's price per 1,000,000 tokens **at the time of the call**; the prices used are stored with the record. A model without prices costs 0 credits. The bundled provider asks the server for token counts with `"stream_options": {"include_usage": true}`; when a server reports none, the record says the tokens are unknown and costs 0 credits, so totals are a lower bound.

The summary of a finished run says how many credits it used. **AI menu → Models, prices and usage → Usage** lists your own calls with totals; users with `users.manage` see everyone's. The same data is available as `GET /api/ai/usage` (filters `from`, `to`, `taskId`, `model`, and `userId` for users with `users.manage`; `limit` and `offset`). There is no credit limit yet: credits are only recorded.

## Tasks

A task is what to ask a model and what to do with the answer. Every task has a provider and model, a prompt, the provider's **model options** (for OpenAI: temperature, image detail and the longest answer) and these options:

| Option | Meaning |
| :--- | :--- |
| Image size | The long edge of the image sent, 256 to 2048 pixels. Larger shows more detail and costs more. |
| Answer language | The UI language of whoever runs the task, or a fixed language. |
| Photos at once | Requests sent in parallel, 1 to 8. |
| Most tags | `tags` tasks: the most tags added per photo. |
| Minimum confidence | `tags` and `objects` tasks: answers the model is less sure of are kept as results but not added to photos. |
| Also add object names as tags | `objects` tasks. |
| Use the text as | `text` tasks: the description when the photo has none, the description always, or only a result. |

Prompts can use placeholders, filled in for each photo: `{language}`, `{maxTags}`, `{photoTags}`, `{description}` and `{libraryTags}` (the 300 tags used most, so the model reuses your vocabulary).

The three built-in tasks can be changed and reset to their defaults. **Add task** creates a task with its own prompt and result: tags, objects with frames, or text. Deleting a task deletes its stored results; tags and descriptions it added stay.

## Running tasks

Users with the `ai.run` permission (administrators and editors by default), from the Normal level, find an **AI** menu wherever **Find faces** is offered: the headers of folders, albums, tags, people and memories, and the menu of a sidebar entry. A task runs on all photos the grid shows:

- The run is a task in the server's [task queue](task-queue.md): it waits for the tasks ahead of it and then runs in the background. Follow, pause, cancel or reorder it under **Tasks** in the user menu; a ring over the library shows the progress of your running task.
- Photos the task already processed with the same configuration are skipped. **Run again** processes them anyway. Changing a task's provider, model, prompt, model options, image size or language makes it process photos again.
- Each photo's result is saved as soon as it arrives, so a paused run, or one interrupted by a restart, continues with the photos it has not done, and a cancelled run continues where it was when run again.
- When the service asks to slow down, the photo is retried up to three times. After five photos in a row fail because the key is refused or the server cannot be reached, the run stops as `failed` and says why.

## What is stored where

- Results (tags, objects with their frames, texts, the model and the tokens used) are kept in the library database, one per photo and task. Results for a photo whose file changed are not shown.
- Tags and descriptions are written to the folder's `.paloma.json`, exactly as when you type them. A folder with only a Picasa `.picasa.ini` gets a `.paloma.json` when a tag is added. Photo files are never changed.
- Object frames stay in the database. Turn them on in the viewer with the **Objects** button; the **Info** panel lists every result of the photo and can run a task again on it.
