# Spec Delta

## Purpose

Defines a photo's non-destructive edits: an ordered chain of plugin filter steps stored next to the photo, how the chain is saved and rendered in thumbnails, previews and exports, and the editor in which the user builds it.

## ADDED Requirements

### Requirement: Edits are an ordered chain of filter steps
A photo's edits SHALL be an ordered list of steps. Each step SHALL be an object with `filter` (a filter name), an optional `"enabled": false`, and that filter's parameters as named keys. Steps SHALL be applied from first to last, and the same filter MAY appear more than once.

#### Scenario: Crop then black & white
- **WHEN** a photo's edits are `[{"filter": "crop64", "rect": {"left": 0.25, "top": 0, "right": 0.75, "bottom": 1}}, {"filter": "bw"}]`
- **THEN** the photo is shown as the middle half of the original, in black & white

#### Scenario: Step marked as not enabled
- **WHEN** a photo's edits are `[{"filter": "bw", "enabled": false}]`
- **THEN** the photo is shown in colour, and the step is kept

### Requirement: Original files are never modified
Editing SHALL NOT write to the photo file or create any file in the photo's folder other than `.paloma.json`.

#### Scenario: Save edits
- **WHEN** the user crops a photo and saves
- **THEN** the photo file's bytes are unchanged and the only file written in its folder is `.paloma.json`

### Requirement: Edits can be saved through the API
`PUT /api/photos/:id/edits` with `{"edits": [...]}` SHALL replace the photo's edits and respond with the updated photo. An empty list SHALL remove all edits. A body that is not a list of steps with a string `filter`, or a step of an available filter whose parameters are of the wrong type or outside its range, SHALL be rejected with 400 and change nothing. A parameter left out SHALL take its default. Steps of filters that are not available SHALL be saved unchanged.

#### Scenario: Save a valid chain
- **WHEN** a client sends `PUT /api/photos/7/edits` with `{"edits": [{"filter": "rotate", "angle": 90}]}`
- **THEN** the response shows that edit, and photo 7's sidecar entry has the same `edits`

#### Scenario: Parameter out of range
- **WHEN** a client sends `{"edits": [{"filter": "brightness", "amount": 500}]}`
- **THEN** the server responds 400 and the photo's edits are unchanged

#### Scenario: Reset to original
- **WHEN** a client sends `{"edits": []}` for a photo with edits
- **THEN** the photo has no edits and its sidecar entry has no `edits` key

#### Scenario: Unwritable sidecar
- **WHEN** a photo's folder has a `.paloma.json` that is not valid JSON and a client saves edits for that photo
- **THEN** the request fails, the photo's edits in the library are unchanged, and the file is unchanged

### Requirement: Rendering skips unavailable steps
When a photo is rendered, Paloma SHALL apply EXIF orientation first and then each step in order. It SHALL skip a step marked `"enabled": false`, a step whose filter is not provided by any plugin that is on, and a step whose filter fails while rendering. A failure SHALL be logged with the photo and the filter name.

#### Scenario: Plugin not installed
- **WHEN** a photo's edits are `[{"filter": "grain", "amount": 30}, {"filter": "sepia"}]` and no plugin provides `grain`
- **THEN** the photo is shown in sepia without grain, and the `grain` step stays in its sidecar

#### Scenario: Filter throws
- **WHEN** a filter throws an error while rendering a photo whose chain also has `sepia`
- **THEN** the photo is shown with sepia, and the log names the photo and the failing filter

### Requirement: Edits are independent of image size
A chain SHALL produce the same framing and look, relative to the image size, whether rendered as a thumbnail, as a preview or at full size.

#### Scenario: Crop in thumbnail and export
- **WHEN** a 4000×3000 photo has a crop to the left half
- **THEN** its thumbnail shows the left half of the image, and an export at full size is 2000×3000 pixels of the left half

### Requirement: Thumbnails and previews show edits
The library's thumbnails and previews, including those in the grid, the tray, albums and the map, SHALL show each photo as rendered through its edits. They SHALL be updated without a restart after edits are saved, after the photo's `.paloma.json` entry is changed by another program, and after a plugin whose filters the photo uses is switched on or off.

