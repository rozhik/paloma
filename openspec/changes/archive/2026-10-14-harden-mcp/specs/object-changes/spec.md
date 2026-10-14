# Spec Delta

## ADDED Requirements

### Requirement: Text and list values have maximum sizes
A changeset SHALL refuse a value that is longer than its maximum length or has more items than its maximum, and SHALL name the field in the error. Changes are checked as a whole before anything is written, so a refused value changes nothing.

#### Scenario: Maximums per field
- **WHEN** a client reads the changeset schema
- **THEN** photo `caption` allows 2 000 characters; photo `tags` allows 200 tags of 100 characters; photo `albums` and `people` allow 200 items each; photo `edits` allows 100 steps; album `name` and `location` allow 200 characters and `description` 5 000; person `name` and `alias` allow 200 characters, `comment` 5 000; person `links` allow 20 links of 2 000 characters

#### Scenario: Caption too long
- **WHEN** a client updates photo 7 with a caption of 2 001 characters
- **THEN** the server responds 400 with code `invalid_field` and field `caption`, and nothing changes

#### Scenario: Too many tags
- **WHEN** a client updates photo 7 with 201 tags
- **THEN** the server responds 400 with code `invalid_field` and field `tags`, and photo 7's tags are unchanged

#### Scenario: Limit reached exactly
- **WHEN** a client updates photo 7 with a caption of exactly 2 000 characters
- **THEN** the caption is saved
