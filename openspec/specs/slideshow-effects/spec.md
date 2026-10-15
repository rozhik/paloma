# slideshow-effects Specification

## Purpose

Defines the transition effects the slideshow plays when it moves from one photo to the next: the catalog of standard effects, Random and None, the effect duration, and how effects behave on manual moves, quick repeated moves and reduced motion.

## Requirements

### Requirement: Effect catalog
Paloma SHALL offer these 20 slideshow effects, each with a name in the active UI language: Fade, Dip to black, Dip to white, Slide left, Slide right, Slide up, Slide down, Push left, Push right, Push up, Push down, Wipe left, Wipe right, Wipe up, Wipe down, Zoom in, Zoom out, Iris, Blinds and Flip. Directions SHALL be physical screen directions and SHALL NOT be mirrored in a right-to-left UI language.

#### Scenario: Effects listed in Settings
- **WHEN** the user opens the effect choice in Settings → Slideshow
- **THEN** it offers None, Random and the 20 effects, each named in the active language

#### Scenario: Right-to-left
- **WHEN** the UI language is Arabic and the effect is Slide left
- **THEN** the next photo moves in from the right edge of the screen towards the left

### Requirement: Effect choice
The slideshow SHALL play the effect chosen in Settings between photos: one of the 20 effects, Random, or None. None SHALL replace the photo at once, without any animation. The default SHALL be Fade.

#### Scenario: Default
- **WHEN** the user has never changed the effect and the slideshow moves to the next photo
- **THEN** the next photo fades in over the current one

#### Scenario: None
- **WHEN** the effect is None and the slideshow moves to the next photo
- **THEN** the next photo replaces the current one at once

### Requirement: Random effect
When the effect is Random, each move SHALL play one of the 20 effects picked at random, and SHALL NOT pick the effect played by the move just before it.

#### Scenario: Different each time
- **WHEN** the effect is Random and the last move played Iris
- **THEN** the next move plays one of the other 19 effects

### Requirement: Effect duration
An effect SHALL take the duration chosen in Settings: 0.5, 1 or 2 seconds, 1 second by default. The interval of the incoming photo SHALL start when its effect has finished.

#### Scenario: Interval after the effect
- **WHEN** the duration is 1 second and the interval is 5 seconds
- **THEN** each photo stays fully shown for 5 seconds after its effect ends

### Requirement: Effects on manual moves
Next, Previous and their keys SHALL play the effect as the automatic advance does. Previous SHALL play a directional effect (slide, push, wipe) in the opposite direction, so that the photo comes back from where it left.

#### Scenario: Previous with Slide left
- **WHEN** the effect is Slide left and the user chooses Previous
- **THEN** the previous photo moves in from the left edge towards the right

### Requirement: Quick moves finish the running effect
When the user moves to another photo while an effect is playing, the running effect SHALL end at once with its photo fully shown, and the effect of the new move SHALL start from there. No photo SHALL be shown half-way through an effect after its effect has ended.

#### Scenario: Pressing Next twice
- **WHEN** the effect is Fade with 2 seconds and the user presses `→` twice within half a second
- **THEN** the second photo is shown fully at the second press and the third photo fades in over it

### Requirement: No blank frame between photos
An effect SHALL start only when the incoming photo is ready to be shown. Until then the current photo SHALL stay on screen.

#### Scenario: Slow network
- **WHEN** the next photo takes 3 seconds to load
- **THEN** the current photo stays shown until it has loaded, and then the effect plays

### Requirement: Reduced motion
When the operating system or browser asks for reduced motion, every effect other than None SHALL play as Fade, including effects picked by Random.

#### Scenario: Reduced motion
- **WHEN** reduced motion is on and the effect is Flip
- **THEN** the slideshow fades between photos
