# Proposal

## Why

The slideshow cuts from photo to photo, always in grid order, always fitted to the screen, and the viewer offers only "fit" and step zoom. Picasa and every comparable photo manager offer transitions, a shuffled order and named zoom levels; without them Paloma's slideshow feels like a test page, and reaching 100% or filling the screen in the viewer takes many clicks.

## What Changes

- Slideshow **transition effects**: a catalog of 20 standard effects (fade, dips, slides, pushes, wipes, zooms, iris, blinds, flip), plus **Random** (a different effect each time) and **None** (an instant cut, today's behavior). Chosen in Settings, with an effect duration. Effects play only in the slideshow, not in the viewer.
- Slideshow **shuffle**: plays the photos in a random order, each once per round. Toggled in Settings and from a new Shuffle button on the slideshow bar, and by a key.
- Slideshow **photo size**: how each photo fills the screen — Fit (default, today's behavior), Fit without enlarging, Fill (crop to cover the screen) or Original size.
- A **Slideshow section in Settings** holding the interval, effect, effect duration, shuffle and photo size. The interval choice on the slideshow bar stays.
- Viewer **zoom levels**: a menu on the zoom percentage with Fit, Fill, 50%, 100% (Original size), 200% and 400%, and a key for 100%.
- Viewer **"Open photos at"** setting: Fit (default), Fill or Original size, used when a photo is opened or the viewer moves to another photo.
- New keymap actions: `slideshow.shuffle` and `viewer.zoomActual` (the keybindings rules already require them to have keys in `mac` and `windows`; the keys are specified in the slideshow and viewer keyboard requirements).

## Capabilities

### New Capabilities
- `slideshow-effects`: the catalog of slideshow transition effects, Random and None, effect duration, how effects behave on manual moves, rapid moves and reduced motion.

### Modified Capabilities
- `slideshow`: shuffled play order, photo size modes, Shuffle on the controls bar and keyboard, transitions between photos.
- `photo-viewer`: named zoom levels menu, `1` for 100%, the photo opens at the zoom chosen in Settings instead of always fitted.
- `app-settings`: a Slideshow section and the viewer's "Open photos at" choice, remembered in this browser; section order.

## Impact

- Client only; no server, API or database changes, nothing written to photo folders.
- `client/src/components/slideshow/*` (reducer, screen, new effects module and CSS), `client/src/components/viewer/{zoomMath,NavBar,PhotoViewer,usePhotoViewer}.ts(x)`, `client/src/settings/uiSettings.ts`, `client/src/components/SettingsView.tsx`, `client/src/appearance/base.css`.
- `shared/keymaps.ts` (catalog and presets), all locale files in `client/src/i18n/locales/`.
- No new dependencies: effects are CSS animations.
