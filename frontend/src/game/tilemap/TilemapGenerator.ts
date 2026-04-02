import { MAP_COLS, MAP_ROWS, TILE_WIDTH, TILE_HEIGHT, isoToScreen, STATION_CONFIGS } from '../constants';

// What each cell in the grid contains
export const enum CellType {
  EMPTY = 0,
  FLOOR = 1,
  WALL = 2,
  CONVEYOR = 3,
  STATION = 4,
}

export interface FactoryMap {
  ground: number[][]; // CellType for each cell
  walkGrid: number[][]; // 0=walkable, 1=blocked
  objects: PlacedObject[];
}

export interface PlacedObject {
  col: number;
  row: number;
  tileKey: string;
  zOffset: number; // Y offset for depth sorting (taller objects)
  label?: string;
  stationId?: string;
}

export function generateFactoryMap(): FactoryMap {
  const ground: number[][] = [];
  const walkGrid: number[][] = [];
  const objects: PlacedObject[] = [];

  // Initialize
  for (let r = 0; r < MAP_ROWS; r++) {
    ground[r] = [];
    walkGrid[r] = [];
    for (let c = 0; c < MAP_COLS; c++) {
      ground[r][c] = CellType.EMPTY;
      walkGrid[r][c] = 1;
    }
  }

  // Floor — fill interior
  for (let r = 1; r < MAP_ROWS - 1; r++) {
    for (let c = 1; c < MAP_COLS - 1; c++) {
      ground[r][c] = CellType.FLOOR;
      walkGrid[r][c] = 0;
    }
  }

  // Walls — top edge
  for (let c = 0; c < MAP_COLS; c++) {
    ground[0][c] = CellType.WALL;
    objects.push({ col: c, row: 0, tileKey: 'structure-wall', zOffset: -32 });
  }

  // Walls — bottom edge
  for (let c = 0; c < MAP_COLS; c++) {
    ground[MAP_ROWS - 1][c] = CellType.WALL;
    objects.push({ col: c, row: MAP_ROWS - 1, tileKey: 'structure-short', zOffset: -16 });
  }

  // Walls — left edge
  for (let r = 1; r < MAP_ROWS - 1; r++) {
    ground[r][0] = CellType.WALL;
    objects.push({ col: 0, row: r, tileKey: 'structure-wall', zOffset: -32 });
  }

  // Walls — right edge
  for (let r = 1; r < MAP_ROWS - 1; r++) {
    ground[r][MAP_COLS - 1] = CellType.WALL;
    objects.push({ col: MAP_COLS - 1, row: r, tileKey: 'structure-wall', zOffset: -32 });
  }

  // Corner walls
  objects.push({ col: 0, row: 0, tileKey: 'structure-corner-outer', zOffset: -32 });

  // Doorways
  objects.push({ col: 7, row: 0, tileKey: 'structure-doorway', zOffset: -32 });
  objects.push({ col: 8, row: 0, tileKey: 'structure-doorway', zOffset: -32 });
  // Remove wall objects at doorway
  const doorCols = [7, 8];
  // We'll just leave the wall objects — they'll be overdrawn

  // Windows along top wall
  for (const wc of [3, 4, 11, 12]) {
    objects.push({ col: wc, row: 0, tileKey: 'structure-window', zOffset: -32 });
  }

  // Conveyor belt lines running through factory
  const conveyorPath = [
    { col: 5, row: 5, key: 'conveyor-stripe' },
    { col: 6, row: 5, key: 'conveyor-stripe' },
    { col: 7, row: 5, key: 'conveyor-stripe' },
    { col: 8, row: 5, key: 'conveyor-stripe' },
    { col: 5, row: 6, key: 'conveyor' },
    { col: 6, row: 6, key: 'conveyor' },
    { col: 7, row: 6, key: 'conveyor' },
    { col: 8, row: 6, key: 'conveyor' },
    { col: 5, row: 8, key: 'conveyor-stripe' },
    { col: 6, row: 8, key: 'conveyor-stripe' },
    { col: 7, row: 8, key: 'conveyor-stripe' },
    { col: 8, row: 8, key: 'conveyor-stripe' },
    { col: 5, row: 9, key: 'conveyor' },
    { col: 6, row: 9, key: 'conveyor' },
    { col: 7, row: 9, key: 'conveyor' },
    { col: 8, row: 9, key: 'conveyor' },
  ];

  for (const cv of conveyorPath) {
    ground[cv.row][cv.col] = CellType.CONVEYOR;
    objects.push({ col: cv.col, row: cv.row, tileKey: cv.key, zOffset: -8 });
  }

  // Boxes scattered around
  const boxes = [
    { col: 2, row: 2, key: 'box-large' },
    { col: 13, row: 2, key: 'box-small' },
    { col: 13, row: 3, key: 'box-wide' },
    { col: 2, row: 12, key: 'box-long' },
    { col: 13, row: 12, key: 'box-large' },
    { col: 14, row: 12, key: 'box-small' },
    { col: 2, row: 13, key: 'box-small' },
    { col: 12, row: 5, key: 'box-small' },
    { col: 12, row: 6, key: 'box-wide' },
  ];

  for (const box of boxes) {
    objects.push({ col: box.col, row: box.row, tileKey: box.key, zOffset: -16 });
    walkGrid[box.row][box.col] = 1;
  }

  // Stations
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

  // Arrows on floor for direction
  objects.push({ col: 5, row: 4, tileKey: 'arrow', zOffset: 0 });
  objects.push({ col: 8, row: 4, tileKey: 'arrow', zOffset: 0 });

  // Covers / roof sections in corners for visual interest
  objects.push({ col: 1, row: 1, tileKey: 'cover-stripe', zOffset: -40 });
  objects.push({ col: 14, row: 1, tileKey: 'cover-stripe', zOffset: -40 });
  objects.push({ col: 1, row: 14, tileKey: 'cover', zOffset: -40 });
  objects.push({ col: 14, row: 14, tileKey: 'cover', zOffset: -40 });

  // Doors on left wall
  objects.push({ col: 0, row: 7, tileKey: 'door-wide-open', zOffset: -24 });

  return { ground, walkGrid, objects };
}

