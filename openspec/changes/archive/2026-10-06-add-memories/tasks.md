# Tasks

## 1. Shared types and date-range filter

- [x] 1.1 Add `Memory` to `shared/types.ts`: `year`, `yearsAgo`, `from`, `to`, `photoCount`, `album: {token, name} | null`, `coverPhotoId`, `coverThumbnailUrl`, and a reserved `title: string | null` for a future generated name; verify with `npm run build`.
- [x] 1.2 Add `takenFrom`/`takenTo` (`YYYY-MM-DD`, inclusive, on `substr(date_taken,1,10)`) to `PhotoFilterQuery` and `photoFilters`, and reject an invalid value from `GET /api/photos` with 400 and an error code; cover range, combination with `album` and `query`, and the 400 case in `photoApi.test.ts`.

## 2. Memories service and API

- [x] 2.1 Create `server/src/services/memories.ts` computing the windows of a date (Feb 29 → Feb 28, ±3 days, New Year crossing) and grouping non-hidden photos into memories with at least 3 photos, newest year first, excluding D's year; test every scenario of "A memory is a past year around today's date" in `memories.test.ts`.
- [x] 2.2 Choose the naming album (all photos in it, non-empty shown name, fewest members, ties by name ignoring case) and the cover (first starred in `date_taken DESC, id` order, else first); test the album, mixed-albums, smallest-album, untitled-album and cover scenarios.
- [x] 2.3 Add `GET /api/memories?date=` to `server/src/routes/index.ts` with 400 for a missing or invalid date; test the response shape (`from` `2016-10-03`, `to` `2016-10-09` for 2026-10-06), that hiding a photo and adding an album membership change the next response, and that no folder file is written.

## 3. Client data and state

- [x] 3.1 Add `client/src/api/memories.ts` with `useMemories()` keyed by the local date, recomputing the date on window focus and every minute; add a unit test for the local-date helper.
- [x] 3.2 Add `selectedMemory` to `usePalomaStore` as part of `NO_SOURCE`, and pass `takenFrom`/`takenTo` to the photo list query while it is set; extend `usePalomaStore.test.ts` so choosing a memory clears other sources and choosing an album clears the memory.

## 4. Sidebar, header and levels

- [x] 4.1 Add `memories` before `albums` in `SIDEBAR_LISTS` and `sidebar.memories: 'easy'` in `CONTROL_LEVELS`; extend `controls.test.ts` (hidden at Child, shown at Easy).
- [x] 4.2 Add the Memories section to `useSidebarSections` with name, cover thumbnail, count and the empty text, and check it renders in the classic, compact and glass skins (`skins.test.tsx`).
- [x] 4.3 Add a `MemoryHeader` (name, photo count, localized date range, no edit actions) and show it in `App.tsx` while a memory is chosen; do not offer Remove from album or Make cover in the tray for a memory.
- [x] 4.4 Add the name helper (album name + two-digit year, else plural years ago, preferring `title` when set) with tests for `Kyiv in '91`, `1 year ago`, `10 years ago` and Ukrainian `10 років тому`.
- [x] 4.5 Add `memories.*` and `sidebar.memories` texts to all 11 locales; `catalogs.test.ts` passes.

## 5. Verification

- [ ] 5.1 Run the app with a library holding photos from earlier years around today's date and check: the Memories section at Easy and not at Child, opening a memory, search inside it, the slideshow, and that no file in the photo folders got a new modification time.
- [x] 5.2 `npm run build` and `npm test` pass.
