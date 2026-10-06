# Proposal

## Why

A large library hides old photos: nobody scrolls back twenty years to see what happened on this week in 2006. "Memories" bring those photos back on their own, by showing, every day, what was taken around the same date in earlier years, without the user having to organize anything.

## What Changes

- New **memories**: virtual albums the library builds by itself for today's date. Each past year that has at least 3 photos (not hidden) taken within 3 days of today's month and day becomes one memory.
- A memory gets an automatic name: `<album> in '<yy>` (for example `Kyiv in '91`) when all its photos belong to one album, otherwise `<N> years ago` (for example `10 years ago`), in the active UI language.
- Memories are computed, never stored: no file in the photo folders is read or written for them beyond what the library already indexes, and they change by themselves when the date changes.
- New API: `GET /api/memories` lists today's memories; `GET /api/photos` gets a date-taken range filter that shows a memory's photos.
- New "Memories" section in the sidebar, above Albums, available from the Easy level. Opening a memory shows its photos in the grid with its name, like a read-only album; selecting, the tray, search and the slideshow work as in other views.
- Out of scope, planned later: AI-generated names, saving a memory as a real album, notifications, and choosing the date window or minimum size in Settings. The design keeps room for a generated name.

## Capabilities

### New Capabilities
- `memories`: which memories exist for a date, how their photos are chosen, how they are named, the memories API, and the Memories sidebar section and view.

### Modified Capabilities
- `complexity-levels`: the Memories sidebar list and opening a memory are added to the controls of the Easy level.
- `photo-search`: the library search also narrows the photos of an open memory.

## Impact

- Server: new memories service and route (`GET /api/memories`), a date-taken range in `photoFilters` used by `GET /api/photos`, vitest tests.
- Client: Memories sidebar section in every skin, store state for the chosen memory, memory header in the library, translations of the names and texts for all 11 UI languages, a new `sidebar.memories` control level.
- `shared/types.ts`: a `Memory` type.
- No change to sidecar or `.picasa.ini` handling, the database schema or `.env`.
