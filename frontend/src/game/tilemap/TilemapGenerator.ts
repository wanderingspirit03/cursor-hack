import { MAP_COLS, MAP_ROWS, isoToScreen, STATION_CONFIGS } from '../constants';

export const enum CellType {
  EMPTY = 0,
  FLOOR = 1,
  WALL = 2,
  CONVEYOR = 3,
  STATION = 4,
}

export interface FactoryMap {
  ground: number[][];
  walkGrid: number[][];
  objects: PlacedObject[];
}

export interface PlacedObject {
  col: number;
  row: number;
  tileKey: string;
  zOffset: number;
  label?: string;
  stationId?: string;
}

function block(w: number[][], c: number, r: number) { if (w[r]) w[r][c] = 1; }

function obj(objects: PlacedObject[], col: number, row: number, tileKey: string, zOffset: number, extra?: Partial<PlacedObject>) {
  objects.push({ col, row, tileKey, zOffset, ...extra });
}

/**
 * Factory layout — clear production flow:
 *
 *   NORTH WALL
 *   ┌─────────────────────────┬───────────┐
 *   │  OFFICE / CONTROL ROOM  │ SUPPLY    │
 *   │  (monitors, desks)      │ CLOSET    │
 *   ├─────────────────────────┤           │
 *   │                         ├───────────┤
 *   │  >>>  INTAKE CONVEYOR   │           │
 *   │       ↓ robot arms      │           │
 *   │  >>> ASSEMBLY LINE >>>  │ WAREHOUSE │
 *   │       ↓ robot arms      │ (boxes)   │
 *   │  >>>  QC / TESTING      │           │
 *   │       ↓                 │           │
 *   │  >>> OUTPUT CONVEYOR >> │           │
 *   │                         │           │
 *   │  STAGING  (boxes)       │ SHIPPING  │
 *   └─────────────────────────┴───────────┘
 *   SOUTH WALL (loading docks)
 */
