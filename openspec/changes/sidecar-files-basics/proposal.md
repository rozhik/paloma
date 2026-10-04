# Proposal

## Why

Paloma keeps what the user decides about their photos in a `.paloma.json` file in each photo folder. That way the data moves with the folder, and the SQLite library can be rebuilt from disk.

The MVP sidecar has no confirmed contract:
- It writes an ad-hoc v1 shape.
- It overwrites the whole file and drops anything it doesn't recognize.
- It writes non-atomically.
- It is read only once, during a scan.
- It ignores the `.picasa.ini` files that Picasa users already have in their folders.

This change defines the basic file contract that later per-photo features (edits, faces, albums, full Picasa import) will build on. It proves the contract with the simple per-photo fields (star, hidden, caption, keywords) and with importing those fields from `.picasa.ini`.

## What Changes

- **File format.** `.paloma.json` is a JSON object with `format: "paloma-folder"`, `version: 2`, an optional `iniHash`, and a `photos` map keyed by exact file name. Paloma preserves the other top-level sections (`folder`, `albums`, `people`, `import`, `extra`) without interpreting them.
- **Photo fields.** A photo entry can hold `star: true`, `hidden: true`, `caption` (string) and `keywords` (array of strings). A field that is not set is absent.
- **Modified marker.** Every entry Paloma changes gets `modified` (a UTC timestamp), which separates the user's Paloma decisions from imported values.
- **Source of truth.** The sidecar is the source of truth for these fields. The library takes them from the sidecar when a photo is indexed and whenever the sidecar changes.
- **Picasa import.** Paloma reads `.picasa.ini` (or `Picasa.ini`) but never writes it.
  - While a folder has no `.paloma.json`, the library shows the supported fields read live from the `.ini`.
  - The first user change in the folder creates `.paloma.json` with a snapshot of the supported fields from the `.ini`, and records `iniHash`, the SHA-256 of the `.ini` file.
- **Re-import.** When `.picasa.ini` changes later (its hash no longer matches `iniHash`), Paloma re-imports the supported fields into entries it has not modified. Entries marked `modified` keep the Paloma value, and the conflict is logged.
- **When Paloma writes.** Paloma never creates `.paloma.json` just by scanning. It writes the file only on a user change, or to re-import a changed `.ini` into an existing sidecar.
- **Safe writes.**
  - Everything Paloma doesn't understand is preserved.
  - The write is atomic.
  - The output is stable: sorted photo keys, 2-space indent, LF, UTF-8 without BOM.
- **Unreadable sidecars are never overwritten.** This covers corrupt JSON, the MVP v1 shape, another format and a newer version. A change to a photo in such a folder fails, the library does not change, and the error is logged.
- **Live sync.** Paloma watches `.paloma.json` and the Picasa `.ini`, and applies changes made outside Paloma while the server runs.
- **API.**
  - New `PATCH /api/photos/:id` sets any of `isStarred`, `isHidden`, `caption` and `keywords`. `PATCH /api/photos/:id/star` stays as a shortcut.
  - The photo list returns `caption`, `keywords` and `isHidden`. It excludes hidden photos unless `includeHidden=true`, and folder photo counts exclude them too.
- **BREAKING**: MVP v1 sidecars (`version: "1.0"`, `is_starred`, `edits` as an object) are no longer read, and Paloma leaves them untouched.
- **BREAKING**: Saving edits no longer writes to `.paloma.json`, so edits live only in the library database until a later change. The sidecar's `geo` is no longer used for photo location.

## Capabilities

### New Capabilities
- `sidecar-files`: the per-folder `.paloma.json` file and its relation to Picasa's `.picasa.ini`. It covers:
  - the format, and when Paloma creates and writes the file
  - how the file and the `.ini` are read into the library
  - importing and re-importing supported `.ini` fields
  - keeping the library in sync with outside changes, and protecting unknown or unreadable content
  - the per-photo fields star, hidden, caption and keywords, and the API that sets them

### Modified Capabilities
- `folder-scanning`: the "Hidden, dependency and excluded paths are skipped" requirement gains an exception. `.paloma.json` and the Picasa `.ini` in a scanned folder are read and watched, and they never appear as photos.

## Impact

- `server/src/services/SidecarService.ts`: rewritten (v2 read/validate, field updates, `.ini` import/re-import, atomic stable write).
- New `.ini` reader in `server/src/services/` with its tests.
- `server/src/services/FolderScannerService.ts`: reads the fields from the sidecar or the live `.ini`, stops reading `geo`/`edits`, and watches `.paloma.json` and the `.ini`.
- `server/src/services/scanPaths.ts`: lets `.paloma.json` and `.picasa.ini` through the hidden-file filter.
- `server/src/db`: `photos` gains `caption`, `keywords` (JSON) and `is_hidden`, added in place to existing databases.
- `server/src/routes/index.ts`: new `PATCH /api/photos/:id`. `/star` delegates to it. `GET /api/photos` gains the hidden filter and the new fields. Folder counts exclude hidden photos. `POST /api/photos/:id/edit` no longer writes the sidecar.
- `shared/types.ts`: v2 sidecar types replace `SidecarFile`/`SidecarPhoto`. `Photo` gains `caption`, `keywords` and `isHidden`.
- User photo folders:
  - `.paloma.json` is written on a user change, or on re-import of a changed `.ini` into an existing `.paloma.json`.
  - `.picasa.ini`/`Picasa.ini` are only read.
  - No other files in photo folders are touched by this change.
