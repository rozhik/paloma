# Design

## Context

See proposal.md for why. Requirements are in `specs/skins` and `specs/themes`. This change builds on the `add-photo-viewer` change (Settings view, `uiSettings.ts`, viewer bars), which must be archived first.

Current state that shapes the approach:

- **One look, hardcoded.** `client/src/index.css` (569 lines) has a small `:root` block of `--paloma-*` variables, but about 40 literal hex colors and fixed sizes are written directly in its rules. 12 components use Bootstrap color utilities (`bg-light`, `bg-white`, `text-dark`, `text-light`, `btn-outline-light`) and inline sizes (`marginBottom: '80px'`, `maxWidth: '480px'`).
- **Bootstrap.** Bootstrap 5.3 CSS is loaded by `i18n/document.ts`, which swaps the LTR and RTL builds by language. Bootstrap 5.3 reads `--bs-*` CSS variables and supports `data-bs-theme="dark"`.
- **Structure is fixed in `App.tsx`.** It fetches the library photos itself, then composes `Navbar`, `LeftSidebar`, `VirtualPhotoGrid`, `PhotoTray` and the modals. `LeftSidebar` fetches folders and albums inside the component. The grid hardcodes `COLUMN_WIDTH = 220`, `ROW_HEIGHT = 240`. `barLayout.ts` hardcodes `VIEWER_BAR_SIZE = 64`.
- **Viewer.** `PhotoViewer.tsx` (368 lines) mixes state (navigation, zoom, save gate, keys) with the DOM of the nav and edit bars. `NavBar.tsx`, `EditBar.tsx`, `FilterPanel.tsx` are presentational already.
- **Settings.** `uiSettings.ts` is a Zustand store persisted to `localStorage` key `paloma.ui.settings`, with per-field validation (`parseUiSettings`). This is the pattern to extend.
- **Startup.** `main.tsx` awaits `initI18n` before the first render to avoid a flash of English/LTR. Appearance needs the same treatment.

## Goals / Non-Goals

**Goals:**
- One data/logic layer, several presentation layers: a skin only renders; it never fetches or owns business state.
- A theme is provably colors-only (enforced by types and a test), and every theme × skin pair works.
- Adding a fourth skin or theme touches one folder plus a registry line, and is described in `docs/skins-and-themes.md`.
- No new runtime dependency.

**Non-Goals:**
- Skins or themes loaded from files or plugins at runtime.
- Per-skin versions of map, people, collage, plugins, settings and modal views (they are shared; see D3).
- New touch gestures (swipe between photos, pull to refresh) in the Fluid Glass skin. They are behavior, not appearance, and can be added later.
- A user-editable color picker or custom themes.
- Automatically picking a skin by device type.

## Decisions

### D1. Two layers of design tokens, split by kind
All visual values become CSS custom properties with the `--pal-` prefix, in three kinds:

| Kind | Who sets it | Examples |
|---|---|---|
| **Color tokens** | theme (required), skin defaults (fallback) | `--pal-bg`, `--pal-surface`, `--pal-surface-raised`, `--pal-text`, `--pal-text-muted`, `--pal-border`, `--pal-accent`, `--pal-accent-text`, `--pal-selection`, `--pal-star`, `--pal-danger`, `--pal-focus`, `--pal-chrome-bg`, `--pal-chrome-text`, `--pal-viewer-bg`, `--pal-overlay` |
| **Size tokens** | skin only | `--pal-font-size`, `--pal-control-height`, `--pal-hit-min`, `--pal-radius`, `--pal-gap`, `--pal-thumb-size`, `--pal-tray-height`, `--pal-viewer-bar-size`, `--pal-sidebar-width` |
| **Font tokens** | skin only | `--pal-font-family`, `--pal-font-weight-strong`, `--pal-line-height` |

- `client/src/appearance/tokens.ts` declares the three name lists as `const` arrays and derives `ColorToken`, `SizeToken`, `FontToken` types from them. This list is the single source of truth: the docs test (D10) and the theme test (D6) check against it.
- A theme is `Record<ColorToken, string>`; its type does not admit size or font keys, and a unit test asserts each theme object has exactly the color keys.
- A skin is `{ sizes: Record<SizeToken, string>; fonts: Record<FontToken, string>; defaultColors: Partial<Record<ColorToken | SkinColorToken, string>> }`. `SkinColorToken` are skin-specific colors a skin may declare (e.g. `--pal-glass-tint`, `--pal-glass-highlight` in Fluid Glass); they are derived from theme tokens with `color-mix()` by default, so every theme works without knowing about them.
- **Cascade**: skin default colors are written first, theme colors over them, all on `<html>` via a generated `<style id="paloma-appearance">` element (one rule for `:root`). Switching rewrites that one element, so the change is instant and needs no reload.
- *Alternative*: one big token set per (skin × theme). Rejected: 9 files that drift apart, and the "theme is only colors" rule could not be enforced.

