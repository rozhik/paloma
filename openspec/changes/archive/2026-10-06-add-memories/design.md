# Design

## Context

See proposal.md for the motivation and specs/memories/spec.md for the rules. Relevant current state:

- `photos.date_taken` (server/src/db/schema.ts) is an ISO string filled by `MetadataService`: EXIF `DateTimeOriginal`, else `DateTime`, else the file's `mtime`. exif-reader turns the EXIF wall-clock time into a UTC `Date`, so for EXIF dates the first 10 characters are the camera's calendar date; for `mtime` they are the UTC date.
- `GET /api/photos` already orders by `date_taken DESC, id` and builds its `WHERE` in `photoFilters` (server/src/services/photoFilters.ts), shared with the map and the places list.
- Album membership is in `album_photos`; shown album names come from `shownAlbumTexts()` (albumApi.ts).
- The client sidebar is built once in `useSidebarSections` (client/src/shell/sidebar.tsx) and rendered by every skin; the lists are `SIDEBAR_LISTS` in client/src/settings/uiSettings.ts and their levels are `sidebar.<id>` in client/src/levels/controls.ts. The library source (folder, album, tag, person…) lives in `usePalomaStore` and is cleared through `NO_SOURCE`.

## Goals / Non-Goals

**Goals:**
- Compute memories on request from the library database, cheap enough to run on every sidebar load.
- Keep the memory view a thin variant of the album view: same grid, tray, search and slideshow.
- Leave a place for an AI-generated name later without changing the API shape.

**Non-Goals:**
- No new tables, no cache of memories, no background job.
- No new configuration in `.env` or Settings; window (±3 days) and minimum (3 photos) are constants.
- No dismissing, saving or sharing a memory.

## Decisions

### Files in the photo folders
None are read or written by this change. Memories use only the library database (`photos`, `album_photos`, and the shown album names already derived from the sidecars and `.picasa.ini`).

### The client sends today's date
`GET /api/memories?date=YYYY-MM-DD` takes the browser's local date instead of the server clock. The server may run on another machine or time zone, and "today" is what the viewer sees. Alternative: server local date — simpler, but wrong for a remote browser and hard to test.

### Matching by calendar date string
A photo's day is `substr(date_taken, 1, 10)`. The server computes, for each past year from the oldest photo's year to D's year − 1, the anniversary (Feb 29 → Feb 28) and its window `[A−3, A+3]` with plain date arithmetic, then runs one query: non-hidden photos whose day falls in any of these windows (`substr(date_taken,1,10) BETWEEN ? AND ?` joined with `OR`, or a 7-value `substr(date_taken,6,5) IN (...)` prefilter followed by exact assignment in TypeScript). Photos are grouped by window; groups under 3 are dropped. Windows of different years never overlap, so a photo is in at most one memory. Alternative: converting to local time on the server — rejected, because EXIF dates carry no zone and the stored string already is the camera's date. For `mtime` dates the UTC day may differ from the local day by one, which the ±3 day window absorbs.

### Same range filter for the memory's photos
The memories response carries `from` and `to`; the client opens a memory with `GET /api/photos?takenFrom=…&takenTo=…`, a new generic condition in `photoFilters` (`substr(date_taken,1,10) BETWEEN`). This makes search, the tray, the slideshow and the map work with no memory-specific code. Alternative: `?memory=2016&date=…` — would duplicate the window logic in the filter. Trade-off: the range alone does not apply the "≥ 3 photos" rule, which is fine since the client only opens listed memories.

### Naming album chosen on the server, name text built on the client
The server returns `album: {token, name} | null`: among albums with a non-empty shown name whose `album_photos` contain every photo of the memory, the one with the fewest member photos, ties by name ignoring case. The client builds the text with i18n keys `memories.yearsAgo` (plural, `{{count}}`) and `memories.albumInYear` (`{{album}}`, `{{yy}}`), so the name follows the active language without a refetch. A nullable `title` field is reserved in the `Memory` type for a future generated name; the client will prefer it when set.

### Cover
First starred photo of the memory in photo-list order (`date_taken DESC, id`), else the first photo; thumbnail URL built like album covers.

### Client
- `SIDEBAR_LISTS` gets `memories` before `albums`; `CONTROL_LEVELS['sidebar.memories'] = 'easy'`. Collapsing works like other lists.
- `usePalomaStore` gets `selectedMemory: {year, from, to} | null`, part of `NO_SOURCE`, so choosing any other source clears it and vice versa.
- `useMemories()` (TanStack Query, key `['memories', today]`): `today` is recomputed on window focus and on an interval of one minute, so the key changes after midnight; queries already refetch on focus.
- The photo list query adds `takenFrom`/`takenTo` while a memory is chosen. A `MemoryHeader` shows the name, the photo count and the localized date range; it has no edit actions. Tray actions that need an album (Remove from album, Make cover) are not offered, as in a tag view.
- Translations for all 11 locales in client/src/i18n/locales.

### MVP code
- Reused: `photoFilters`, `listPhotos`, the album cover thumbnail logic, `useSidebarSections`, skins' sidebar rendering, `AlbumHeader` as a model for `MemoryHeader`.
- New: server/src/services/memories.ts (+ test), route in server/src/routes/index.ts, `Memory` in shared/types.ts, client/src/api/memories.ts.
- Rewritten or dropped: nothing.

## Risks / Trade-offs

- [Photos without EXIF date use `mtime`, so copied files cluster on the copy date and make false memories] → accepted for now; a later change can exclude `mtime`-only dates once the library records the date source.
- [A large library makes the query scan all photos] → the windows cover at most ~7 days per year; add an index on `substr(date_taken, 6, 5)` only if measurements show a need.
- [Browser and server disagree on the date] → the date always comes from the browser; the server never uses its clock for memories.
- [A memory changes while open, e.g. a photo is hidden] → the open view keeps its range and simply shows what matches; the sidebar entry updates or disappears on the next listing.
