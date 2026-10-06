# Design

## Context

- The `people` capability already reads Picasa `faces=` / `[Contacts2]` and sidecar `faces` / `people` into two derived tables, `photo_people` (contact ids per photo, in face order) and `folder_people` (definitions per folder), rebuilt from disk by `FolderScannerService`. `services/people.ts` resolves names across folders; `photoFilters` searches people's names; the Info panel lists them.
- The database has two MVP tables that nothing real uses: `people` (integer id, name, `avatar_crop_path`) and `face_annotations` (bounding box as `[x,y,w,h]`, descriptor as a JSON string). `routes/index.ts` has demo `GET/POST /api/people` and `POST /api/faces/annotate`; `components/PeopleView.tsx` is a demo list.
- `@vladmandic/face-api` ^1.7.12 is already a client dependency but is not imported anywhere.
- Sidecar writing goes through `SidecarService.updateFolderSidecar` / `changeEntry` (atomic write, Picasa import on first change, `modified`). Bulk changes across folders follow the pattern of `albumApi` / `POST /api/photos/keywords`: folder by folder, each folder all-or-nothing.
- `ThumbnailService` uses `sharp(...).rotate()` for EXIF orientation; previews include edits.
- Until now the library DB was a pure cache of the folders (plus geocoding caches). This change makes it hold user data for the first time (profiles, avatar choice, dismissals, detections).

## Goals / Non-Goals

**Goals:**
- Editable people with known/unknown state and profiles, stored in the DB; marks stored in `.paloma.json` `faces` as contact id plus optional rect.
- People seeded from sidecars and Picasa without writing files.
- People view, People sidebar list, grid by person, avatar picker.
- Marking people in the Info panel.
- Browser-side face detection over the grid's photos with an overlay progress ring, resumable.
- Similar faces mode for a person, with bulk marking and dismissal.

**Non-Goals:**
- Drawing or resizing face rectangles by hand (marks without a rect cover the manual case for now).
- Automatic assignment of faces to people without user confirmation; clustering of unknown faces into unknown people.
- Merging two people; editing `ignored` faces; writing face data into photo files (XMP MWG regions).
- Server-side detection (tfjs-node) or a background detection queue.
- Backing up or exporting profiles to folder files.

## Decisions

### D1. Person identity is the contact id; profiles live in a new `persons` table
New table `persons(contact_id TEXT PRIMARY KEY, name, alias, comment, links_json, birth, gender, avatar_folder, avatar_file, avatar_rect_json, edited INTEGER, created_at)`. `edited = 0` means "never edited in Paloma": the shown name is then the resolved name from `folder_people` (existing `personNames` logic) and `persons.name` is ignored; on the first PATCH, `edited` becomes 1 and the resolved name is copied into `name` if the request does not set one. Known ⇔ shown name is non-null.
- Contact ids for new people: 16 random lowercase hex digits (`crypto.randomBytes(8)`), re-drawn on collision and never `ffffffffffffffff`.
- Alternative considered: integer ids (MVP). Rejected — sidecar faces already use Picasa contact ids, and marks must stay meaningful if the DB is rebuilt.
- The MVP `people` and `face_annotations` tables are dropped by a migration in `db/columns.ts` (like `dropMvpEdits`); nothing real is stored in them.

### D2. Seeding on index, no file writes
The scanner also keeps a derived `photo_faces(photo_id, position, contact_id, rect)` table next to `photo_people`: every face of a person with its rectangle (null for a mark without one), rebuilt from disk the same way. Avatars, face frames and the mark ↔ detected-face matching read rectangles from it instead of re-reading folder files.

After `setPhotoPeople`, `FolderScannerService` inserts `persons(contact_id, edited=0)` with `INSERT OR IGNORE` for every contact id in `photo_people`. Rows are never deleted by scanning (a person whose photos disappear stays, with 0 photos; the People view still lists them so profiles are not lost). Definitions without faces do not create persons (spec "Definition without faces").

### D3. Face shape and marks in `SidecarService`
- `isFace` accepts `{person}` without `rect`; `ignored` still requires `rect`. `PalomaFace.rect` becomes optional in `shared/types.ts`.
- New `FieldPatch`-like operations, applied through `changeEntry` so Picasa import, `modified`, empty-entry removal and atomic writes are reused:
  - `addMark(person, rect?)`: no-op if the person already has a face and no rect is given; with a rect, replaces the person's rect-less faces and appends `{rect, person}` (keys in that order, matching Picasa import output).
  - `removePerson(person)`: drops every face with that `person`; drops `faces` if it becomes empty.
