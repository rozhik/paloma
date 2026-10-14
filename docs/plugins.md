# Writing Paloma plugins

A Paloma plugin is a folder of JavaScript code that adds features to Paloma without changes to Paloma itself. In plugin API version 1, plugins add **image filters**, which are the steps of a photo's non-destructive edit chain, such as crop, sepia or film grain, **auth providers**, which are ways to log in or to authenticate API requests when [users are switched on](users-and-auth.md), and **AI providers**, which look at photos for [AI tasks](ai.md).

> **Plugins are trusted code.** A plugin's module runs inside the Paloma server with the same rights as Paloma: it can read and write any file the server can. Install only plugins you trust. External plugins stay **off** until you switch them on in **user menu → Server settings → Plugins**, and the code of a plugin that is off is never run.

## Installing a plugin

External plugins live in the folder set by `PALOMA_PLUGINS_DIR` in `.env`. The default is `plugins/` inside `PALOMA_DATA_DIR`. Each direct subfolder that has a `paloma-plugin.json` is one plugin. Paloma never runs git and never changes files in plugin folders. To install a plugin, clone it:

```sh
mkdir -p .paloma_data/plugins
cd .paloma_data/plugins
git clone https://example.com/paloma-film-grain.git
# or, if the plugins folder is itself a git repository:
git submodule add https://example.com/paloma-film-grain.git
```

Then restart Paloma. The plugin is listed in **user menu → Server settings → Plugins** (the avatar at the end of the navigation) as off. Switch it on there; this does not need a restart. To update a plugin, `git pull` in its folder and restart. To remove it, delete its folder and restart.

If a plugin needs npm packages, it should ship them or tell you to run `npm install` in its folder.

Paloma's own filters and login methods ship as **bundled plugins** in the repository's `plugins/` folder (`basic-transforms`, `basic-effects`, `auth-password`, `auth-token`, `ai-openai`). They use the same API as external plugins and are good examples. Bundled plugins are on until you switch them off.

## Folder layout

```
paloma-film-grain/
  paloma-plugin.json   the manifest
  package.json         { "type": "module" }, so index.js is an ES module
  index.js             the server module named in the manifest
  icons/grain.svg      optional: the filter's icon in the edit bar
```

## The manifest

<!-- file: paloma-plugin.json -->
```json
{
  "id": "film-grain",
  "name": { "en": "Film grain", "uk": "Плівкове зерно" },
  "description": { "en": "Adds the grain of analogue film.", "uk": "Додає зерно плівкової фотографії." },
  "version": "1.0.0",
  "apiVersion": 1,
  "server": "index.js",
  "level": "easy"
}
```

