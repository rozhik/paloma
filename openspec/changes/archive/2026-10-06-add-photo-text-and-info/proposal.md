# Proposal

## Why

Paloma already stores a caption and keywords per photo in `.paloma.json` and imports them from Picasa, but the user can neither see nor edit them, cannot browse photos by tag, and search only matches file names and place names. Captions and tags written into the photo files by Picasa or a camera (IPTC/XMP/EXIF) are ignored. There is also no place in the viewer to see what Paloma knows about a photo: where the file is, its albums, people, location and camera data.

## What Changes

- **Description and tags as user text.** The photo's caption (shown as "Description") and keywords (shown as "Tags") become visible and editable. When the folder files say nothing, they come from the metadata embedded in the photo (XMP, IPTC, EXIF), read-only. A change made in Paloma is stored only in `.paloma.json` and overrides the embedded value; an empty caption or an empty tag list in the sidecar means "removed" when the file has embedded text, like `"geotag": null`. Photo files are never written.
- **Tags in the sidebar.** A new "Tags" sidebar list, next to albums and folders, lists every tag with its photo count. Choosing a tag shows its photos. Tags are grouped ignoring letter case.
- **Tagging selected photos.** The tray gets "Add tags", which adds one or more tags to every selected photo (new `POST /api/photos/keywords`, folder by folder like the bulk location change). While a tag is open in the grid, the tray also offers "Remove tag", which removes that tag from the selected photos; it is not shown in other grid views.
- **Tags are edited as chips.** In the Info panel and the "Add tags" dialog, tags are chips that can be removed with their button or Backspace.
- **Search over all text.** The library search matches every word of the query, ignoring case, against file name, folder path, description, tags, album names and descriptions, people's names, place names and camera make and model.
- **Info panel in the viewer.** A new Info button in the navigation bar (and the `i` key) opens a panel for the current photo: file name, path on disk, size, dimensions and dates; editable description and tags; albums; people; location with its source and place name; EXIF (from Professional); the photo's `.paloma.json` entry as JSON (Developer); and other facts (starred, hidden, number of edits). New `GET /api/photos/:id/info`.
- **People from Picasa, read-only.** Picasa `faces=` lines and `[Contacts2]` sections are imported into `.paloma.json` as `faces` per photo and a top-level `people` section, and the people named on a photo are shown in the Info panel and searchable. No face detection or people editing in this change; the demo People view is untouched.
- **Levels.** The Info button, editing description and tags, the Tags sidebar list, "Add tags" and "Remove tag" are Easy; the EXIF section is Professional; the JSON section is Developer. Child sees none of them.

## Capabilities

### New Capabilities
- `photo-text`: a photo's description and tags — their sources (sidecar, Picasa `.ini`, embedded metadata), editing one photo and many, the tag list with counts, and browsing photos by tag.
- `photo-search`: what the library search matches and how a query is interpreted.
- `photo-info`: the Info panel in the photo viewer and the photo info API.
- `people`: people named on photos, read from Picasa faces and contacts and stored in folder sidecars; read-only for now.

### Modified Capabilities
- `sidecar-files`: photo entries gain `faces`; the sidecar gains a top-level `people` section; `caption: ""` and `keywords: []` become valid "removed" markers; Picasa `faces=` and `[Contacts2]` are mapped; clearing a caption or tags via the API follows the embedded-value rule.
- `photo-viewer`: the navigation bar gains the Info button; the viewer keyboard gains `i`.
- `complexity-levels`: the list of current controls and their levels includes the Info panel and its sections, the Tags list and "Add tags".

## Impact

- Server: `MetadataService` (reading XMP/IPTC/EXIF text, camera make and model; metadata version bump so photos are re-read), `SidecarService` and `picasaIni` (faces, people, empty markers), `FolderScannerService` (effective caption/keywords, faces, people), `photoFilters` (multi-word text search, tag filter), new tag and info endpoints in `routes/index.ts`, DB columns and tables in `db/schema.ts` / `db/columns.ts`.
- Client: viewer `NavBar` and a new Info panel, the sidebar sections and `uiSettings.SIDEBAR_LISTS`, the tray and a tag dialog, `levels/controls.ts`, `api/library.ts`, the store, all 11 locale catalogs, `docs/complexity-levels.md`.
- Shared types: `Photo`, new `PhotoInfo`, `TagSummary`.
- API: new `GET /api/tags`, `GET /api/photos/:id/info`, `POST /api/photos/keywords`; `GET /api/photos` accepts `tag`; `query` semantics widen.
- No new runtime dependency is required; XMP and IPTC are parsed with small in-house readers (see design).