- Files read/written: only `<folder>/.paloma.json` of the photo's folder (created with the Picasa import on first change, per sidecar-files). `.picasa.ini` / `picasa.ini` are read, never written. Photo files are never touched.
- After a write, the folder's `photo_people` rows are refreshed from the new state (same path as other field changes), so search and person filters follow at once.

### D4. Deleting a person
`DELETE /api/people/:id` groups the person's photos by folder and applies `removePerson` folder by folder. If every folder succeeds, the `persons` row, its dismissals and its avatar choice are deleted and its detected faces become unassigned. If any folder fails, the person row is kept and the response is 500 with the count of failed folders (folders already written stay written; the person's remaining faces are in the failed folders). `people` definitions are untouched; since D2 only seeds from faces, the person does not come back.

### D5. Profile API and validation (`services/peopleApi.ts`)
- `GET /api/people` → `PersonSummary[]`: `{id, name|null, alias|null, hasAvatar, photoCount}`; count excludes hidden photos. The client sorts with `Intl.Collator` of the active language (known by name, then unknown by count desc), because the order depends on the UI language.
- `GET /api/people/:id` → `Person` with all profile fields (no descriptors). `POST` / `PATCH` take `{name?, alias?, comment?, links?, birth?, gender?, avatar?}`; `avatar: {photoId, rect} | null`.
- Validation (pure functions with tests): name trimmed, ≤ 200 chars, non-empty if present; clearing a known name → 400; profile fields on an unknown person without a name in the same request → 400; alias ≤ 200, comment ≤ 5000; links: `new URL()` with protocol `http:`/`https:`, ≤ 20, each ≤ 2000; birth `^\d{4}$` (1000..current year) or `^\d{4}-\d{2}-\d{2}$` round-tripping through `Date.UTC` and ≤ today; gender `female|male|null`.

### D6. Avatars
Stored as folder path + file name + rect (photo ids change when a folder is re-indexed; paths are what marks are tied to). `GET /api/people/:id/avatar` resolves the chosen face (must still be a face of this person with that rect, compared with 1e-6 tolerance), else the first rect face in `folders.path, photos.filename` order, else 404. The crop is the rect expanded by 20% on each side and clamped, made square, cut from the EXIF-rotated unedited original with sharp, 256 px JPEG, cached in the thumbnail cache dir keyed by file hash + rect; response sets `Cache-Control` and the client adds a version query (`?v=<hash>`) taken from the summary so a new choice refreshes.
`GET /api/people/:id/faces` lists the person's rect faces (photo id, rect) for the avatar picker. `Person.avatar` is the chosen face while it is still the person's (null for the default), so the picker can show the current choice.

### D7. Face crops
`GET /api/photos/:id/face?rect=l,t,r,b&size=160` returns a crop like D6 (used by the Info panel, Similar faces and the avatar picker). Same cache.

### D8. Detection runs in the browser
- `@vladmandic/face-api` with the WebGL backend; models `ssdMobilenetv1`, `faceLandmark68Net`, `faceRecognitionNet` (128-d descriptors). Model files are copied from `node_modules/@vladmandic/face-api/model/` by a small Vite plugin (served in dev, emitted to `dist/face-models/` in build); they are loaded lazily on the first run, so the library page does not pay for them.
- Alternative considered: server-side `@vladmandic/face-api` + `tfjs-node`. Rejected for now — native TensorFlow binaries fight the project's "latest Node" policy, and the browser already has WebGL.
- Input image: new `GET /api/photos/:id/face-source` — unedited, EXIF-rotated JPEG, longest side 1280 px (cached like previews). Rects are relative to this image = relative to the unedited oriented photo, the same frame as Picasa `rect64` and `crop64`.
- Detector version string `DETECTOR = "face-api-1.7/ssd-mnv1/0.5"` (library, model, min confidence 0.5) is sent with each result.
- Runner (`client/src/faces/detectionRunner.ts`, a Zustand slice): takes the grid's photo ids, asks `POST /api/faces/pending {photoIds, detector}` which photos need detection (not detected with this detector for the current `file_hash`, not videos), then processes them sequentially; after each photo it `PUT /api/photos/:id/detected-faces {detector, fileHash, faces: [{rect, score, descriptor: number[128]}]}`. Cancel sets a flag checked between photos. The run lives in the store, so it continues while the user changes folders; a reload ends it (resumable by D9's skip rule).
- Progress ring: `FaceDetectionProgress` component, fixed over the grid's bottom-end corner, an SVG circle with `stroke-dasharray` = share done, `12 / 30` inside; a `button` with `aria-label` "Cancel face detection (12 of 30)". Finish message uses the existing toast/alert mechanism of the library header.
- Start button: in `LibraryHeader` (and `TagHeader` / person header via the shared header area), level Normal, hidden while a run exists or the grid is empty.