#### Scenario: Thumbnail after save
- **WHEN** the user applies black & white to a photo and saves
- **THEN** its thumbnail in the grid is black & white without reloading the page

#### Scenario: Plugin switched off
- **WHEN** the user switches off `basic-effects` and a photo has a `sepia` step
- **THEN** after the library reloads, its thumbnail is in colour

### Requirement: Preview of unsaved edits
`POST /api/photos/:id/preview` with `{"edits": [...], "maxSize": N}` SHALL respond with an image of the photo rendered through the given steps and fitted within N×N pixels, validating the steps as when saving. It SHALL NOT save anything.

#### Scenario: Preview a rotation
- **WHEN** a client posts `{"edits": [{"filter": "rotate", "angle": 90}], "maxSize": 1200}` for a 4000×3000 photo
- **THEN** the response is a 900×1200 image of the photo turned clockwise, and the photo's saved edits are unchanged

### Requirement: Export applies edits
Exporting a photo SHALL write the photo rendered at full size through its edits, before any resizing chosen for the export.

#### Scenario: Export a cropped photo
- **WHEN** a photo with a crop to its left half is exported without resizing
- **THEN** the exported file shows only the left half

### Requirement: Editor offers the filters of active plugins
The editor SHALL offer the filters of all active plugins, grouped as Basic, Tuning and Effects, with the plugins' labels. It SHALL show a control for each parameter of a filter by its type: a slider for `number`, a switch for `boolean`, a choice for `choice` and a draggable frame over the image for `rect`. All controls SHALL be large enough to use comfortably.

#### Scenario: Plugin switched on
- **WHEN** the external plugin providing `grain` in group `effects` is switched on and the user opens the editor
- **THEN** Effects offers `grain` with a slider for `amount`

### Requirement: Editor builds the chain
In the editor, applying a filter SHALL add a step to the end of the chain with the parameter values chosen. If the last step uses the same filter, the editor SHALL update that step instead. The editor SHALL list the steps, and SHALL let the user change the parameters of a step or remove it.

#### Scenario: Adjust brightness twice
- **WHEN** the user drags the brightness slider to 20 and then to 35
- **THEN** the chain has one `brightness` step with `amount` 35

#### Scenario: Remove a step
- **WHEN** the chain is `crop64`, `sepia` and the user removes `sepia`
- **THEN** the preview shows the cropped photo in colour

### Requirement: Editor preview follows the chain
The editor SHALL show the photo rendered through the current, unsaved chain, and SHALL update it when the user stops changing a control. Holding "Show original" SHALL show the photo without edits while held.

#### Scenario: Live update
- **WHEN** the user switches on sepia
- **THEN** the preview turns sepia without saving

#### Scenario: Hold for original
- **WHEN** the user holds "Show original" on an edited photo
- **THEN** the unedited photo is shown until the button is released

### Requirement: Editor undo, reset, save and cancel
The editor SHALL offer undo and redo for every change to the chain made in the current session. "Reset to original" SHALL empty the chain, and the reset can be undone. "Save" SHALL save the chain and return to the library. "Cancel" SHALL return without saving. If saving fails, the editor SHALL stay open with the chain and show the error in the active language.

#### Scenario: Undo a rotation
- **WHEN** the user rotates right and then chooses undo
- **THEN** the preview and chain are as before the rotation

#### Scenario: Cancel
- **WHEN** the user applies sepia and chooses Cancel
- **THEN** the photo's saved edits are unchanged

### Requirement: Editor keeps unavailable steps
The editor SHALL list a step whose filter is not available, labelled with its filter name and as unavailable. It SHALL keep the step unchanged on save unless the user removes it.

#### Scenario: Edit a photo with an unknown step
- **WHEN** a photo's chain has a `grain` step, no plugin provides `grain`, and the user adds `bw` and saves
- **THEN** the saved chain is the `grain` step unchanged followed by `bw`