### D2. Bootstrap is fed from the tokens
The same generated rule maps tokens onto Bootstrap's variables (`--bs-body-bg: var(--pal-bg)`, `--bs-body-color`, `--bs-primary` / `--bs-primary-rgb`, `--bs-border-color`, `--bs-secondary-color`, `--bs-font-sans-serif`, `--bs-body-font-size`, `--bs-border-radius`, …). `<html data-bs-theme>` is set to `dark` for the Dark theme, `light` otherwise, so Bootstrap's components (modals, dropdowns, form controls) get matching base styling, and `color-scheme` is set accordingly for native controls and scrollbars (spec: Browser controls follow the theme). High Contrast sets `data-bs-theme` from its own background luminance.

MVP utilities that bypass variables (`bg-white`, `bg-light`, `text-dark`, `btn-outline-light`) are replaced in components by Paloma classes (`pal-surface`, `pal-chrome`, …) or Bootstrap's variable-driven ones (`bg-body`, `bg-body-tertiary`, `text-body`).

### D3. Skins are component sets behind slots
A skin is a TypeScript module, not a stylesheet:

```ts
interface SkinDefinition {
  id: 'classic' | 'compact' | 'glass';
  sizes; fonts; defaultColors;            // D1
  load: () => Promise<SkinComponents>;    // code-split per skin
}
interface SkinComponents {
  AppShell: React.FC<AppShellProps>;        // navigation, sidebar, tray placement, content area
  PhotoGrid: React.FC<PhotoGridProps>;      // grid + photo cards
  ViewerChrome: React.FC<ViewerChromeProps>; // nav bar + edit bar + filter panel host
}
```

- `client/src/appearance/skins/<id>/` holds `index.ts` (definition), its components and a CSS file whose rules are all scoped under `html[data-skin="<id>"]`, so skins' CSS cannot leak into each other while one is loaded after another.
- `SkinProvider` (React context) exposes the loaded `SkinComponents`; `App.tsx` renders `<skin.AppShell>` and passes it the active view's content. Views without a skin slot (map, people, collage, plugins, settings, modals) are shared components rendered inside the shell's content area; they use only tokens, so they follow the skin's sizes/fonts and the theme's colors.
- **Why slots instead of CSS-only**: the Fluid Glass shell puts navigation in floating capsules and the sidebar in a popover; Compact turns view buttons into an icon rail with a collapsible sidebar. These are different element trees and different interaction (popover open/close), which CSS cannot express without shipping every skin's markup to every skin.
- *Alternative*: one component tree with `if (skin === …)` branches. Rejected: every skin then pays for every other skin's complexity, and a fourth skin edits every component.
- *Alternative*: whole-app replacement per skin. Rejected: map/people/collage would be duplicated three times for no user value (user decision: shell + key views).

### D4. Logic moves into hooks so skins only render
To let different DOM render the same behavior (spec: Every skin offers the same features):

| New hook / module | Extracted from | Used by |
|---|---|---|
| `useLibraryPhotos()` | photo fetching and star toggle in `App.tsx` | every `PhotoGrid`, tray |
| `useFolderTree()` | folder/album fetching in `LeftSidebar.tsx` | every `AppShell` sidebar |
| `useSidebarSections()` | the list of sidebar sections (shortcuts, albums, folders) and their collapsed state | every `AppShell` sidebar |
| `useNavigationItems()` | the list of views, icons and i18n keys in `Navbar.tsx` | every `AppShell` |
| `usePhotoViewer()` | state, keys, save gate, zoom wiring in `PhotoViewer.tsx` | every `ViewerChrome` |
| `usePhotoSelection()` / card actions | selection, open, star logic in `PhotoCard.tsx` | every `PhotoGrid` card |

`PhotoViewer.tsx` becomes: `usePhotoViewer()` + `ZoomStage` (shared, it is the photo itself) + `<skin.ViewerChrome>`. `barLayout()` stays shared and takes the bar size from the skin's `--pal-viewer-bar-size` (number exported alongside), so all skins honor the bar position settings (spec requirement). The grid's `COLUMN_WIDTH/ROW_HEIGHT` come from the skin's `thumbSize`.

