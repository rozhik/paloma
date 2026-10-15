# photo-viewer Specification

## Purpose

Defines the full-screen photo viewer: the photo shown behind floating controls, zooming and panning, the navigation bar for closing and stepping through the photos of the current grid, keyboard use, and where the overlay bars are placed.

## Requirements

### Requirement: Photo fills the screen behind overlay controls
The viewer SHALL fill the whole browser window with the photo as rendered through its edits, on a dark background. Every viewer control, including the navigation bar, the edit bar and their floating panels, SHALL be drawn on top of the photo and SHALL NOT shrink the area the photo is shown in. The library navbar, sidebar and tray SHALL NOT be shown.

#### Scenario: Open a landscape photo
- **WHEN** the user opens a 4000×3000 photo in a 1600×900 window
- **THEN** the photo is shown 1200×900, centred, and the navigation bar and the edit bar overlap it

### Requirement: Photo opens fitted to the screen
When the viewer opens a photo, and when it moves to another photo, the photo SHALL be shown centred at the zoom level chosen in Settings as "Open photos at": Fit, Fill or Original size, Fit by default. At Fit the photo SHALL be shown whole, as large as fits in the window, and a photo smaller than the window SHALL be shown at its actual size. When the window is resized while the photo is at Fit or Fill, it SHALL stay at that level.

#### Scenario: Small photo
- **WHEN** "Open photos at" is Fit and the user opens a 640×480 photo in a 1600×900 window
- **THEN** the photo is shown at 640×480, centred

#### Scenario: Open at original size
- **WHEN** "Open photos at" is Original size and the user opens a 4000×3000 photo in a 1600×900 window
- **THEN** the photo is shown at 100%, centred, and can be panned

#### Scenario: Next photo at the chosen level
- **WHEN** "Open photos at" is Fill, the user zooms the photo to 300% and chooses Next
- **THEN** the next photo is shown at Fill

### Requirement: Zoom
The user SHALL be able to zoom with the mouse wheel or a trackpad pinch, keeping the point under the pointer in place. The user SHALL also be able to zoom with the zoom-in and zoom-out buttons and the `+` and `-` keys, keeping the centre of the window in place. Zoom SHALL range from fitted to 400% of the photo's actual pixels. "Fit" (button or `0` key) SHALL return to the fitted view. The navigation bar SHALL show the current zoom as a percentage of actual pixels.

#### Scenario: Wheel zoom at a point
- **WHEN** the pointer is over a face in the photo and the user scrolls the wheel up
- **THEN** the photo is shown larger and the face stays under the pointer

#### Scenario: Zoom limit
- **WHEN** the photo is at 400% and the user presses `+`
- **THEN** the zoom stays at 400%

#### Scenario: Back to fit
- **WHEN** the photo is zoomed in and the user presses `0`
- **THEN** the whole photo is shown fitted and centred

### Requirement: Zoom levels
Choosing the zoom percentage in the navigation bar SHALL open a menu of zoom levels: Fit, Fill, 50%, 100% (Original size), 200% and 400%, with names in the active UI language and the current level marked. Fit SHALL be as described in Photo opens fitted to the screen; Fill SHALL cover the whole window with the photo, centred, up to 400%. Percentages SHALL keep the centre of the window in place. A level below Fit SHALL be disabled.

#### Scenario: Choose 100%
- **WHEN** a 4000×3000 photo is fitted and the user chooses 100% in the zoom menu
- **THEN** the photo is shown at 100% with the photo point at the centre of the window kept in place, and the bar shows 100%

#### Scenario: Fill
- **WHEN** the user chooses Fill for a 4000×3000 photo in a 1600×900 window
- **THEN** the photo is shown 1600×1200, centred, and can be panned up and down

#### Scenario: Level below fit
- **WHEN** a 4000×3000 photo fits a 1600×900 window at 30%
- **THEN** 50% is enabled, and for a 1000×750 photo, fitted at 100%, 50% is disabled

#### Scenario: Current level marked
- **WHEN** the photo is at Fill and the user opens the zoom menu
- **THEN** Fill is marked as the current level

### Requirement: Double-click toggles zoom
Double-clicking the photo SHALL zoom to 100% of actual pixels centred on the clicked point when the photo is fitted, and SHALL return to fitted otherwise.

#### Scenario: Double-click a fitted photo
- **WHEN** the user double-clicks a fitted 4000×3000 photo
- **THEN** the photo is shown at 100% with the clicked point under the pointer

### Requirement: Pan
When the zoomed photo is larger than the window, the user SHALL be able to move it by dragging with the mouse, one finger or the arrow keys with Shift. The photo SHALL NOT be moved further than needed to bring any of its edges to the matching window edge. A photo that fits the window in a direction SHALL stay centred in that direction.

#### Scenario: Drag a zoomed photo
- **WHEN** the photo is zoomed to 200% and the user drags it to the left
- **THEN** the right part of the photo comes into view

#### Scenario: Drag stops at the edge
- **WHEN** the user keeps dragging to the left after the photo's right edge reaches the window's right edge
- **THEN** the photo does not move further

### Requirement: Zoomed photo shows more detail
When the user zooms in, the viewer SHALL replace the shown image with a sharper rendering suited to the new size, up to at least 4096 pixels on the photo's longer side. Until it arrives, the viewer SHALL keep showing the current image scaled.

