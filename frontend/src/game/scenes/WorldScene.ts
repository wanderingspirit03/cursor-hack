import Phaser from 'phaser';
import { eventBus } from '../../services/EventBus';
import { COLORS } from '../constants';

const WORLD_ZOOM_DEFAULT = 0.8;
const WORLD_ZOOM_MIN = 0.3;
const WORLD_ZOOM_MAX = 3.5;
const WORLD_ZOOM_STEP = 0.15;
const ZOOM_ENTER_THRESHOLD = 2.8;

export class WorldScene extends Phaser.Scene {
  private isPanning = false;
  private panStart = { x: 0, y: 0 };
  private camStart = { x: 0, y: 0 };
  private wasd!: Record<string, Phaser.Input.Keyboard.Key>;
  private building!: Phaser.GameObjects.Image;
  private isTransitioning = false;
  private hintText!: Phaser.GameObjects.Text;

  constructor() {
    super({ key: 'WorldScene' });
  }

  create(): void {
    this.isTransitioning = false;

    // Background matches the building's own ground color
    this.cameras.main.setBackgroundColor(0x9d8f77);

    // Place factory building
    this.building = this.add.image(0, 0, 'factory-building');
    this.building.setOrigin(0.5, 0.5);

    // Label below building
    const labelY = this.building.displayHeight / 2 + 20;
    this.add.text(0, labelY, 'FACTORY', {
      fontSize: '14px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#4a9eff',
    }).setOrigin(0.5);

    // Hint text
    this.hintText = this.add.text(0, labelY + 25, 'SCROLL TO ZOOM IN', {
      fontSize: '8px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#6e7178',
    }).setOrigin(0.5);

    // Pulse the hint
    this.tweens.add({
      targets: this.hintText,
      alpha: 0.3,
      duration: 1200,
      yoyo: true,
      repeat: -1,
    });

    // Camera setup
    this.cameras.main.setZoom(WORLD_ZOOM_DEFAULT);
    this.cameras.main.centerOn(0, 0);

    // Input
    if (this.input.keyboard) {
      this.wasd = {
        W: this.input.keyboard.addKey('W'),
        A: this.input.keyboard.addKey('A'),
        S: this.input.keyboard.addKey('S'),
        D: this.input.keyboard.addKey('D'),
      };
    }

    // Zoom toward building center (0,0)
    this.input.on('wheel', (_pointer: Phaser.Input.Pointer, _over: unknown, _dx: unknown, dz: number) => {
      if (this.isTransitioning) return;
      const cam = this.cameras.main;
      const newZoom = Phaser.Math.Clamp(
        cam.zoom * (dz > 0 ? (1 - WORLD_ZOOM_STEP) : (1 + WORLD_ZOOM_STEP)),
        WORLD_ZOOM_MIN,
        WORLD_ZOOM_MAX,
      );
      cam.setZoom(newZoom);
      cam.centerOn(0, 0);

      this.hintText.setVisible(newZoom <= 1.2);

      if (newZoom >= ZOOM_ENTER_THRESHOLD) {
        this.enterBuilding();
      }
    });

    // Pan: middle-mouse OR left-click drag
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (pointer.middleButtonDown() || pointer.leftButtonDown()) {
        this.isPanning = true;
        this.panStart = { x: pointer.x, y: pointer.y };
        this.camStart = { x: this.cameras.main.scrollX, y: this.cameras.main.scrollY };
      }
    });

    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (this.isPanning && pointer.isDown) {
        const dx = (this.panStart.x - pointer.x) / this.cameras.main.zoom;
        const dy = (this.panStart.y - pointer.y) / this.cameras.main.zoom;
        this.cameras.main.scrollX = this.camStart.x + dx;
        this.cameras.main.scrollY = this.camStart.y + dy;
      }
    });

    this.input.on('pointerup', () => {
      this.isPanning = false;
    });

    // Double-click on building to enter
    this.building.setInteractive();
    let lastClick = 0;
    this.building.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (!pointer.leftButtonDown()) return;
      const now = Date.now();
      if (now - lastClick < 400) {
        this.enterBuilding();
      }
      lastClick = now;
    });

    // Emit scene change
    eventBus.emit('scene:changed', { scene: 'world' });

    // Fade in
    this.cameras.main.fadeIn(500, 10, 10, 18);
  }

  update(): void {
    if (this.isTransitioning) return;

    if (this.wasd) {
      const speed = 6 / this.cameras.main.zoom;
      if (this.wasd.W?.isDown) this.cameras.main.scrollY -= speed;
      if (this.wasd.S?.isDown) this.cameras.main.scrollY += speed;
      if (this.wasd.A?.isDown) this.cameras.main.scrollX -= speed;
      if (this.wasd.D?.isDown) this.cameras.main.scrollX += speed;
    }
  }

  private enterBuilding(): void {
    if (this.isTransitioning) return;
    this.isTransitioning = true;

    this.cameras.main.fadeOut(400, 10, 10, 18);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.start('FactoryScene');
    });
  }
}
