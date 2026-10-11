## ADDED Requirements

### Requirement: The user a person is
When auth is on and a person is linked with a user, the person's header SHALL show the user's display name and username, and `GET /api/people/:id` SHALL include them. A person without a link SHALL show none.

#### Scenario: Person linked with a user
- **WHEN** the person `Ben Avery` is linked with the user `ben` (display name `Ben`) and someone opens `Ben Avery`
- **THEN** the person's header says that `Ben Avery` is the Paloma user `Ben` (`ben`)
