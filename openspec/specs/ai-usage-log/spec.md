# ai-usage-log Specification

## Purpose

Defines the record kept for every AI model call so that token use and credits can be attributed to a user and a task, how credits are computed from token prices, and who can read the records.

## Requirements

### Requirement: Every model call is logged
Paloma SHALL store a record for each call to an AI model, whether it succeeded or failed. A record SHALL have the time, the id of the queue task, the id of the AI task, the id of the user who started the run, the provider, the model, the tokens per kind, the credits used and whether the call succeeded. A call retried after rate limiting SHALL be a record of its own.

#### Scenario: Successful call
- **WHEN** `ben` runs Tags on one photo and the model reports 1200 prompt tokens and 80 completion tokens
- **THEN** a record exists with the queue task id, the task `tags`, `ben`'s user id, the model, 1200 and 80 tokens, the credits used and success

#### Scenario: Failed call
- **WHEN** a call fails because the key is refused
- **THEN** a record exists with failure, zero tokens and zero credits

### Requirement: Records outlive what they refer to
Usage records SHALL survive restarts and the deletion of the AI task, the provider or the user.

#### Scenario: Task deleted
- **WHEN** an administrator deletes a custom AI task that has records
- **THEN** its records remain

#### Scenario: Provider deleted
- **WHEN** an administrator deletes a provider that has records
- **THEN** its records remain and still show the provider's name

### Requirement: Providers report token usage
A provider SHALL report the tokens a call used per kind, or report none. The bundled OpenAI provider SHALL request usage by sending `"stream_options": {"include_usage": true}` with streamed Chat Completions. When a server refuses that parameter, the provider SHALL retry without it. When no usage is reported, the record SHALL say tokens are unknown and the credits SHALL be 0.

#### Scenario: Usage requested
- **WHEN** a task calls an OpenAI-compatible server
- **THEN** the request is streamed and asks for usage with `stream_options.include_usage`

#### Scenario: Server without usage
- **WHEN** a server answers without usage
- **THEN** the record has unknown tokens and 0 credits, and the photo's result is still saved

### Requirement: Credits are computed from prices
The credits of a call SHALL be the sum over token kinds of the tokens of that kind times the model's price per 1,000,000 tokens for that kind, using the prices at the time of the call. A kind without a price SHALL cost 0. The record SHALL keep the prices used, so a later price change does not alter it.

#### Scenario: Compute credits
- **WHEN** a call used 1,000,000 prompt tokens and 500,000 completion tokens at prices 0.15 and 0.60
- **THEN** the record has 0.45 credits

#### Scenario: Price changed later
- **WHEN** an administrator changes a price after a call
- **THEN** that call's credits are unchanged

#### Scenario: Unpriced model
- **WHEN** a model has no prices set
- **THEN** its calls are recorded with their tokens and 0 credits

### Requirement: Reading the log
`GET /api/ai/usage` SHALL return usage records, newest first, filterable by time range, user, AI task and model, with the totals of tokens and credits. A user SHALL see only their own records; a user with `users.manage` SHALL see everyone's. Records SHALL NOT contain prompts, images or answers.

#### Scenario: Own usage
- **WHEN** `ben` requests the usage
- **THEN** he gets only records of runs he started, with their totals

#### Scenario: Administrator sees all
- **WHEN** an administrator requests the usage filtered by user `ben`
- **THEN** the response has only `ben`'s records and their totals

#### Scenario: No content stored
- **WHEN** a record is read
- **THEN** it has no prompt, image or model answer

### Requirement: Credits in run summaries
When an AI run ends, its summary SHALL say how many credits it used, shown to the same people who see the rest of the summary.

#### Scenario: Run summary
- **WHEN** a run that used 0.12 credits ends
- **THEN** its owner sees `0.12 credits` in the summary
