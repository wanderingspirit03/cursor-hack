const SPRITE_SIZE = 16;

/** Hard hat colors per agent role */
const HAT_COLORS = [
  { main: '#e6c832', shadow: '#b89828' }, // yellow
  { main: '#3264c8', shadow: '#2850a0' }, // blue
  { main: '#c83232', shadow: '#a02828' }, // red
  { main: '#32b432', shadow: '#289028' }, // green
  { main: '#dc8228', shadow: '#b06820' }, // orange
  { main: '#9648c8', shadow: '#7838a0' }, // purple
];

const SKIN_TONES = ['#e8b89a', '#c68e6a', '#8d5e3c', '#f5d0b0'];

const ROBOT_COLORS = [
  { main: '#7080a0', shadow: '#506080', light: '#90a0c0', eye: '#50ff50' },
  { main: '#a07060', shadow: '#806050', light: '#c09080', eye: '#ff5050' },
];

const DRONE_COLORS = [
  { main: '#505860', shadow: '#383e44', light: '#707880', prop: '#a0a8b0' },
  { main: '#605050', shadow: '#443838', light: '#807070', prop: '#b0a0a0' },
];

/**
 * Generate all agent sprite sheets as canvas textures.
 * Worker: 16x24, 4 frames (idle, walk1, walk2, work), 4 directions
 * Robot: 16x16, 4 frames, 4 directions
 * Drone: 16x16, 4 frames, 4 directions
 */
export function generateAgentSprites(scene: Phaser.Scene): void {
  // Workers
  for (let i = 0; i < HAT_COLORS.length; i++) {
    for (let s = 0; s < SKIN_TONES.length; s++) {
      generateWorkerSheet(scene, `worker-${i}-${s}`, HAT_COLORS[i], SKIN_TONES[s]);
    }
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

function generateWorkerSheet(
  scene: Phaser.Scene,
  key: string,
  hat: { main: string; shadow: string },
  skin: string
): void {
  const frameW = SPRITE_SIZE;
  const frameH = 24;
  const cols = 4; // idle, walk1, walk2, work
  const rows = 4; // down, up, right, left

  const canvas = document.createElement('canvas');
  canvas.width = frameW * cols;
  canvas.height = frameH * rows;
  const ctx = canvas.getContext('2d')!;

  for (let dir = 0; dir < 4; dir++) {
    for (let frame = 0; frame < 4; frame++) {
      const ox = frame * frameW;
      const oy = dir * frameH;
      drawWorker(ctx, ox, oy, dir, frame, hat, skin);
    }
  }

  scene.textures.addSpriteSheet(key, canvas as unknown as HTMLImageElement, { frameWidth: frameW, frameHeight: frameH });
}

function drawWorker(
  ctx: CanvasRenderingContext2D,
  ox: number,
  oy: number,
  dir: number,
  frame: number,
  hat: { main: string; shadow: string },
  skin: string
): void {
  const walkOffset = frame === 1 ? -1 : frame === 2 ? 1 : 0;
  const isWork = frame === 3;

  // Legs (row 18-23 from top)
  ctx.fillStyle = '#2a2a50';
  if (dir === 0 || dir === 1) {
    // front/back — two legs
    ctx.fillRect(ox + 5, oy + 18 + walkOffset, 2, 5);
    ctx.fillRect(ox + 9, oy + 18 - walkOffset, 2, 5);
  } else {
    // side — offset legs
    ctx.fillRect(ox + 6, oy + 18 + walkOffset, 2, 5);
    ctx.fillRect(ox + 8, oy + 18 - walkOffset, 2, 5);
  }

  // Boots
  ctx.fillStyle = '#1a1a1a';
  ctx.fillRect(ox + 5, oy + 22, 2, 2);
  ctx.fillRect(ox + 9, oy + 22, 2, 2);

  // Body (overalls)
  ctx.fillStyle = '#4060a0';
  ctx.fillRect(ox + 4, oy + 10, 8, 8);

  // Arms
  ctx.fillStyle = '#4060a0';
  if (isWork) {
    // Arms extended forward
    if (dir === 0) {
      ctx.fillRect(ox + 2, oy + 11, 2, 5);
      ctx.fillRect(ox + 12, oy + 11, 2, 5);
    } else if (dir === 2 || dir === 3) {
      ctx.fillRect(ox + 3, oy + 10, 2, 6);
      ctx.fillRect(ox + 11, oy + 10, 2, 6);
    } else {
      ctx.fillRect(ox + 3, oy + 11, 2, 5);
      ctx.fillRect(ox + 11, oy + 11, 2, 5);
    }
  } else {
    ctx.fillRect(ox + 2, oy + 11 + walkOffset, 2, 5);
    ctx.fillRect(ox + 12, oy + 11 - walkOffset, 2, 5);
  }

  // Hands
  ctx.fillStyle = skin;
  if (isWork) {
    ctx.fillRect(ox + 2, oy + 15, 2, 2);
    ctx.fillRect(ox + 12, oy + 15, 2, 2);
  } else {
    ctx.fillRect(ox + 2, oy + 15 + walkOffset, 2, 2);
    ctx.fillRect(ox + 12, oy + 15 - walkOffset, 2, 2);
  }

  // Head
  ctx.fillStyle = skin;
  ctx.fillRect(ox + 5, oy + 4, 6, 6);

  // Eyes
  ctx.fillStyle = '#1a1a1a';
  if (dir === 0) {
    ctx.fillRect(ox + 6, oy + 6, 1, 2);
    ctx.fillRect(ox + 9, oy + 6, 1, 2);
  } else if (dir === 1) {
    // Back — no eyes
  } else if (dir === 2) {
    ctx.fillRect(ox + 9, oy + 6, 1, 2);
  } else {
    ctx.fillRect(ox + 6, oy + 6, 1, 2);
  }

  // Hard hat
  ctx.fillStyle = hat.main;
  ctx.fillRect(ox + 4, oy + 2, 8, 3);
  ctx.fillRect(ox + 3, oy + 4, 10, 1);
  ctx.fillStyle = hat.shadow;
  ctx.fillRect(ox + 4, oy + 4, 8, 1);
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
    const hat = variant % HAT_COLORS.length;
    const skin = Math.floor(variant / HAT_COLORS.length) % SKIN_TONES.length;
    return `worker-${hat}-${skin}`;
  } else if (type === 'robot') {
    return `robot-${variant % ROBOT_COLORS.length}`;
  } else {
    return `drone-${variant % DRONE_COLORS.length}`;
  }
}

export function getFrameHeight(type: string): number {
  return type === 'worker' ? 24 : 16;
}
