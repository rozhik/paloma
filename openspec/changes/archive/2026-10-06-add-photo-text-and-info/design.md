# Design

## Context

See proposal.md for motivation. Current state relevant to the approach:

- `SidecarService` already reads and writes `caption` and `keywords`, and `picasaIni` maps them; both drop empty values. `PATCH /api/photos/:id` already accepts both. `FolderScannerService.toPhotoColumns` copies them into `photos.caption` / `photos.keywords` (JSON text).
- `MetadataService.extractMetadata` gets `sharp(...).metadata()`, which already exposes the raw `exif`, `iptc` and `xmp` buffers, but only parses EXIF (via `exif-reader`) for GPS and date. `METADATA_VERSION` makes older rows re-read on the next scan.
- `photoFilters` searches with `query` only in `filename` (SQL `LIKE`, ASCII case folding) and in cached place names (lowercased in JS).
- The sidebar lists come from `useSidebarSections` (shared by all skins) and `SIDEBAR_LISTS` in `uiSettings`; levels per control are in `levels/controls.ts`.
- The viewer (`components/viewer/*`) has `NavBar`, `EditBar`, floating panels and `barLayout` for placing overlay bars; Esc already closes an open floating panel before the viewer.
- MVP leftovers: DB-only tables `tags`, `photo_tags`, `people`, `face_annotations`, the `/api/people` and `/api/faces/annotate` routes, `PeopleView`, and `Photo.tags?` / `Photo.facesCount?` in `shared/types.ts`.

## Goals / Non-Goals

**Goals:**
- One place (`toPhotoColumns`) decides the effective description and tags from sidecar → `.ini` → embedded text, so scan, watcher and API agree.
- Search, tag list and tag filter work from indexed columns, with Unicode case folding done in JS, never by SQLite `lower()`/`LIKE`.
- The Info panel needs only one request per photo; EXIF is read from the file on demand and never stored.

**Non-Goals:**
- Writing XMP/IPTC/EXIF into photo files (also not on export in this change).
- Face detection, face rectangles on the photo, editing people, the central Picasa `contacts.xml`; the demo People view and its tables and routes stay as they are.
- Renaming or merging tags across the library; removing an arbitrary tag from the tray outside a tag view (only the open tag can be removed there).
- Phrase search, boolean operators, ranking.

## Decisions

### 1. Embedded text is read by small in-house readers, no new dependency
`MetadataService` gains `readEmbeddedText(exif, iptc, xmp)` returning `{ caption, keywords, cameraMake, cameraModel }`:
- **XMP**: the packet is decoded as UTF-8 and scanned for `dc:description` (`rdf:Alt`, the `x-default` item, else the first) and `dc:subject` (`rdf:Bag`/`rdf:Seq` items), with XML entities decoded. A regex-level reader is enough for these two well-formed, namespace-fixed properties.
- **IPTC IIM**: walk `0x1C` records; dataset 2:120 is the caption, every 2:25 is a keyword. If 1:90 announces UTF-8 (`ESC % G`) decode UTF-8; otherwise try UTF-8 strictly and fall back to latin1.
- **EXIF**: `Image.ImageDescription`, `Image.XPComment`, `Image.XPKeywords` (UTF-16LE byte arrays, NUL-terminated, keywords split at `;`), `Image.Make`, `Image.Model` from the already-parsed `exif-reader` result.
- Precedence and the camera placeholder list are as in the photo-text spec; the placeholder list is a constant next to the reader.

Alternative: `exifr` (one library for EXIF/IPTC/XMP). Rejected for now: we already depend on `exif-reader`, need only five fields, and in-house readers are easy to test with byte fixtures. Revisit if more XMP fields are needed.

`METADATA_VERSION` goes to 2 so every existing photo is re-read once.

### 2. Storage of effective and embedded values
New `photos` columns (added through `PHOTO_COLUMNS`): `embedded_caption`, `embedded_keywords` (JSON), `camera_make`, `camera_model`, `search_text`. `caption` / `keywords` keep holding the **effective** values, so `toApiPhoto` and everything reading them is unchanged.

`PhotoFields` keeps `caption: ""` and `keywords: []` from a sidecar (today they are dropped) so the scanner can tell "removed" from "not set". `toPhotoColumns(fields, metadata)`:
- `caption = fields.caption !== undefined ? (fields.caption || null) : embeddedCaption`
- `keywords = fields.keywords !== undefined ? fields.keywords : embeddedKeywords` (deduplicated ignoring case)
- `search_text` = lowercased (`String.prototype.toLowerCase`) join with `\n` of file name, folder path, caption, keywords, make, model.

