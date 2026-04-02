import Phaser from 'phaser';
import { generateAgentSprites } from '../entities/sprites/SpriteGenerator';
import { COLORS } from '../constants';

// All Kenney tile assets to load
const TILE_ASSETS = [
  'arrow-basic', 'arrow',
  'box-large', 'box-long', 'box-small', 'box-wide',
  'conveyor-bars-fence', 'conveyor-bars-high', 'conveyor-bars-sides',
  'conveyor-bars-stripe-fence', 'conveyor-bars-stripe-high', 'conveyor-bars-stripe-side',
  'conveyor-bars-stripe', 'conveyor-bars',
  'conveyor-long-sides', 'conveyor-long-stripe-sides', 'conveyor-long-stripe', 'conveyor-long',
  'conveyor-sides', 'conveyor-stripe-sides', 'conveyor-stripe', 'conveyor',
  'cover-bar', 'cover-corner', 'cover-hopper',
  'cover-stripe-bar', 'cover-stripe-corner', 'cover-stripe-hopper',
  'cover-stripe-top', 'cover-stripe-window', 'cover-stripe',
  'cover-top', 'cover-window', 'cover',
  'door-wide-closed', 'door-wide-half', 'door-wide-open', 'door',
  'floor-large', 'floor',
  'robot-arm-a', 'robot-arm-b',
  'scanner-high', 'scanner-low',
  'structure-corner-inner', 'structure-corner-outer',
  'structure-doorway-wide', 'structure-doorway',
  'structure-high', 'structure-medium', 'structure-short', 'structure-tall',
  'structure-wall', 'structure-window-wide', 'structure-window',
  'structure-yellow-high', 'structure-yellow-medium', 'structure-yellow-short', 'structure-yellow-tall',
  'top-large', 'top',
  // Custom brick wall tiles — oriented
  'brick-wall-east', 'brick-tall-east', 'brick-short-east',
  'brick-window-east', 'brick-door-east',
  'brick-wall-south', 'brick-tall-south', 'brick-short-south',
  'brick-window-south', 'brick-door-south',
  'brick-corner', 'brick-corner-inner', 'brick-corner-window',
];

export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BootScene' });
  }

  preload(): void {
    const { width, height } = this.cameras.main;

    // Loading UI
    const title = this.add.text(width / 2, height / 2 - 30, 'FACTORY AGENTS', {
      fontSize: '14px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#4a9eff',
    });
    title.setOrigin(0.5);

    const progressText = this.add.text(width / 2, height / 2 + 10, 'Loading assets...', {
      fontSize: '8px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#6e7178',
    });
    progressText.setOrigin(0.5);

    const barW = 200;
    const barBg = this.add.rectangle(width / 2, height / 2 + 35, barW, 8, 0x1a1a24);
    barBg.setStrokeStyle(1, 0x2a2a3a);
    const barFill = this.add.rectangle(width / 2 - barW / 2 + 1, height / 2 + 35, 0, 6, 0x4a9eff);
    barFill.setOrigin(0, 0.5);

    this.load.on('progress', (value: number) => {
      barFill.width = (barW - 2) * value;
      progressText.setText(`Loading... ${Math.floor(value * 100)}%`);
    });

    // Load all tile images
    for (const key of TILE_ASSETS) {
      this.load.image(key, `tiles/${key}.png`);
    }

    // Load factory building image for world view
    this.load.image('factory-building', 'factpj.png');

    // Load original pixel-agents character sprite sheets (6 palettes, 4x4 grid, 16x32 each)
    const CHAR_COUNT = 6;
    for (let i = 0; i < CHAR_COUNT; i++) {
      this.load.spritesheet(`char-${i}`, `characters/char_${i}.png`, {
        frameWidth: 16,
        frameHeight: 32,
      });
    }
  }

  create(): void {
    // Generate programmatic agent sprites (robots, drones) + register loaded character sheets
    generateAgentSprites(this);

    // Transition to world view
    this.time.delayedCall(300, () => {
      this.scene.start('WorldScene');
    });
  }
}
