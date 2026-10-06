# Tasks

## 1. Types and library tables

- [x] 1.1 In `shared/types.ts`: add `PalomaFace` (`rect`, `person?`, `ignored?`), `PalomaPerson` (`name`, `email`, `googleId`: string | null), `faces?` on `PalomaPhotoEntry`, `people?` on `PalomaFolderFile`; add `TagSummary` (`name`, `photoCount`), `PhotoInfo` (as in design §7) and `PhotoPerson` (`id`, `name: string | null`); remove `Photo.tags?`. Verify `npm run build` type-checks once the references in later groups compile (temporary stubs allowed).
- [x] 1.2 In `db/schema.ts`, `db/index.ts` and `db/columns.ts`: add `photos` columns `embedded_caption`, `embedded_keywords`, `camera_make`, `camera_model`, `search_text` through `PHOTO_COLUMNS`; create `photo_keywords` (index on `key`), `folder_people`, `photo_people`; drop the MVP `tags` and `photo_tags` tables and remove their references in `FolderScannerService` and `routes/index.ts`. Verify with `columns.test.ts`: an in-memory MVP database ends up with the new columns and tables, without `tags`/`photo_tags`, idempotently, with `photos` rows untouched.

## 2. Embedded text in photo files

- [x] 2.1 Add the IPTC IIM reader (2:120 caption, repeated 2:25 keywords, 1:90 UTF-8 marker, strict UTF-8 then latin1 fallback). Verify with byte-fixture tests in `MetadataService.test.ts` (or a new `embeddedText.test.ts`): UTF-8 Cyrillic caption, latin1 caption, three keywords, truncated record ignored.
- [x] 2.2 Add the XMP reader for `dc:description` (`x-default`, else first item; element and attribute forms) and `dc:subject` (`rdf:Bag`/`rdf:Seq`), decoding XML entities. Verify with tests on Picasa-, Lightroom- and Windows-style packets, `&amp;` in a tag, and a packet without `dc` yielding nothing.
- [x] 2.3 Read EXIF `ImageDescription`, `XPComment`, `XPKeywords` (UTF-16LE, `;`-split), `Make`, `Model`; apply the source precedence and the camera placeholder list from the photo-text spec; return `{ caption, keywords, cameraMake, cameraModel }` from `extractMetadata`; bump `METADATA_VERSION` to 2. Verify with tests: XMP wins over IPTC, IPTC over EXIF, `OLYMPUS DIGITAL CAMERA   ` is no caption, blank XMP falls through to IPTC, XPKeywords `a;b;` → `a`, `b`.

## 3. Picasa faces and contacts

- [x] 3.1 In `picasaIni`: parse `faces=` into `PhotoFields.faces` (rect via the `crop64` rect64 decoder, ids padded to 16 lowercase hex, `ffffffffffffffff` → `ignored: true`, unreadable items dropped) and `[Contacts2]` into `people` (exactly three `;` parts, empty → `null`). Verify with `picasaIni.test.ts` cases from the people spec: face + contact, short contact id, contact with two parts dropped, malformed `rect64` dropped.

## 4. Sidecar fields

- [x] 4.1 In `SidecarService`: keep `caption: ""` and `keywords: []` from a sidecar in `PhotoFields`; read `faces` (valid faces only; any other shape counts as absent for the library) and add `faces` to `SUPPORTED_FIELDS`, `sameFields` and re-import; read top-level `people` (ignore invalid definitions without making the sidecar unreadable) into `FolderState.people`; preserve unknown keys as today. Verify with `SidecarService.test.ts`: `"caption": ""` read as removed, malformed face ignored and kept in the file, faces survive starring, invalid `people` leaves other fields working.
- [x] 4.2 Import `[Contacts2]` people on the first change and re-import a changed `.ini` (replace listed ids, add new, never remove); faces re-imported like other fields for entries without `modified`. Verify with tests: first change writes `people` and `faces`; renamed contact in a re-imported `.ini` updates `people`; a person missing from the new `.ini` stays.
- [x] 4.3 Extend `FieldPatch`/`applyPatch` with the embedded state: clearing a caption or keywords writes `""`/`[]` when the file has embedded text, else deletes the key; keywords deduplicated ignoring case keeping first spelling. Verify with tests for all four clear cases and `["Київ", "київ", "Lviv"]`.

## 5. Indexing, tags and people in the library

- [x] 5.1 In `FolderScannerService.toPhotoColumns`: compute effective caption and keywords (sidecar → `.ini` → embedded), store the embedded values, camera make/model and the lowercased `search_text`; rewrite `photo_keywords` and `photo_people` and the folder's `folder_people` in the same transactions as albums. Verify with `FolderScannerService.test.ts`: embedded IPTC caption shown without an entry; sidecar caption wins; `"keywords": []` hides embedded tags after a DB rebuild; editing the sidecar while running updates `photo_keywords`; Picasa-only folder shows faces live.
- [x] 5.2 Add people name resolution (first non-null name in folder path order) and expose it for search and info. Verify with tests: name defined only in another folder; unknown contact → `null`.
- [x] 5.3 Add `GET /api/tags` and the `tag` filter in `photoFilters`. Verify with route/service tests: two spellings grouped under the majority spelling, tie broken by code-point order, hidden-only tag absent, `?tag=DAWN` matches `Dawn` and `dawn`, combines with `album`.

