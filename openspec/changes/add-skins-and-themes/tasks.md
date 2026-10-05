# Tasks

## 1. Tokens, themes and appearance state

- [x] 1.1 Create `client/src/appearance/tokens.ts` with the color, size and font token name lists and derived types (D1); verify `npm run build:client` type-checks
- [x] 1.2 Add `appearance/contrast.ts` (WCAG luminance, contrast ratio, compositing a translucent color over black/white) with `contrast.test.ts` covering known pairs (e.g. #000/#fff = 21:1); verify `npm test` passes
- [x] 1.3 Add `appearance/themes/light.ts`, `dark.ts`, `high-contrast.ts` and a registry; add `themes.test.ts` asserting each theme has exactly the color tokens (no size/font keys) and meets the D9 contrast table (4.5/3 for Light and Dark, 7/4.5 for High Contrast, no translucent colors in High Contrast); verify `npm test` passes
- [x] 1.4 Extend `uiSettings.ts` with `skin` (default `classic`), `theme` (default `system`) `sidebarCollapsed` (default `false`) and `collapsedSidebarLists` (default `[]`), validated per field (D5); extend `uiSettings.test.ts` with unknown skin keeps theme, unknown theme keeps skin, old stored object without the fields, unknown list ids dropped; verify `npm test` passes
- [x] 1.5 Add pure `resolveTheme(choice, media)` (D6) with tests for System → Light/Dark/High Contrast (contrast wins over dark, forced-colors → High Contrast) and explicit choices ignoring the OS; verify `npm test` passes
- [x] 1.6 Add `buildAppearanceCss(skin, theme)` that writes skin default colors, then theme colors, sizes, fonts and the Bootstrap `--bs-*` mapping (D1, D2) into one `:root` rule, with a test that theme values override skin defaults and that size/font values come only from the skin; verify `npm test` passes
- [x] 1.7 Start `docs/skins-and-themes.md` (D10): skin vs. theme in plain words, the three themes with palettes and contrast levels, how System is resolved, and the full token reference table; add `docs.test.ts` that compares that table with `tokens.ts` in both directions; verify `npm test` passes and fails when a token is removed from the doc

## 2. Applying the appearance (Classic only)

- [x] 2.1 Create the skin definition type, registry and `skins/classic/index.ts` with today's sizes and fonts (D3, D8); verify `npm run build:client`
- [x] 2.2 Implement `initAppearance()` and `useAppearance()`: write the `<style id="paloma-appearance">`, set `data-skin`, `data-theme`, `data-bs-theme` and `color-scheme` on `<html>`, await the skin's `load()`, subscribe to `matchMedia` while the theme is System (D6, D7); call it from `main.tsx` before the first render; verify in the browser that reloading with Dark remembered shows no Light frame and that toggling the OS appearance with System switches the theme live
- [x] 2.3 Split `index.css` into `appearance/base.css` (shared, tokens only) and `skins/classic/classic.css` scoped under `html[data-skin="classic"]`, replacing every literal color and size with tokens; verify `grep -E '#[0-9a-fA-F]{3,6}' client/src/appearance/base.css client/src/appearance/skins/classic/classic.css` finds no colors and Classic + Light looks as before in the browser
- [x] 2.4 Replace Bootstrap color utilities and inline sizes that bypass variables (`bg-white`, `bg-light`, `text-dark`, `btn-outline-light`, `marginBottom: '80px'`, …) in all components and shared views with token-based classes; verify `grep -rnE 'bg-white|bg-light|text-dark' client/src` is empty and map, people, collage, plugins, settings and every modal are readable in Dark and High Contrast in the browser
- [x] 2.5 Make sure photos, thumbnails, edit previews and map tiles get no filters or blend modes from themes; verify a photo looks identical in Light and Dark in the viewer
- [x] 2.6 Add the Classic section to `docs/skins-and-themes.md` (who it is for, ASCII layout sketch, sizes and fonts); verify its values match `skins/classic/index.ts`

## 3. Extract logic so skins only render

- [x] 3.1 Extract `useLibraryPhotos()` from `App.tsx` and `useFolderTree()` from `LeftSidebar.tsx` (D4); verify `npm run build:client` and the library, folders and albums still load in the browser
- [x] 3.2 Extract `useNavigationItems()` (view ids, icons, i18n keys) from `Navbar.tsx` and a shared tray-actions list from `PhotoTray.tsx`, with a unit test that the list contains every view and tray action; verify `npm test` passes
- [x] 3.3 Add `useSidebarSections()` and the shared `SidebarSection` primitive (D5a) with a test that toggling a section updates `collapsedSidebarLists` and leaves the selected folder/album unchanged; use it in the Classic sidebar for shortcuts, Albums and Folders; verify `npm test` passes and in the browser that each list collapses independently, Enter/Space on a heading toggles it, `aria-expanded` changes, and the state survives a reload
- [x] 3.4 Split `PhotoViewer.tsx` into `usePhotoViewer()` + shared `ZoomStage` + a `ViewerChrome` slot; make `barLayout()` take the bar size from the skin; extend `barLayout.test.ts` with a non-64 bar size; verify `npm test` passes and the viewer works as before (zoom, nav, edits, auto-save, bar positions)
- [x] 3.5 Turn the virtualized grid into a shared base parametrized by the skin's thumb size and move the Classic card markup into `skins/classic/`; verify `npm run build:client` and selection, star and open work in the browser
- [x] 3.6 Move `Navbar`, `LeftSidebar`, `PhotoTray` composition into `skins/classic/AppShell.tsx`; make `App.tsx` render `<skin.AppShell>` with the shared views as content (D3); add `skins.test.ts` that renders each registered skin's `AppShell` with `react-dom/server` and asserts every navigation item, tray action and sidebar list heading has an accessible name; verify `npm test` passes

## 4. Settings: Appearance section

- [x] 4.1 Add an Appearance section to `SettingsView.tsx` with skin choices (preview picture, name, description) and theme choices (System, Light, Dark, High Contrast), applying at once without reload; verify in the browser that switching skin keeps the current folder and photo selection, and the choice survives a reload
- [x] 4.2 Add the new strings (section title, skin and theme names and descriptions, Compact sidebar collapse/expand labels, sidebar list expand/collapse labels) to all 11 locale files; verify `catalogs.test.ts` passes

## 5. Compact skin

- [x] 5.1 Create `skins/compact/` with sizes and fonts from D8 and scoped CSS; verify `npm run build:client`
- [x] 5.2 Implement the Compact `AppShell`: icon toolbar with tooltips and `aria-label`s, sidebar collapsible to a narrow strip (state in `sidebarCollapsed`) with its lists rendered via `SidebarSection`, thin tray; verify in the browser that collapsing widens the grid and is remembered after reload, and Arabic mirrors the layout
- [x] 5.3 Implement the Compact `PhotoGrid` card and `ViewerChrome` (44 px bars, all positions honored); verify in the browser that more thumbnails fit than in Classic at the same window size, every target is ≥ 24 px, and the viewer bars follow all four edge settings
- [x] 5.4 Add the Compact section to `docs/skins-and-themes.md`; verify its values match `skins/compact/index.ts`

## 6. Fluid Glass skin

- [x] 6.1 Create `skins/glass/` with sizes, fonts and glass default colors derived from theme tokens via `color-mix()` (D1, D8); extend `themes.test.ts` to check glass text over the tint composited on black and white for Light and Dark; verify `npm test` passes
- [x] 6.2 Implement the glass `AppShell`: full-bleed content scrolling under a floating capsule toolbar, sidebar as a floating panel (lists via `SidebarSection`) that closes on folder choice or outside tap, floating tray; verify that lists collapsed in Classic are still collapsed here, and on a touch tablet (or a browser responsive mode with touch) that content shows through the toolbars and every target is ≥ 44 px
- [x] 6.3 Implement the glass `PhotoGrid` card and `ViewerChrome` (floating capsule bars honoring the edge settings); verify in the browser for all four edges and in Arabic
- [x] 6.4 Implement the solid fallback for `@supports not (backdrop-filter)`, `prefers-reduced-transparency: reduce` and the High Contrast theme (D8); verify in the browser with reduced transparency emulated in DevTools and with High Contrast that toolbars are opaque
- [x] 6.5 Add the Fluid Glass section to `docs/skins-and-themes.md`, including when glass falls back to solid; verify its values match `skins/glass/index.ts`

## 7. Developer guide

- [x] 7.1 Finish `docs/skins-and-themes.md` with "Adding a theme" (one file, registry line, contrast test) and "Adding a skin" (folder, the three slots, scoped CSS, rules: no fetching in skin components, every feature reachable via the shared hooks, labels on icon buttons, logical properties for RTL); verify by following the theme steps with a throwaway theme locally until `npm test` passes, then removing it
- [x] 7.2 Link `docs/skins-and-themes.md` from `AGENTS.md` (Layout → `docs/`); verify the link resolves

## 8. Integration check

- [x] 8.1 Walk all nine skin × theme combinations in the browser (library, viewer with edit bar, map, people, settings, a modal), in English and Arabic; verify text is readable and every view and tray action is reachable in each
- [x] 8.2 Verify `npm run build` and `npm test` pass
