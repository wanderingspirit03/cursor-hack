import { FRAME_RATE } from '../../constants';

const SPRITE_SIZE = 16;

const ROBOT_COLORS = [
  { main: '#7080a0', shadow: '#506080', light: '#90a0c0', eye: '#50ff50' },
  { main: '#a07060', shadow: '#806050', light: '#c09080', eye: '#ff5050' },
];

const DRONE_COLORS = [
  { main: '#505860', shadow: '#383e44', light: '#707880', prop: '#a0a8b0' },
  { main: '#605050', shadow: '#443838', light: '#807070', prop: '#b0a0a0' },
];

const LOADED_CHAR_COUNT = 6;

/**
 * Generate all agent sprite sheets.
 * Workers: loaded from pre-made pixel art PNGs (char-0..5), 16x32, 4 frames x 4 dirs
 * Robot: 16x16, 4 frames, 4 directions (procedural)
 * Drone: 16x16, 4 frames, 4 directions (procedural)
 */
export function generateAgentSprites(scene: Phaser.Scene): void {
  // Workers: register animations from loaded sprite sheets
  for (let i = 0; i < LOADED_CHAR_COUNT; i++) {
    registerWorkerAnims(scene, i);
  }

  // Robots
  for (let i = 0; i < ROBOT_COLORS.length; i++) {
    generateRobotSheet(scene, `robot-${i}`, ROBOT_COLORS[i]);
  }

  // Drones
  for (let i = 0; i < DRONE_COLORS.length; i++) {
    generateDroneSheet(scene, `drone-${i}`, DRONE_COLORS[i]);
  }
}

/** Register walk/idle/work animations for a loaded character sprite sheet. */
function registerWorkerAnims(scene: Phaser.Scene, charIndex: number): void {
  const key = `char-${charIndex}`;
  const dirs = ['down', 'up', 'right', 'left'];

  for (let d = 0; d < 4; d++) {
    const row = d * 4; // 4 frames per row in the sprite sheet

    if (!scene.anims.exists(`${key}-idle-${dirs[d]}`)) {
      scene.anims.create({
        key: `${key}-idle-${dirs[d]}`,
        frames: [{ key, frame: row }],
        frameRate: 1,
      });
    }

    if (!scene.anims.exists(`${key}-walk-${dirs[d]}`)) {
      scene.anims.create({
        key: `${key}-walk-${dirs[d]}`,
        frames: [
          { key, frame: row },
          { key, frame: row + 1 },
          { key, frame: row },
          { key, frame: row + 2 },
        ],
        frameRate: FRAME_RATE,
        repeat: -1,
      });
    }

    if (!scene.anims.exists(`${key}-work-${dirs[d]}`)) {
      scene.anims.create({
        key: `${key}-work-${dirs[d]}`,
        frames: [
          { key, frame: row + 3 },
          { key, frame: row },
        ],
        frameRate: FRAME_RATE / 2,
        repeat: -1,
      });
    }
  }
}

function generateRobotSheet(
  scene: Phaser.Scene,
  key: string,
  colors: { main: string; shadow: string; light: string; eye: string }
): void {
  const frameW = SPRITE_SIZE;
  const frameH = SPRITE_SIZE;
  const cols = 4;
  const rows = 4;

  const canvas = document.createElement('canvas');
  canvas.width = frameW * cols;
  canvas.height = frameH * rows;
  const ctx = canvas.getContext('2d')!;

  for (let dir = 0; dir < 4; dir++) {
    for (let frame = 0; frame < 4; frame++) {
      const ox = frame * frameW;
      const oy = dir * frameH;
      drawRobot(ctx, ox, oy, dir, frame, colors);
    }
  }

  scene.textures.addSpriteSheet(key, canvas as unknown as HTMLImageElement, { frameWidth: frameW, frameHeight: frameH });
}

