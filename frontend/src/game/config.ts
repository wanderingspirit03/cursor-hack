import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene';
import { FactoryScene } from './scenes/FactoryScene';
import { COLORS } from './constants';

export function createGameConfig(parent: string): Phaser.Types.Core.GameConfig {
  return {
    type: Phaser.AUTO,
    parent,
    backgroundColor: COLORS.BG,
    pixelArt: true,
    scale: {
      mode: Phaser.Scale.RESIZE,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    scene: [BootScene, FactoryScene],
    physics: {
      default: 'arcade',
      arcade: {
        gravity: { x: 0, y: 0 },
        debug: false,
      },
    },
    input: {
      mouse: {
        preventDefaultWheel: true,
      },
    },
  };
}
