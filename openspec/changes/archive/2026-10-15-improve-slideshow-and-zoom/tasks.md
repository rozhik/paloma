# Tasks

## 1. Settings model

- [x] 1.1 Add `slideshowEffect`, `slideshowEffectDuration`, `slideshowShuffle`, `slideshowFit` and `viewerOpenZoom` with their value lists and defaults to `client/src/settings/uiSettings.ts` (`UiSettings`, `DEFAULT_UI_SETTINGS`, `parseUiSettings`, `settingsOf`); verify with new cases in `uiSettings.test.ts`: defaults, each valid value round-trips, an invalid stored effect such as `spin` falls back to `fade` while other fields are kept

## 2. Effects catalog and play order (pure logic)

- [x] 2.1 Create `client/src/components/slideshow/effects.ts` with the 20 effect ids, `EffectChoice`, `pickEffect` (Random never repeats the previous effect), `reverseOf` (slide/push/wipe directions) and `effectiveEffect` (reduced motion → fade, none stays none); verify with `effects.test.ts` using an injected random source
- [x] 2.2 Rewrite `slideshowReducer.ts` with `order`/`pos` play order: grid order without shuffle, `[start, ...shuffled rest]` with shuffle, new round whose first photo differs from the last shown, Previous walking back and wrapping to the end of the current order, `shuffle` toggle keeping the current photo; verify with updated `slideshow.test.ts` covering every scenario in the slideshow delta (every photo once per round, next round, one photo, back in shuffled order, shuffle off continues in grid order)

## 3. Slideshow screen

- [x] 3.1 Replace the single `<img>` in `Slideshow.tsx` with the two-layer stage (outgoing/incoming), gating each effect on the incoming image's load, starting the interval at `animationend`, and finishing a running effect at once on a new move; verify manually in `npm run dev` that Next pressed twice quickly never leaves a half-faded photo and that a slow image keeps the current photo shown
- [x] 3.2 Add the CSS keyframes for all 20 effects, the dip backdrops, `prefers-reduced-motion` handling and `CSS.supports` fallbacks to Fade in `client/src/appearance/base.css`; verify each effect visually by choosing it in Settings and running a slideshow of 3 photos
- [x] 3.3 Implement the photo sizes Fit, Fit without enlarging, Fill and Original size, using `useEditPreview` with `previewSizeFor` when a sharper rendering is needed; verify on a 1600×900 window with a 640×480 and a 4000×3000 photo that the sizes match the spec scenarios
- [x] 3.4 Add the Shuffle toggle button (lucide `Shuffle`, `aria-pressed`, tooltip) to the slideshow bar, wired to `slideshowShuffle` and the reducer's toggle; verify toggling on the bar shows the same state in Settings and that `SlideshowButton.test.tsx`/new component tests pass

## 4. Viewer zoom levels

- [x] 4.1 Add `fillScale` and the `ZoomLevel` type to `zoomMath.ts`; make `resized` keep Fill; verify with new `zoomMath.test.ts` cases (4000×3000 in 1600×900 fills at 0.4, tiny photo fill clamps to 400%, Fill survives resize)
- [x] 4.2 In `usePhotoViewer.ts`, widen `zoomChoice` to `'fit' | 'fill' | ZoomState`, open each photo at `viewerOpenZoom`, and add `zoomTo(level)` for the menu; verify by opening a photo with "Open photos at" set to Original size and seeing 100% in the bar, and that Next after zooming returns to the chosen level
- [x] 4.3 Turn the zoom percentage in `NavBar.tsx` into a dropdown with Fit, Fill, 50%, 100% (Original size), 200%, 400%, the current level marked and levels below Fit disabled; verify with a component test (menu items, disabled 50% for a photo fitted at 100%, marked Fill)

## 5. Keyboard

- [x] 5.1 Add `slideshow.shuffle` (`S` in mac/windows, `ColorF3Blue` in tvBox) and `viewer.zoomActual` (`1` in mac/windows, unbound in tvBox) to `shared/keymaps.ts`, and wire them in `Slideshow.tsx` and `usePhotoViewer.ts`; verify with new expectations in `shared/keymaps.test.ts` and `catalog.test.ts` (every catalog action bound in mac/windows, no conflicts in the slideshow layer)

## 6. Settings view and texts

- [x] 6.1 Add "Open photos at" under the viewer heading and a Slideshow section (interval, effect select with optgroups, duration, shuffle, photo size) before the Keyboard section in `SettingsView.tsx`; verify with `SettingsView.test.tsx`: section order Language, Level, appearance, viewer, Slideshow, Keyboard, and the default values shown
- [x] 6.2 Add English texts for the effect names, settings labels, shuffle, zoom menu and new key actions to `client/src/i18n/locales/en.json`, and translations to every other locale file (ar, de, es, fr, id, ja, pt-BR, ru, uk, zh-Hans); verify the locale key-parity test passes
- [x] 6.3 Update `docs/keybindings.md` if it lists actions or preset keys for the Slideshow and Viewer sections, and verify the documented keys match `shared/keymaps.ts`

## 7. Integration

- [x] 7.1 Run through the slideshow in `npm run dev` with Random, shuffle on, Fill, and reduced motion on in the OS; verify effects become fades, order is shuffled without repeats, and Exit returns to the library unchanged
- [x] 7.2 Run `npm run build` and `npm test` and verify both pass
