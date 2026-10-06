# Tasks

## 1. Data model and seeding

- [x] 1.1 In `shared/types.ts`, make `PalomaFace.rect` optional and replace `Person` / `FaceAnnotation` with `PersonSummary`, `Person` (profile fields), `PersonInput`, `PhotoFace`, `DetectedFaceInfo` and `SimilarFace`; extend `PhotoInfo` with people ids, `hasAvatar` and unassigned faces. Verify: `npm run build` type-checks after the call sites below are updated.
- [x] 1.2 In `db/schema.ts` + `db/columns.ts`, add `persons`, `face_detections`, `detected_faces`, `face_dismissals` and a migration that drops the MVP `people` and `face_annotations` tables; remove `faceAnnotations` uses in `FolderScannerService`. Verify: `columns.test.ts` covers creating the tables on an empty DB and dropping the MVP tables on an old one.
- [x] 1.3 In `SidecarService`, accept faces `{person}` without `rect` (ignored faces still need `rect`). Verify: `SidecarService.test.ts` cases for "Mark without a rectangle" and `{"ignored": true}` without rect being ignored and kept in the file.
- [x] 1.4 In `FolderScannerService`, insert `persons(contact_id, edited=0)` with insert-or-ignore for every contact id in `photo_people` after indexing; never delete persons on scan. Verify: `FolderScannerService.test.ts` — a Picasa folder creates the person without writing files; a `people` definition without faces creates none.

## 2. People service and API

- [x] 2.1 Add `services/personValidation.ts` (name, alias, comment, links, birth, gender, unknown-person rules from design D5). Verify: `personValidation.test.ts` covers valid profile, `javascript:` link, 21 links, `1990-02-30`, future date, year-only birth, blank name on a known person, profile fields on an unknown person.
- [x] 2.2 Add `services/peopleApi.ts`: list with photo counts (hidden excluded), get, create (random 16-hex id, never `ffffffffffffffff`), patch (sets `edited`, copies resolved name), shown-name resolution (`edited` ? DB name : `personNames`); replace demo routes in `routes/index.ts` with `GET/POST /api/people`, `GET/PATCH/DELETE /api/people/:id`; drop `POST /api/faces/annotate`. Verify: `peopleApi.test.ts` — create unknown, name it, rename survives a Picasa rename, 404 on unknown id, profile edit writes no files.
- [x] 2.3 Add mark operations `addMark` / `removePerson` to `SidecarService` (through `changeEntry`, with `modified`, Picasa import on first change) and refresh `photo_people` after the write. Verify: `SidecarService.test.ts` — add without rect, add twice is a no-op, rect replaces rect-less mark, remove keeps ignored faces, first mark in a Picasa folder imports the `.ini`, read-only folder leaves the library unchanged.
- [x] 2.4 Add `POST /api/photos/:id/people {person, faceId?}` and `DELETE /api/photos/:id/people/:personId`. Verify: route tests in `peopleApi.test.ts` for both, including 404 for an unknown person and the sidecar error response.
- [x] 2.5 Implement `DELETE /api/people/:id` folder by folder (design D4). Verify: test with two folders (both cleaned, `people` definitions unchanged, person gone) and with one read-only folder (person kept, error returned).
- [x] 2.6 Add `person` to `photoFilters` and replace people name search with names + aliases (`personTexts`). Verify: `photoApi.test.ts` / filter tests — `GET /api/photos?person=` with search, alias search, rename then search.
- [x] 2.7 Extend `photoInfo` with people (ids, `hasAvatar`) and unassigned detected faces (no descriptors). Verify: `photoInfo.test.ts` "Unassigned faces" scenario.

## 3. Face crops and avatars

- [x] 3.1 Add a crop renderer (rect expanded 20 %, square, clamped, EXIF-rotated unedited original, JPEG, cached by file hash + rect) and `GET /api/photos/:id/face?rect=&size=`. Verify: `RenderService`/crop unit test for the rect math and clamping at photo edges.
- [x] 3.2 Add `GET /api/photos/:id/face-source` (unedited, EXIF-rotated, longest side 1280 px). Verify: test that the output is upright for an EXIF-orientation-6 fixture and ignores the photo's edits.
- [x] 3.3 Add avatar choice (stored as folder path + file name + rect), fallback order and `GET /api/people/:id/avatar`, `GET /api/people/:id/faces`. Verify: tests for chosen avatar, chosen face removed → fallback, no rect faces → 404.

## 4. Face detection storage and similarity (server)

- [x] 4.1 Add `POST /api/faces/pending {photoIds, detector}` and `PUT /api/photos/:id/detected-faces` (replace in one transaction, descriptors as float32 BLOBs, never returned). Verify: tests — pending skips done photos and videos, changed `file_hash` becomes pending, PUT replaces previous faces, no file in the folder changes.
- [x] 4.2 Add `services/faceMatch.ts`: IoU, assignment of detected faces to marks (IoU ≥ 0.5, best wins), Euclidean distance. Verify: `faceMatch.test.ts` with overlapping, non-overlapping and two-candidate cases.
- [x] 4.3 Add `GET /api/people/:id/similar` (threshold 0.55, max 200, hidden photos and dismissed faces excluded, `noReference` flag), `POST /api/people/:id/faces {faceIds}` (folder by folder, assigned + failed ids) and `POST /api/people/:id/dismissals`. Verify: tests for ordering, dismissal per person, `noReference`, and one read-only folder in a bulk assign.

