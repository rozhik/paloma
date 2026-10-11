# AGENTS.md

Paloma Photo Manager — monorepo: React + Vite client, Node.js/Express + SQLite (Drizzle) server.

## Layout
- `client/` — React 18, Vite, React Bootstrap, Zustand, TanStack Query
- `server/` — Express, better-sqlite3 + drizzle-orm, sharp, ffmpeg
- `shared/types.ts` — types shared by client and server
- `docs/` — project documentation; skins, themes and design tokens: [`docs/skins-and-themes.md`](docs/skins-and-themes.md); complexity levels and the Child PIN: [`docs/complexity-levels.md`](docs/complexity-levels.md); async queries, transactions, batching and file access on the server: [`docs/server-data-layer.md`](docs/server-data-layer.md); users, roles, library access, quotas, API tokens and login plugins: [`docs/users-and-auth.md`](docs/users-and-auth.md); AI providers, tasks and runs: [`docs/ai.md`](docs/ai.md)

## Setup
```sh
cp .env.example .env
npm install && npm --prefix server install && npm --prefix client install
```

## Commands (from repo root)
- `npm run dev` — server + client together
- `npm run build` — build server and client
- `npm test` — run vitest (tests live next to sources as `*.test.ts`)

## Conventions
- TypeScript everywhere; run `npm run build` to type-check before finishing.
- Configuration comes from `.env` (see `.env.example`); don't hardcode ports or paths.
- Edit `shared/types.ts`, not the generated `shared/types.js`.

## OpenSpec
Features are planned with OpenSpec (OPSX): `/opsx:explore` → `/opsx:propose` → `/opsx:apply` → `/opsx:archive`. Project rules for artifacts are in `openspec/config.yaml`.
- `openspec/specs/` — the only source of confirmed behavior; it changes only by archiving a change.
- `docs/paloma/`, `docs/picassa/08-paloma-json-format.md` — unconfirmed proposals, not requirements.
- `docs/picassa/01-07` — reference on the original Google Picasa.
- The current code is a demo MVP: reusable as a starting point, but not a contract.
