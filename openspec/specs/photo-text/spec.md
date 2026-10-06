# photo-text Specification

## Purpose

Defines a photo's description and tags: where they come from (the folder's `.paloma.json`, the Picasa `.ini`, the text embedded in the photo file), how the user edits them for one photo or many, and how photos are browsed by tag.

## Requirements

### Requirement: Description and tags are the caption and keywords
A photo's description SHALL be its `caption` field and its tags SHALL be its `keywords` field, as stored in the folder's sidecar. The UI SHALL call them "Description" and "Tags" in the active language, and the API SHALL keep the names `caption` and `keywords`.

#### Scenario: Caption shown as the description
- **WHEN** the sidecar entry for `a.jpg` has `"caption": "Sunrise"` and `"keywords": ["dawn", "hills"]`
- **THEN** the Info panel of `a.jpg` shows the description `Sunrise` and the tags `dawn` and `hills`

### Requirement: Embedded text is used when the folder files say nothing
When the sidecar entry has no `caption` key (or, while the folder has no `.paloma.json`, its Picasa `.ini` section has no caption), the description SHALL be the first non-blank value of: XMP `dc:description`, IPTC Caption/Abstract, EXIF ImageDescription, EXIF XPComment. Tags SHALL likewise be the first non-empty list of: XMP `dc:subject`, IPTC Keywords, EXIF XPKeywords (split at `;`).

#### Scenario: Description from IPTC
- **WHEN** `a.jpg` has the IPTC caption `Market day` and no `caption` in `.paloma.json` or `.picasa.ini`
- **THEN** `a.jpg` has the description `Market day`

#### Scenario: Tags from XMP
- **WHEN** `a.jpg` has XMP `dc:subject` `bridge`, `river` and IPTC Keywords `old`, and no `keywords` in the folder files
- **THEN** `a.jpg` has the tags `bridge` and `river`

#### Scenario: Sidecar wins
- **WHEN** `a.jpg` has the IPTC caption `Market day` and its sidecar entry has `"caption": "Lviv market"`
- **THEN** `a.jpg` has the description `Lviv market`

#### Scenario: Picasa ini wins over the file
- **WHEN** a folder has no `.paloma.json`, its `.picasa.ini` gives `a.jpg` `keywords=trip`, and `a.jpg` has IPTC Keywords `old`
- **THEN** `a.jpg` has the tag `trip` only

### Requirement: Camera placeholder text is not a description
An embedded description that is blank, or is exactly one of the texts cameras write by default (`OLYMPUS DIGITAL CAMERA`, `SONY DSC`, `DIGITAL CAMERA`, `KONICA MINOLTA DIGITAL CAMERA`, `Default`), ignoring surrounding spaces, SHALL be treated as absent.

#### Scenario: Olympus default
- **WHEN** `a.jpg` has EXIF ImageDescription `OLYMPUS DIGITAL CAMERA          ` and no other description
- **THEN** `a.jpg` has no description

### Requirement: Removing embedded text is stored in the sidecar
When the user clears the description of a photo whose file has an embedded description, Paloma SHALL write `"caption": ""` to its entry, and the photo SHALL have no description. When the user removes all tags of a photo whose file has embedded tags, Paloma SHALL write `"keywords": []`. Without embedded text, clearing SHALL remove the key.

#### Scenario: Clear an embedded description
- **WHEN** `a.jpg` has the IPTC caption `Market day` and the user clears its description
- **THEN** its entry has `"caption": ""`, `a.jpg` has no description, and the bytes of `a.jpg` are unchanged

#### Scenario: Clear a description set in Paloma
- **WHEN** `a.jpg` has no embedded description, its entry has `"caption": "Sunrise"`, and the user clears it
- **THEN** its entry has no `caption` key

#### Scenario: Remove the last embedded tag
- **WHEN** `a.jpg` has the embedded tag `old` only and the user removes it
- **THEN** its entry has `"keywords": []` and `a.jpg` has no tags

### Requirement: Photo files are never changed for text
Changing a description or tags SHALL change only the folder's `.paloma.json`. Paloma SHALL NOT write XMP, IPTC, EXIF or any other data into photo files.

#### Scenario: Tag a JPEG
- **WHEN** the user adds the tag `river` to `a.jpg`
- **THEN** the bytes and modification time of `a.jpg` are unchanged

### Requirement: Tags are compared ignoring letter case
Two tags SHALL be the same tag when they are equal after Unicode lowercasing. A photo SHALL NOT have the same tag twice: when tags are saved, later duplicates SHALL be dropped, keeping the first spelling and order. Tags SHALL be saved exactly as typed otherwise, without trimming.

#### Scenario: Duplicate in another case
- **WHEN** a client sets the keywords of photo 7 to `["Київ", "київ", "Lviv"]`
- **THEN** photo 7 has the tags `Київ` and `Lviv`

### Requirement: Tag list
`GET /api/tags` SHALL return every tag of at least one photo that is not hidden, with `name` and `photoCount` (the number of such photos that have it), sorted by name ignoring case. A tag spelled differently on different photos SHALL be listed once, under the spelling used by the most photos, and on a tie the spelling that sorts first by code points.

#### Scenario: Two spellings
- **WHEN** two photos have the tag `Dawn` and one has `dawn`
- **THEN** `GET /api/tags` returns one entry `{"name": "Dawn", "photoCount": 3}`