## 6. Search

- [x] 6.1 Rewrite the `query` part of `photoFilters` per design §5 (words ANDed; `search_text`, place cells, album tokens by resolved name/description, contact ids by resolved name; `instr`, no `LIKE`). Verify with `photoFilters`/`photoApi` tests covering every photo-search scenario, including Cyrillic case, `%` treated literally, removed embedded description not found, and search inside an album.

## 7. Photo API

- [x] 7.1 Pass the embedded state from the photo row into `PATCH /api/photos/:id` and return effective values. Verify with `photoApi.test.ts`: clear an embedded caption writes `"caption": ""` and the response has `caption: null`; photo file bytes and mtime unchanged.
- [x] 7.2 Add `POST /api/photos/keywords` (`photoIds`, `add`, `remove`) using `saveFolderByFolder`. Verify with tests: two folders, embedded tags copied before adding, tag already present in another case unchanged, empty `add` → 400, unknown id → 404, corrupt sidecar → 409 with nothing written.
- [x] 7.3 Add `GET /api/photos/:id/info?lang=` (`services/photoInfo.ts`): file stat, album names, people, place, EXIF groups stringified (binary as size, long strings cut at 2000 chars), entry with source `paloma`/`ini`/`none`/`unreadable`. Verify with tests: unknown id → 404; entry with unknown keys returned as stored; Picasa-only folder returns source `ini`; MakerNote returned as `{ binary }`; no file in the folder changes.

## 8. Client: levels, store, sidebar and tray

- [x] 8.1 In `levels/controls.ts` add `sidebar.tags`, `tray.addTags`, `tray.removeTag`, `viewer.info` (easy), `info.exif` (pro), `info.json` (developer); update `docs/complexity-levels.md`. Verify with `controls.test.ts` cases for each level and the docs test if it checks the table.
- [x] 8.2 Store and API: `selectedTag` / `setSelectedTag` (clears folder and album; folder/album setters and `enterChildMode` clear it), `tag` in `api/library.ts`, `api/tags.ts`, `api/photoInfo.ts`, `api/photos` bulk keywords. Verify with `usePalomaStore.test.ts` and `library.test.ts`.
- [x] 8.3 Sidebar: add `'tags'` to `SIDEBAR_LISTS` (between albums and folders), a `useTags` hook, the Tags section with counts and empty text, and the tag header in `LibraryHeader`. Verify with `shell.test.ts`/`skins.test.tsx`: Tags list shown at Easy in every skin, hidden at Child, choosing a tag replaces a chosen album.
- [x] 8.4 Shared `TagChips` (chips with a named remove button, Enter/comma adds, Backspace in the empty field removes the last chip, case-insensitive suggestions) and `AddTagsModal`; tray action `addTags`. Verify with component tests: suggestion for `bir`, duplicate in another case not added, × and Backspace remove a chip, confirm sends `POST /api/photos/keywords` and keeps the selection.
- [x] 8.5 Tray action `removeTag`, shown only while a tag is chosen: sends `remove: [selectedTag]`, clears the selection, refreshes grid and sidebar counts; on error keeps the selection and shows the error. Verify with tests: offered in a tag view at Easy, not offered in folder, album, collection or all-photos views, and not at Child; after success the photos leave the grid and the selection is empty.

## 9. Client: Info panel

- [x] 9.1 Info button in `NavBar` and `i` key in the viewer (only when `viewer.info` is allowed, not while typing in a field), open state reset on viewer open, Esc closes the panel first; panel placement from `barLayout`. Verify with `barLayout.test.ts` for insets with bars on top/right/bottom and a viewer test: `i` toggles, Esc closes panel not viewer, Child shows no button.
- [x] 9.2 `InfoPanel` sections: File (size formatted with the active language, base 1024), Description (Enter/blur saves, Esc restores), Tags (`TagChips`, saves each change), Albums, People ("Unknown person"), Location (6 decimals, source, place), EXIF (pro), JSON (developer, 2-space, `ini`/none/unreadable messages), Other (starred, hidden, edit count); follows Previous/Next; failed save shows the error and restores; successful saves bump `libraryVersion`. Verify with component tests for each section's scenarios in the photo-info spec, including the level gating of EXIF and JSON.
- [x] 9.3 Add every new string to all 11 locale catalogs (Info, Description, Tags, Add tags, No tags yet, Unknown person, section titles, messages). Verify with `catalogs.test.ts`.

## 10. Integration

- [x] 10.1 Run the app against a folder with a Picasa `.ini` (faces, contacts, keywords), a JPEG with IPTC/XMP text and one without metadata; check that the Tags list, search, the Info panel at Easy/Pro/Developer and "Add tags" behave as specified, and that only `.paloma.json` files changed (`git status`/checksums of the photos and `.ini`).
- [x] 10.2 Verify `npm run build` and `npm test` pass.
