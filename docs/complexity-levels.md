# Complexity levels

Paloma shows each user only the tools that fit them. The level is chosen in **Settings → Level** and is remembered in the browser, like the other UI settings. It is never sent to the server and never written next to photos.

| Level | Id | For whom |
| :--- | :--- | :--- |
| Child | `child` | A child looking at the family albums. Nothing can be changed. |
| Easy | `easy` | A beginner: browsing, stars, albums, simple fixes, export and print. |
| Normal | `normal` | Everyone else. The default; everything Paloma had before levels existed. |
| Professional | `pro` | Experienced users: also the camera's EXIF data. |
| Developer | `developer` | Everything, including tools for developers: also the raw `.paloma.json` entry of a photo. |

Levels are ordered. A control or plugin filter tagged with a level is shown at that level and at every higher one, and is **hidden** (not just disabled) below it.

## What each level shows

The levels of the controls are kept in one table, `CONTROL_LEVELS` in [`client/src/levels/controls.ts`](../client/src/levels/controls.ts). It reads as follows.

| Lowest level | Controls |
| :--- | :--- |
| Child | Library view; the Albums list in the sidebar; opening a photo in the viewer, with its previous/next and zoom; the slideshow; the Settings view (behind the PIN) |
| Easy | The shortcuts, Tags, People and Folders lists in the sidebar; choosing a person to see their photos; search; selecting photos; starring; the tray's Add to album, Add tags, Remove tag (only while a tag is open), Remove from album, Make cover, Clear, Export and Print; the language switcher in the top bar; the viewer's edit bar; the viewer's Info button and panel, with editing the description and tags and the list of people on the photo; the viewer's Faces toggle with the face frames |
| Normal | The People, Map, Collage and Plugins views; the tray's Remove location, Collage and Movie; album properties and Delete; placing photos on the map and removing their location; adding, editing and deleting people; adding, assigning and removing people on a photo, in the Info panel and on face frames; Find faces; Similar faces; the Unrecognized entry of the People list and naming the faces there |
| Professional | The EXIF section of the Info panel |
| Developer | The JSON section of the Info panel |

At Child the library shows only the photos of the chosen album, and asks for an album until one is chosen. Photo cards only open the viewer. Switching to Child clears the selection, the search, the folder, the tag, the person and the shortcut; an open album stays.

The edit bar offers a plugin's filter only when the level reaches both the plugin's level and the filter's own level. The bundled `basic-effects` plugin (brightness, contrast, black & white, sepia) is `easy`; `basic-transforms` (crop, rotate, flip, straighten) is `normal`. Steps of filters the level hides are still rendered everywhere and are kept when other steps are edited. Plugin authors set levels as described in [Writing Paloma plugins](plugins.md#levels).

## The Child PIN

Choosing Child asks for a new PIN of 4 to 8 digits, twice. At Child:

- Opening Settings asks for the PIN. Leaving Settings locks them again.
- After five wrong PINs in a row, PIN entry is refused for 30 seconds.
- The Level section offers **Change PIN**. Choosing any other level removes the PIN.

The PIN is stored as a salted SHA-256 hash, never as digits. This is a **convenience lock** that keeps children from changing things by accident, not a security boundary:

- The server does not know about levels; its API works at every level.
- Clearing the browser's site data for Paloma removes the PIN and the level (back to Normal). That is also the way out when the PIN is forgotten. The other UI settings (skin, theme, viewer bars) go back to their defaults too.
- Reloading the page resets the count of wrong PINs.

## Tagging a new control

Every control that can change something must have a level:

1. Add its id to `ControlId` and its lowest level to `CONTROL_LEVELS` in `client/src/levels/controls.ts`. TypeScript refuses an id without a level.
2. Show it only when `useAllows('<id>')` is true. A navigation item, tray action or sidebar list only needs the table entry: `useNavigationItems()`, `useTray()` and `useSidebarSections()` already filter by level, so every skin follows.
3. Hide it, don't disable it, and make sure no keyboard shortcut reaches it below its level.
4. Never give `child` to a control that changes photos, albums, edits, locations, plugins or files.

`controls.test.ts` checks that every navigation item, tray action and sidebar list has a level.
