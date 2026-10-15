# Design

## Context

- The slideshow (`client/src/components/slideshow/`) is a single `<img>` with `object-fit: contain`, keyed by photo id, so each move is a hard cut. Order and position live in `slideshowReducer` (`index`, `count`, `playing`, `step`); the interval timer restarts on every `step`.
- The viewer keeps zoom in `usePhotoViewer` as `zoomChoice: 'fit' | ZoomState`; `'fit'` is re-derived on resize. Pure math lives in `zoomMath.ts` (`fitScale`, `zoomAt`, `clampScale`, `resized`, `toggleZoom`), unit-tested in `zoomMath.test.ts`. Sharper renderings come from `useEditPreview(photoId, steps, size)` with `previewSizeFor(...)`.
- Browser-only preferences live in `client/src/settings/uiSettings.ts` (`UiSettings`, `parseUiSettings` with per-field fallbacks, `settingsOf`). `slideshowInterval` is already there.
- Keymap catalog and presets are in `shared/keymaps.ts`.

## Goals / Non-Goals

**Goals:**
- Effects as pure CSS (keyframes + two stacked layers), no new dependency.
- Play order, shuffle and effect selection as pure, unit-tested functions; the React screen only renders.
- One zoom-level model shared by the viewer menu, the "Open photos at" setting and the slideshow photo size.

**Non-Goals:**
- Ken Burns (motion while a photo is shown), music, captions, per-album slideshow settings.
- Effects in the viewer (user decision), or effects for video.
- Server-side settings sync: the new settings stay in this browser like the others.

## Decisions

### D1. Two-layer stage for effects
The slideshow renders up to two layers: `outgoing` and `incoming`, each an absolutely positioned box holding the photo. A move sets `incoming`, waits until its image has loaded (`img.decode()`; on failure, show it anyway), then adds a class `fx-<effect> fx-in` / `fx-out` with `animation-duration` from settings. On `animationend` of the incoming layer, the outgoing layer is dropped and the interval timer starts.
- Alternatives: Web Animations API (more code, same result); a library such as Swiper or framer-motion (heavy, harder to theme). CSS keyframes keep each effect a few lines and make reduced motion a media query away.
- Effects, as keyframes on the incoming (I) and outgoing (O) layer:
  - Fade: I opacity 0→1 over O.
  - Dip to black / white: O fades to a black/white backdrop during the first half, I fades in during the second half.
  - Slide ×4: I translates from off-screen to 0; O stays.
  - Push ×4: I and O translate together by 100%.
  - Wipe ×4: I `clip-path: inset(...)` reveals from one edge.
  - Zoom in: I scales 0.3→1 with opacity. Zoom out: O scales 1→1.6 with opacity →0, I under it.
  - Iris: I `clip-path: circle(0%→75%)`.
  - Blinds: I masked by a `repeating-linear-gradient` mask whose stripe height animates (via a registered `@property` custom property; where not supported, falls back to Fade).
  - Flip: both layers on a 3D card, `rotateY` 0→180 with `backface-visibility: hidden`.
- Directions are physical (`left` = moving towards the left edge), not logical, so RTL does not mirror them.

### D2. Effect catalog and picking in a pure module
`slideshow/effects.ts` exports `SLIDESHOW_EFFECTS` (20 ids, stable, used in settings and i18n keys), `EffectChoice = 'none' | 'random' | EffectId`, `pickEffect(choice, previous, random)`, `reverseOf(effect)` (Previous plays slide/push/wipe in the opposite direction) and `effectiveEffect(effect, reducedMotion)` (everything except none → fade). `random` is injected for tests.

### D3. Play order in the reducer
`SlideshowPlayback` gets `order: number[]` (grid indexes of the current round), `pos` (place in `order`) and `history` is implicit in `order` because Previous walks back in the same round; going Previous from `pos 0` wraps to the end of the current order (spec: "last photo of the current play order").
- Without shuffle, `order` is `[0..n-1]` and `pos` starts at the start index, so today's behavior is unchanged.
- With shuffle, the first round is `[start, ...shuffle(rest)]`; at the end of a round the next is `shuffle(all)` re-drawn until `order[0] !== last shown` (n > 1).
- Toggling shuffle on: keep `order[0..pos]`, shuffle the rest. Off: rebuild `order` as grid order and set `pos` to the current photo's grid index.
- Fisher–Yates with an injected `random` so tests are deterministic.
- `reset` and the start index logic in `slideshowStart.ts` are kept.

