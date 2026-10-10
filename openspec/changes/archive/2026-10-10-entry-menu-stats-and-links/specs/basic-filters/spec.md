## MODIFIED Requirements

### Requirement: Bundled filter plugins
Paloma SHALL ship two bundled plugins with names and descriptions in every supported UI language: `basic-transforms`, providing `crop64`, `rotate`, `flip` and `straighten` in group `basic`, and `basic-effects`, providing `brightness` and `contrast` in group `tuning` and `bw` and `sepia` in group `effects`.

#### Scenario: Fresh install
- **WHEN** Paloma starts for the first time
- **THEN** the Plugins section of Settings lists `basic-transforms` and `basic-effects` as bundled and on

#### Scenario: Effects switched off
- **WHEN** the user switches off `basic-effects`
- **THEN** the editor still offers crop, rotate, flip and straighten, but not brightness, contrast, black & white or sepia
