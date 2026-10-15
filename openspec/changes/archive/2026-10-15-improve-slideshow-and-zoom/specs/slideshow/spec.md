# Spec Delta

## MODIFIED Requirements

### Requirement: Start a slideshow
When the library grid shows at least one photo, the library SHALL offer a Slideshow button at every level. It SHALL play the photos the grid shows, starting with the first selected photo if there is one, otherwise with the first photo. Without shuffle it SHALL play them in grid order; with shuffle, as described in Shuffled order.

#### Scenario: Album slideshow
- **WHEN** shuffle is off, the user opens the album `Birds` with 12 photos and chooses Slideshow
- **THEN** the slideshow shows the first photo of `Birds` and plays the 12 photos in grid order

#### Scenario: Start from the selection
- **WHEN** the grid shows `a.jpg`, `b.jpg`, `c.jpg`, `b.jpg` is selected and the user chooses Slideshow
- **THEN** the slideshow starts with `b.jpg`, with shuffle on or off

#### Scenario: Empty grid
- **WHEN** the grid shows no photos
- **THEN** no Slideshow button is offered

### Requirement: Slideshow fills the screen
The slideshow SHALL show each photo on a dark background, as it looks with its edits, sized by the photo size chosen in Settings as described in Photo size. It SHALL ask the browser for full screen; if the browser refuses, it SHALL fill the window instead and keep working.

#### Scenario: Edited photo
- **WHEN** a photo in the slideshow has a sepia step
- **THEN** the slideshow shows it in sepia

#### Scenario: Full screen refused
- **WHEN** the browser does not allow full screen
- **THEN** the slideshow fills the browser window

### Requirement: Slideshow advances by itself
The slideshow SHALL start playing and move to the next photo in its play order when the interval has passed, with the effect described in the slideshow-effects capability. The interval SHALL be 3, 5 or 10 seconds, 5 by default, chosen on the slideshow bar or in Settings, and the choice SHALL be remembered in this browser. After the last photo of the play order it SHALL continue with the first, or with a new round when shuffle is on.

#### Scenario: Automatic advance
- **WHEN** the interval is 5 seconds and a photo has been fully shown for 5 seconds
- **THEN** the next photo is shown

#### Scenario: Wrap around
- **WHEN** shuffle is off and the last photo has been shown for the interval
- **THEN** the first photo is shown

### Requirement: Slideshow controls
The slideshow SHALL offer Exit, Previous, Play/Pause, Next, Shuffle and the interval choice, with tooltips and accessible names in the active language. Shuffle SHALL show whether it is on, and changing it on the bar SHALL change the Settings choice too. The controls SHALL hide after 3 seconds without pointer movement or touch and SHALL appear again on pointer movement or a tap. Previous and Next SHALL wrap around and restart the interval.

#### Scenario: Pause
- **WHEN** the user chooses Pause
- **THEN** the current photo stays until the user chooses Play, Next or Previous

#### Scenario: Controls hide
- **WHEN** the pointer has not moved for 3 seconds
- **THEN** the controls are hidden, and moving the pointer shows them again

#### Scenario: Shuffle from the bar
- **WHEN** shuffle is off and the user chooses Shuffle on the slideshow bar
- **THEN** Shuffle shows as on, the following photos come in random order, and Settings → Slideshow shows shuffle on

### Requirement: Slideshow keyboard
In the slideshow, the keys bound in the user's keymap SHALL toggle Play/Pause, go to the previous and next photo, turn shuffle on or off, and exit. In the `mac` and `windows` presets these SHALL be Space, `←`, `→`, `s` and Esc. In a right-to-left UI language `←` and `→` SHALL be swapped.

#### Scenario: Right-to-left
- **WHEN** the UI language is Arabic and the user presses `←`
- **THEN** the next photo is shown

#### Scenario: Remote control
- **WHEN** the keymap is `tvBox` and the remote's play/pause button is pressed
- **THEN** the slideshow pauses, and pressing it again plays it

#### Scenario: Shuffle key
- **WHEN** the keymap is `windows` and the user presses `s` during a slideshow
- **THEN** shuffle turns on, and pressing `s` again turns it off

## ADDED Requirements

### Requirement: Shuffled order
With shuffle on, the slideshow SHALL play the photos in a random order in rounds: each round SHALL show every photo exactly once. When a round ends, the next round SHALL be a new random order whose first photo is not the last photo shown, when there is more than one photo. The position shown SHALL be the photo's place in the current round.

#### Scenario: Every photo once
- **WHEN** shuffle is on and the slideshow of 12 photos has advanced 11 times
- **THEN** each of the 12 photos has been shown exactly once

#### Scenario: Next round
- **WHEN** shuffle is on and the last photo of a round has been shown for the interval
- **THEN** a new random round starts with a photo other than the one just shown

#### Scenario: One photo
- **WHEN** shuffle is on and the grid has one photo
- **THEN** the slideshow keeps showing that photo

### Requirement: Previous follows the order shown
Previous SHALL go back to the photo shown before the current one in the play order, also with shuffle on. Previous on the first photo of the slideshow SHALL go to the last photo of the current play order.

#### Scenario: Back in shuffled order
- **WHEN** shuffle is on, the slideshow showed `c.jpg` and then `a.jpg`, and the user chooses Previous
- **THEN** `c.jpg` is shown

### Requirement: Turning shuffle on or off while playing
Turning shuffle on during a slideshow SHALL keep the current photo and play the photos not yet shown in this round in a random order. Turning it off SHALL keep the current photo and continue in grid order from it.

#### Scenario: Shuffle off
- **WHEN** shuffle is on, the grid is `a.jpg` … `e.jpg`, `c.jpg` is shown and the user turns shuffle off
- **THEN** `c.jpg` stays and the next photo is `d.jpg`

### Requirement: Photo size
The slideshow SHALL size each photo by the choice in Settings: Fit shows the whole photo as large as the screen allows, also enlarging smaller photos; Fit without enlarging does the same but shows smaller photos at actual size; Fill covers the whole screen, cropping the photo's edges equally; Original size shows 100% of actual pixels as in the viewer, cropping equally what does not fit. The photo SHALL always be centred. The default SHALL be Fit.

#### Scenario: Default
- **WHEN** the user has never changed the photo size and a 640×480 photo is shown on a 1600×900 screen
- **THEN** it is shown 1200×900, centred

#### Scenario: Fit without enlarging
- **WHEN** the photo size is Fit without enlarging and a 640×480 photo is shown on a 1600×900 screen
- **THEN** it is shown at 640×480, centred

#### Scenario: Fill
- **WHEN** the photo size is Fill and a 4000×3000 photo is shown on a 1600×900 screen
- **THEN** it is shown 1600×1200 with 150 pixels cut off at the top and at the bottom

#### Scenario: Original size
- **WHEN** the photo size is Original size and a 4000×3000 photo is shown on a 1600×900 screen
- **THEN** the centre 1600×900 pixels of the photo are shown at 100%

### Requirement: Sharp enough for the photo size
When the photo size needs the photo larger than the slideshow's usual image, the slideshow SHALL show a sharper rendering suited to the size, as the viewer does when zooming, up to at least 4096 pixels on the photo's longer side.

#### Scenario: Original size of a large photo
- **WHEN** the photo size is Original size and a 6000×4000 photo is shown
- **THEN** the shown part is sharp, not an enlarged small preview
