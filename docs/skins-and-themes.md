# Skins and themes

Paloma's look is made of two independent choices:

- A **skin** decides how the screen is *built*: where the navigation, the folder sidebar and the photo tray are, how photo cards and the viewer's bars look, how big text and buttons are, and which fonts are used. Two skins can arrange the screen completely differently. They are not just different stylesheets: each skin brings its own components.
- A **theme** decides the *colors*, and nothing else. Every theme works with every skin, so three skins and three themes give nine combinations.

Whatever skin and theme you choose, Paloma does the same things: every view and every action is available, and photos are never recolored. Only the interface around them changes.

## Choosing a skin and a theme

Open **Settings** (the gear button in the top bar) and find **Appearance**.

- **Skin**: Classic, Compact or Fluid Glass.
- **Theme**: System, Light, Dark or High Contrast.

A choice applies at once, without reloading the page. The folder you are in and the photos you selected stay as they were. Paloma remembers the choice in this browser only. Another browser or computer starts with the defaults: **Classic** and **System**.

### System theme

With **System**, Paloma follows your operating system and switches while it is open when the system setting changes:

1. If the system asks for more contrast (macOS "Increase contrast", Windows contrast themes), Paloma uses **High Contrast**.
2. Otherwise, if the system uses a dark appearance, Paloma uses **Dark**.
3. Otherwise it uses **Light**.

Choosing Light, Dark or High Contrast yourself ignores the system setting.

## Themes

| Theme | For | Contrast |
|---|---|---|
| **Light** | Daylight and bright rooms. Dark text on white, a dark navigation bar. | Text at least 4.5:1, icons, borders and focus at least 3:1 |
| **Dark** | Dim rooms and long photo sessions. Light text on near-black greys; photos stand out. | Text at least 4.5:1, icons, borders and focus at least 3:1 |
| **High Contrast** | Low vision. White and bright colors on pure black, solid surfaces with no transparency. | Text at least 7:1, icons, borders and focus at least 4.5:1 |

These minimums follow WCAG 2 (levels AA, and AAA for High Contrast). They are checked by automated tests (`client/src/appearance/themes/themes.test.ts`), not by eye.

The viewer's background, the photo tray and the navigation bar change color with the theme. Photos, thumbnails, edit previews and map tiles do not.

## Skins

Each skin builds three parts of the screen its own way: the **app frame** (navigation, folder sidebar and photo tray), the **library grid** with its photo cards, and the **viewer's bars** around an open photo. The other views (map, people, collage, settings) and the dialogs are shared by all skins; they take the skin's sizes and fonts and the theme's colors. Every dialog, menu and popover fits the window: a dialog keeps its header and footer in view and scrolls its body, and menus and popovers scroll inside themselves (rules in `base.css`, for every dialog whether or not it is created with `scrollable`).

### Classic

Paloma's original layout, with large text and labelled buttons. For anyone who prefers clear, roomy controls, and the default.

```
+----------------------------------------------------------------+
| Paloma  [search.....]  [Library][People][Map][Collage][...][A] |  navigation bar
+------------+---------------------------------------------------+
| v Collect. |  +------+  +------+  +------+  +------+           |
|   All      |  |      |  |      |  |      |  |      |           |
|   Starred  |  +------+  +------+  +------+  +------+           |
| v Albums   |  name.jpg  name.jpg  name.jpg  name.jpg           |
|   ...      |                                                   |
| v Folders  |               photo grid                          |
|   ...      |                                                   |
+------------+---------------------------------------------------+
| Selected: 3 photos [] [] []    [Add to album][Export][Print]...|  photo tray
+----------------------------------------------------------------+
```

| Size | Value |
|---|---|
| Text | 1.1rem (small 0.95rem, large 1.5rem) |
| Smallest button | 44 × 44 px |
| Photo card | 220 px wide, with the file name under the thumbnail |
| Photo tray | 80 px high |
| Viewer bars | 64 px thick |
| Sidebar | 280 px wide |
| Corners | 8 px (panels 12 px) |
| Font | The system's interface font (`system-ui`), headings and buttons semibold |

### Compact

Fits much more on the screen: for laptops with small screens and for large libraries. Text and thumbnails are smaller, the views are icon buttons (hover or focus one to see its name), and the whole sidebar folds away to a narrow strip.