#### Scenario: Zoom in on a large photo
- **WHEN** the user zooms a 6000×4000 photo to 100% in a 1600×900 window
- **THEN** after a moment the photo is shown at the higher resolution, without a blank frame in between

### Requirement: Navigation bar
The viewer SHALL show a navigation bar with Close, Previous and Next buttons, the photo's file name, its position in the list ("3 / 120"), the zoom buttons and percentage, and, when the level allows it, the Info button described in the photo-info capability, the Faces toggle described in the people capability, and the Objects toggle described in the ai-processing capability. Each button SHALL have a tooltip and an accessible name in the active UI language.

#### Scenario: Bar contents
- **WHEN** the user opens the third of 120 photos, `IMG_0042.JPG`
- **THEN** the navigation bar shows Close, Previous, Next, `IMG_0042.JPG` and `3 / 120`

#### Scenario: Info button
- **WHEN** the level is Normal and the user opens a photo
- **THEN** the navigation bar also shows the Info button

#### Scenario: Faces toggle
- **WHEN** the level is Easy and the user opens a photo
- **THEN** the navigation bar shows the Faces toggle, pressed when face frames are on

#### Scenario: Objects toggle
- **WHEN** the level is Normal and the user opens a photo
- **THEN** the navigation bar shows the Objects toggle, pressed when object frames are on

### Requirement: Previous and next follow the grid
Previous and Next SHALL move to the photo before or after the current one in the list of photos the grid showed when the viewer opened, in grid order. Previous SHALL be disabled on the first photo and Next on the last, without wrapping around.

#### Scenario: Next photo
- **WHEN** the grid shows `a.jpg`, `b.jpg`, `c.jpg`, the user opens `b.jpg` and chooses Next
- **THEN** the viewer shows `c.jpg`, fitted, as `3 / 3`, and Next is disabled

#### Scenario: Album order
- **WHEN** the user opens a photo from an album view and chooses Previous
- **THEN** the viewer shows the photo before it in that album's grid, not in its folder

### Requirement: Close returns to the library
Close SHALL return to the library view with the same folder, album, filter, search and selection as before. The grid SHALL show the photos' current thumbnails, including edits made in the viewer.

#### Scenario: Close after editing
- **WHEN** the user applies sepia to a photo in the viewer and chooses Close
- **THEN** the library shows the same grid, and that photo's thumbnail is in sepia

### Requirement: Viewer keyboard
In the viewer, the keys bound in the user's keymap SHALL close the viewer, go to the previous and next photo, open or close the Info panel, turn face frames on or off, zoom, zoom to 100% and undo, each when the level allows it. In the `mac` and `windows` presets these SHALL be Esc, `←`, `→`, `i`, `f`, `+`, `-`, `0`, `1`, and `Meta+Z` or `Ctrl+Z`. In a right-to-left UI language `←` and `→` SHALL be swapped and the Previous and Next icons mirrored. Keys typed into a text or slider control SHALL go to that control. While a floating panel, the Info panel or a frame is open, Esc SHALL close it instead of the viewer.

#### Scenario: Arrow keys
- **WHEN** the UI language is English and the user presses `→`
- **THEN** the viewer shows the next photo

#### Scenario: Right-to-left
- **WHEN** the UI language is Arabic and the user presses `←`
- **THEN** the viewer shows the next photo

#### Scenario: Esc with an open panel
- **WHEN** the brightness panel is open and the user presses Esc
- **THEN** the panel closes and the viewer stays open

#### Scenario: Typing a tag
- **WHEN** the Info panel is open and the user types `i` into its tag field
- **THEN** the letter goes into the field and the panel stays open

#### Scenario: Faces key
- **WHEN** the level is Easy and the user presses `f`
- **THEN** face frames turn on, and pressing `f` again turns them off

#### Scenario: Typing f
- **WHEN** the Info panel is open and the user types `f` into its tag field
- **THEN** the letter goes into the field and face frames do not change

#### Scenario: Rebound next
- **WHEN** the user has bound Viewer → Next photo to `N` only
- **THEN** `N` shows the next photo and `→` does nothing

#### Scenario: Actual size key
- **WHEN** the keymap is `windows`, a 4000×3000 photo is fitted and the user presses `1`
- **THEN** the photo is shown at 100%, keeping the centre of the window in place

### Requirement: Overlay bars are placed by the settings
The navigation bar and the edit bar SHALL each be placed along the screen edge chosen in the settings: top, bottom, left or right. On the top or bottom edge a bar SHALL lay out its buttons in a row, and on the left or right edge in a column. When both bars are on the same edge, the navigation bar SHALL be nearest the edge and the edit bar next to it, without overlapping. The edges are physical screen sides and SHALL NOT be mirrored in a right-to-left UI language.

#### Scenario: Defaults
- **WHEN** the user has never changed the settings and opens a photo
- **THEN** the navigation bar is a row along the top and the edit bar is a column along the left

#### Scenario: Edit bar at the bottom
- **WHEN** the user sets the edit bar to bottom and opens a photo
- **THEN** the edit bar is a row of icons along the bottom edge

#### Scenario: Both bars on the right
- **WHEN** both bars are set to right
- **THEN** the navigation bar is a column at the right edge and the edit bar is a column just inside it, and they do not overlap
