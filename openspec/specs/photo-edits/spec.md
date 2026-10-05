# photo-edits Specification

## Purpose

Defines a photo's non-destructive edits: an ordered chain of plugin filter steps stored next to the photo, how the chain is saved and rendered in thumbnails, previews and exports, and the editor in which the user builds it.

## Requirements

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
The editor SHALL be the photo viewer's edit bar. It SHALL offer the filters of all active plugins as icon buttons grouped as Basic, Tuning and Effects, each with a tooltip and an accessible name from the plugin's label. Choosing a filter with parameters SHALL open a floating panel next to the bar, over the photo, with a control for each parameter by its type: a slider for `number`, a switch for `boolean`, a choice for `choice` and a draggable frame over the image for `rect`. A filter without parameters SHALL be applied directly. All controls SHALL be large enough to use comfortably.

#### Scenario: Plugin switched on
- **WHEN** the external plugin providing `grain` in group `effects` is switched on and the user opens a photo in the viewer
- **THEN** the Effects group of the edit bar has a `grain` icon, and choosing it opens a panel with a slider for `amount`

#### Scenario: Tooltip
- **WHEN** the UI language is Ukrainian and the pointer rests on the brightness icon
- **THEN** a tooltip shows the filter's Ukrainian label

#### Scenario: Filter without parameters
- **WHEN** the user chooses the sepia icon
- **THEN** a `sepia` step is added and no panel opens

### Requirement: Editor builds the chain
In the editor, applying a filter SHALL add a step to the end of the chain with the parameter values chosen. If the last step uses the same filter, the editor SHALL update that step instead. The editor SHALL list the steps without letting the user change or remove a step other than through new steps and Undo, so that the chain is the full history of the photo's edits.

#### Scenario: Adjust brightness twice
- **WHEN** the user drags the brightness slider to 20 and then to 35
- **THEN** the chain has one `brightness` step with `amount` 35

#### Scenario: Remove a step
- **WHEN** the chain is `crop64`, `sepia` and the user chooses undo
- **THEN** the preview shows the cropped photo in colour

### Requirement: Editor preview follows the chain
The editor SHALL show the photo rendered through the current, unsaved chain, and SHALL update it when the user stops changing a control. Holding "Show original" SHALL show the photo without edits while held.

#### Scenario: Live update
- **WHEN** the user switches on sepia
- **THEN** the preview turns sepia without saving

#### Scenario: Hold for original
- **WHEN** the user holds "Show original" on an edited photo
- **THEN** the unedited photo is shown until the button is released

### Requirement: Editor undo
Undo SHALL be the first button of the edit bar, before any filter. It SHALL remove the last step of the photo's chain and save the result, and it SHALL be available while the chain has steps, whenever and however they were made: in this viewer session, before the viewer was closed or Paloma restarted, or imported from Picasa. There SHALL be no Redo and no "Revert to original". Ctrl+Z (Cmd+Z on a Mac) SHALL undo.

#### Scenario: Undo a rotation
- **WHEN** the user rotates right and then chooses undo
- **THEN** the preview and the saved chain are as before the rotation

#### Scenario: Cancel
- **WHEN** the user applies sepia and then chooses undo, as the viewer has no Cancel
- **THEN** the photo's saved edits are as before sepia

#### Scenario: Undo after reopening
- **WHEN** the user rotates a photo right, applies sepia, closes the viewer, opens the same photo again and chooses undo twice
- **THEN** the photo is shown and saved as before the rotation

#### Scenario: Undo after a restart
- **WHEN** the user crops a photo, Paloma is restarted, and the user opens the photo and chooses undo
- **THEN** the photo is shown and saved without the crop

#### Scenario: Undo a Picasa edit
- **WHEN** a photo's edits were imported from Picasa as `crop64`, `autolight`, `bw` and the user chooses undo twice
- **THEN** the saved chain is the `crop64` step alone

### Requirement: Editor keeps unavailable steps
The editor SHALL list a step whose filter is not available, labelled with its filter name and as unavailable. It SHALL keep the step unchanged when saving unless the user undoes it.