| Field | Meaning |
| :--- | :--- |
| `id` | Unique id: lowercase letters, digits and hyphens. If two plugins share an id, a bundled one wins, then the external one whose folder name sorts first. The other one is shown with an error. |
| `name`, `description` | Shown in **Plugins**. A string, or an object of language tags to strings that includes `en`. Paloma shows the active UI language, or English when it is missing. |
| `version` | Your plugin's version. Changing it re-renders thumbnails that use your filters. |
| `apiVersion` | The plugin API version you wrote against. This Paloma supports `1`. |
| `server` | Path of the module, relative to the folder. It must stay inside the folder. |
| `level` | Optional. The lowest [level](complexity-levels.md) at which the UI offers what the plugin contributes: `child`, `easy`, `normal`, `pro` or `developer`. Without it, `normal`. Any other value is an error, and the plugin is not loaded. See [Levels](#levels). |

<!-- file: package.json -->
```json
{ "name": "paloma-film-grain", "private": true, "type": "module" }
```

## The module

The module exports `activate(host)`. Paloma calls it when the plugin is switched on, including at startup, and the function returns the plugin's contributions:

<!-- file: index.js -->
```js
// @ts-check
export function activate(host) {
  return {
    filters: [
      {
        name: 'grain',
        label: { en: 'Film grain', uk: 'Плівкове зерно' },
        group: 'effects',
        icon: 'icons/grain.svg',
        params: [
          { name: 'amount', label: { en: 'Amount', uk: 'Сила' }, type: 'number', min: 0, max: 100, step: 1, default: 20 },
        ],
        async render({ image, width, height, params }) {
          const sigma = (60 * Number(params.amount)) / 100;
          if (sigma === 0) return image;
          const noise = await host.sharp({
            create: { width, height, channels: 3, background: '#808080', noise: { type: 'gaussian', mean: 128, sigma } },
          }).png().toBuffer();
          return image.composite([{ input: noise, blend: 'overlay' }]);
        },
      },
    ],
  };
}
```

`host` gives you:

- `host.apiVersion`: `1`.
- `host.sharp`: Paloma's [sharp](https://sharp.pixelplumbing.com/), so you need no image library of your own.
- `host.log.info/warn/error(message)`: logs with your plugin id as a prefix.

Keys of the returned object other than `filters`, `authProviders` and `aiProviders` are ignored with a warning in this API version. Later versions will add new kinds of contributions there, for example a map provider.

If `activate` throws, or the module does not export it, the plugin shows the error in **Server settings → Plugins** and the rest of Paloma keeps working. Switching the plugin on again retries `activate`.

## Filters

| Field | Meaning |
| :--- | :--- |
| `name` | The `filter` value of edit steps, for example `{ "filter": "grain", "amount": 30 }` in `.paloma.json`. It must be unique across all plugins. A name already taken by a bundled plugin, or by an external plugin whose id sorts first, is not available, and your plugin shows a warning. Pick a distinctive name. |
| `label` | Shown in the editor as the icon's tooltip; a string or an object by language, as in the manifest. |
| `group` | Edit bar group: `basic`, `tuning` or `effects`. |
| `icon` | Optional. Path of an SVG icon, relative to the plugin folder (see below). |
| `level` | Optional. The lowest level at which the edit bar offers the filter. Without it, the plugin's `level`. See [Levels](#levels). |
| `params` | The step's parameters (below). The editor makes a control for each one. |
| `render(input)` | Returns a sharp image with the result; it may be async. |

Parameter types:

| `type` | Extra fields | Editor control | Value in a step |
| :--- | :--- | :--- | :--- |
| `number` | `min`, `max`, `step`, `default` | slider | number in range |
| `boolean` | `default` | switch | `true` / `false` |
| `choice` | `options: [{ value, label }]`, `default` | buttons | one of the option values (string or number) |
| `rect` | `default: { left, top, right, bottom }` | frame over the image | fractions 0..1 of the image at that step, `left < right`, `top < bottom` |

Parameter names are letters, digits and `_`, starting with a letter. `filter` and `enabled` are reserved.

### Levels

Users choose a level in **Settings**: Child, Easy, Normal, Professional or Developer, from the simplest to the most capable. A filter is in the edit bar only when the user's level is at least the plugin's `level` and at least the filter's own `level`. So give a plugin for beginners `"level": "easy"`, a plugin for experts `"level": "pro"`, and a single advanced filter of an easy plugin `level: 'pro'`.

- Levels only decide what the editor offers. Steps of your filters are rendered at every level, in thumbnails, the viewer and exports, and are kept when the user edits other steps.
- At the Child level the edit bar is not shown at all, so `child` makes no difference for filters yet.
- A filter whose `level` is not one of the five values is not available, and **Plugins** shows a warning naming it. The plugin's other filters still work.

### Icons

Each filter is a button with an icon in the photo viewer's edit bar. Give it one with `icon`, the path of an `.svg` file inside your plugin folder:

<!-- file: icons/grain.svg -->
```svg
<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <circle cx="7" cy="7" r="1.5" /><circle cx="16" cy="6" r="1" /><circle cx="11" cy="12" r="2" />
  <circle cx="18" cy="15" r="1.5" /><circle cx="6" cy="17" r="1" /><circle cx="13" cy="19" r="1" />
</svg>
```

- Draw it on a 24×24 grid with thin strokes, like the [Lucide](https://lucide.dev) icons the bundled plugins use. Colours do not matter: Paloma uses only the icon's shape and paints it in the edit bar's colour.
- The icon is never put into the page as markup, so scripts or styles in the file have no effect.
- Paloma uses the icon only when it is an existing `.svg` file inside the plugin folder (a symlink must lead inside it too). Otherwise the filter still works, it gets a generic filter icon, and **Plugins** shows a warning naming the filter.
- A filter without `icon` also gets the generic icon.

### What `render` gets

```ts
{
  image,         // sharp image of the photo after the previous steps
  width, height, // its size in pixels
  params,        // every declared parameter, validated, defaults filled in
  host,          // the same host as activate() got
}
```

- **Be independent of resolution.** The same chain renders a 250-pixel thumbnail, the editor preview and the full-size export. Express sizes as fractions of `width`/`height`, never as fixed pixels.
- **Each step gets fresh pixels.** Paloma materializes the result of every step before calling the next one, so your sharp operations run in the order you call them and never mix with other steps.
- **Failures are contained.** If `render` throws, returns something that is not a sharp image, or takes too long (10 s for previews, 60 s for exports), the step is skipped and the error is logged with the photo and your filter name. The photo still renders with the other steps.
- **Never write files** in photo folders. Paloma stores edits in `.paloma.json` and never changes the photo.

## Auth providers

When `PALOMA_AUTH=on` (see [Users and logins](users-and-auth.md)), every request needs a user. Paloma itself keeps the users, their roles and permissions, their library access, sessions and API tokens. **Auth providers** only check credentials and say which user they belong to. The bundled `auth-password` plugin (username and password) and `auth-token` plugin (personal API tokens) are auth providers, and are the best examples to read.

A plugin returns its providers in `authProviders`:

| Field | Meaning |
| :--- | :--- |
| `id` | The type's id, unique across plugins: lowercase letters, digits and hyphens. A taken id is not available, and your plugin shows a warning. A bundled provider wins, then the external plugin whose id sorts first. |
| `label` | Shown on the login page and in **Admin → Authentication**; a string or an object by language. |
| `kind` | `credentials`: a login form; a successful login starts a browser session. `bearer`: a credential the client sends with each request as `Authorization: Bearer <credential>`. Any other kind is not available, and your plugin shows a warning. Redirect-based logins such as OAuth are planned for a later API version. |
| `fields` | `credentials` only: the form fields, each `{ name, label, type }` with type `text` or `password`. |
| `login(input, ctx)` | `credentials` only: gets the entered values by field name and returns `{ userId }`, or `null` when they are wrong. |
| `setSecret(userId, secret, ctx)`, `checkSecret(userId, secret, ctx)` | Optional, both or neither: a provider that stores passwords. Paloma uses them when a user is created, changes their password or an administrator resets it. |
| `authenticate(credential, ctx)` | `bearer` only: returns `{ userId, permissions?, tokenId? }`, or `null` when the credential is not yours or not valid. `permissions` narrows what the request may do; the user's role still applies. Return `null` quickly for credentials that are not yours, because every bearer provider is asked in turn. |

Every call gets `ctx`:

- `ctx.findUserByUsername(name)`: `{ id, username, enabled }` of the user, ignoring case.
- `ctx.identities.get(userId)` / `ctx.identities.set(userId, data)`: JSON data your provider keeps about a user, such as a password hash or an external account id. Each provider id has its own store.
- `ctx.hashSecret(secret)` / `ctx.verifySecret(secret, hash)`: a salted scrypt hash and a constant-time check, so you need no crypto code of your own.
- `ctx.verifyApiToken(value)`: the owner and permissions of a Paloma API token.

Paloma checks again that the user you return exists and is enabled. Errors thrown by a provider count as a failed login. When auth is on, the last plugin with a `credentials` provider cannot be switched off. Otherwise nobody could log in.

> **An auth provider can log anyone in.** A provider that returns another user's id acts as that user, including an administrator. Switch on only auth plugins you trust.

This example lets a home automation system read the library with a fixed key. The key and the user it acts as come from the server's environment:

<!-- auth-file: index.js -->
```js
// @ts-check
export function activate() {
  return {
    authProviders: [
      {
        id: 'home-key',
        kind: 'bearer',
        label: { en: 'Home automation key', uk: 'Ключ розумного дому' },
        async authenticate(credential, ctx) {
          const key = process.env.PALOMA_HOME_KEY;
          if (!key || credential !== key) return null;
          const user = await ctx.findUserByUsername(process.env.PALOMA_HOME_USER ?? 'home');
          // Only looking, whatever the user's role allows
          return user ? { userId: user.id, permissions: ['library.view'] } : null;
        },
      },
    ],
  };
}
```

## AI providers

**AI providers** look at one photo at a time and answer with tags, objects with boxes, or a text. How administrators set them up and run tasks is described in [AI tasks](ai.md). What your plugin contributes is a provider **type**. In **Server settings → AI** administrators create any number of named providers from it (each with its own settings, e.g. one for OpenAI and one for a local server), curate their models and prices, and choose a provider and a model for each **AI task** (Tags, Objects, Description, and tasks they add). Paloma builds the prompt, prepares the image, runs the tasks as a background job, stores the results and applies tags and descriptions. A provider only talks to its service. The bundled `ai-openai` plugin is the best example to read.

A plugin returns its providers in `aiProviders`:

| Field | Meaning |
| :--- | :--- |
| `id` | Unique across plugins: lowercase letters, digits and hyphens. A taken id is not available, and your plugin shows a warning. A bundled provider wins, then the external plugin whose id sorts first. |
| `label` | Shown in Server settings; a string or an object by language. |
| `settings` | What an administrator enters, each `{ name, label, type, required?, default?, help?, min?, max?, options? }` with type `text`, `secret`, `number`, `boolean` or `choice`. Paloma keeps the values in its data folder. A `secret` is never sent to the browser or logged, and cannot have a default. |
| `missingSettings({ settings, env })` | Optional: names of settings that still need a value for the current values, beyond those marked `required`. `ai-openai` needs an API key only for OpenAI's own address. |
| `settingFromEnv(name, { env })` | Optional: whether a setting without a saved value comes from the server's environment, so Server settings can say so. |
| `modelOptions` | Optional: options of the model that each task sets, declared like filter parameters (`number`, `boolean` or `choice`; no `rect`). |
| `listModels(ctx)` | The models for the saved settings, each `{ id, label?, info? }`; `info` is an object of what the service reports about the model, shown to users. Throw an `Error` with a message for the administrator when the service fails. |
| `getModel(id, ctx)` | Optional: what the service reports about one model, as an object (for OpenAI-compatible servers `GET /models/{model}`). Paloma calls it for models whose information it does not have yet; a failure is only logged. |
| `test(ctx)` | Optional: throws with a message when the service cannot be used. Without it, the connection test calls `listModels`. |
| `run(request, ctx)` | Answers about one photo (below). |

`ctx` has `settings` (saved values with defaults filled in), `env` (the server's environment), `signal` (pass it to `fetch`, so a stopping server cancels your request) and `log`.

`request` has:

- `model`: the task's model id.
- `prompt`: the task's prompt with its placeholders filled in.
- `output`: `tags`, `objects` or `text`: what to answer with.
- `image`: `{ data, mimeType: 'image/jpeg', width, height }`: the photo upright, without edits, resized to the task's image size.
- `language`: the English name of the language to answer in, e.g. `Ukrainian`.
- `maxTags`: for `tags`, the most tags to return.
- `options`: the task's model options, defaults filled in.

Return `{ tags: [{ name, confidence? }] }`, `{ objects: [{ label, rect: { left, top, right, bottom }, confidence? }] }` or `{ text }`, and, when the service reports it, `usage: { tokens: { prompt_tokens, completion_tokens } }`: the tokens the call used by kind (`inputTokens` and `outputTokens` still count as these two). Paloma prices them with the model's prices and stores a [usage record](ai.md#usage-and-credits) for every call. Leave `usage` out when the service reports none; the record then says the tokens are unknown. Servers speaking the OpenAI API report usage on streamed requests that send `"stream_options": {"include_usage": true}`, as `ai-openai` does. Rectangles are fractions 0..1 of the image you got, and confidences are 0..1. Paloma clips rectangles to the image and drops empty tags and labels, so you need not.

When a call fails, throw an `Error` with a `kind`, so Paloma can react: `auth` (credentials refused), `unreachable` (no answer), `rate-limit` (Paloma waits `retryAfterMs` or a few seconds and retries up to three times), `bad-answer` or `other`. A run stops after five photos in a row fail with `auth` or `unreachable`. Any other error counts as a failed photo. A paid call whose answer is no use can still report its tokens: put `usage` on the error.

Providers made from your type do not see the server's environment, except the one named `OpenAI` that exists from the start; `ctx.env` is empty for the others. Read connection details from `ctx.settings` first.

> **Photos leave the computer.** Whatever your provider sends goes to its service. Say in your plugin's description where photos are sent.

This example tags photos with a tagging service on the local network, whose address the administrator enters:

<!-- ai-file: index.js -->
```js
// @ts-check
export function activate() {
  return {
    aiProviders: [
      {
        id: 'home-tagger',
        label: { en: 'Home tagger', uk: 'Домашній тегувальник' },
        settings: [
          { name: 'url', label: { en: 'Service address', uk: 'Адреса сервісу' }, type: 'text', required: true, default: 'http://tagger.local:8080' },
        ],
        async listModels() {
          return [{ id: 'default', label: 'Default' }];
        },
        async run(request, ctx) {
          if (request.output !== 'tags') throw Object.assign(new Error('Home tagger only gives tags'), { kind: 'other' });
          let response;
          try {
            response = await fetch(`${ctx.settings.url}/tag`, {
              method: 'POST', headers: { 'Content-Type': request.image.mimeType }, body: request.image.data, signal: ctx.signal,
            });
          } catch (err) {
            throw Object.assign(new Error(`Home tagger cannot be reached: ${err}`), { kind: 'unreachable' });
          }
          if (!response.ok) throw Object.assign(new Error(`Home tagger answered ${response.status}`), { kind: 'other' });
          const labels = /** @type {{ label: string, score: number }[]} */ (await response.json());
          return { tags: labels.slice(0, request.maxTags).map((l) => ({ name: l.label, confidence: l.score })) };
        },
      },
    ],
  };
}
```

## How edits are stored

The editor saves a photo's chain as `edits` in its `.paloma.json` entry:

```json
"IMG_0042.jpg": {
  "edits": [
    { "filter": "crop64", "rect": { "left": 0.1, "top": 0, "right": 0.9, "bottom": 1 } },
    { "filter": "grain", "amount": 30 }
  ],
  "modified": "2026-10-05T12:00:00.000Z"
}
```

When your plugin is off or uninstalled, its steps stay in the file and are skipped when rendering. The editor shows them as unavailable. Switch the plugin back on, and photos look as before.

## Type checking

Bundled plugins are plain JavaScript with `// @ts-check` and JSDoc types from `server/src/plugins/api.ts`. `npm run build` type-checks them. External plugins can copy that file for the same checks.