### D5. Appearance state lives in `uiSettings`
`UiSettings` gains `skin: SkinId` (default `classic`), `theme: 'system' | 'light' | 'dark' | 'high-contrast'` (default `system`) `sidebarCollapsed: boolean` (default `false`; the whole sidebar as a strip in Compact) and `collapsedSidebarLists: SidebarListId[]` (default `[]`; `SidebarListId` is `'shortcuts' | 'albums' | 'folders'`, unknown ids are dropped when parsing). `parseUiSettings` validates each field independently, as today, so an unknown skin keeps the theme and vice versa. Same `localStorage` key; old stored objects without these fields parse to defaults (no migration).

### D5a. Collapsible sidebar lists are shared, not per skin
`useSidebarSections()` returns each section as `{ id, titleKey, collapsed, toggle, items }`; `collapsed` reads `collapsedSidebarLists`, `toggle` updates it. Each skin renders sections with a shared `SidebarSection` primitive: the heading is a `<button aria-expanded aria-controls>` with a chevron (mirrored in RTL), the body is hidden with the `hidden` attribute when collapsed. Skins style the primitive but do not reimplement it, so keyboard and screen-reader behavior is identical everywhere. State is per list and global, not per skin (spec: Remembered across reload and skins). Collapsing hides entries only; selection in `usePalomaStore` is untouched.
- *Alternative*: per-skin collapse state. Rejected: switching skin would unexpectedly re-expand lists.

### D6. Resolving System and reacting to the OS
`resolveTheme(choice, media)` is a pure function: `prefers-contrast: more` (or `forced-colors: active`) → `high-contrast`; else `prefers-color-scheme: dark` → `dark`; else `light`. `useAppearance()` subscribes to those three `matchMedia` queries only while the choice is `system`, and re-applies on change. Unit-tested with a fake `media` object.

When `forced-colors: active` (Windows High Contrast), Paloma does not override system colors (`forced-color-adjust` left at `auto`); the High Contrast theme just keeps layout and borders sensible.

### D7. Applying before the first render
`initAppearance()` in `main.tsx` runs next to `initI18n`: it reads settings, writes the token `<style>`, sets `data-skin`, `data-theme`, `data-bs-theme`, `color-scheme` on `<html>`, and awaits the active skin's `load()` (and its CSS) before `createRoot().render`. Switching skin later awaits the new skin's `load()`, then swaps context and `data-skin` in one React update, so there is no unstyled frame. Store state (view, folder, selection) lives in Zustand, outside the shell, so it survives the swap (spec: Choosing a skin).

### D8. The three skins

| | Classic | Compact | Fluid Glass |
|---|---|---|---|
| Shell | today's: top navbar with labelled buttons, left sidebar, bottom tray | top toolbar with icon buttons + tooltips, collapsible icon-rail sidebar, thin tray strip | floating glass capsule toolbar (top) with view buttons, sidebar as floating popover panel, tray as floating glass bar; content full-bleed under them |
| Base font | 1.1rem, system UI | 0.875rem, system UI | 1.0625rem, `-apple-system, "SF Pro Text", system-ui` |
| Thumbnail | 220 px | 140 px | 200 px, larger radius |
| Hit target min | 44 px | 24 px (WCAG 2.5.8) | 44 px |
| Viewer bar | 64 px | 44 px | 64 px floating capsules |
| Radius | 8–10 px | 4 px | 20–28 px |

Fluid Glass surfaces: `background: var(--pal-glass-tint)` + `backdrop-filter: blur(24px) saturate(180%)`, a 1px inner highlight border and soft shadow. Solid fallback (spec: Glass falls back to solid surfaces) via `@supports not (backdrop-filter: blur(1px))`, `@media (prefers-reduced-transparency: reduce)` and `html[data-theme="high-contrast"]`, all switching the tint to opaque `--pal-surface-raised`. Text on glass uses `--pal-chrome-text` checked against the *opaque* fallback and against the tint over both black and white content in the contrast test (D9).

The MVP's look is Classic: `index.css` rules move into `skins/classic/classic.css` (scoped) and shared `appearance/base.css`, with literals replaced by tokens.