```
+----------------------------------------------------------------+
| Paloma [search......]                  [L][P][M][C][Pl][S][A]  |  one thin toolbar
+---------+------------------------------------------------------+
|   [<<]  | +--+ +--+ +--+ +--+ +--+ +--+ +--+ +--+              |
| v Coll. | |  | |  | |  | |  | |  | |  | |  | |  |              |
|   All   | +--+ +--+ +--+ +--+ +--+ +--+ +--+ +--+              |
| v Albums| +--+ +--+ +--+ +--+ +--+ +--+ +--+ +--+   square     |
| v Fold. | |  | |  | |  | |  | |  | |  | |  | |  |   thumbnails |
+---------+------------------------------------------------------+
| 3 photos [] [] []                         [+][x][v][P][C][M]   |  thin tray
+----------------------------------------------------------------+

Sidebar folded:   [>>]
                  [All]
                  [Star]     the shortcuts stay one click away
                  [Recent]
                  [Pin]
```

| Size | Value |
|---|---|
| Text | 0.875rem (small 0.78rem, large 1.15rem) |
| Smallest button | 28 × 28 px (never under 24 × 24 px) |
| Photo card | 140 px square; the file name shows on hover |
| Photo tray | 52 px high |
| Viewer bars | 44 px thick |
| Sidebar | 220 px wide, or a strip of icons when folded |
| Corners | 4 px (panels 6 px) |
| Font | The system's interface font (`system-ui`) |

### Fluid Glass

Built for tablets and touch, in the style of modern touch interfaces. Photos fill the screen edge to edge and scroll under **floating, see-through toolbars** made of frosted glass: the toolbar at the top, the photo tray at the bottom, and the sidebar as a panel you open when you need it. Every button is at least 44 × 44 px, large enough for a fingertip. The current view shows its name in the toolbar; the others are icons (touch and hold, or hover, to see the name).

```
 photos run under the bars, edge to edge
+----------------------------------------------------------------+
|   +--------------------------------------------------------+   |
|   | [F] ( search......... ) [Library] [P][M][C][Pl][S] [A] |   |  floating glass toolbar
|   +--------------------------------------------------------+   |
| +---------+  +------+  +------+  +------+  +------+  +------+  |
| |v Collect|  |      |  |      |  |      |  |      |  |      |  |
| |  All    |  +------+  +------+  +------+  +------+  +------+  |
| |v Albums |  +------+  +------+  +------+  +------+  +------+  |
| |  ...    |  |      |  |      |  |      |  |      |  |      |  |
| +---------+  +------+  +------+  +------+  +------+  +------+  |
|  sidebar panel   +-------------------------------------------+ |
|  (opened by [F]) | 2 photos [] []  [+][x][v][Print][C][Movie]| |  floating glass tray
|                  +-------------------------------------------+ |
+----------------------------------------------------------------+
```

In the photo viewer, the navigation and edit bars become floating glass capsules on the edges you chose in Settings. To take a photo out of the tray, tap its thumbnail.

The glass is the theme's surface color, partly see-through, with the content behind it blurred. It is opaque enough that text on it stays readable over any photo, even pure black or pure white (checked by tests). The glass turns **solid** when:

- the browser cannot blur what is behind it;
- your system asks for reduced transparency (macOS: Accessibility › Display › Reduce transparency);
- the theme is **High Contrast**.

| Size | Value |
|---|---|
| Text | 1.0625rem (small 0.9rem, large 1.4rem) |
| Smallest button | 44 × 44 px |
| Photo card | 200 px square, with large rounded corners |
| Photo tray | 76 px high, floating |
| Viewer bars | 64 px thick, drawn as capsules |
| Sidebar panel | 320 px wide |
| Corners | 14 px (panels 26 px; bars fully rounded) |
| Font | The Apple system font where available (`-apple-system`, SF Pro), otherwise the system's interface font |

## The sidebar

The library's sidebar has three lists: **Collections** (All photos, Starred, Last import, Geotagged), **Albums** and **Folders**. In every skin, click or tap a list's heading to fold it up or open it again; with the keyboard, focus the heading and press Enter or Space. Folding a list only hides its entries: the folder or album you are in stays selected. Paloma remembers which lists are folded, in this browser, and keeps them that way when you change skin.

In **Compact** you can also fold the whole sidebar into a narrow strip with the button at its top, to give the photos more room. The strip keeps the Collections shortcuts as icons and a button to open the sidebar again. This is remembered too.

In **Fluid Glass** the sidebar is a floating panel: open it with the folders button in the toolbar. It closes when you pick a folder or album, or tap outside it.

## Token reference

Every size, font and color is a named **design token**: a CSS custom property `--pal-<name>` on the page's `<html>` element. Skins set sizes and fonts; themes set colors; a skin can also give default colors for tokens a theme does not set (Fluid Glass uses this for its glass tints). Paloma code and stylesheets use only these tokens, never literal colors.

The list of tokens lives in `client/src/appearance/tokens.ts`. A test (`client/src/appearance/docs.test.ts`) fails when this reference and the code disagree, so the tables below are always complete and current.

