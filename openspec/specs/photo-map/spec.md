# photo-map Specification

## Purpose

Defines the map view: the geotagged photos of the current library selection on a map, grouped into clusters and by place, and placing selected photos on the map or removing their location.

## Requirements

### Requirement: Map shows the photos of the current selection
The map view SHALL show every photo with a location that matches the current library selection (folder, album, collection and search text), not only the first ones, as markers grouped into clusters with photo counts. On opening it SHALL fit all shown photos. Without such photos it SHALL say there are no geotagged photos here.

#### Scenario: Album on the map
- **WHEN** the user opens album `Trip` with five photos, three of them geotagged, and switches to the map
- **THEN** the map shows exactly those three photos, and the view contains all three

#### Scenario: Many photos in one town
- **WHEN** 40 photos are in the same town and the map is zoomed out
- **THEN** they appear as one cluster labelled 40

#### Scenario: Nothing geotagged
- **WHEN** no photo in the selected folder has a location
- **THEN** the map says there are no geotagged photos here

### Requirement: Map loads only configured resources
Map tiles SHALL be loaded from the tile URL in `.env`, defaulting to OpenStreetMap, with its attribution shown on the map. Markers and all other map resources SHALL be served by Paloma itself.

#### Scenario: Custom tile server
- **WHEN** `.env` sets the tile URL to another server
- **THEN** the map loads its tiles from that server and loads nothing from other third-party hosts

### Requirement: Open photos from the map
Clicking a marker, or a cluster that cannot be split further, SHALL show thumbnails of its photos. Clicking a thumbnail SHALL add the photo to the selection. Clicking a cluster that can be split SHALL zoom into it.

#### Scenario: Select from a marker
- **WHEN** the user clicks a marker and then a thumbnail in it
- **THEN** that photo appears in the tray

### Requirement: Places panel
When geocoding is on, the map view SHALL show a panel listing the places of the shown photos with their counts, as given by `GET /api/geo/places`, in the active UI language, and how many are still being resolved. Clicking a place SHALL fit the map to its photos.

#### Scenario: Zoom to a place
- **WHEN** the panel lists `Lviv` with 3 photos and the user clicks it
- **THEN** the map shows those 3 photos fitted to the view

#### Scenario: Places still resolving
- **WHEN** two shown photos have no place name yet
- **THEN** the panel says two photos are still being resolved, and updates when they are

### Requirement: Place selected photos on the map
With photos selected, the map view SHALL let the user set their location by choosing "Set location" and clicking a point on the map, or by dragging a photo from the tray onto the map. When some of them already have a location, the UI SHALL ask for confirmation before replacing it. The new markers SHALL appear without reloading the page.

#### Scenario: Click to place
- **WHEN** the user selects two photos without a location, chooses "Set location" and clicks on Odesa
- **THEN** both photos get that location and appear on the map at Odesa

#### Scenario: Drag a photo
- **WHEN** the user drags a photo from the tray onto a point on the map
- **THEN** that photo gets the location of the point

#### Scenario: Replace needs confirmation
- **WHEN** one of the selected photos has a location and the user cancels the confirmation
- **THEN** no location changes

### Requirement: Place photos at a found address
When geocoding is on, the map view SHALL offer an address search. Choosing a result SHALL move the map to it and mark it; with photos selected, the user SHALL be able to set their location to that result.

#### Scenario: Search and place
- **WHEN** the user selects a photo, searches for `Yaremche`, chooses the first result and chooses "Place selected photos here"
- **THEN** the photo gets the result's location and appears on the map there

### Requirement: Remove the location of selected photos
The map view and the tray SHALL offer "Remove location" for selected photos that have a location. It SHALL ask for confirmation, then clear their location.

#### Scenario: Remove after confirmation
- **WHEN** the user selects a geotagged photo, chooses "Remove location" and confirms
- **THEN** the photo disappears from the map and its pin disappears from the grid

### Requirement: Failed map actions leave the shown data unchanged
When setting or removing a location, searching an address or loading places fails, the UI SHALL show the error in the active language and keep the map and grid as they were.

#### Scenario: Read-only folder
- **WHEN** the user places a photo from a read-only folder on the map
- **THEN** an error is shown and the photo's marker and pin stay as before
