# Spec Delta

## RENAMED Requirements

- FROM: `### Requirement: Editor undo, reset, save and cancel`
- TO: `### Requirement: Editor undo`

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

### Requirement: Editor builds the chain
In the editor, applying a filter SHALL add a step to the end of the chain with the parameter values chosen. If the last step uses the same filter, the editor SHALL update that step instead. The editor SHALL list the steps without letting the user change or remove a step other than through new steps and Undo, so that the chain is the full history of the photo's edits.

#### Scenario: Adjust brightness twice
- **WHEN** the user drags the brightness slider to 20 and then to 35
- **THEN** the chain has one `brightness` step with `amount` 35

#### Scenario: Remove a step
- **WHEN** the chain is `crop64`, `sepia` and the user chooses undo
- **THEN** the preview shows the cropped photo in colour

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

## ADDED Requirements

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