### Colors

Set by every theme. Values are hex; `#rrggbbaa` has transparency.

| Token | Light | Dark | High Contrast | Used for |
|---|---|---|---|---|
| `--pal-bg` | `#f4f6f8` | `#0f1115` | `#000000` | Page background behind views and the photo grid |
| `--pal-surface` | `#ffffff` | `#171a20` | `#000000` | Panels: sidebar, photo cards, settings |
| `--pal-surface-raised` | `#ffffff` | `#21252d` | `#000000` | Things above panels: dialogs, menus, popovers |
| `--pal-text` | `#1f2328` | `#e8eaed` | `#ffffff` | Normal text |
| `--pal-text-muted` | `#59636e` | `#a6adb8` | `#e6e6e6` | Secondary text: hints, counts, section headings |
| `--pal-border` | `#858e98` | `#6f7887` | `#ffffff` | Borders of controls, cards and panels |
| `--pal-accent` | `#0b5ed7` | `#79aefe` | `#ffff00` | Main buttons, the active item, links |
| `--pal-accent-text` | `#ffffff` | `#0b1220` | `#000000` | Text on the accent color |
| `--pal-selection` | `#0277b5` | `#38bdf8` | `#00ffff` | Frame of selected photos |
| `--pal-star` | `#f59e0b` | `#fbbf24` | `#ffff00` | The star of starred photos |
| `--pal-danger` | `#b42318` | `#f48b82` | `#ff8a8a` | Errors and destructive actions |
| `--pal-danger-text` | `#ffffff` | `#1d0907` | `#000000` | Text on the danger color |
| `--pal-success` | `#137333` | `#6fd296` | `#5cff7a` | Success messages and "go" actions |
| `--pal-success-text` | `#ffffff` | `#04210f` | `#000000` | Text on the success color |
| `--pal-warning` | `#9a5b00` | `#f5c451` | `#ffd400` | Warnings, folder icons, the selection count |
| `--pal-warning-text` | `#ffffff` | `#241800` | `#000000` | Text on the warning color |
| `--pal-info` | `#0b6f86` | `#67d4e8` | `#66e0ff` | Information and secondary actions |
| `--pal-info-text` | `#ffffff` | `#03232a` | `#000000` | Text on the info color |
| `--pal-focus` | `#0b5ed7` | `#8ab4f8` | `#00ffff` | Keyboard focus ring |
| `--pal-chrome-bg` | `#0f172a` | `#090b0f` | `#000000` | Navigation bar and photo tray |
| `--pal-chrome-text` | `#ffffff` | `#f1f3f4` | `#ffffff` | Text and icons on the navigation bar and tray |
| `--pal-chrome-muted` | `#cbd5e1` | `#aab1bb` | `#e6e6e6` | Secondary text on the navigation bar and tray |
| `--pal-chrome-accent` | `#38bdf8` | `#7dd3fc` | `#ffff00` | The Paloma logo, highlights on the navigation bar |
| `--pal-viewer-bg` | `#0b0d10` | `#000000` | `#000000` | Background around a photo in the viewer |
| `--pal-viewer-text` | `#f8fafc` | `#f8fafc` | `#ffffff` | Text and icons on the viewer's bars |
| `--pal-overlay` | `#0000009c` | `#000000b3` | `#000000cc` | Dimming over photos: outside the crop frame, behind badges |
| `--pal-placeholder` | `#e2e8f0` | `#2a2f38` | `#1a1a1a` | Where a thumbnail is still loading |

### Sizes

Set by every skin; each skin's values are in its section above.

| Token | Used for |
|---|---|
| `--pal-font-size` | Normal text |
| `--pal-font-size-small` | Small text: counts, captions, hints |
| `--pal-font-size-large` | Headings and the logo |
| `--pal-icon-size` | Icons in buttons and lists |
| `--pal-control-padding-y` | Vertical padding inside buttons and list items |
| `--pal-control-padding-x` | Horizontal padding inside buttons and list items |
| `--pal-hit-min` | Smallest width and height of anything you can click or tap |
| `--pal-radius` | Corner rounding of buttons, cards and inputs |
| `--pal-radius-large` | Corner rounding of panels, dialogs and floating bars |
| `--pal-gap` | Space between neighbouring controls |
| `--pal-thumb-size` | Width of a photo card in the library grid |
| `--pal-tray-height` | Height of the photo tray |
| `--pal-viewer-bar-size` | Thickness of the viewer's navigation and edit bars |
| `--pal-sidebar-width` | Width of the folder sidebar |

### Fonts

Set by every skin.

