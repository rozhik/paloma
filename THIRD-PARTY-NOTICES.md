# Third-party notices

Paloma's own code is under the [MIT License](LICENSE). It uses the components below, each under its own
license. Versions are those installed when this file was written (direct runtime dependencies only);
transitive dependencies carry their own licenses in `node_modules`. Regenerate this list when dependencies change.

## Needs attention before distributing Paloma

| Component | License | Why it matters |
| :--- | :--- | :--- |
| `ffmpeg-static` 5.3.0 | GPL-3.0-or-later | Ships an FFmpeg binary, built with GPL parts (libx264). Installing it from npm is fine; **distributing an app bundle with it** (Electron, Docker image, installer) means complying with the GPL for that binary (license text, source offer). Alternative: require a system FFmpeg. |
| `react-leaflet` 4.2.1 | Hippocratic-2.1 | An "ethical source" license: not OSI-approved, with use restrictions (human-rights clauses). It is not MIT-compatible in the usual sense. Consider replacing it with plain `leaflet` calls or checking whether it suits your use. |
| `sharp` 0.33.5 | Apache-2.0 | Its prebuilt libvips binaries are LGPL-3.0; keep them dynamically linked and keep their notices when bundling. |

## Runtime dependencies

| Package | Version | License |
| :--- | :--- | :--- |
| @tanstack/react-query | 5.104.0 | MIT |
| @vladmandic/face-api | 1.7.15 | MIT (face models are not in this repo; check their license before adding them) |
| better-sqlite3 | 13.0.3 | MIT |
| bootstrap | 5.3.8 | MIT |
| bootstrap-icons | 1.13.1 | MIT |
| chokidar | 3.6.0 | MIT |
| cors | 2.8.6 | MIT |
| dotenv | 18.0.5 | BSD-2-Clause |
| drizzle-orm | 0.30.10 | Apache-2.0 |
| exif-reader | 2.0.3 | MIT |
| express | 4.22.3 | MIT |
| fabric | 5.5.2 | MIT |
| fluent-ffmpeg | 2.1.3 | MIT |
| i18next | 26.4.2 | MIT |
| leaflet | 1.9.4 | BSD-2-Clause |
| leaflet.markercluster | 1.5.3 | MIT |
| lucide-react | 0.350.0 | ISC |
| react, react-dom | 18.3.1 | MIT |
| react-bootstrap | 2.10.10 | MIT |
| react-cropper | 2.3.3 | MIT |
| react-i18next | 17.0.15 | MIT |
| react-virtualized-auto-sizer | 1.0.26 | MIT |
| react-window | 1.8.11 | MIT |
| xxhashjs | 0.2.2 | MIT |
| zustand | 4.5.7 | MIT |

## Bundled assets

- **Plugin icons** (`plugins/*/icons/`): from [Lucide](https://lucide.dev), ISC License; Copyright (c) Cole Bemis 2013-2022 (Feather, MIT) and Lucide Contributors 2022. The license text is in `plugins/*/icons/LICENSE`.

## Map data and services

- Map tiles and geocoding default to OpenStreetMap services. Map data © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright), ODbL. The public servers have usage policies and are not meant for heavy or commercial use; set `PALOMA_MAP_TILE_URL` and `PALOMA_GEOCODER_URL` to your own or a commercial provider for that.

## Trademarks

Picasa and Google are trademarks of Google LLC. Paloma is an independent project, not affiliated with or endorsed by Google. The documents in `docs/picassa/` describe the original program for reference only.