## 5. Client: people UI

- [x] 5.1 Add `client/src/api/people.ts` (people, marks, avatar URLs, faces, similar, detection endpoints) and store fields `selectedPerson` / `personMode` exclusive with folder, album and tag. Verify: `usePalomaStore.test.ts` for exclusivity and Child mode clearing the person.
- [x] 5.2 Add level control ids (`sidebar.people`, `people.choose`, `info.people`, `info.people.edit`, `people.edit`, `faces.detect`, `faces.similar`) to `levels/controls.ts` and update `docs/complexity-levels.md`. Verify: `controls.test.ts` — Easy sees people but not edit/detect/similar, Child sees none; `docs.test.ts` passes.
- [x] 5.3 Add `people` to `SIDEBAR_LISTS` and the People sidebar section (persons with photos, sorted with `Intl.Collator`, avatar + count). Verify: `shell.test.ts` / `uiSettings.test.ts` updated for the new list and ordering helper.
- [x] 5.4 Add `PersonHeader` (avatar, name, alias, count, Edit, Photos | Similar faces) and wire `person` into `useLibraryPhotos`. Verify: component test that the toggle and Edit are hidden at Easy.
- [x] 5.5 Rewrite `PeopleView` (cards, add person, open, edit, delete with `ConfirmModal`) and add `PersonEditorModal` (unknown: name only; known: all fields, links rows, year-or-date birth, gender) with the avatar picker. Verify: component tests for the unknown/known editor fields and server validation errors shown inline.
- [x] 5.6 Rework the Info panel People section: list with avatars, add person (picker with "new person" and "new unknown person"), remove, unassigned face crops with assign. Verify: `InfoPanel.test.tsx` — read-only at Easy, add/remove/assign calls at Normal.
- [x] 5.7 Add all new strings to the 11 locale catalogs (including "Unknown person", gender labels, detection messages with plurals). Verify: `catalogs.test.ts` and `plurals.test.ts` pass.

## 6. Client: face detection and Similar faces

- [x] 6.1 Add a Vite plugin serving/copying `@vladmandic/face-api/model` files to `face-models/`, and a lazy loader for ssdMobilenetv1, faceLandmark68Net and faceRecognitionNet. Verify: `npm run build` emits `client/dist/face-models/*` and the main bundle does not include face-api (check the build's chunk list).
- [x] 6.2 Add the detection runner store (pending query, sequential detect on `face-source`, PUT per photo, cancel between photos, summary counts). Verify: `detectionRunner.test.ts` with a mocked detector — skips done photos, cancel after N, resume detects the rest, summary counts.
- [x] 6.3 Add the "Detect faces" header button and `FaceDetectionProgress` ring (share, `n / total`, localized cancel label, finish message). Verify: component test for ring percentage, label and cancel; manual check in the running app on a folder of photos.
- [x] 6.4 Add the Similar faces grid (face crops, selection, "Add <name>" / "Not <name>", open in viewer, no-reference message, partial failure message). Verify: component test with mocked API for add, dismiss and the no-reference state; manual check: mark one face of a person, detect, see and accept suggestions.

## 7. Viewer face frames

- [x] 7.1 Add `faceRectMapper` (crop64/crop, rotate, flip; outside-crop → undefined; straighten/tilt → null; disabled steps ignored) and include mark rects in `PhotoInfo.people`. Verify: `faceRects.test.ts` for crop, rotate 90/270, flip, straighten and a face outside the crop; `photoInfo.test.ts` asserts rects.
- [x] 7.2 Add `showFaces` to `uiSettings`, the Faces toggle in `NavBar` and the `f` key, with control ids `viewer.faces` (Easy) and `viewer.faces.assign` (Normal). Verify: `uiSettings.test.ts` persistence; `controls.test.ts` levels; keyboard test that `f` toggles and typing `f` in a text field does not.
- [x] 7.3 Draw the SVG frames layer in the zoom stage (labelled marks, dashed unassigned, "cannot be shown" note) with theme tokens, and open the person choice when an unassigned frame is activated at Normal. Verify: component test for drawn frames, the straighten note and assign-on-click (frames reuse the contrast-checked viewer tokens, see design D14); locale strings added to all 11 catalogs.

## 8. Unrecognized faces

- [x] 8.1 Add `GET /api/faces/unassigned` (count and faces, hidden photos left out, newest first, limit up to 500). Verify: `faceDetectionApi.test.ts` — count, order, hidden excluded, assigned faces leave the list.
- [x] 8.2 Add the `selectedUnrecognized` source to the store, control id `faces.unrecognized` (Normal), the "Unrecognized" entry at the top of the sidebar People list with its count, and the Unrecognized view (shared face crop grid, "Who is this?" with the person picker assigning all selected faces). Verify: store, level and component tests; strings in all 11 catalogs.

## 9. Finish

- [x] 9.1 Run `npm run build` and `npm test` from the repo root; both pass.
