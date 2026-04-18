# Cursor Hack / Factory Agents

Prototype software-factory UI for orchestrating coding agents. The repo contains a TypeScript backend that bridges `pi-coding-agent`/OpenRouter sessions to a React + Phaser pixel-factory frontend over WebSockets.

## Repository layout

```text
.
├── backend/              # WebSocket backend and mission/orchestrator logic
├── frontend/             # React + Vite + Phaser factory UI
├── docs/superpowers/     # Design notes/specs for the orchestrator backend
├── frontend/public/      # Game sprites and tile assets used by Phaser
└── package.json          # Convenience scripts for running both apps
```

The checked-in app source is in `backend/` and `frontend/`. Local agent/runtime folders such as `.pi/`, `.factory/`, `pi-mono/`, and `pixel-agents/` are ignored and should not be committed.

## Prerequisites

- Node.js compatible with the installed Vite/Rolldown toolchain
- npm
- Optional: `OPENROUTER_API_KEY` for real agent execution; without it the backend uses mock mode where supported

## Install

Install dependencies separately for the root scripts, backend, and frontend:

```bash
npm install
npm --prefix backend install
npm --prefix frontend install
```

## Development

Run backend and frontend together from the repo root:

```bash
npm run dev
```

Or run them separately:

```bash
npm run dev:backend
npm run dev:frontend
```

Defaults:

- Backend WebSocket server: `localhost:3001`
- Frontend Vite dev server: printed by Vite, usually `localhost:5173`

## Build and checks

Run both backend and frontend builds:

```bash
npm run build
```

Run frontend linting:

```bash
npm run lint
```

## Backend behavior

The frontend sends mission prompts over WebSocket. The backend starts an orchestrator session, emits agent state updates, and bridges those events into the pixel-factory UI protocol. See `docs/superpowers/specs/2026-04-02-orchestrator-backend-design.md` for the original design notes.
