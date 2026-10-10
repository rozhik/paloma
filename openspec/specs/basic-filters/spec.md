# basic-filters Specification

## Purpose

Defines the image filters that ship with Paloma as bundled plugins: the basic geometric transformations (crop, rotate, flip, straighten) and the basic effects (brightness, contrast, black & white, sepia), with their parameters and results.

## Requirements

### Requirement: Bundled filter plugins
Paloma SHALL ship two bundled plugins with names and descriptions in every supported UI language: `basic-transforms`, providing `crop64`, `rotate`, `flip` and `straighten` in group `basic`, and `basic-effects`, providing `brightness` and `contrast` in group `tuning` and `bw` and `sepia` in group `effects`.

#### Scenario: Fresh install
- **WHEN** Paloma starts for the first time
- **THEN** the Plugins section of Settings lists `basic-transforms` and `basic-effects` as bundled and on

#### Scenario: Effects switched off
- **WHEN** the user switches off `basic-effects`
- **THEN** the editor still offers crop, rotate, flip and straighten, but not brightness, contrast, black & white or sepia

### Requirement: Crop
The `crop64` filter SHALL keep the part of the image inside `rect`, an object with `left`, `top`, `right` and `bottom` as fractions from 0 to 1 of the image's width and height at that step, where `left` < `right` and `top` < `bottom`. In the editor, the frame SHALL offer the ratios free, original, 1:1, 4:3, 3:2 and 16:9, in either orientation.

#### Scenario: Crop to the centre
- **WHEN** a 1000×800 image has `{"filter": "crop64", "rect": {"left": 0.1, "top": 0.25, "right": 0.9, "bottom": 0.75}}`
- **THEN** the result is the 800×400 region starting 100 pixels from the left and 200 from the top

#### Scenario: Empty rectangle
- **WHEN** a client saves a `crop64` step with `left` 0.5 and `right` 0.5
- **THEN** the server responds 400

#### Scenario: Fixed ratio
- **WHEN** the user chooses 1:1 and drags the frame on a 4000×3000 photo
- **THEN** the frame stays square, and the cropped result is square

### Requirement: Rotate
The `rotate` filter SHALL turn the image clockwise by `angle`, which is one of 90, 180 or 270. The editor SHALL offer "Rotate left" and "Rotate right" buttons, which combine with a `rotate` step at the end of the chain. When the combined angle is 0, that step SHALL be removed.

#### Scenario: Rotate right
- **WHEN** the user chooses "Rotate right" on a 4000×3000 photo with no edits
- **THEN** the chain is `[{"filter": "rotate", "angle": 90}]` and the result is 3000×4000

#### Scenario: Right then left
- **WHEN** the user chooses "Rotate right" and then "Rotate left"
- **THEN** the chain is empty

### Requirement: Flip
The `flip` filter SHALL mirror the image left to right when `direction` is `horizontal`, and top to bottom when it is `vertical`.

#### Scenario: Flip horizontally
- **WHEN** a photo with a tree on the left has `{"filter": "flip", "direction": "horizontal"}`
- **THEN** the tree is on the right

### Requirement: Straighten
The `straighten` filter SHALL rotate the image by `angle` degrees, from -45 to 45 with step 0.1, where positive is clockwise. It SHALL then crop the result to the largest centred rectangle with the image's aspect ratio that contains no blank corners. The editor SHALL show a grid over the image while the angle is being changed.

#### Scenario: Small tilt
- **WHEN** a 4000×3000 photo has `{"filter": "straighten", "angle": 3}`
- **THEN** the result has a 4:3 aspect ratio, is rotated 3° clockwise, and has no blank corners

### Requirement: Brightness and contrast
`brightness` and `contrast` SHALL each have `amount` from -100 to 100, step 1, default 0, where 0 leaves the image unchanged. A positive `amount` SHALL make the image brighter, or increase contrast, and a negative one SHALL do the opposite.

#### Scenario: Brighter
- **WHEN** a photo has `{"filter": "brightness", "amount": 40}`
- **THEN** its average brightness is higher than the original's

#### Scenario: Neutral value
- **WHEN** a photo has `{"filter": "contrast", "amount": 0}`
- **THEN** it looks the same as without the step

### Requirement: Black & white and sepia
`bw` SHALL turn the image into grayscale, and `sepia` SHALL give it a warm brown monochrome tone. Neither filter has parameters.

#### Scenario: Black & white
- **WHEN** a colour photo has `{"filter": "bw"}`
- **THEN** every pixel of the result has equal red, green and blue values

### Requirement: Bundled filters have icons
Every filter of the bundled plugins (`crop64`, `rotate`, `flip`, `straighten`, `brightness`, `contrast`, `bw`, `sepia`) SHALL have its own icon, and no two of them SHALL share an icon.

#### Scenario: Default edit bar icons
- **WHEN** both bundled plugins are on and the user opens a photo in the viewer
- **THEN** each bundled filter in the edit bar has its own distinct icon, and none shows the generic filter icon

#### Scenario: Rotate step in the Changes list
- **WHEN** the user rotates right and opens "Changes"
- **THEN** the `rotate` step is listed with the rotate icon
