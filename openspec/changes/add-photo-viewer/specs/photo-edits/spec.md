# Spec Delta

## RENAMED Requirements

- FROM: `### Requirement: Editor undo, reset, save and cancel`
- TO: `### Requirement: Editor undo, redo and revert`

## MODIFIED Requirements

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

### Requirement: Editor undo, redo and revert
Undo and Redo SHALL be the first buttons of the edit bar, before any filter. They SHALL undo and redo every change ever made to the photo's chain in Paloma, also after the viewer was closed, the page reloaded or Paloma restarted. Each photo SHALL have its own history, kept without a limit in its sidecar entry. "Revert to original" SHALL empty the chain, and the revert can be undone. Ctrl+Z and Ctrl+Shift+Z (Cmd on a Mac) SHALL undo and redo.

#### Scenario: Undo a rotation
- **WHEN** the user rotates right and then chooses undo
- **THEN** the preview and the saved chain are as before the rotation

#### Scenario: Cancel
- **WHEN** the user applies sepia and then chooses undo, as the viewer has no Cancel
- **THEN** the photo's saved edits are as before sepia

#### Scenario: Undo after coming back
- **WHEN** the user applies sepia to `a.jpg`, goes to the next photo, comes back and chooses undo
- **THEN** `a.jpg` is shown and saved without sepia

#### Scenario: Undo after reopening
- **WHEN** the user rotates a photo right, applies sepia, closes the viewer, opens the same photo again and chooses undo twice
- **THEN** the photo is shown and saved as before the rotation

#### Scenario: Undo after a restart
- **WHEN** the user crops a photo, Paloma is restarted, and the user opens the photo and chooses undo
- **THEN** the photo is shown and saved without the crop, and Redo brings the crop back

#### Scenario: Revert
- **WHEN** a photo has a crop and black & white and the user chooses "Revert to original"
- **THEN** the photo is shown and saved without edits, and Undo brings both steps back

### Requirement: Editor keeps unavailable steps
The editor SHALL list a step whose filter is not available, labelled with its filter name and as unavailable. It SHALL keep the step unchanged when saving unless the user removes it.

#### Scenario: Edit a photo with an unknown step
- **WHEN** a photo's chain has a `grain` step, no plugin provides `grain`, and the user adds `bw`
- **THEN** the saved chain is the `grain` step unchanged followed by `bw`

## ADDED Requirements

### Requirement: Edit bar order
The edit bar SHALL show, in this order: Undo and Redo; Rotate left and Rotate right when the `rotate` filter is available; the Basic, Tuning and Effects filter groups, separated from each other; then "Show original", "Changes" and "Revert to original". "Changes" SHALL open a floating panel listing the chain's steps, each with its filter's icon.

#### Scenario: Default edit bar
- **WHEN** both bundled plugins are on and the user opens a photo
- **THEN** the edit bar starts with Undo and Redo, followed by Rotate left and Rotate right, then the crop, flip and straighten icons, then brightness and contrast, then black & white and sepia, then Show original, Changes and Revert to original

### Requirement: Edits are saved automatically
Each finished change to a photo's chain SHALL be saved without a separate Save action. This covers applying or removing a step, releasing a slider, applying a frame, undo, redo and revert. While a slider is being dragged, the change SHALL be shown in the preview and SHALL be saved when it is released. The viewer SHALL NOT offer Save or Cancel.

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

### Requirement: Edit history through the API
`GET /api/photos/:id/edits` SHALL respond with the photo's `edits` and its `history`, `{"undo": [...], "redo": [...]}`, where each item is an earlier or later chain; a photo without history SHALL get empty lists. `PUT /api/photos/:id/edits` SHALL accept an optional `history` of that shape and save it with the edits; without `history` the stored history SHALL be unchanged. A `history` that is not of that shape SHALL be rejected with 400 and change nothing.

#### Scenario: Save and read history
- **WHEN** a client sends `PUT /api/photos/7/edits` with `{"edits": [{"filter": "sepia"}], "history": {"undo": [[]], "redo": []}}` and then `GET /api/photos/7/edits`
- **THEN** the response is `{"edits": [{"filter": "sepia"}], "history": {"undo": [[]], "redo": []}}`

#### Scenario: Invalid history
- **WHEN** a client sends `{"edits": [], "history": {"undo": "sepia"}}`
- **THEN** the server responds 400 and the photo's edits and history are unchanged

### Requirement: Preview reports the full size
A response of `POST /api/photos/:id/preview` SHALL state the width and height in pixels that the same steps give when the photo is rendered at full size. The width and height SHALL each be within 0.5% of the size a full-size export gives, rounded to whole pixels.

#### Scenario: Cropped preview
- **WHEN** a client posts `{"edits": [{"filter": "crop64", "rect": {"left": 0, "top": 0, "right": 0.5, "bottom": 1}}], "maxSize": 1024}` for a 4000×3000 photo
- **THEN** the response image fits within 1024×1024 and the response states a full size of 2000×3000