### D4. Zoom levels as named choices
Extend `zoomMath.ts` with `fillScale(photo, stage)` (= `max(stage.w/photo.w, stage.h/photo.h)`, clamped to `MAX_SCALE`) and `ZoomLevel = 'fit' | 'fill' | 'actual'`. The viewer's `zoomChoice` becomes `'fit' | 'fill' | ZoomState`, so Fill survives resizing like Fit does. The zoom menu maps 50/100/200/400 % to `zoomAt(state, p, photo, stage)` around the centre; an entry whose scale is below `fitScale` is disabled. "Open photos at" sets the initial `zoomChoice` on open and on every move (`actual` → `zoomAt(fitted, 1)`). The current level is marked when `zoomChoice` is `fit`/`fill` or the scale equals a percentage (within 1e-6).
- The percentage in `NavBar` becomes a dropdown toggle (React Bootstrap `Dropdown`), keeping its `aria-live` text; it is disabled while `zoomLocked`.
- New action `viewer.zoomActual` → `1` in `mac`/`windows`; unbound in `tvBox` (no fitting remote key that is not already used by navigation).

### D5. Slideshow photo size
`SlideshowFit = 'fit' | 'fitNoEnlarge' | 'fill' | 'actual'`. `fit` and `fill` stay pure CSS (`object-fit: contain` / `cover`). `fitNoEnlarge` and `actual` need the photo's pixel size, which the `Photo` objects already carry (`width`, `height`); the box is sized from `fitScale` / scale 1 and centred, with `overflow: hidden` on the stage.
- Sharpness: when the needed long side exceeds the size of `previewUrl`, the slideshow uses `useEditPreview(photo.id, photo.edits, previewSizeFor(...))` — the same rendering path the viewer uses — for the incoming photo, and its load gates the effect (D1). Otherwise it keeps `previewUrl`.

### D6. Settings
`UiSettings` gains `slideshowEffect: EffectChoice` (default `fade`), `slideshowEffectDuration: 0.5 | 1 | 2` (default 1), `slideshowShuffle: boolean` (default false), `slideshowFit: SlideshowFit` (default `fit`) and `viewerOpenZoom: ZoomLevel` (default `fit`), each validated on its own in `parseUiSettings` and copied in `settingsOf`. `SettingsView` gets "Open photos at" under the viewer heading and a new Slideshow section before `KeyboardSection`; the effect choice is a `Form.Select` (22 options), the others are radio/toggle groups like `EdgeChoice`.
- Slideshow settings are shown at every level (Child is already guarded by the PIN for the whole view).

### D7. Keyboard
`slideshow.shuffle` joins the Slideshow section: `S` in `mac`/`windows`, `ColorF3Blue` in `tvBox` (a colour key is allowed and is free on the slideshow screen). It is unique within the slideshow layer, so it does not clash with `selection.star` / `viewer.star`.

### MVP code
- Reused: `slideshowStart.ts`, the fullscreen helpers, controls hiding, `useKeyActions` wiring, `zoomMath.ts`, `useEditPreview`, `uiSettings.ts` parsing pattern, `SettingsView` choice components.
- Rewritten: `slideshowReducer.ts` (play order), the slideshow photo rendering in `Slideshow.tsx` (two layers), slideshow CSS in `base.css`, the zoom percentage in `NavBar.tsx`, the opening zoom in `usePhotoViewer.ts`.
- Dropped: nothing.

### Photo folders
No file in the user's photo folders is read or written by this change beyond what the existing preview/render endpoints already read; nothing is written.

## Risks / Trade-offs

- [Two decoded full-screen images during an effect cost memory on TV boxes] → only two layers at a time; the outgoing layer is removed at `animationend`; the next photo is pre-loaded only once (as today).
- [`clip-path`/mask/`@property` support varies on older TV browsers] → effects that rely on them fall back to Fade when `CSS.supports` says no.
- [Rapid key presses could stack animations] → a new move first completes the running one (D1: remove outgoing, clear classes), as the spec requires.
- [Original size / Fill renderings are large] → capped at the existing `MAX_PREVIEW_SIZE` and requested only when needed.
- [22-option select is long] → grouped with `<optgroup>`: None/Random, Fades, Slides, Pushes, Wipes, Other.

## Migration Plan

Client-only. New settings fields fall back to defaults when absent, so stored settings from earlier versions keep working. Rollback = revert; unknown fields in stored JSON are ignored by older builds.