### D9. Detection storage
New tables:
- `face_detections(photo_id PK → photos ON DELETE CASCADE, detector, file_hash, detected_at)` — a photo is "done" when a row with the current detector and its current `file_hash` exists.
- `detected_faces(id PK, photo_id → photos CASCADE, rect_json, score, descriptor BLOB (128 × float32))`.
- `face_dismissals(face_id → detected_faces CASCADE, contact_id, PK(face_id, contact_id))`.
`PUT detected-faces` replaces the photo's rows in one transaction. Descriptors are never serialized into any response.
Photo rows are recreated when a folder is re-indexed only if the file changed (existing scanner behavior); a changed `file_hash` makes the photo pending again.

### D10. Matching faces to marks and similarity
- Assignment is computed, not stored: a detected face belongs to person P if a face of P with a rect on the same photo has IoU ≥ 0.5 with it (best IoU wins when several overlap). This keeps the DB consistent with outside edits of `.paloma.json` without extra bookkeeping. Implemented in `services/faceMatch.ts` (pure, tested).
- Assigning a detected face writes `{rect: detected rect, person}` (D3), after which the computed match makes it assigned.
- `GET /api/people/:id/similar?limit=200` (server): reference set = descriptors of P's assigned detected faces; candidates = unassigned detected faces on not-hidden photos not dismissed for P; distance = min Euclidean distance to the reference set; keep ≤ 0.55 (face-api's commonly used 0.6 tightened to reduce false positives; a constant, tuned later), sort ascending, return `{faceId, photoId, rect, distance}`. Brute force in JS over Float32Arrays; fine for tens of thousands of faces. Response says `noReference: true` when the reference set is empty.
- `POST /api/people/:id/faces {faceIds}` assigns detected faces in bulk (folder by folder, D4 pattern), responding with assigned and failed ids. `POST /api/people/:id/dismissals {faceIds}` stores dismissals.
- Single-photo endpoints: `GET /api/photos/:id/people` (people with rects and unassigned faces — light, no EXIF read; used by face frames and to refresh the Info panel), `POST /api/photos/:id/people {person, faceId?}` (faceId → rect of that detected face; none → rect-less mark), `DELETE /api/photos/:id/people/:personId`. Assigning to a new person: the client first `POST /api/people` then assigns.

### D11. Grid by person and Similar faces UI
- Store: `selectedPerson: string | null`, mutually exclusive with folder / album / tag like `setSelectedTag`; `personMode: 'photos' | 'similar'`. `GET /api/photos` gains `person` (`photoFilters`: `inArray(photos.id, photo_people where contact_id = ?)`).
- `PersonHeader` (like `TagHeader`): avatar, shown name, alias, photo count, Edit (Normal), Photos | Similar faces toggle (Normal).
- Similar faces renders its own grid of face crops (reusing `VirtualGrid`), with selection checkboxes, a sticky action bar "Add <name>" / "Not <name>", and double-click / Enter opening the viewer on the photo.
- Sidebar: `SIDEBAR_LISTS` gains `people` (between tags and folders), using `useSidebarSections`; people with `photoCount > 0` only.
- People view rewrite: card grid + `PersonEditorModal` (name; for known: alias, comment, links rows, birth as year or date input, gender select, avatar picker) + delete via `ConfirmModal`.

### D12. Search
`photoFilters` text search currently matches `personNames()` for people. It becomes a `personTexts()` map of contact id → [shown name, alias] using `persons` + resolved names. No `searchText` column change is needed, so renames apply at once.