### D9. Contrast is tested, not eyeballed
`appearance/contrast.ts` implements WCAG relative luminance and contrast ratio. `themes.test.ts` checks, for each theme, a table of (foreground, background, minimum) pairs: text/bg, text/surface, muted/surface, chrome-text/chrome-bg, accent-text/accent, focus/bg, border/surface — 4.5/3 for Light and Dark, 7/4.5 for High Contrast. Translucent colors are composited over both black and white before measuring. Themes are written as hex literals (no `color-mix`) so the test can read them.

### D10. Human-readable document
`docs/skins-and-themes.md` (user and developer audience, same style as `docs/plugins.md`):
1. Skin vs. theme in plain words, with how to switch in Settings.
2. Each skin: who it is for, layout sketch (ASCII), sizes and fonts.
3. Each theme: palette table with swatches as hex, contrast levels, how System is resolved.
4. Token reference: every token, its kind, what it colors or sizes.
5. The sidebar: collapsible lists and, in Compact, collapsing the whole sidebar.
6. How to add a theme (one file, registry line, contrast test) and a skin (folder, the three slots, scoped CSS, rules: no fetching in skin components, every feature reachable, labels on icon buttons, RTL via logical properties).

`docs.test.ts` (client) parses the token reference table and fails if a token in `tokens.ts` is missing from the doc or vice versa, so the doc cannot drift.

### D11. Files in the photo folders and server
None. No file in photo folders is read or written, and nothing is sent to the server; all appearance state is in browser `localStorage`.

### MVP code: reused, rewritten, dropped

| Code | Fate |
|---|---|
| `uiSettings.ts` | Reused, extended (D5) |
| `SettingsView.tsx` | Reused; Appearance section added, `EdgePicture` pattern reused for skin/theme preview pictures |
| `index.css` | Rewritten: split into `appearance/base.css` (shared, tokens only) and `skins/classic/classic.css`; `--paloma-*` variables dropped in favor of `--pal-*` |
| `App.tsx` | Rewritten into skin-driven composition; photo fetching moved to `useLibraryPhotos` |
| `Navbar.tsx`, `LeftSidebar.tsx`, `PhotoTray.tsx` | Moved into `skins/classic/` as the Classic shell; data logic extracted to hooks (D4); sidebar headings become collapsible `SidebarSection`s (D5a); tray *actions* shared by all skins |
| `VirtualPhotoGrid.tsx`, `PhotoCard.tsx` | Virtualization reused as a shared `VirtualGrid` base parametrized by thumb size; card markup moved into `skins/classic/` |
| `PhotoViewer.tsx` | Split: `usePhotoViewer` hook + shared `ZoomStage` + per-skin `ViewerChrome` |
| `NavBar.tsx`, `EditBar.tsx`, `FilterPanel.tsx`, `ViewerButton.tsx` | Reused by Classic and Compact chromes (sized by tokens); Fluid Glass wraps them in its own capsule containers |
| `barLayout.ts` | Reused; bar size becomes a parameter |
| `i18n/document.ts` | Reused unchanged (Bootstrap LTR/RTL swap) |
| Other views and modals | Reused; color utilities and inline sizes replaced by tokens |

## Risks / Trade-offs

- [Large refactor of MVP components touches most of the client] → Do it in order: tokens + themes with Classic only first (no visible change except colors), then hook extraction, then Compact, then Fluid Glass. Each step builds and passes tests.
- [`backdrop-filter` over a virtualized, scrolling grid is expensive on older tablets] → Limit glass to a few fixed surfaces, no nested glass; fallback to solid with `prefers-reduced-transparency`.
- [Translucent text contrast depends on the photo underneath] → Measure tint composited over black and white (D9) and keep a minimum tint opacity; High Contrast and reduced transparency are always solid.
- [Skins drift: a feature added to Classic only] → Shared hooks own the feature lists (`useNavigationItems`, tray actions); skins map over them instead of hardcoding buttons. A test renders each skin's shell with `react-dom/server` (`renderToStaticMarkup`, no DOM library needed) and asserts every navigation item and tray action is present with an accessible name.
- [Code-split skin loads slowly on switch] → Skins are small; switching awaits `load()` with the old skin still visible, so the worst case is a short delay, not a broken frame.

## Migration Plan

Client-only and per-browser. Existing stored settings without `skin`/`theme` parse to Classic + System, so the first visible change for current users is that the UI follows the OS dark mode. Rollback is reverting the client build; stored extra fields are ignored by older builds' `parseUiSettings`.
