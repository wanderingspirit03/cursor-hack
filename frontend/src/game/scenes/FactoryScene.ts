import Phaser from 'phaser';
import { generateFactoryMap, renderFloor, renderObjects } from '../tilemap/TilemapGenerator';
import { PathfindingSystem } from '../systems/PathfindingSystem';
import { Agent } from '../entities/Agent';
import { eventBus } from '../../services/EventBus';
import {
  MAP_COLS, MAP_ROWS, TILE_WIDTH, TILE_HEIGHT,
  ZOOM_DEFAULT, ZOOM_MIN, ZOOM_MAX, ZOOM_STEP,
  PAN_SPEED, COLORS, STATION_CONFIGS, isoToScreen,
} from '../constants';
import type { AgentType, TaskState } from '../entities/AgentTypes';
import { TASK_TYPES } from '../entities/AgentTypes';

export class FactoryScene extends Phaser.Scene {
  private agents = new Map<string, Agent>();
  private pathfinding!: PathfindingSystem;
  private wasd!: Record<string, Phaser.Input.Keyboard.Key>;
  private escKey!: Phaser.Input.Keyboard.Key;
  private selectedAgentId: string | null = null;
  private followingAgentId: string | null = null;
  private isPanning = false;
  private panStart = { x: 0, y: 0 };
  private camStart = { x: 0, y: 0 };
  private isTransitioning = false;
  private isDragging = false;
  private dragThreshold = 5;

  constructor() {
    super({ key: 'FactoryScene' });
  }

