# localization Specification

## Purpose

Defines which languages the Paloma UI is available in, how the language is chosen, remembered and applied (texts, plurals, dates, numbers, text direction), and how API errors are reported so the UI can show them in the user's language.

## Requirements

### Requirement: Supported languages
The UI SHALL be available in exactly these languages: English (`en`), Chinese Simplified (`zh-Hans`), Spanish (`es`), Arabic (`ar`), Portuguese Brazil (`pt-BR`), French (`fr`), German (`de`), Japanese (`ja`), Russian (`ru`), Indonesian (`id`) and Ukrainian (`uk`). Every UI text, including labels, buttons, placeholders, tooltips, empty-state hints, confirmations and error messages, SHALL be shown in the active language.

#### Scenario: All texts translated
- **WHEN** the active language is German
- **THEN** the top bar, sidebar, photo tray, album dialogs and every modal show German texts and no Ukrainian ones

#### Scenario: Page title
- **WHEN** the active language is French
- **THEN** the browser tab title is in French

### Requirement: Initial language follows the browser
When no language has been chosen, Paloma SHALL use the first entry in the browser's preferred languages that matches a supported language, comparing by primary language subtag. `zh` SHALL match Chinese Simplified, and `pt` SHALL match Portuguese Brazil. If no entry matches, the UI SHALL be in English.

#### Scenario: Supported regional variant
- **WHEN** no language was chosen and the browser prefers `es-MX`, then `en-US`
- **THEN** the UI is in Spanish

#### Scenario: First match wins over later ones
- **WHEN** no language was chosen and the browser prefers `nl-NL`, then `uk-UA`, then `en`
- **THEN** the UI is in Ukrainian

#### Scenario: No supported language
- **WHEN** no language was chosen and the browser prefers only `nl-NL` and `sv`
- **THEN** the UI is in English

### Requirement: User can switch the language
The top bar SHALL offer a language switcher that lists every supported language by its own name (for example `Deutsch`, `日本語`, `Українська`) and marks the active one. Choosing a language SHALL switch the whole UI at once without reloading the page or losing the current view, selection or open dialog.

#### Scenario: Switch while photos are selected
- **WHEN** the UI is in English, two photos are in the tray, and the user chooses `Українська`
- **THEN** the UI is in Ukrainian and the same two photos are still in the tray

#### Scenario: Native names
- **WHEN** the user opens the language switcher in any language
- **THEN** it lists `English`, `简体中文`, `Español`, `العربية`, `Português (Brasil)`, `Français`, `Deutsch`, `日本語`, `Русский`, `Bahasa Indonesia` and `Українська`

### Requirement: Chosen language is remembered
A language chosen in the switcher SHALL be used on later loads of the app in the same browser, instead of the browser's preferred languages. A remembered value that is not a supported language SHALL be ignored.

#### Scenario: Reload after choosing
- **WHEN** the browser prefers English, the user chooses Japanese and reloads the page
- **THEN** the UI is in Japanese

#### Scenario: Unknown remembered value
- **WHEN** the remembered language is `xx` and the browser prefers French
- **THEN** the UI is in French

### Requirement: Missing translations fall back to English
If a text has no translation in the active language, the UI SHALL show its English text and SHALL NOT show an internal key or an empty string.

#### Scenario: Untranslated text
- **WHEN** the active language is Indonesian and one button's text has no Indonesian translation
- **THEN** that button shows its English text and every other text is in Indonesian

### Requirement: Counts use the language's plural rules
A text that includes a count SHALL use the grammatical plural form of the active language for that count.

#### Scenario: Ukrainian plural forms
- **WHEN** the active language is Ukrainian and the tray holds 1, 3 or 5 photos
- **THEN** the count reads `1 фотографія`, `3 фотографії` and `5 фотографій`

#### Scenario: English plural forms
- **WHEN** the active language is English and the tray holds 1 or 2 photos
- **THEN** the count reads `1 photo` and `2 photos`

### Requirement: Dates and numbers follow the language
Wherever the UI shows a date, time or number, it SHALL format it using the conventions of the active language.

#### Scenario: Large count in German
- **WHEN** the active language is German and an album has 1234 photos
- **THEN** its photo count is shown as `1.234`

#### Scenario: Large count in English
- **WHEN** the active language is English and an album has 1234 photos
- **THEN** its photo count is shown as `1,234`

### Requirement: Right-to-left languages use a mirrored layout
When the active language is Arabic, the document SHALL have `dir="rtl"`, and the layout SHALL be mirrored: text is right-aligned, the sidebar is on the right, and directional spacing and icons are mirrored. For every other supported language the document SHALL have `dir="ltr"`. The document's `lang` attribute SHALL always be the active language's tag.

#### Scenario: Switch to Arabic
- **WHEN** the user chooses `العربية`
- **THEN** the document has `lang="ar"` and `dir="rtl"`, and the sidebar is on the right

#### Scenario: Switch back from Arabic
- **WHEN** the active language is Arabic and the user chooses English
- **THEN** the document has `lang="en"` and `dir="ltr"`, and the sidebar is on the left

### Requirement: User content is not translated
Album names, descriptions and locations, captions, keywords, folder paths and file names SHALL be shown exactly as stored, whatever the active language.

#### Scenario: Album name in another language
- **WHEN** the active language is English and an album is named `Птахи`
- **THEN** the sidebar shows `Птахи`

### Requirement: API errors carry a stable code
Every API error response SHALL be a JSON object with an English `error` text, a `code` string from a fixed set of error codes, and, when the message refers to specific values, a `params` object holding them. Existing status codes and fields such as `failedFolders` SHALL stay unchanged. Server logs SHALL stay in English.

#### Scenario: Album name missing
- **WHEN** a client sends `POST /api/albums` with an empty `name`
- **THEN** the server responds 400 with a `code` identifying a missing album name and an English `error`

#### Scenario: Unreadable sidecar
- **WHEN** an album change is rejected because `/photos/b/.paloma.json` is unreadable
- **THEN** the server responds 409 with a `code` identifying an unreadable sidecar, `params` naming `/photos/b/.paloma.json`, and `failedFolders` containing `/photos/b`

### Requirement: UI shows API errors in the active language
When a request fails, the UI SHALL show the translated message for the response's `code`, filling in its `params`. If the code is missing or unknown to the client, the UI SHALL show the response's `error` text. If the response has no usable body, the UI SHALL show a translated generic failure message with the HTTP status.

#### Scenario: Known code
- **WHEN** the active language is Spanish and creating an album fails with the code for a missing album name
- **THEN** the UI shows the Spanish message for that error

#### Scenario: Unknown code
- **WHEN** a response has `code` `"something_new"` and `error` `"Disk is full"`
- **THEN** the UI shows `Disk is full`

#### Scenario: No body
- **WHEN** the active language is English and a request fails with status 502 and no JSON body
- **THEN** the UI shows a generic English failure message that includes `502`
