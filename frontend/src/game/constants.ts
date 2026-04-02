// Isometric tile dimensions (2:1 ratio diamond)
export const TILE_WIDTH = 64;
export const TILE_HEIGHT = 32;
export const TILE_IMG_SIZE = 64; // actual image is 64x64

// Map grid
export const MAP_COLS = 16;
export const MAP_ROWS = 16;

// Zoom
export const ZOOM_DEFAULT = 1.5;
export const ZOOM_MIN = 0.5;
export const ZOOM_MAX = 3;
export const ZOOM_STEP = 0.25;

// Camera
export const PAN_SPEED = 6;

// Colors
export const COLORS = {
  BG: 0x1a1a2e,
  UI_BG: 0x14141e,
  UI_BORDER: 0x2a2a3a,
  UI_TEXT: 0xc8c8d0,
  UI_ACCENT: 0x4a9eff,
  GREEN: 0x32b432,
  RED: 0xc83232,
  BLUE: 0x3264c8,
  ORANGE: 0xdc8228,
  YELLOW: 0xe6c832,
} as const;

// Station IDs
export const STATIONS = {
  CODING_DESK: 'coding-desk',
  TEST_CHAMBER: 'test-chamber',
  REVIEW_TERMINAL: 'review-terminal',
  DEPLOY_BAY: 'deploy-bay',
  DATA_PIPELINE: 'data-pipeline',
} as const;

// Station configs — positions in isometric grid coords
export const STATION_CONFIGS = [
  { id: STATIONS.CODING_DESK, label: 'Coding Desk', col: 3, row: 3, tileKey: 'scanner-high', color: 0x4a9eff },
  { id: STATIONS.TEST_CHAMBER, label: 'Test Chamber', col: 10, row: 3, tileKey: 'scanner-low', color: 0x32b432 },
  { id: STATIONS.REVIEW_TERMINAL, label: 'Review Terminal', col: 3, row: 10, tileKey: 'robot-arm-a', color: 0xdc8228 },
  { id: STATIONS.DEPLOY_BAY, label: 'Deploy Bay', col: 10, row: 10, tileKey: 'robot-arm-b', color: 0xc83232 },
  { id: STATIONS.DATA_PIPELINE, label: 'Data Pipeline', col: 7, row: 7, tileKey: 'conveyor-bars-stripe', color: 0xe6c832 },
] as const;

// Agent movement
export const AGENT_SPEED = 80; // pixels per second
export const WORK_DURATION_MIN = 3000;
export const WORK_DURATION_MAX = 8000;

// Animation
export const FRAME_RATE = 6;

// Isometric coordinate helpers
export function isoToScreen(col: number, row: number): { x: number; y: number } {
  return {
    x: (col - row) * (TILE_WIDTH / 2),
    y: (col + row) * (TILE_HEIGHT / 2),
  };
}

export function screenToIso(x: number, y: number): { col: number; row: number } {
  return {
    col: Math.floor(x / TILE_WIDTH + y / TILE_HEIGHT),
    row: Math.floor(y / TILE_HEIGHT - x / TILE_WIDTH),
  };
}
