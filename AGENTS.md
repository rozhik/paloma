# AGENTS.md

Paloma Photo Manager — monorepo: React + Vite client, Node.js/Express + SQLite (Drizzle) server.

## Layout
- `client/` — React 18, Vite, React Bootstrap, Zustand, TanStack Query
- `server/` — Express, better-sqlite3 + drizzle-orm, sharp, ffmpeg
- `shared/types.ts` — types shared by client and server
- `docs/` — project documentation

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