#### Scenario: Only on a hidden photo
- **WHEN** the tag `secret` is only on a hidden photo
- **THEN** `GET /api/tags` does not return `secret`

### Requirement: Photos of a tag
`GET /api/photos?tag=<name>` SHALL return the photos that have that tag, ignoring letter case, with the same ordering and hidden-photo rules as other photo lists. It SHALL combine with the other photo-list filters.

#### Scenario: Tag filter
- **WHEN** a client sends `GET /api/photos?tag=DAWN` and three photos have the tag `Dawn` or `dawn`
- **THEN** the response contains exactly those three photos

### Requirement: Tags in the sidebar
The library sidebar SHALL have a "Tags" list, after the album list and before the folder list, showing the entries of `GET /api/tags` with their photo counts. Choosing a tag SHALL show its photos in the grid, with the tag's name and photo count above them, and SHALL replace any chosen folder or album. Without tags the list SHALL say there are no tags yet. The list SHALL be collapsible like the other sidebar lists.

#### Scenario: Open a tag
- **WHEN** the user chooses the tag `dawn` in the sidebar
- **THEN** the grid shows only photos tagged `dawn`, and the header shows `dawn` and the count

#### Scenario: Counts follow edits
- **WHEN** the user adds the tag `dawn` to one more photo
- **THEN** the sidebar count of `dawn` grows by one without a reload

### Requirement: Add or remove tags of many photos
`POST /api/photos/keywords` with `photoIds` (non-empty array of photo ids) and at least one non-empty `add` or `remove` array of strings SHALL add each `add` tag that a photo does not yet have to the end of its tags, and remove each `remove` tag, ignoring case, then respond with the updated photos. It SHALL start from each photo's current tags, including embedded ones. Validation and folder-by-folder saving SHALL follow the bulk location change.

#### Scenario: Tag photos from two folders
- **WHEN** a client sends `photoIds` of `/photos/a/1.jpg` (tags `old`, embedded) and `/photos/b/2.jpg` (no tags) with `{"add": ["trip"]}`
- **THEN** `1.jpg` has the tags `old`, `trip` and `2.jpg` has `trip`, and both sidecar entries hold those `keywords`

#### Scenario: Tag already present
- **WHEN** a photo has the tag `Trip` and a client adds `trip` to it
- **THEN** the photo's tags are unchanged

#### Scenario: Nothing to do
- **WHEN** a client sends `{"photoIds": [7], "add": []}`
- **THEN** the server responds 400 and nothing changes

#### Scenario: Unknown photo
- **WHEN** `photoIds` contains an id that is not in the library
- **THEN** the server responds 404 and nothing changes

### Requirement: Add tags to the selection
With photos selected, the tray SHALL offer "Add tags", which opens a dialog where the user enters one or more tags as chips, with suggestions from the tag list, and confirms. Confirming SHALL add the tags to every selected photo and keep the selection. A failed request SHALL show its error and leave the shown data unchanged.

#### Scenario: Tag three photos
- **WHEN** the user selects three photos, chooses "Add tags", enters `birds` and confirms
- **THEN** all three photos have the tag `birds`, the sidebar lists `birds` with at least 3 photos, and the three photos are still selected

#### Scenario: Suggestion
- **WHEN** the library has the tag `Birds of prey` and the user types `bir` in the dialog
- **THEN** `Birds of prey` is offered as a suggestion

### Requirement: Remove the open tag from the selection
While a tag is chosen in the sidebar and photos are selected, the tray SHALL offer "Remove tag", which removes that tag, ignoring case, from every selected photo without asking for confirmation, then clears the selection; the photos leave the tag's grid. While no tag is chosen (a folder, an album, a collection or all photos is shown), the tray SHALL NOT offer "Remove tag". A failed request SHALL show its error and leave the shown data and the selection unchanged.

#### Scenario: Remove a tag from two of three photos
- **WHEN** the tag `birds` is open with three photos, the user selects two of them and chooses "Remove tag"
- **THEN** those two photos no longer have `birds`, the grid shows one photo, the sidebar count of `birds` is 1, and the selection is empty

#### Scenario: Different spelling on a photo
- **WHEN** the tag `Birds` is open and a selected photo has the tag `birds`
- **THEN** "Remove tag" removes `birds` from that photo

#### Scenario: No button outside a tag
- **WHEN** the user opens the album `Trip` and selects two photos that have tags
- **THEN** the tray does not offer "Remove tag"

#### Scenario: Request fails
- **WHEN** a selected photo's folder has a `.paloma.json` that is not valid JSON and the user chooses "Remove tag"
- **THEN** an error is shown, no photo loses the tag, and the selection is unchanged

### Requirement: Text follows the folder files and the photo content
Description and tags SHALL be recomputed whenever the folder's `.paloma.json` or Picasa `.ini` changes and whenever the photo is re-indexed, without a restart. A description or tags from the sidecar SHALL survive a change of the photo's content; embedded values SHALL follow it.

#### Scenario: Embedded caption changed in another program
- **WHEN** `a.jpg` has no `caption` in the folder files and another program changes its IPTC caption to `Bridge`
- **THEN** `a.jpg` has the description `Bridge` without a restart

#### Scenario: Library rebuilt from disk
- **WHEN** the library database is deleted and the server starts with a sidecar giving `a.jpg` `"keywords": []` and `a.jpg` has embedded tags
- **THEN** `a.jpg` has no tags