The Picasa `.ini` parser keeps dropping empty values (Picasa never writes "removed" markers).

### 3. Clearing writes a marker only when the file has embedded text
`FieldPatch` gets the photo's embedded state from the DB row (`embedded_caption`, `embedded_keywords`) in `photoApi`; `applyPatch` writes `caption: ""` / `keywords: []` when clearing a field the file has, and deletes the key otherwise. The DB is current because embedded values change only with the file, which re-indexes it. Alternative of re-reading the photo file on each PATCH was rejected as slow and racy.

### 4. Tags index table
New table `photo_keywords(photo_id, keyword, key)` with index on `key`, where `key` is the JS-lowercased keyword. It is rewritten for a photo whenever its columns are set (same transaction as `setPhotoAlbums`). The MVP DB-only `tags` and `photo_tags` tables are dropped (they never existed on disk) and their scanner/route references removed; `Photo.tags?` is removed from shared types.
- `GET /api/tags`: group non-hidden photos' rows by `key`, count distinct photos, pick the spelling with the highest count then lowest code-point order (done in JS over the grouped rows), sort by `key` with `localeCompare`.
- `GET /api/photos?tag=`: `photos.id IN (SELECT photo_id FROM photo_keywords WHERE key = lower_js(tag))`.

Alternative: `json_each(photos.keywords)` at query time — rejected because SQLite cannot case-fold Cyrillic.

### 5. Search is composed per word at query time
`photoFilters` splits `query` at white space, lowercases each word in JS, and ANDs one condition per word:
```
instr(photos.search_text, w) > 0
OR photos.geo_cell IN (place cells whose search_text contains w)        -- existing
OR photos.id IN (album_photos WHERE token IN <album tokens matching w>)
OR photos.id IN (photo_people WHERE contact_id IN <people matching w>)
```
Album tokens and contact ids matching a word are computed in JS from the resolved names (reusing the album name resolution in `albumApi`, and the new people resolution) because names are resolved across folder copies. `instr` replaces `LIKE`, so `%` and `_` in a query are literal. Album renames and people changes need no `search_text` rewrite.

### 6. People: two library tables, sidecar and `.ini` as the source
- `picasaIni` parses `[Contacts2]` into `people` and `faces=` into `PhotoFields.faces` (`rect64` decoded by the existing `crop64` helper; ids padded to 16 lowercase hex). `[Contacts2]` leaves `NON_FILE_SECTIONS` handling as a known section.
- `SidecarService`: `faces` becomes a supported photo field (import, re-import and `sameFields` like `albums`); top-level `people` is imported on the first change and re-imported like album definitions (replace listed ids, add new, never remove). An invalid `people` value or definition is ignored, not a reason to treat the sidecar as unreadable. `FolderState` gains `people`.
- New tables `folder_people(folder_id, contact_id, name, email, google_id)` and `photo_people(photo_id, contact_id, position)` (non-ignored, distinct), rebuilt from disk like `folder_albums` / `album_photos`.
- Name resolution: first non-null `name` for the id ordered by `folders.path`.
- The MVP `people` / `face_annotations` tables, `/api/people`, `/api/faces/annotate` and `PeopleView` are untouched.

### 7. Info endpoint reads the file and the sidecar live
`GET /api/photos/:id/info?lang=` (new `services/photoInfo.ts`) returns `PhotoInfo`:
`{ photo, file: { path, size, modifiedAt }, albums: [{ token, name }], people: [{ id, name }], place, exif: { [group]: { [tag]: string | { binary: bytes } } } | null, entry: { source: 'paloma' | 'ini' | 'none' | 'unreadable', json?: object } }`.
- EXIF: `sharp(file).metadata().exif` → `exif-reader`; each value stringified (numbers as is, arrays joined with `, `, dates ISO, `Buffer`/byte arrays as `{ binary: length }`); strings longer than 2000 characters are cut with `…`.
- Entry: `SidecarService` read of the folder; for `paloma` the raw entry object for the exact file name (unknown keys included); for `ini` the mapped fields in sidecar shape; `none` when no entry.
- Developer/Professional gating is a UI concern (levels live only in the browser); the API always returns all sections.

