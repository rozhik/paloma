# Writing Paloma plugins

A Paloma plugin is a folder of JavaScript code that adds features to Paloma without changes to Paloma itself. In plugin API version 1, plugins add **image filters**: the steps of a photo's non-destructive edit chain, such as crop, sepia or film grain.

> **Plugins are trusted code.** A plugin's module runs inside the Paloma server with the same rights as Paloma: it can read and write any file the server can. Install only plugins you trust. External plugins stay **off** until you switch them on in **Settings → Plugins**, and the code of a plugin that is off is never run.

## Installing a plugin

External plugins live in the folder set by `PALOMA_PLUGINS_DIR` in `.env`. The default is `plugins/` inside `PALOMA_DATA_DIR`. Each direct subfolder that has a `paloma-plugin.json` is one plugin. Paloma never runs git and never changes files in plugin folders. To install a plugin, clone it:

```sh
mkdir -p .paloma_data/plugins
cd .paloma_data/plugins
git clone https://example.com/paloma-film-grain.git
# or, if the plugins folder is itself a git repository:
git submodule add https://example.com/paloma-film-grain.git
```

Then restart Paloma. The plugin is listed in **Settings → Plugins** as off. Switch it on there; this does not need a restart. To update a plugin, `git pull` in its folder and restart. To remove it, delete its folder and restart.

If a plugin needs npm packages, it should ship them or tell you to run `npm install` in its folder.

Paloma's own filters ship as **bundled plugins** in the repository's `plugins/` folder (`basic-transforms`, `basic-effects`). They use the same API as external plugins and are good examples. Bundled plugins are on until you switch them off.

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

Keys of the returned object other than `filters` are ignored with a warning in this API version. Later versions will add new kinds of contributions there, for example a map provider.

If `activate` throws, or the module does not export it, the plugin shows the error in **Settings → Plugins** and the rest of Paloma keeps working. Switching the plugin on again retries `activate`.

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