export function generateFactoryMap(): FactoryMap {
  const ground: number[][] = [];
  const walkGrid: number[][] = [];
  const objects: PlacedObject[] = [];

  // Init grid
  for (let r = 0; r < MAP_ROWS; r++) {
    ground[r] = [];
    walkGrid[r] = [];
    for (let c = 0; c < MAP_COLS; c++) {
      ground[r][c] = CellType.EMPTY;
      walkGrid[r][c] = 1;
    }
  }

  // Floor fill (inside walls)
  for (let r = 1; r < MAP_ROWS - 1; r++) {
    for (let c = 1; c < MAP_COLS - 1; c++) {
      ground[r][c] = CellType.FLOOR;
      walkGrid[r][c] = 0;
    }
  }

  // ═══════════════════════════════════════
  // EXTERIOR WALLS
  // ═══════════════════════════════════════

  // North wall (row=0, runs along col) — east-facing
  for (let c = 0; c < MAP_COLS; c++) {
    ground[0][c] = CellType.WALL;
    if (c === 0 || c === MAP_COLS - 1) {
      obj(objects, c, 0, 'brick-corner', 0);
    } else if (c >= 10 && c <= 12) {
      obj(objects, c, 0, 'brick-door-east', 0);
    } else if (c % 4 === 2) {
      obj(objects, c, 0, 'brick-window-east', 0);
    } else {
      obj(objects, c, 0, 'brick-tall-east', 0);
    }
  }

  // South wall (row=max, runs along col) — east-facing
  for (let c = 0; c < MAP_COLS; c++) {
    ground[MAP_ROWS - 1][c] = CellType.WALL;
    if (c >= 8 && c <= 10) {
      obj(objects, c, MAP_ROWS - 1, 'door-wide-open', -16);
    } else if (c >= 14 && c <= 16) {
      obj(objects, c, MAP_ROWS - 1, 'door-wide-open', -16);
    } else if (c === 0 || c === MAP_COLS - 1) {
      obj(objects, c, MAP_ROWS - 1, 'brick-corner', 0);
    } else {
      obj(objects, c, MAP_ROWS - 1, 'brick-short-east', 0);
    }
  }

  // Left wall (col=0, runs along row) — south-facing
  for (let r = 1; r < MAP_ROWS - 1; r++) {
    ground[r][0] = CellType.WALL;
    if (r === 7 || r === 8) {
      obj(objects, 0, r, 'door-wide-open', -24);
    } else if (r % 3 === 0) {
      obj(objects, 0, r, 'brick-window-south', 0);
    } else {
      obj(objects, 0, r, 'brick-tall-south', 0);
    }
  }

  // Right wall (col=max, runs along row) — south-facing
  for (let r = 1; r < MAP_ROWS - 1; r++) {
    ground[r][MAP_COLS - 1] = CellType.WALL;
    if (r % 3 === 0) {
      obj(objects, MAP_COLS - 1, r, 'brick-window-south', 0);
    } else {
      obj(objects, MAP_COLS - 1, r, 'brick-tall-south', 0);
    }
  }

  // ═══════════════════════════════════════
  // INTERNAL COLUMNS (not walls — open floor)
  // ═══════════════════════════════════════
  const whDiv = MAP_COLS - 8;

  // Columns along production/warehouse divide — sparse, every 6 rows
  for (let r = 3; r < MAP_ROWS - 2; r += 6) {
    obj(objects, whDiv, r, 'brick-tall', 0);
    block(walkGrid, whDiv, r);
  }

  // ═══════════════════════════════════════
  // ZONE A: OFFICE / CONTROL ROOM (rows 1-5)
  // ═══════════════════════════════════════

  // Office-production divider — just columns, not a full wall
  const officeWallRow = 6;
  for (let c = 4; c < whDiv; c += 8) {
    obj(objects, c, officeWallRow, 'brick-tall', 0);
    block(walkGrid, c, officeWallRow);
  }

  // Control monitors (covered units = control panels)
  for (let c = 2; c <= 5; c++) {
    obj(objects, c, 1, c % 2 === 0 ? 'cover-stripe-top' : 'cover-top', -56);
    obj(objects, c, 2, c % 2 === 0 ? 'cover-stripe-window' : 'cover-window', -40);
    block(walkGrid, c, 2);
  }

  // Scanners = monitoring displays
  obj(objects, 7, 2, 'scanner-high', -24); block(walkGrid, 7, 2);
  obj(objects, 9, 2, 'scanner-low', -16); block(walkGrid, 9, 2);

  // Right side: more control panels
  for (let c = 12; c <= 15; c++) {
    obj(objects, c, 1, c % 2 === 0 ? 'cover-stripe-top' : 'cover-top', -56);
    obj(objects, c, 2, c % 2 === 0 ? 'cover-stripe-window' : 'cover-window', -40);
    block(walkGrid, c, 2);
  }

  // Office storage
  obj(objects, 2, 4, 'box-small', -16); block(walkGrid, 2, 4);
  obj(objects, 3, 4, 'box-wide', -16); block(walkGrid, 3, 4);
  obj(objects, 14, 4, 'box-small', -16); block(walkGrid, 14, 4);
  obj(objects, 15, 4, 'box-wide', -16); block(walkGrid, 15, 4);

  // ═══════════════════════════════════════
  // ZONE B: PRODUCTION FLOOR (rows 7-27)
  // ═══════════════════════════════════════

  // --- INTAKE AREA (rows 7-9) ---
  for (let c = 2; c <= 10; c++) {
    obj(objects, c, 8, c % 3 === 0 ? 'conveyor-bars-stripe' : 'conveyor-stripe', -8);
    ground[8][c] = CellType.CONVEYOR;
  }
  obj(objects, 1, 8, 'arrow', 0);
  obj(objects, 12, 8, 'scanner-high', -24); block(walkGrid, 12, 8);
  obj(objects, 1, 7, 'structure-yellow-tall', -32); block(walkGrid, 1, 7);
  obj(objects, 13, 7, 'structure-yellow-tall', -32); block(walkGrid, 13, 7);

  // --- ASSEMBLY LINE (rows 10-13) ---
  for (let c = 2; c <= whDiv - 2; c++) {
    const k1 = c % 4 === 0 ? 'conveyor-bars-stripe' : 'conveyor-stripe';
    const k2 = c % 4 === 0 ? 'conveyor-bars' : 'conveyor';
    obj(objects, c, 11, k1, -8);
    obj(objects, c, 12, k2, -8);
    ground[11][c] = CellType.CONVEYOR;
    ground[12][c] = CellType.CONVEYOR;
  }
  obj(objects, 1, 11, 'conveyor-stripe-sides', -8); ground[11][1] = CellType.CONVEYOR;
  obj(objects, 1, 12, 'conveyor-sides', -8); ground[12][1] = CellType.CONVEYOR;
  obj(objects, whDiv - 1, 11, 'conveyor-stripe-sides', -8); ground[11][whDiv - 1] = CellType.CONVEYOR;
  obj(objects, whDiv - 1, 12, 'conveyor-sides', -8); ground[12][whDiv - 1] = CellType.CONVEYOR;
  obj(objects, 1, 10, 'arrow', 0);
  obj(objects, whDiv - 1, 10, 'arrow', 0);

  // Robot arms alternating on both sides
  for (let c = 3; c <= whDiv - 3; c += 3) {
    obj(objects, c, 10, 'robot-arm-a', -24); block(walkGrid, c, 10);
  }
  for (let c = 5; c <= whDiv - 3; c += 3) {
    obj(objects, c, 13, 'robot-arm-b', -24); block(walkGrid, c, 13);
  }

  // Safety pillars at assembly line
  obj(objects, 1, 10, 'structure-yellow-medium', -24); block(walkGrid, 1, 10);
  obj(objects, whDiv - 1, 10, 'structure-yellow-medium', -24); block(walkGrid, whDiv - 1, 10);
  obj(objects, 1, 13, 'structure-yellow-medium', -24); block(walkGrid, 1, 13);
  obj(objects, whDiv - 1, 13, 'structure-yellow-medium', -24); block(walkGrid, whDiv - 1, 13);

  // --- QC / TESTING BOOTHS (rows 15-17) ---
  for (let c = 2; c <= 6; c++) {
    obj(objects, c, 15, c % 2 === 0 ? 'cover-stripe-bar' : 'cover-bar', -40);
    block(walkGrid, c, 15);
    obj(objects, c, 16, c % 2 === 0 ? 'cover-stripe-corner' : 'cover-corner', -40);
    block(walkGrid, c, 16);
    obj(objects, c, 14, c % 2 === 0 ? 'cover-stripe-top' : 'cover-top', -56);
  }
  for (let c = 10; c <= 14; c++) {
    obj(objects, c, 15, c % 2 === 0 ? 'cover-stripe-window' : 'cover-window', -40);
    block(walkGrid, c, 15);
    obj(objects, c, 16, c % 2 === 0 ? 'cover-stripe-hopper' : 'cover-hopper', -40);
    block(walkGrid, c, 16);
    obj(objects, c, 14, c % 2 === 0 ? 'cover-stripe-top' : 'cover-top', -56);
  }
  obj(objects, 8, 15, 'scanner-high', -24); block(walkGrid, 8, 15);
  obj(objects, 8, 16, 'scanner-low', -16); block(walkGrid, 8, 16);

  // --- OUTPUT CONVEYOR (rows 19-20) ---
  for (let c = 2; c <= whDiv - 2; c++) {
    const k1 = c % 4 === 0 ? 'conveyor-bars-stripe-high' : 'conveyor-long-stripe';
    const k2 = c % 4 === 0 ? 'conveyor-bars-high' : 'conveyor-long';
    obj(objects, c, 19, k1, -8);
    obj(objects, c, 20, k2, -8);
    ground[19][c] = CellType.CONVEYOR;
    ground[20][c] = CellType.CONVEYOR;
  }
  obj(objects, 1, 19, 'arrow', 0);
  obj(objects, whDiv - 1, 19, 'arrow', 0);
  obj(objects, 1, 19, 'structure-yellow-short', -16); block(walkGrid, 1, 19);
  obj(objects, whDiv - 1, 19, 'structure-yellow-short', -16); block(walkGrid, whDiv - 1, 19);
  obj(objects, 1, 21, 'structure-yellow-short', -16); block(walkGrid, 1, 21);
  obj(objects, whDiv - 1, 21, 'structure-yellow-short', -16); block(walkGrid, whDiv - 1, 21);

  // --- STAGING AREA (rows 23-26) ---
  // Boxes near dock 1
  for (let r = 23; r <= 26; r++) {
    for (let c = 6; c <= 11; c++) {
      const keys = ['box-large', 'box-wide', 'box-long', 'box-large'];
      obj(objects, c, r, keys[(c + r) % keys.length], -16);
      block(walkGrid, c, r);
    }
  }
  // Boxes near dock 2
  for (let r = 23; r <= 26; r++) {
    for (let c = 12; c <= 17; c++) {
      const keys = ['box-large', 'box-small', 'box-wide', 'box-large'];
      obj(objects, c, r, keys[(c + r) % keys.length], -16);
      block(walkGrid, c, r);
    }
  }

  // Conveyors to docks
  for (let c = 8; c <= 10; c++) {
    obj(objects, c, 27, 'conveyor-bars-stripe', -8);
    ground[27][c] = CellType.CONVEYOR;
  }
  obj(objects, 7, 27, 'arrow-basic', 0);
  for (let c = 14; c <= 16; c++) {
    obj(objects, c, 27, 'conveyor-bars-stripe', -8);
    ground[27][c] = CellType.CONVEYOR;
  }
  obj(objects, 13, 27, 'arrow-basic', 0);

  // ═══════════════════════════════════════
  // ZONE C: WAREHOUSE (right of divider)
  // ═══════════════════════════════════════
  const whStart = whDiv + 1;
  const whEnd = MAP_COLS - 2;

  // Storage rows with aisles
  for (let c = whStart; c <= whEnd; c++) {
    obj(objects, c, 2, 'box-large', -16); block(walkGrid, c, 2);
    obj(objects, c, 3, 'box-wide', -16); block(walkGrid, c, 3);
  }
  for (let c = whStart; c <= whEnd; c++) {
    obj(objects, c, 5, 'box-large', -16); block(walkGrid, c, 5);
    obj(objects, c, 6, 'box-small', -16); block(walkGrid, c, 6);
  }
  for (let c = whStart; c <= whEnd; c++) {
    obj(objects, c, 8, 'box-wide', -16); block(walkGrid, c, 8);
    obj(objects, c, 9, 'box-large', -16); block(walkGrid, c, 9);
  }

  // Warehouse conveyor (feeds production)
  for (let c = whStart; c <= whEnd; c++) {
    obj(objects, c, 11, 'conveyor-stripe', -8);
    obj(objects, c, 12, 'conveyor', -8);
    ground[11][c] = CellType.CONVEYOR;
    ground[12][c] = CellType.CONVEYOR;
  }

  // More storage below
  for (let c = whStart; c <= whEnd; c++) {
    obj(objects, c, 14, 'box-large', -16); block(walkGrid, c, 14);
    obj(objects, c, 15, 'box-long', -16); block(walkGrid, c, 15);
  }
  for (let c = whStart; c <= whEnd; c++) {
    obj(objects, c, 17, 'box-wide', -16); block(walkGrid, c, 17);
    obj(objects, c, 18, 'box-large', -16); block(walkGrid, c, 18);
  }

  // Shipping conveyor
  for (let c = whStart; c <= whEnd; c++) {
    obj(objects, c, 20, 'conveyor-long-stripe', -8);
    obj(objects, c, 21, 'conveyor-long', -8);
    ground[20][c] = CellType.CONVEYOR;
    ground[21][c] = CellType.CONVEYOR;
  }

  // Structural pillars
  obj(objects, whStart, 1, 'structure-yellow-tall', -32); block(walkGrid, whStart, 1);
  obj(objects, whEnd, 1, 'structure-yellow-tall', -32); block(walkGrid, whEnd, 1);
  obj(objects, whStart, 13, 'structure-yellow-short', -16); block(walkGrid, whStart, 13);
  obj(objects, whEnd, 13, 'structure-yellow-short', -16); block(walkGrid, whEnd, 13);
  obj(objects, whStart, 19, 'structure-yellow-short', -16); block(walkGrid, whStart, 19);
  obj(objects, whEnd, 19, 'structure-yellow-short', -16); block(walkGrid, whEnd, 19);

  obj(objects, whStart + 2, 13, 'scanner-low', -16); block(walkGrid, whStart + 2, 13);

  // ═══════════════════════════════════════
  // STATIONS
  // ═══════════════════════════════════════
  for (const station of STATION_CONFIGS) {
    ground[station.row][station.col] = CellType.STATION;
    walkGrid[station.row][station.col] = 1;
    objects.push({
      col: station.col,
      row: station.row,
      tileKey: station.tileKey,
      zOffset: -24,
      label: station.label,
      stationId: station.id,
    });
  }

  return { ground, walkGrid, objects };
}

