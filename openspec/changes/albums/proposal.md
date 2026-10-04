# Proposal

## Why

Albums are the main way Picasa users organize photos across folders, and Picasa users' folders already contain them. `.picasa.ini` holds an `[.album:<token>]` definition and `albums=` memberships (526 album sections and 1 908 memberships in the reference corpus). Paloma currently drops all of this. The `sidecar-files` contract was built so that later per-photo features could build on it, and albums are the first. The MVP album code keeps albums only in the database, with numeric ids and no UI, so an album is lost when the library is rebuilt.

## What Changes

- **Album model (Picasa-compatible).**
  - An album is global and identified by a token.
  - Its definition (name, date, location, description) is copied into the `.paloma.json` of every folder that has a photo in it, under the top-level `albums` section keyed by token.
  - Photo entries list their albums in an `albums` array of tokens.
  - An album exists only while at least one photo is in it. Nothing outside the photo folders is stored.
- **Picasa import.**
  - `[.album:<token>]` sections (`name`, `date`, `location`, `description`, values untrimmed) and each file's `albums=` key are read.
  - While a folder has no `.paloma.json`, they are shown live.
  - The first change imports them, and a changed `.ini` re-imports them under the existing `iniHash` rules.
  - Re-import never removes an album definition.
- **Folders without `.paloma.json`.** The app reads the album definitions and memberships from the folder's Picasa `.ini`, as it does for photo fields.
- **Album name across folders.** When folder copies disagree, the copy with the newest Paloma `modified` wins. Otherwise the first non-empty name wins, with folders in path order. An album without a name anywhere is shown as untitled.
- **Management.** Users can do the following, and each change is saved to every affected `.paloma.json` (created if needed):
  - create an album from selected photos, with an optional description and location
  - edit an album's name, description and location
  - choose the album's cover photo, or reset it to the default
  - delete an album
  - add selected photos to an album, or remove them from it

  Deleting an album leaves its photo files untouched.
- **Multi-folder writes.** An album change can touch several folders. It is rejected without writing anything if any affected sidecar is unreadable. If a write fails part-way, the folders already written keep the change, and the API names the folders that failed.
- **Library and API.**
  - Album definitions and memberships are indexed from the folder files and kept in sync by the existing watcher.
  - Endpoints: `GET /api/albums`, `POST /api/albums`, `PATCH /api/albums/:token`, `DELETE /api/albums/:token`, `POST`/`DELETE /api/albums/:token/photos`.
  - `GET /api/photos?album=<token>` lists an album's photos.
  - Photos expose their album tokens.
- **UI.**
  - An "Albums" section in the sidebar, with photo counts.
  - An album view with an album properties dialog (name, description, location) and a delete action.
  - "Make cover" for one selected photo in the album view.
  - "Add to album" (existing album or a new one) for the selected photos in the photo tray.
  - "Remove from album" in the album view.
- **BREAKING**: The MVP `albums`/`album_photos` tables, with their numeric ids, are replaced. Albums created through the old `POST /api/albums` exist only in the database and are dropped. `POST /api/albums/:id/photos` with a numeric id no longer exists.

- **Out of scope.**
  - Sync with Picasa Web Albums / Google Photos (`name_lh`, `IIDLIST_*`, `[photoid]`) is left to future plugins.
  - A collage as the album cover.

## Capabilities

### New Capabilities
- `albums`: global albums stored the Picasa way in folder sidecars. It covers:
  - the album definition and membership format in `.paloma.json`
  - importing and re-importing from `.picasa.ini`
  - resolving the album definition and cover across folders
  - which albums the library lists
  - create, edit (name, description, location, cover), delete, add and remove through the API, and the multi-folder write rules
  - the albums UI

### Modified Capabilities
- `sidecar-files`:
  - Photo entries gain the `albums` field.
  - `albums=` becomes a mapped Picasa key.
  - A top-level `albums` section that is not an object of objects makes the sidecar unreadable.
  - Album changes, like photo field changes, may create `.paloma.json`.
  - The "unknown content is preserved" example no longer uses `albums`, because Paloma now interprets it.

## Impact

- `server/src/services/picasaIni.ts`: parses `[.album:*]` sections and `albums=`.
- `server/src/services/SidecarService.ts`:
  - validates and reads album definitions and memberships
  - imports and re-imports them
  - new album operations that write one folder atomically
- New album service (server): definition and cover resolution, multi-folder create/edit/delete/add/remove, and token generation.
- `server/src/services/FolderScannerService.ts`: applies album definitions and memberships per folder alongside the photo fields.
- `server/src/db`: replaces the MVP `albums`/`album_photos` with per-folder album definitions and token-based membership. Old tables are dropped in place.
- `server/src/routes/index.ts`: new album endpoints replace the MVP ones, and `GET /api/photos` gains `album`.
- `shared/types.ts`: `Album` is keyed by `token`, `Photo` gains `albums`, and `PalomaFolderFile`/`PalomaPhotoEntry` gain album fields.
- Client:
  - `LeftSidebar` gets the albums section.
  - The store gets the selected album.
  - `App` gets the album photo list and header.
  - `PhotoTray` gets add to album and remove from album.
  - New album picker and album properties modals.
- User photo folders: only `.paloma.json` is written, on album changes and on `.ini` re-import as before. `.picasa.ini` stays read-only. Photo files are never touched.
