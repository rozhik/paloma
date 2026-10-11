# AI tasks

Paloma can send photos to an AI model that adds tags, finds objects with frames around them, or writes descriptions. The models come from **AI providers**, which plugins contribute (see [Writing Paloma plugins](plugins.md#ai-providers)). The bundled `ai-openai` plugin talks to the OpenAI API and to any server that speaks the same API.

> **Photos leave the computer.** Each photo a task processes is sent, resized, to the provider's address. With OpenAI that is OpenAI's servers, and it costs money per photo. A local server such as Ollama keeps photos on your network. Nothing is sent until someone runs a task.

## Setting up OpenAI or a local server

Open **user menu → Server settings → AI**. This needs `plugins.manage` when users are on.

1. Under **Providers**, enter the settings of `OpenAI` and save:
   - **API key**: your OpenAI key. It is stored in `ai.json` in the data folder, readable only by the server's user, and is never shown again. Leave it empty for a local server.
   - **Server address**: `https://api.openai.com/v1` for OpenAI, or a compatible server, e.g. `http://localhost:11434/v1` for Ollama, `http://localhost:1234/v1` for LM Studio.
   - **Request timeout**: how long one photo may take.
2. Choose **Test connection**. It lists the server's models without sending any photo.
3. Under **Tasks**, edit **Tags**, **Objects** and **Description**: choose the provider and a model that can see images, e.g. a vision model for a local server. A task shows **Ready** when it can run.

Instead of entering them, the key and address can come from the server's environment: `OPENAI_API_KEY` and `OPENAI_BASE_URL` (see `.env.example`). A value saved in the AI section wins over the environment.

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

- The server runs it in the background, one run at a time. A ring over the grid shows its progress in every browser; activate it to stop the run.
- Photos the task already processed with the same configuration are skipped. **Run again** processes them anyway. Changing a task's provider, model, prompt, model options, image size or language makes it process photos again.
- Each photo's result is saved as soon as it arrives, so a stopped run, or one ended by a restart, continues where it was when run again.
- When the service asks to slow down, the photo is retried up to three times. After five photos in a row fail because the key is refused or the server cannot be reached, the run stops and says why.

## What is stored where

- Results (tags, objects with their frames, texts, the model and the tokens used) are kept in the library database, one per photo and task. Results for a photo whose file changed are not shown.
- Tags and descriptions are written to the folder's `.paloma.json`, exactly as when you type them. A folder with only a Picasa `.picasa.ini` gets a `.paloma.json` when a tag is added. Photo files are never changed.
- Object frames stay in the database. Turn them on in the viewer with the **Objects** button; the **Info** panel lists every result of the photo and can run a task again on it.