/** Render floor tiles as isometric diamond grid */
export function renderFloor(scene: Phaser.Scene, ground: number[][]): void {
  for (let r = 0; r < MAP_ROWS; r++) {
    for (let c = 0; c < MAP_COLS; c++) {
      if (ground[r][c] === CellType.EMPTY) continue;
      const { x, y } = isoToScreen(c, r);
      const floorKey = (c + r) % 3 === 0 ? 'floor-large' : 'floor';
      const tile = scene.add.image(Math.round(x), Math.round(y), floorKey);
      tile.setTint(0xd4c4a8); // warm beige tint
      tile.setDepth(0);
    }
  }
}

/** Render placed objects with depth sorting */
export function renderObjects(scene: Phaser.Scene, objects: PlacedObject[]): Phaser.GameObjects.Image[] {
  const images: Phaser.GameObjects.Image[] = [];

  for (const o of objects) {
    const { x, y } = isoToScreen(o.col, o.row);
    const px = Math.round(x);
    const py = Math.round(y + o.zOffset);

    if (!scene.textures.exists(o.tileKey)) continue;

    const img = scene.add.image(px, py, o.tileKey);
    // Brick wall tiles are 64x128 with diamond at 75% height
    if (o.tileKey.startsWith('brick-')) {
      img.setOrigin(0.5, 0.75);
    }
    img.setDepth((o.col + o.row) * 10 + 5);

    if (o.stationId) {
      img.setData('stationId', o.stationId);
      img.setInteractive();
    }

    images.push(img);

    if (o.label) {
      const label = scene.add.text(px, py - 36, o.label, {
        fontSize: '7px',
        fontFamily: '"Press Start 2P", monospace',
        color: '#4a9eff',
        align: 'center',
        stroke: '#000000',
        strokeThickness: 2,
      });
      label.setOrigin(0.5, 1);
      label.setDepth((o.col + o.row) * 10 + 100);
    }
  }

  return images;
}
