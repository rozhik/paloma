# Spec Delta

## ADDED Requirements

### Requirement: The library stays usable during a scan
While the server scans or re-indexes folders, on start or because files changed, it SHALL keep answering API requests. Photos indexed so far SHALL be listed, and a request SHALL NOT wait for the scan to finish.

#### Scenario: Browsing during the initial scan
- **WHEN** the server starts with a configured folder of thousands of photos and a client requests `GET /api/photos` before the scan has finished
- **THEN** the server responds without waiting for the scan to end, with the photos indexed so far

#### Scenario: Changing a photo during a scan
- **WHEN** a client stars an already indexed photo while another folder is still being scanned
- **THEN** the request succeeds without waiting for the scan to end, and the photo stays starred after the scan finishes

#### Scenario: Re-applying a large folder's sidecar
- **WHEN** `.paloma.json` of a folder with thousands of photos is edited outside Paloma, and a client requests `GET /api/folders` meanwhile
- **THEN** the server responds to the request while the folder's fields are still being applied