### 8. Bulk tagging reuses the folder-by-folder path
`POST /api/photos/keywords` validates like `POST /api/photos/location`, computes each photo's new list from its current effective `keywords` (so embedded tags are copied into the sidecar on first change), and saves through `folderChanges.saveFolderByFolder`.

### 9. Client structure
- `components/viewer/InfoPanel.tsx` + `api/photoInfo.ts` (fetch `PhotoInfo` for the current photo, refetch after a save); open state lives in `usePhotoViewer`, reset when the viewer opens. `barLayout` gains a helper giving the panel's insets from bars on the right/top/bottom edges.
- Shared `components/TagChips.tsx`: a chips control (each chip with a remove button named after the tag; Enter/comma adds; Backspace in the empty field removes the last chip; suggestions from `GET /api/tags` filtered by case-insensitive substring), used by the panel and the new `AddTagsModal`.
- Tray action `removeTag` with `when: selectedTag !== null`: calls `POST /api/photos/keywords` with `remove: [selectedTag]`, then clears the selection and bumps `libraryVersion`; no confirmation (Add tags undoes it). On error the selection is kept.
- Saves call `PATCH /api/photos/:id`, update the viewer's photo, and bump `libraryVersion` so grid, sidebar counts and tag list refresh.
- Store: `selectedTag`, `setSelectedTag` (clears folder and album; folder/album setters clear the tag; `enterChildMode` clears it). `api/library.ts` sends `tag`. `LibraryHeader` shows the tag name and count.
- `SIDEBAR_LISTS = ['shortcuts', 'albums', 'tags', 'folders']`; the tag entries come from a `useTags` hook next to `useFolderTree`.
- `levels/controls.ts`: `sidebar.tags`, `tray.addTags`, `tray.removeTag`, `viewer.info` → easy; `info.exif` → pro; `info.json` → developer. Viewer `i` key bound only when `viewer.info` is allowed.
- New strings in all 11 locale catalogs; `docs/complexity-levels.md` lists the new controls.

### MVP code reused, rewritten or dropped
- Reused: `MetadataService` (extended), `SidecarService`, `picasaIni`, `folderChanges`, `photoApi`, `albumApi` name resolution, viewer bars and `barLayout`, sidebar and tray structure, store.
- Rewritten: the `query` part of `photoFilters`; `toPhotoColumns`.
- Dropped: DB tables `tags`, `photo_tags` and their references; `Photo.tags?`.

### Files in the user's photo folders
- **Read**: every indexed photo file (EXIF, IPTC, XMP through `sharp` metadata) on indexing and on `GET /api/photos/:id/info`; `.paloma.json`; `.picasa.ini` / `picasa.ini` (now also `faces=` and `[Contacts2]`).
- **Written**: only `.paloma.json`, atomically as today, on `PATCH /api/photos/:id` with `caption`/`keywords`, on `POST /api/photos/keywords`, and on any first change that imports a Picasa `.ini` (now also `faces` and `people`).
- Never written: photo files and Picasa `.ini` files.

## Risks / Trade-offs

- [Regex XMP reader misses unusual serialisations (attribute form `dc:description="..."`)] → handle both element and attribute forms; fixtures from Picasa, Lightroom and Windows Explorer XMP in tests; unknown shapes simply yield no value.
- [Metadata version bump re-reads every photo once (hash + metadata) on the next start] → one-off cost, same mechanism already used for GPS; logged as a re-index.
- [`instr` over `search_text` is a full scan] → fine for hundreds of thousands of rows in SQLite; an FTS index can be added later without changing behaviour.
- [Camera placeholder list is incomplete] → kept as one constant; adding entries is a spec-compatible fix.
- [Info EXIF can be large (UserComment, long arrays)] → string values truncated at 2000 characters, binary shown only as size.
- [Old Paloma versions read `caption: ""` / `keywords: []` as unset and show embedded text again] → acceptable; files stay valid for them and unknown keys (`faces`, `people`) are preserved by their writer.

## Migration Plan

- On start: add the new `photos` columns, create `photo_keywords`, `folder_people`, `photo_people`, drop `tags` / `photo_tags`. All new tables are rebuilt from disk; the version bump re-indexes every photo once.
- Rollback: older builds ignore the extra columns and tables; sidecars stay readable by them.
