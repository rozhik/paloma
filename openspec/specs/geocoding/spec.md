# geocoding Specification

## Purpose

Turns addresses into coordinates and coordinates into place names through a configurable online geocoder, so the user can find a place to put photos on, see where a photo was taken in words, find photos by place, and see photos grouped by place.

## Requirements

### Requirement: Geocoder is configured in .env
The geocoder URL SHALL come from `.env`, defaulting to the public OpenStreetMap Nominatim service. When it is set to an empty value, geocoding SHALL be off: the geocoding endpoints SHALL respond 503 with an error code for a disabled geocoder, no geocoder request SHALL be made, and everything else, including the map and setting locations, SHALL keep working.

#### Scenario: Geocoding turned off
- **WHEN** the geocoder URL in `.env` is empty and a client searches for `Lviv`
- **THEN** the server responds 503 with the code for a disabled geocoder and makes no network request

#### Scenario: Map without a geocoder
- **WHEN** geocoding is off and the user opens the map
- **THEN** geotagged photos are shown on the map, and address search and the places panel are not offered

### Requirement: Geocoder is used politely
Only the server SHALL call the geocoder. It SHALL send at most one request per second in total, SHALL identify Paloma in the User-Agent with the contact from `.env` when set, and SHALL keep every answer in a cache that survives restarts, so the same query or place is never requested twice.

#### Scenario: Many photos at once
- **WHEN** 50 photos in 50 different places need place names
- **THEN** the geocoder receives no more than one request per second

#### Scenario: Restart
- **WHEN** a place name was resolved and the server is restarted
- **THEN** the place name is available again without a geocoder request

### Requirement: Search for an address
`GET /api/geo/search` with a non-empty `q` SHALL respond with up to 10 results, each with a display `name`, `lat`, `lon` and `bounds` (`south`, `west`, `north`, `east`), in the language given by `lang`. An empty `q` SHALL be rejected with 400. A geocoder that fails or cannot be reached SHALL give 502 with an error code for a failed geocoder.

#### Scenario: Address found
- **WHEN** a client sends `GET /api/geo/search?q=Yaremche&lang=en`
- **THEN** the response contains a result named with `Yaremche` and coordinates near 48.45, 24.55

#### Scenario: Nothing found
- **WHEN** the geocoder finds nothing for `q`
- **THEN** the response is an empty list

#### Scenario: Offline
- **WHEN** the server has no internet access and a client searches
- **THEN** the server responds 502 with the code for a failed geocoder

### Requirement: Photos have place names
For each photo with a location, the library SHALL get a place name from the geocoder: the city, town or village with its region and country, in the requested UI language, or in the place's own language when the geocoder has no name in it. Photos whose coordinates round to the same 0.01° SHALL share one lookup and one place.

#### Scenario: Place name in English
- **WHEN** a photo is at 48.4500, 24.5500 and the UI language is English
- **THEN** its place name is like `Yaremche, Ivano-Frankivsk Oblast, Ukraine`

#### Scenario: Nearby photos
- **WHEN** two photos are 200 m apart within the same 0.01° cell
- **THEN** they have the same place name and only one geocoder request was made for them

### Requirement: Place names are resolved in the background
`GET /api/photos` with `lang` SHALL return each photo's `place` in that language, or `null` until it is resolved. Missing place names for the photos in the library SHALL be resolved in the background without blocking responses, and SHALL appear in later responses without a restart. A failed lookup SHALL be retried later.

#### Scenario: Newly geotagged photo
- **WHEN** the user sets the location of a photo to a place not looked up before
- **THEN** the response shows `"place": null`, and a later `GET /api/photos` shows its place name

#### Scenario: Geocoder temporarily down
- **WHEN** a lookup fails because the geocoder is unreachable and the geocoder comes back later
- **THEN** the photo gets its place name without a restart

### Requirement: Photos grouped by place
`GET /api/geo/places` with `lang` and the same filters as `GET /api/photos` SHALL respond with the places of the matching photos that have a location, each with its `name`, `count` of photos and `bounds` of their locations, sorted by count, plus `pending`: the number of matching photos whose place is not resolved yet.

#### Scenario: Two places
- **WHEN** the selected album has three photos in Lviv, one in Kyiv and one with an unresolved place
- **THEN** the response lists Lviv with count 3, then Kyiv with count 1, and `pending` is 1

### Requirement: Search finds photos by place
The library search SHALL match a photo when the search text is found, ignoring letter case, in its file name or in any of its resolved place names.

#### Scenario: Search a city
- **WHEN** `a.jpg` has the place name `Yaremche, Ivano-Frankivsk Oblast, Ukraine` and the user searches for `yaremche`
- **THEN** the grid includes `a.jpg`

### Requirement: Place name shown on the photo
In the photo grid, the location pin of a geotagged photo SHALL show its place name as a tooltip, or the coordinates while the place is unknown. When exactly one photo is selected, the tray SHALL show its place name or coordinates.

#### Scenario: Hover the pin
- **WHEN** the user points at the pin of a photo whose place is `Lviv, Lviv Oblast, Ukraine`
- **THEN** the tooltip shows `Lviv, Lviv Oblast, Ukraine`

#### Scenario: Place not resolved yet
- **WHEN** the photo's place is not resolved
- **THEN** the tooltip shows its coordinates
