# Proposal

## Why

Scanning the photo folders listed in `.env` is the base of the whole app: the library shows only what the scan finds. The demo MVP already scans and watches `PALOMA_PHOTOS_DIRS`, but nothing about it is confirmed, and the catalog drifts from the configuration and from the files: folders removed from `.env` stay in the library forever, and photos edited in another program keep stale metadata and thumbnails. This change makes the scanning behavior the first confirmed capability and closes those two gaps.

## What Changes

- Confirm the existing MVP behavior as the contract:
  - folders from `PALOMA_PHOTOS_DIRS` are scanned recursively and watched on server start;
  - `PALOMA_EXCLUDE_DIRS`, hidden files/folders and `node_modules` are skipped;
  - only supported image types are indexed; each directory with photos is its own folder in the library;
  - rescans don't duplicate photos; one broken file doesn't stop the scan;
  - photos added or deleted while the server runs appear in / disappear from the library.
- **New:** on start, folders that are no longer covered by `PALOMA_PHOTOS_DIRS` (removed from it, or now excluded) are removed from the library together with their photos. Files on disk are never touched. A configured folder that is temporarily missing (e.g. an unplugged disk) is kept.
- **New:** a photo whose file content changes while the server runs is re-indexed (dimensions, date, location, thumbnails), keeping the user's star and edits.
- **New:** nested entries in `PALOMA_PHOTOS_DIRS` (one inside another) don't produce duplicate photos.
- **BREAKING (demo behavior):** the "Add folder" button, its dialog and `POST /api/folders/scan` are removed. Folders come only from `PALOMA_PHOTOS_DIRS` and `PALOMA_EXCLUDE_DIRS` in `.env`. Folders added earlier through the button are removed from the library on the first start.

Out of scope: photos deleted or changed while the server was off (startup reconciliation), metadata extraction details, thumbnail format, and `.paloma.json` format.

## Capabilities

### New Capabilities
- `folder-scanning`: which folders and files from the configuration end up in the library, and how the library stays in sync with them while the server runs.

### Modified Capabilities
<!-- none: openspec/specs/ is empty -->

## Impact

- `server/src/services/FolderScannerService.ts` — pruning, change handling, nested-root handling, shared photo removal.
- `server/src/index.ts` — startup order (prune, then scan).
- `server/src/config.ts` — reused as is (`photosDirs`, `excludeDirs`).
- `server/src/routes/index.ts` — `POST /api/folders/scan` removed.
- Client: `components/ImportModal.tsx` deleted; "Add folder" button removed from `components/Navbar.tsx` and its wiring from `App.tsx`; empty-state hint in `components/LeftSidebar.tsx` points to `.env`.
- SQLite catalog: rows in `folders`, `photos` and dependent tables (`edits`, `face_annotations`, `photo_tags`, `album_photos`) are deleted for pruned folders. No schema change.
- Thumbnail cache: re-indexed photos get new cache files; old ones are left in place.
- Photo folders on disk: read only. No files are written or deleted by this change.
- New vitest tests for the scanner.
