# Keybindings

Almost everything you can do with one button in Paloma also has a key: the next photo, starring the selected photos, rotating, opening Settings. Which keys run which actions is set by a **keymap**.

## Keymaps

A keymap has a name, the **preset** it is based on, and its own keys for some actions. Every action the keymap does not change keeps the key of its preset, so actions added in a later Paloma version get their preset keys too. An action can have several keys, or none.

Paloma ships three presets, which nobody can change:

| Preset | For |
| :--- | :--- |
| `mac` | A Mac keyboard: shortcuts use ⌘ (`Meta`) |
| `windows` | Windows and Linux keyboards: shortcuts use Ctrl |
| `tvBox` | A TV box remote: arrows, OK, Back, play/pause and the coloured buttons, no modifiers |

`mac` and `windows` give every action a key (except filters of plugins that do not come with Paloma). `tvBox` gives keys only where a remote has one.

Each user has **one keymap**, kept in Paloma's database on the server (never in the photo folders), so it is the same in every browser they log in from. With users off, the one user has one keymap. Until a user chooses or changes anything, they get `mac` on Apple devices and `windows` on every other device, and nothing is stored for them. Deleting a user deletes their keymap.

## Where to find it

| What | Where | Lowest level |
| :--- | :--- | :--- |
| Using the keys | Everywhere | Child (each key only for what the level shows) |
| Choosing a preset | Settings → Keyboard | Normal |
| Editing keys | Settings → Keyboard → Edit keys (the Keybindings page) | Normal |
| Downloading and uploading a keymap as JSON | The Keybindings page | Professional |

On the Keybindings page you can rename the keymap, add a key to an action by pressing it, remove a key, and reset one action or the whole keymap to its preset. Each change is saved at once. A key that another action already has in the same scope is refused; the page offers to move it.

## Sections and scopes

Actions are grouped by where they work:

| Section | Works |
| :--- | :--- |
| Global | Everywhere |
| Library, Selection | While the photo grid is shown; Selection actions need selected photos |
| Viewer, Edit | While a photo is open in the viewer; Edit actions need the edit bar |
| Slideshow | During a slideshow |
| People, Map, Collage | On that view |

A key can be used only once among the sections that work at the same time: Global with every section, Library with Selection, Viewer with Edit. The same key can be used on different screens, like `→` for the next photo in the viewer and in the slideshow.

Keys never run in a text field: typing `i` into the search field types an `i`. Esc goes to the field first. Keys reach only what the level and the user's permissions allow. In a right-to-left language `←` and `→` swap, so the key for the next photo points the way the photos go.

Forms and dialogs (Account, Admin, Server settings and the pickers) have no actions of their own; Tab, Enter and Esc work there as usual.

## Keys

A key is written as its modifiers in this order, then the key: `Ctrl+`, `Alt+`, `Shift+`, `Meta+` (⌘ on a Mac). Letters are upper case (`S`, `Shift+T`), the space bar is `Space`, and other keys have the names browsers give them: `ArrowLeft`, `Escape`, `Enter`, `PageDown`, `F5`, `MediaPlayPause`, `ColorF0Red`, `GoBack`. Symbols are written as typed, without `Shift`: `+`, `?`.

## The JSON format

```json
{
  "format": "paloma-keymap",
  "version": 1,
  "name": "My keys",
  "basedOn": "mac",
  "sections": [
    {
      "id": "viewer",
      "name": "Viewer",
      "actions": [
        { "id": "viewer.next", "name": "Next photo", "keys": ["ArrowRight", "N"] },
        { "id": "viewer.objects", "name": "Object frames", "keys": [] }
      ]
    },
    {
      "id": "edit",
      "actions": [{ "id": "edit.basic-transforms.rotate", "keys": ["R", "Meta+]"] }]
    }
  ]
}
```

- Listed actions take the listed keys; `[]` means no key. Every other action has the keys of `basedOn`.
- `name` fields are for people and are ignored when a file is read. A downloaded file lists every action with its English name.
- Filters of the edit bar are `edit.<plugin id>.<filter name>`. Filters of plugins that are not installed are kept.
- A file that is not a keymap, a newer `version`, an unknown preset, a name that is empty or longer than 64 characters, an invalid key, or two actions with the same key in one scope are refused. Unknown sections and actions are left out and reported. Files over 256 KB are refused.

## API

Every logged-in user, and their API tokens, can read and replace their own keymap. No permission is needed, and nobody can read another user's keymap.

| Request | Does |
| :--- | :--- |
| `GET /api/keymap` | `{ "keymap": <file> }` with only the keymap's own keys, or `{ "keymap": null }` when nothing is stored |
| `PUT /api/keymap` | Replaces the keymap with a keymap file. `200 { "keymap", "dropped" }`, or `400` with `code: "invalid_keymap"` and `problems`, each with a `code` (`not_keymap`, `version`, `preset`, `name`, `key`, `conflict`, `too_large`) and, where it applies, the `key` and `actions` |
| `GET /api/keymap/presets` | Each preset with every action and its keys |

The catalog of actions and the presets are in [`shared/keymaps.ts`](../shared/keymaps.ts). A new button that is the only one of its kind on its screen, or acts on the selection, gets an action there with keys in `mac` and `windows`; `shared/keymaps.test.ts` fails for an action without one.