#### Scenario: Edit a photo with an unknown step
- **WHEN** a photo's chain has a `grain` step, no plugin provides `grain`, and the user adds `bw`
- **THEN** the saved chain is the `grain` step unchanged followed by `bw`

### Requirement: Edit bar order
The edit bar SHALL show, in this order: Undo; Rotate left and Rotate right when the `rotate` filter is available; the Basic, Tuning and Effects filter groups, separated from each other; then "Show original" and "Changes". "Changes" SHALL open a floating panel listing the chain's steps, each with its filter's icon.

#### Scenario: Default edit bar
- **WHEN** both bundled plugins are on and the user opens a photo
- **THEN** the edit bar starts with Undo, followed by Rotate left and Rotate right, then the crop, flip and straighten icons, then brightness and contrast, then black & white and sepia, then Show original and Changes

### Requirement: Edits are saved automatically
Each finished change to a photo's chain SHALL be saved without a separate Save action. This covers applying a step, releasing a slider, applying a frame and undo. While a slider is being dragged, the change SHALL be shown in the preview and SHALL be saved when it is released. The viewer SHALL NOT offer Save or Cancel.

#### Scenario: Apply and leave
- **WHEN** the user applies sepia and immediately chooses Next
- **THEN** the photo's sidecar entry has the `sepia` step, and its thumbnail in the grid is in sepia

#### Scenario: Slider
- **WHEN** the user drags the brightness slider from 0 to 30 and releases it
- **THEN** the chain is saved once, with `amount` 30

### Requirement: A failed save keeps the photo open
If saving a change fails, the viewer SHALL show the error in the active language with "Try again" and "Discard change" and keep the unsaved chain on screen. While the latest change is unsaved, Close, Previous and Next SHALL NOT leave the photo. Instead they SHALL show that error. "Discard change" SHALL return the photo to its last saved chain.

#### Scenario: Unwritable sidecar
- **WHEN** a photo's `.paloma.json` is not valid JSON and the user applies sepia
- **THEN** the viewer shows the error and still shows sepia, and choosing Next shows the error again instead of moving on

#### Scenario: Discard
- **WHEN** saving failed and the user chooses "Discard change"
- **THEN** the photo is shown with its last saved edits, and Next works again

### Requirement: Frame editing over the photo
While a `rect` parameter, such as the crop frame, is being edited, the viewer SHALL show the whole photo fitted, with the frame over it. Zooming, panning, Previous, Next and the other edit bar buttons SHALL be disabled. The frame's panel SHALL offer Apply and Cancel. Esc SHALL cancel, and Cancel SHALL leave the chain unchanged.

#### Scenario: Crop from a zoomed view
- **WHEN** the photo is zoomed to 200% and the user chooses crop
- **THEN** the whole photo is shown fitted with the crop frame, and Next is disabled until the user applies or cancels

#### Scenario: Cancel a crop
- **WHEN** the user moves the crop frame and presses Esc
- **THEN** the frame closes and the chain and the saved edits are unchanged

### Requirement: Frame shows its size in pixels
While a `rect` frame, such as the crop frame, is being edited, its panel SHALL show the width and height in pixels of the area inside the frame, measured on the full-size photo as it is at that step, and SHALL update them while the frame is moved or resized.

#### Scenario: Crop half of a photo
- **WHEN** the user crops a 4000×3000 photo and drags the frame to its left half
- **THEN** the panel shows 2000 × 3000 px

#### Scenario: Crop after an earlier crop
- **WHEN** a 4000×3000 photo already has a crop to its left half and the user adds a new crop with the frame over the whole image
- **THEN** the panel shows 2000 × 3000 px

### Requirement: Preview reports the full size
A response of `POST /api/photos/:id/preview` SHALL state the width and height in pixels that the same steps give when the photo is rendered at full size. The width and height SHALL each be within 0.5% of the size a full-size export gives, rounded to whole pixels.

#### Scenario: Cropped preview
- **WHEN** a client posts `{"edits": [{"filter": "crop64", "rect": {"left": 0, "top": 0, "right": 0.5, "bottom": 1}}], "maxSize": 1024}` for a 4000×3000 photo
- **THEN** the response image fits within 1024×1024 and the response states a full size of 2000×3000