### D13. Levels
New control ids in `levels/controls.ts`: `sidebar.people` (Easy), `people.choose` (Easy), `info.people` (Easy, read-only list), `info.people.edit` (Normal), `view.people` (Normal, existing), `people.edit` (Normal), `faces.detect` (Normal), `faces.similar` (Normal). Child: none (sidebar shows albums only already). `docs/complexity-levels.md` table updated.

### D14. Face frames in the viewer
- A layer of absolutely positioned elements inside the viewer's zoom stage, in the image's own box, so zoom and pan need no extra math; rectangles are placed as CSS percentages (HTML rather than SVG, so labels are not distorted by the box's aspect ratio).
- Rects live in the unedited oriented frame; a pure `faceRectMapper(chain)` (`components/viewer/faceRects.ts`) maps them through enabled `crop64`/`crop`, `rotate` (90° steps) and `flip` steps in order, returns the clipped rect, `undefined` when the face falls outside a crop, and `null` for the whole photo when the chain contains another geometric step (`straighten`, `tilt`). Colour/effect steps are ignored. The geometric step list comes from the bundled filters' names, so plugin effects never block frames.
- Data: `PhotoInfo.people[].rects` and `PhotoInfo.faces` (unassigned detected faces); the frames layer fetches `GET /api/photos/:id/people` only while Faces is on, and refetches after library changes, so an assignment in the Info panel or on a frame shows in both.
- Toggle: `showFaces` in `uiSettings` (per browser, like other UI settings); `f` key; nav bar button. Control ids `viewer.faces` (Easy) and `viewer.faces.assign` (Normal).
- Frames reuse existing theme tokens whose contrast every theme already guarantees: marks `--pal-viewer-text` outlined with `--pal-viewer-bg`, unassigned faces dashed `--pal-warning`, labels `--pal-viewer-text` on `--pal-viewer-bg`. No new color tokens. Labels sit above the frame, inside it at the top edge.
- Keys from inside a dialog over the viewer (the person picker) are ignored by the viewer's key handler, so Esc closes the dialog, not the viewer.

### D15. Unrecognized faces
- `GET /api/faces/unassigned?limit=` → `{ total, faces }`: unassigned detected faces (the same computed matching as D10) on not-hidden photos, newest photos first (`date_taken` desc, then photo and face id), at most 500; `limit=0` gives only the count for the sidebar. Assigning reuses `POST /api/people/:id/faces`.
- Store: `selectedUnrecognized` is one more library source, exclusive with folder, album, tag and person.
- The face crop grid of Similar faces is shared (`FaceCropGrid`); the Unrecognized view has one action, "Who is this?", which opens the person picker and assigns every selected face.
- Control id `faces.unrecognized` (Normal): the sidebar entry is shown only when the level allows it and the count is above 0.

### MVP code reused, rewritten or dropped
- Reused: `people.ts` name resolution (extended), `photo_people` / `folder_people`, `SidecarService` write path and Picasa import, `VirtualGrid`, `SidebarSection`, `ConfirmModal`, `TagHeader` as the pattern for `PersonHeader`, `ThumbnailService` sharp pipeline for crops.
- Rewritten: `PeopleView.tsx`, `GET/POST /api/people`, `Person` type in `shared/types.ts`, the Info panel People section.
- Dropped: `people` and `face_annotations` tables, `FaceAnnotation` type, `POST /api/faces/annotate`, the `faceAnnotations` deletes in `FolderScannerService` (replaced by cascades on the new tables).

## Risks / Trade-offs

- **Profiles exist only in the DB** → deleting `DATA_DIR/paloma.db` loses aliases, comments, links, avatars, dismissals and detections (names and marks survive in folder files). This is the user's explicit choice; documented in the proposal. A future change can add profile export.
- **Browser detection speed** (≈ 0.2–1 s/photo on WebGL; CPU fallback much slower) → sequential, resumable runs with a visible ring and cancel; results saved per photo.
- **Model files size (~12 MB)** → loaded lazily only when detection or Similar faces is first used; not part of the main bundle.
- **Computed assignment (IoU) can flip** if someone edits a rect by hand → acceptable; it only changes which detected face counts as assigned.
- **Similarity threshold** is a fixed constant; false positives are handled by "Not <name>" dismissals.
- **Photo ids change on re-index of changed files** → avatars stored by path + rect, detections keyed by photo id but invalidated by `file_hash`, so a changed file is simply detected again.
- **Bulk marking across folders is not atomic** → per-folder all-or-nothing with a reported failed count, the same trade-off already accepted for albums and tags.
