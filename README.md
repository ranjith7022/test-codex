# Azul 2-Player Room Game

A lightweight Azul-inspired multiplayer game built with Next.js for Vercel Hobby.

## Features

- Create a room and get a 6-character room code.
- Join an existing room as the second player.
- Turn-based tile drafting from factories and center area.
- Auto-polling game state so both players stay in sync.
- Works with Vercel KV in production (recommended for Hobby tier).

## Local development

```bash
npm install
npm run dev
```

Open http://localhost:3000.

> Without KV environment variables, the app falls back to in-memory storage (single local process only).

## Deploy to Vercel (Hobby)

1. Push this repo to GitHub.
2. Import project in Vercel.
3. Add **Vercel KV** from the Storage tab.
4. Ensure these environment variables are present (automatically injected when KV is linked):
   - `KV_URL`
   - `KV_REST_API_URL`
   - `KV_REST_API_TOKEN`
   - `KV_REST_API_READ_ONLY_TOKEN` (optional)
5. Deploy.

## API overview

- `POST /api/rooms` action `create` -> create room.
- `POST /api/rooms` action `join` -> join room with code.
- `POST /api/rooms` action `move` -> make a turn move.
- `GET /api/state?roomCode=XXXXXX` -> poll latest state.