| Token | Used for |
|---|---|
| `--pal-font-family` | The typeface of the whole interface |
| `--pal-font-weight-strong` | Weight of headings, active items and button labels |
| `--pal-line-height` | Line height of normal text |

## For developers

Skins and themes are built into the client; there is no way to load them from files or plugins. The code is in `client/src/appearance/`:

| Path | What it is |
|---|---|
| `tokens.ts` | The names of all tokens: the only list, checked against this document by a test |
| `themes/` | One file per theme, and the registry (`index.ts`, `types.ts`) |
| `skins/` | One folder per skin (`index.ts` with its tokens, `components.tsx`, its stylesheet), and the registry |
| `css.ts` | Turns a skin and a theme into the CSS rule that sets every token on `<html>` |
| `runtime.ts` | Applies the chosen skin and theme before the first render and on every change; follows the system for System |
| `base.css` | Styles shared by every skin, and Bootstrap recolored from the tokens |

The behavior every skin shares lives in `client/src/shell/`: the navigation items (`navigation.ts`), the sidebar's lists and the collapsible list component (`sidebar.tsx`), the tray's state and actions (`useTray.tsx`), the photos of the library (`useLibraryPhotos.ts`), the virtualized grid (`VirtualGrid.tsx`) and the square photo card (`SquarePhotoCard.tsx`). The photo viewer's state is `components/viewer/usePhotoViewer.ts`, and its bars are `components/viewer/ViewerChrome.tsx`.

### Adding a theme

1. Copy `client/src/appearance/themes/light.ts` to a new file and give every color token a hex value. A theme holds colors only; its type has no room for anything else.
2. Add the theme's id to `THEME_IDS` in `themes/types.ts` and to `THEMES` in `themes/index.ts`. Settings then offers it.
3. Add its name and description as `settings.themes.<id>.name` and `.description` to every file in `client/src/i18n/locales/`.
4. Add a column named after the theme (its English name) to the **Colors** table above, with its values.
5. Run `npm test`. The tests check that the theme sets exactly the color tokens, in hex, and that text, icons, borders and focus reach the WCAG AA contrast minimums on every surface, also on Fluid Glass. A theme meant to reach AAA gets an entry in `MINIMUMS` in `themes/themes.test.ts`. The documentation test checks your new column.

### Adding a skin

1. Add the skin's id to `SKIN_IDS` in `client/src/appearance/skins/ids.ts`.
2. Create `skins/<id>/index.ts` with the skin's definition: a value for every size and font token, its default colors (any colors only this skin uses, mixed from theme tokens with `color-mix()` so that they follow every theme), the grid's cell size, the viewer bar thickness, and a `load()` that imports its components. Register it in `skins/index.ts`.
3. Create `skins/<id>/components.tsx` exporting `components` with three parts:
   - `AppShell`: the frame around a view. It gets the active view and the content to show, and places the navigation, the sidebar (in the library) and the photo tray.
   - `PhotoGrid`: the library grid. Use `VirtualGrid` with your own card, or `SquarePhotoCard`.
   - `ViewerChrome`: the viewer's bars. Use `ViewerChrome` as it is, or with a class for your look.
4. Put the skin's styles in `skins/<id>/<id>.css`, imported by `components.tsx`, and start every rule with `html[data-skin='<id>']` so it cannot touch another skin.
5. Add the name and description as `settings.skins.<id>.name` and `.description` to every locale file, and a sketch for Settings (`.settings-skin-<id>` rules in `base.css`).
6. Add a section for the skin to this document.

Rules every skin follows; `npm test` renders each skin's frame and checks the first three:

- **Every feature is reachable.** Map over `useNavigationItems()` and `useTray().actions` instead of listing buttons yourself, so a view or action added later shows up in every skin.
- **Icon buttons have names.** A button that shows only an icon has an accessible name and a tooltip in the active language (`IconButton` does both).
- **Sidebar lists collapse.** Render each list of `useSidebarSections()` with `SidebarSection`, so folding works and is remembered the same way everywhere.
- **Skin components only render.** They never fetch data or keep state that matters outside the skin; the shared hooks do that. Switching skins must keep the view, folder, album and selection.
- **Viewer bars follow Settings.** Place them with `ViewerChrome` (or `barLayout()` and `barStyle()`), so the chosen edges apply.
- **Right-to-left works.** Use logical CSS properties (`inset-inline-start`, `margin-inline-end`, `border-inline-end`) and the `flip-rtl` class for arrows, never `left`/`right` for things that follow the reading direction.
- **Tokens only.** Write no literal colors or sizes in components or stylesheets; use `var(--pal-…)`.
- **Big enough to hit.** No button is smaller than `--pal-hit-min`, and never under 24 × 24 px.