  create(): void {
    this.isTransitioning = false;
    this.cameras.main.setBackgroundColor(COLORS.BG);

    // Generate map data
    const { ground, walkGrid, objects } = generateFactoryMap();

    // Render floor
    renderFloor(this, ground);

    // Render objects
    renderObjects(this, objects);

    // Setup pathfinding (uses grid coords, not screen)
    this.pathfinding = new PathfindingSystem();
    this.pathfinding.setGrid(walkGrid, MAP_COLS, MAP_ROWS);

    // Camera — center on map
    const center = isoToScreen(MAP_COLS / 2, MAP_ROWS / 2);
    this.cameras.main.setZoom(ZOOM_DEFAULT);
    this.cameras.main.centerOn(center.x, center.y);

    // Input
    if (this.input.keyboard != null) {
      this.wasd = {
        W: this.input.keyboard.addKey('W'),
        A: this.input.keyboard.addKey('A'),
        S: this.input.keyboard.addKey('S'),
        D: this.input.keyboard.addKey('D'),
      };
      this.escKey = this.input.keyboard.addKey('ESC');
    }

    // Zoom toward cursor (clamped, no auto-exit)
    this.input.on('wheel', (pointer: Phaser.Input.Pointer, _over: unknown, _dx: unknown, dz: number) => {
      if (this.isTransitioning) return;
      const cam = this.cameras.main;
      const oldZoom = cam.zoom;
      const newZoom = Phaser.Math.Clamp(
        oldZoom * (dz > 0 ? (1 - ZOOM_STEP) : (1 + ZOOM_STEP)),
        ZOOM_MIN,
        ZOOM_MAX,
      );
      const worldBefore = cam.getWorldPoint(pointer.x, pointer.y);
      cam.setZoom(newZoom);
      const worldAfter = cam.getWorldPoint(pointer.x, pointer.y);
      cam.scrollX += worldBefore.x - worldAfter.x;
      cam.scrollY += worldBefore.y - worldAfter.y;
    });

    // Pan: any mouse button drag (left/middle/right)
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      this.isPanning = true;
      this.isDragging = false;
      this.panStart = { x: pointer.x, y: pointer.y };
      this.camStart = { x: this.cameras.main.scrollX, y: this.cameras.main.scrollY };
    });

    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (!this.isPanning || !pointer.isDown) return;
      const movedX = Math.abs(pointer.x - this.panStart.x);
      const movedY = Math.abs(pointer.y - this.panStart.y);
      if (!this.isDragging && (movedX > this.dragThreshold || movedY > this.dragThreshold)) {
        this.isDragging = true;
        this.followingAgentId = null;
      }
      if (this.isDragging) {
        const dx = (this.panStart.x - pointer.x) / this.cameras.main.zoom;
        const dy = (this.panStart.y - pointer.y) / this.cameras.main.zoom;
        this.cameras.main.scrollX = this.camStart.x + dx;
        this.cameras.main.scrollY = this.camStart.y + dy;
      }
    });

    this.input.on('pointerup', (pointer: Phaser.Input.Pointer) => {
      const wasDrag = this.isDragging;
      this.isPanning = false;
      this.isDragging = false;

      // Only handle click (not drag) with left button
      if (!wasDrag && pointer.leftButtonReleased()) {
        const worldPoint = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
        let hitAgent = false;
        this.agents.forEach((agent) => {
          const bounds = agent.getBounds();
          if (bounds.contains(worldPoint.x, worldPoint.y)) {
            hitAgent = true;
          }
        });
        if (!hitAgent) {
          this.deselectAll();
          this.followingAgentId = null;
        }
      }
    });

    // Disable context menu so right-click drag works
    this.game.canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    // EventBus listeners
    eventBus.on('agent:selected', ({ agentId }) => this.selectAgent(agentId));
    eventBus.on('agent:deselected', () => this.deselectAll());
    eventBus.on('camera:follow', ({ agentId }) => { this.followingAgentId = agentId; });
    eventBus.on('camera:unfollow', () => { this.followingAgentId = null; });
    eventBus.on('command:assign', ({ agentId, stationId }) => this.assignAgentToStation(agentId, stationId));

    // Emit scene change
    eventBus.emit('scene:changed', { scene: 'factory' });

    // Fade in
    this.cameras.main.fadeIn(500, 10, 10, 18);
  }

  update(time: number, delta: number): void {
    if (this.isTransitioning) return;

    // Update agents
    this.agents.forEach((agent) => agent.update(time, delta));

    // ESC to exit to world view
    if (this.escKey?.isDown) {
      this.exitToWorld();
      return;
    }

    // WASD pan
    if (!this.isPanning && this.wasd) {
      const speed = PAN_SPEED / this.cameras.main.zoom;
      if (this.wasd.W?.isDown) this.cameras.main.scrollY -= speed;
      if (this.wasd.S?.isDown) this.cameras.main.scrollY += speed;
      if (this.wasd.A?.isDown) this.cameras.main.scrollX -= speed;
      if (this.wasd.D?.isDown) this.cameras.main.scrollX += speed;
    }

    // Camera follow
    if (this.followingAgentId) {
      const agent = this.agents.get(this.followingAgentId);
      if (agent) {
        this.cameras.main.centerOn(agent.x, agent.y);
      }
    }
  }

  public spawnAgent(id: string, name: string, type: AgentType, variant: number): Agent {
    // Random walkable spawn in isometric coords
    const spawnCol = 5 + Math.floor(Math.random() * 16);
    const spawnRow = 10 + Math.floor(Math.random() * 8);
    const { x, y } = isoToScreen(spawnCol, spawnRow);

    const agent = new Agent(this, x, y, id, name, type, variant, this.pathfinding);
    this.agents.set(id, agent);

    eventBus.emit('agent:spawned', { agent: agent.getState() });
    return agent;
  }

  public removeAgent(id: string): void {
    const agent = this.agents.get(id);
    if (agent) {
      agent.destroy();
      this.agents.delete(id);
      eventBus.emit('agent:removed', { agentId: id });
    }
  }

  public getAgent(id: string): Agent | undefined {
    return this.agents.get(id);
  }

  private selectAgent(agentId: string): void {
    if (this.selectedAgentId && this.selectedAgentId !== agentId) {
      this.agents.get(this.selectedAgentId)?.deselect();
    }
    this.selectedAgentId = agentId;
    this.followingAgentId = agentId;
    this.agents.get(agentId)?.select();
  }

  private deselectAll(): void {
    if (this.selectedAgentId) {
      this.agents.get(this.selectedAgentId)?.deselect();
      this.selectedAgentId = null;
      eventBus.emit('agent:deselected', {});
    }
  }

  private exitToWorld(): void {
    if (this.isTransitioning) return;
    this.isTransitioning = true;

    this.cameras.main.fadeOut(400, 10, 10, 18);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.start('WorldScene');
    });
  }

  private assignAgentToStation(agentId: string, stationId: string): void {
    const agent = this.agents.get(agentId);
    if (!agent) return;

    const taskType = TASK_TYPES.find((t) => t.station === stationId) ?? TASK_TYPES[0];
    const task: TaskState = {
      id: `task-${Date.now()}`,
      type: taskType.type,
      description: taskType.description,
      stationId,
      progress: 0,
      startedAt: Date.now(),
    };

    const duration = 3000 + Math.random() * 5000;
    agent.assignToStation(stationId, task, duration);
  }
}
