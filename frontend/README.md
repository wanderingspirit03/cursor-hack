# Factory Agents Frontend

React + TypeScript + Vite frontend for the Cursor Hack / Factory Agents prototype. The UI renders a Phaser-powered pixel factory and receives mission/agent updates from the backend over WebSocket.

## Scripts

```bash
npm run dev      # start Vite dev server
npm run build    # type-check and build production assets
npm run lint     # run ESLint
npm run preview  # preview production build locally
```

## Assets

Game assets live under `public/`:

- `public/tiles/` — isometric factory tiles
- `public/characters/` — agent spritesheets
- `public/factpj.png` — factory background/building image

Phaser loads these assets from `src/game/scenes/BootScene.ts`.

## Backend connection

The frontend talks to the backend WebSocket server started from `../backend`. By default the backend listens on port `3001`.
