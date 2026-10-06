# Proposal

## Why

Paloma already reads who is on a photo from Picasa (`faces=`, `[Contacts2]`) and keeps those marks in `.paloma.json`, but people are read-only: the user cannot add a person, describe them, mark them on photos, browse a person's photos or find their faces automatically. The People view is a leftover MVP demo that is not connected to the faces Paloma reads. People are the main way families look through photos, so this is the next organizer feature after albums and tags.

## What Changes

- **People live in the library database.** Every person has a contact id (16 lowercase hex digits, as in Picasa) and a profile stored only in the database. A person is either **known** (has a name) or **unknown** (no name yet). Known people also have an optional avatar, alias, comment, a list of profile links, a birth year or full birth date, and a gender. The database also keeps hidden face data (face descriptors) that is never shown and is used only for face matching.
- **Folder files hold only the marks.** A photo entry's `faces` keeps, per mark, the person's contact id and, optionally, the face rectangle. Paloma never writes names or profiles into `.paloma.json`; `people` definitions found in sidecars or Picasa `[Contacts2]` only seed a person's name in the database the first time that contact id is seen, and keep doing so until the person is edited in Paloma. **BREAKING (sidecar)**: a face no longer needs `rect` when it names a person.
- **People come from files and from the UI.** Scanning a folder adds every contact id named by a face as a person (known if a sidecar or Picasa definition gives it a name, unknown otherwise). The user can also add a person by hand in the People view, edit their profile, and delete them.
- **Marking people on photos.** In the viewer's Info panel the user can add a person to the photo (a mark without a rectangle), assign a detected face to an existing or a new person, and remove a mark. Changes are written to the folder's `.paloma.json`.
- **Browsing by person.** A new "People" sidebar list and the reworked People view list people with avatar and photo count; choosing a person shows their photos in the grid (`GET /api/photos?person=<id>`).
- **Avatar from a marked face.** The avatar is chosen from the person's marks that have a rectangle; the server crops it from the photo.
- **Automatic face detection.** While viewing a grid, the user can start face detection (`@vladmandic/face-api`, in the browser) for the photos the grid shows. A circular progress indicator is drawn over the grid while it runs and can cancel it. Detected rectangles and descriptors are stored in the database only; a detected face is written to `.paloma.json` only when the user assigns it to a person.
- **Similar faces.** While the grid shows a person, the user can switch it to "Similar faces": unassigned detected faces most similar to that person's faces, as face crops. The user selects faces and adds the person's mark to them, or dismisses them for this person.
- **Unrecognized faces.** The People list in the sidebar starts with an "Unrecognized" entry (unassigned detected faces, with their count); it shows their crops, and selected faces can be named at once.
- **Face frames in the viewer.** A Faces toggle in the viewer's navigation bar (and the `f` key) draws the photo's marks with rectangles, labelled, and unassigned detected faces, dashed, over the photo; they follow zoom, pan and crop/rotate/flip edits. Activating an unassigned frame assigns it to a person.
- **Levels.** Seeing people (sidebar list, a person's photos, People section of the Info panel, face frames in the viewer) is Easy; adding, editing, deleting people, marking faces, face detection and Similar faces are Normal. Child sees no people.
- The MVP `people` and `face_annotations` tables, `POST /api/faces/annotate` and the demo People view are replaced.

## Capabilities

### New Capabilities
- `face-recognition`: automatic face detection over a grid's photos with its progress indicator, the hidden face data it stores, and the "Similar faces" mode for marking a person on detected faces.

### Modified Capabilities
- `people`: people become editable library records with known/unknown state and profile fields stored in the database; marks are added and removed in the UI; people are seeded from sidecars and Picasa; browsing a person's photos, the People view and sidebar list, avatars.
- `sidecar-files`: a face's `rect` becomes optional for a face that names a person; marking a person creates or changes `.paloma.json` like any other photo field change; the `people` section is never written by Paloma.
- `photo-info`: the People section becomes editable (add, assign, remove marks) and shows detected faces that are not assigned.
- `photo-viewer`: the navigation bar gains the Faces toggle; the viewer keyboard gains `f`.
- `photo-search`: people's aliases are searched as well as their names.
- `complexity-levels`: the list of current controls and their levels includes the people controls, face detection and Similar faces.

## Impact

- Server: new people service and API (`GET/POST /api/people`, `GET/PATCH/DELETE /api/people/:id`, `GET /api/people/:id/avatar`, face mark and detection endpoints, `GET /api/people/:id/similar`), `SidecarService` (face shape, writing marks, removing a person's marks), `FolderScannerService` (seeding people), `photoFilters` (`person` filter, aliases in search), `photoInfo`, DB tables in `db/schema.ts` / `db/columns.ts` (replacing MVP `people` and `face_annotations`), an unedited oriented image for detection.
- Client: People view rewrite, person editor dialog, avatar picker, People sidebar list (`uiSettings.SIDEBAR_LISTS`), grid header for a person with the Photos / Similar faces switch, face detection runner and overlay progress ring, Info panel People section, `levels/controls.ts`, store, `api/` modules, all 11 locale catalogs, `docs/complexity-levels.md`.
- Shared types: `Person`, `PersonProfile`, `PhotoFace`, `DetectedFace`, `PalomaFace` (optional `rect`), `PhotoInfo.people`.
- Dependencies: `@vladmandic/face-api` is already in `client/package.json`; its model files must be served to the browser.
- Data: person profiles and face descriptors exist only in `DATA_DIR/paloma.db`; deleting the database loses profiles and detections but not marks or names stored in folder files.