/** Render floor tiles as isometric diamond grid */
export function renderFloor(scene: Phaser.Scene, ground: number[][]): void {
  for (let r = 0; r < MAP_ROWS; r++) {
    for (let c = 0; c < MAP_COLS; c++) {
      if (ground[r][c] === CellType.EMPTY) continue;

      const { x, y } = isoToScreen(c, r);

      // Use floor tile for all non-empty cells (objects render on top)
      const floorKey = (c + r) % 3 === 0 ? 'floor-large' : 'floor';
      const tile = scene.add.image(x, y, floorKey);
      tile.setDepth(0);
    }
  }
}

/** Render placed objects with depth sorting */
export function renderObjects(scene: Phaser.Scene, objects: PlacedObject[]): Phaser.GameObjects.Image[] {
  const images: Phaser.GameObjects.Image[] = [];

  for (const obj of objects) {
    const { x, y } = isoToScreen(obj.col, obj.row);
    const img = scene.add.image(x, y + obj.zOffset, obj.tileKey);

    // Depth sort: row + col gives isometric depth order
    img.setDepth((obj.col + obj.row) * 10 + 5);

    if (obj.stationId) {
      img.setData('stationId', obj.stationId);
      img.setInteractive();
    }

    images.push(img);

    // Station label
    if (obj.label) {
      const label = scene.add.text(x, y + obj.zOffset - 36, obj.label, {
        fontSize: '7px',
        fontFamily: '"Press Start 2P", monospace',
        color: '#4a9eff',
        align: 'center',
        stroke: '#000000',
        strokeThickness: 2,
      });
      label.setOrigin(0.5, 1);
      label.setDepth((obj.col + obj.row) * 10 + 100);
    }
  }

  return images;
}