function drawRobot(
  ctx: CanvasRenderingContext2D,
  ox: number,
  oy: number,
  dir: number,
  frame: number,
  colors: { main: string; shadow: string; light: string; eye: string }
): void {
  const bob = frame === 1 || frame === 3 ? -1 : 0;

  // Treads/wheels
  ctx.fillStyle = '#1a1a1a';
  ctx.fillRect(ox + 2, oy + 13, 4, 3);
  ctx.fillRect(ox + 10, oy + 13, 4, 3);

  // Body
  ctx.fillStyle = colors.main;
  ctx.fillRect(ox + 3, oy + 4 + bob, 10, 9);
  ctx.fillStyle = colors.shadow;
  ctx.fillRect(ox + 3, oy + 10 + bob, 10, 3);

  // Light stripe
  ctx.fillStyle = colors.light;
  ctx.fillRect(ox + 4, oy + 6 + bob, 8, 1);

  // Head/sensor dome
  ctx.fillStyle = colors.light;
  ctx.fillRect(ox + 5, oy + 2 + bob, 6, 3);

  // Eye(s)
  ctx.fillStyle = colors.eye;
  if (dir === 0) {
    ctx.fillRect(ox + 6, oy + 3 + bob, 1, 1);
    ctx.fillRect(ox + 9, oy + 3 + bob, 1, 1);
  } else if (dir === 1) {
    ctx.fillRect(ox + 7, oy + 2 + bob, 2, 1);
  } else if (dir === 2) {
    ctx.fillRect(ox + 9, oy + 3 + bob, 2, 1);
  } else {
    ctx.fillRect(ox + 5, oy + 3 + bob, 2, 1);
  }

  // Antenna
  ctx.fillStyle = '#1a1a1a';
  ctx.fillRect(ox + 7, oy + 0 + bob, 1, 2);
  ctx.fillStyle = colors.eye;
  ctx.fillRect(ox + 7, oy + 0 + bob, 1, 1);

  // Arms (when working)
  if (frame === 3) {
    ctx.fillStyle = colors.shadow;
    ctx.fillRect(ox + 1, oy + 6 + bob, 2, 5);
    ctx.fillRect(ox + 13, oy + 6 + bob, 2, 5);
  }
}

function generateDroneSheet(
  scene: Phaser.Scene,
  key: string,
  colors: { main: string; shadow: string; light: string; prop: string }
): void {
  const frameW = SPRITE_SIZE;
  const frameH = SPRITE_SIZE;
  const cols = 4;
  const rows = 4;

  const canvas = document.createElement('canvas');
  canvas.width = frameW * cols;
  canvas.height = frameH * rows;
  const ctx = canvas.getContext('2d')!;

  for (let dir = 0; dir < 4; dir++) {
    for (let frame = 0; frame < 4; frame++) {
      const ox = frame * frameW;
      const oy = dir * frameH;
      drawDrone(ctx, ox, oy, dir, frame, colors);
    }
  }

  scene.textures.addSpriteSheet(key, canvas as unknown as HTMLImageElement, { frameWidth: frameW, frameHeight: frameH });
}

function drawDrone(
  ctx: CanvasRenderingContext2D,
  ox: number,
  oy: number,
  dir: number,
  frame: number,
  colors: { main: string; shadow: string; light: string; prop: string }
): void {
  const hover = frame % 2 === 0 ? 0 : -1;

  // Shadow on ground
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.fillRect(ox + 4, oy + 13, 8, 2);

  // Body
  ctx.fillStyle = colors.main;
  ctx.fillRect(ox + 4, oy + 5 + hover, 8, 5);
  ctx.fillStyle = colors.shadow;
  ctx.fillRect(ox + 4, oy + 8 + hover, 8, 2);

  // Eye/camera
  ctx.fillStyle = '#50aaff';
  if (dir === 0) {
    ctx.fillRect(ox + 7, oy + 7 + hover, 2, 2);
  } else if (dir === 1) {
    ctx.fillRect(ox + 7, oy + 5 + hover, 2, 1);
  } else if (dir === 2) {
    ctx.fillRect(ox + 10, oy + 6 + hover, 2, 2);
  } else {
    ctx.fillRect(ox + 4, oy + 6 + hover, 2, 2);
  }

  // Propeller arms
  ctx.fillStyle = colors.light;
  ctx.fillRect(ox + 2, oy + 4 + hover, 3, 1);
  ctx.fillRect(ox + 11, oy + 4 + hover, 3, 1);

  // Propellers (spinning effect)
  ctx.fillStyle = colors.prop;
  const propOffset = frame % 2 === 0 ? 0 : 1;
  ctx.fillRect(ox + 1 + propOffset, oy + 3 + hover, 3, 1);
  ctx.fillRect(ox + 11 + propOffset, oy + 3 + hover, 3, 1);

  // LED
  ctx.fillStyle = frame % 2 === 0 ? '#ff3030' : '#30ff30';
  ctx.fillRect(ox + 7, oy + 5 + hover, 1, 1);
}

export function getAgentSpriteKey(type: string, variant: number): string {
  if (type === 'worker') {
    return `char-${variant % LOADED_CHAR_COUNT}`;
  } else if (type === 'robot') {
    return `robot-${variant % ROBOT_COLORS.length}`;
  } else {
    return `drone-${variant % DRONE_COLORS.length}`;
  }
}

export function getFrameHeight(type: string): number {
  return type === 'worker' ? 32 : 16;
}
