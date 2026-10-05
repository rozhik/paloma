# Spec Delta

## MODIFIED Requirements

### Requirement: Supported Picasa fields are mapped
From a file section of the Picasa `.ini`, Paloma SHALL map: `star=yes` to star, `hidden=yes` to hidden, `caption` to caption, `keywords` (comma-separated, empty items dropped) to keywords, `albums` (comma-separated tokens, empty items and duplicates dropped) to albums, `geotag` (`lat,lon` in decimal degrees, within range) to geotag, and `filters` to edits as described in "Picasa filters become edits". Every other key of a file section, a `geotag` that is not two numbers in range, and every section other than file sections and `[.album:*]` sections, SHALL be ignored. A section SHALL match a file in the folder ignoring letter case. The entry is keyed by the file's name on disk, or by the section name if no file matches.

#### Scenario: Keywords and caption
- **WHEN** `.picasa.ini` has `[a.jpg]` with `caption= Sunrise ` and `keywords=mountains,,dawn`
- **THEN** `a.jpg` has caption ` Sunrise ` (spaces kept) and keywords `mountains` and `dawn`

#### Scenario: Section name in a different case
- **WHEN** `.picasa.ini` has `[IMG_0042.JPG]` with `star=yes` and the file on disk is `img_0042.jpg`
- **THEN** `img_0042.jpg` appears starred

#### Scenario: Album membership
- **WHEN** `.picasa.ini` has `[a.jpg]` with `albums=c9ea,7f01`
- **THEN** `a.jpg` is in the albums `c9ea` and `7f01`

#### Scenario: Picasa geotag
- **WHEN** `.picasa.ini` has `[a.jpg]` with `geotag=33.770556,-84.293055`, and the user later stars another photo in the folder
- **THEN** `a.jpg` has the location 33.770556, -84.293055 before and after the change, and `.paloma.json` contains `"geotag": { "lat": 33.770556, "lon": -84.293055 }` for `a.jpg`

#### Scenario: Malformed Picasa geotag
- **WHEN** `.picasa.ini` has `[a.jpg]` with `geotag=north,east` and `a.jpg` has EXIF GPS
- **THEN** `a.jpg` has the EXIF location

#### Scenario: Unsupported keys
- **WHEN** a section has `rotate=rotate(1)`, `redo=bw=1;` and `backuphash=52410`
- **THEN** none of them affect the library or appear in `.paloma.json`

## ADDED Requirements

### Requirement: Picasa filters become edits
Paloma SHALL turn a section's `filters=` (`name=1,param,…;` items, in order) into an edit chain with one step per item, keeping their order and repeats, with `"enabled": false` for an item whose first parameter is `0`. `crop64` SHALL become a `crop64` step whose `rect` is the `rect64` hex (zero-padded to 16 digits) split into four 16-bit words divided by 65535. `bw` and `sepia` SHALL become steps of those filters. Other items SHALL keep their name as `filter` and their parameters: as named fields for `tilt` (`angle`, `scale`), `fill`, `unsharp2`, `sat`, `Boost` (`amount`), `finetune2` (`fillLight`, `highlights`, `shadows`, `neutral`, `temperature`) and `Vignette` (`radius`, `strength`, `fade`, `color`), and as `params`, a list of the raw strings, for any other. Items that cannot be read SHALL be dropped.

#### Scenario: Crop and effects
- **WHEN** `.picasa.ini` has `[a.jpg]` with `filters=crop64=1,33101d68ffffffff;autolight=1;bw=1;`
- **THEN** `a.jpg` has the edits `[{"filter": "crop64", "rect": {"left": 0.199466, "top": 0.11487, "right": 1, "bottom": 1}}, {"filter": "autolight"}, {"filter": "bw"}]`, shown cropped and in black & white

#### Scenario: Short rect64 and unknown filter
- **WHEN** a section has `filters=crop64=1,6911ae3ce91ecbd;PicnikGrain=1,0.350000,0;`
- **THEN** the `crop64` rect is read from `06911ae3ce91ecbd`, and the second step is `{"filter": "PicnikGrain", "params": ["0.350000", "0"]}`

#### Scenario: Picasa edits are undoable
- **WHEN** a Picasa folder's `a.jpg` has `filters=crop64=1,33101d68ffffffff;sepia=1;` and the user undoes in the viewer
- **THEN** `.paloma.json` is created with the import, and the entry for `a.jpg` has the edits with only the `crop64` step and `modified`
