# slideshow Specification

## Purpose

Shows the photos of the current album or folder one after another on the full screen, without any control that changes them, so that anyone, including a child, can watch them.

## Requirements

### Requirement: Start a slideshow
When the library grid shows at least one photo, the library SHALL offer a Slideshow button at every level. It SHALL play the photos the grid shows, in grid order, starting with the first selected photo if there is one, otherwise with the first photo.

#### Scenario: Album slideshow
- **WHEN** the user opens the album `Birds` with 12 photos and chooses Slideshow
- **THEN** the slideshow shows the first photo of `Birds` and plays the 12 photos in grid order

#### Scenario: Start from the selection
- **WHEN** the grid shows `a.jpg`, `b.jpg`, `c.jpg`, `b.jpg` is selected and the user chooses Slideshow
- **THEN** the slideshow starts with `b.jpg`

#### Scenario: Empty grid
- **WHEN** the grid shows no photos
- **THEN** no Slideshow button is offered

### Requirement: Slideshow fills the screen
The slideshow SHALL show each photo fitted to the screen on a dark background, as it looks with its edits. It SHALL ask the browser for full screen; if the browser refuses, it SHALL fill the window instead and keep working.

#### Scenario: Edited photo
- **WHEN** a photo in the slideshow has a sepia step
- **THEN** the slideshow shows it in sepia

#### Scenario: Full screen refused
- **WHEN** the browser does not allow full screen
- **THEN** the slideshow fills the browser window

### Requirement: Slideshow advances by itself
The slideshow SHALL start playing and show the next photo when the interval has passed. The interval SHALL be 3, 5 or 10 seconds, 5 by default, and the choice SHALL be remembered in this browser. After the last photo it SHALL continue with the first.

#### Scenario: Automatic advance
- **WHEN** the interval is 5 seconds and a photo has been shown for 5 seconds
- **THEN** the next photo is shown

#### Scenario: Wrap around
- **WHEN** the last photo has been shown for the interval
- **THEN** the first photo is shown

### Requirement: Slideshow controls
The slideshow SHALL offer Exit, Previous, Play/Pause, Next and the interval choice, with tooltips and accessible names in the active language. The controls SHALL hide after 3 seconds without pointer movement or touch and SHALL appear again on pointer movement or a tap. Previous and Next SHALL wrap around and restart the interval.

#### Scenario: Pause
- **WHEN** the user chooses Pause
- **THEN** the current photo stays until the user chooses Play, Next or Previous

#### Scenario: Controls hide
- **WHEN** the pointer has not moved for 3 seconds
- **THEN** the controls are hidden, and moving the pointer shows them again

### Requirement: Slideshow keyboard
In the slideshow, Space SHALL toggle Play/Pause, `←` and `→` SHALL go to the previous and next photo (swapped in a right-to-left UI language), and Esc SHALL exit.

#### Scenario: Right-to-left
- **WHEN** the UI language is Arabic and the user presses `←`
- **THEN** the next photo is shown

### Requirement: Exit returns to the library
Exiting the slideshow, by Exit, Esc or leaving the browser's full screen, SHALL return to the library with the same album or folder, filter, search and selection as before, and SHALL leave full screen.

#### Scenario: Exit by Esc
- **WHEN** the user presses Esc during a slideshow of `Birds`
- **THEN** the library shows `Birds` as before the slideshow

### Requirement: Slideshow changes nothing
The slideshow SHALL NOT offer any control that changes photos, albums, edits or locations, at any level.

#### Scenario: No editing
- **WHEN** the level is Developer and a slideshow is playing
- **THEN** no star, edit, album or tray control is shown
