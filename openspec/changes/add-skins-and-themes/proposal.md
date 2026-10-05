# Proposal

## Why

Paloma has one hardcoded look: large "senior-friendly" controls, a dark navbar and a light grid, with about 40 colors written directly in `index.css` and Bootstrap color classes (`bg-light`, `bg-white`, `text-dark`) spread over the components. People use Paloma on very different devices and with different needs: a dense desktop with a big library, a tablet used by touch, or low vision that needs strong contrast. One look cannot serve all of them, and a dark or high-contrast mode cannot be added while colors are scattered through the code.

## What Changes

- Introduce two independent appearance settings:
  - **Skin** — how the UI is built: layout, its own React component tree (DOM) for the app shell and key views, element sizes, fonts and the skin's default colors.
  - **Theme** — colors only. Any theme can be combined with any skin.
- Ship three skins:
  - **Classic** — today's layout (top navbar, folder sidebar on the left, photo tray at the bottom) with its large controls, rebuilt on top of the skin system.
  - **Compact** — a dense layout for small laptop screens and large libraries: smaller type and thumbnails, icon toolbar, collapsible sidebar, thin tray and viewer bars.
  - **Fluid Glass** — a touch-first layout for tablets in the style of modern touch interfaces: floating translucent "glass" toolbars and panels over full-bleed content, large rounded touch targets.
- Ship three themes: **Light**, **Dark** and **High Contrast**, plus a **System** choice that follows the operating system (dark mode → Dark, increased contrast → High Contrast, otherwise Light).
- A skin can render a completely different DOM, not only different CSS. In this change a skin supplies its own **app shell** (navigation, sidebar, tray placement), **library grid and photo cards**, and **photo viewer chrome** (navigation and edit bars). Other views (map, people, collage, plugins, settings, modals) are shared between skins and follow the skin's sizes and fonts and the theme's colors.
- Make every list in the sidebar (library shortcuts, Albums, Folders) collapsible on its own, in every skin, with the collapsed state remembered in this browser.
- Add an **Appearance** section to the Settings view to choose the skin and the theme. Changes apply at once without a reload and are remembered in this browser, like the other UI settings. Defaults: Classic skin, System theme.
- Replace hardcoded colors and sizes in the MVP client with named design tokens.
- Add a human-readable document, `docs/skins-and-themes.md`, that describes every skin and theme, the token reference, and how a developer adds a new skin or theme.

Skins and themes are built into the client. Loading them from outside (files or plugins) is not part of this change.

## Capabilities

### New Capabilities
- `skins`: choosing a skin; what a skin defines (layout and own component tree for the app shell, library grid and viewer chrome, sizes, fonts, default colors); the Classic, Compact and Fluid Glass skins; behavior every skin must keep (same features, collapsible sidebar lists, viewer bar positions, right-to-left layout).
- `themes`: choosing a theme or following the system; a theme defines colors only and combines with any skin; the Light, Dark and High Contrast themes and their contrast guarantees; photos are never recolored.

### Modified Capabilities
<!-- none: the Settings view and UI-settings storage are specified in the not-yet-archived `add-photo-viewer` change (`app-settings`); the appearance choices are specified in the new capabilities above -->

## Impact

- **Depends on** `add-photo-viewer` (Settings view, UI-settings storage, photo viewer bars); archive it before this change.
- **Client**: new `client/src/appearance/` (tokens, themes, skins, provider); `App.tsx` becomes skin-driven; library data loading and viewer state are moved out of components into hooks so skins can render them with their own DOM; `index.css` colors and sizes become tokens; `uiSettings.ts` gains `skin`, `theme` and the collapsed sidebar lists; `SettingsView.tsx` gains the Appearance section; `main.tsx` applies the appearance before the first render.
- **i18n**: new strings (skin and theme names and descriptions, Appearance section, expand/collapse labels for sidebar lists) in all 11 locale files.
- **Docs**: new `docs/skins-and-themes.md`.
- **Server, API, `shared/types.ts`, photo folders**: no changes. Nothing is sent to the server or written next to photos.
- **Dependencies**: none new; Bootstrap stays and is fed from the tokens.
