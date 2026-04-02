import Phaser from 'phaser';
import { StateMachine } from '../systems/StateMachine';
import { PathfindingSystem, type Point } from '../systems/PathfindingSystem';
import { eventBus } from '../../services/EventBus';
import { AGENT_SPEED, FRAME_RATE, STATION_CONFIGS, isoToScreen, screenToIso } from '../constants';
import { getAgentSpriteKey, getFrameHeight } from './sprites/SpriteGenerator';
import type { AgentState, AgentStatus, AgentType, TaskState, LogEntry } from './AgentTypes';

export class Agent extends Phaser.GameObjects.Container {
  public agentId: string;
  public agentType: AgentType;
  public agentName: string;
  public status: AgentStatus = 'idle';
  public currentStation: string | null = null;
  public task: TaskState | null = null;
  public logs: LogEntry[] = [];

  private sprite: Phaser.GameObjects.Sprite;
  private bubble: Phaser.GameObjects.Container;
  private bubbleText: Phaser.GameObjects.Text;
  private bubbleBg: Phaser.GameObjects.Rectangle;
  private outline: Phaser.GameObjects.Rectangle;
  private fsm: StateMachine<AgentStatus>;
  private pathfinding: PathfindingSystem;
  private path: Point[] = [];
  private pathIndex = 0;
  private direction = 0; // 0=down, 1=up, 2=right, 3=left
  private selected = false;
  private workTimer = 0;
  private workDuration = 0;
  private variant: number;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    id: string,
    name: string,
    type: AgentType,
    variant: number,
    pathfinding: PathfindingSystem
  ) {
    super(scene, x, y);

    this.agentId = id;
    this.agentName = name;
    this.agentType = type;
    this.variant = variant;
    this.pathfinding = pathfinding;

    const spriteKey = getAgentSpriteKey(type, variant);
    const frameH = getFrameHeight(type);

    // Sprite
    this.sprite = scene.add.sprite(0, -frameH / 2, spriteKey, 0);
    this.sprite.setOrigin(0.5, 0.5);
    this.sprite.setScale(1.5); // Scale up to match isometric tiles
    this.add(this.sprite);

    // Selection outline
    const outW = 20;
    const outH = frameH * 1.5 + 4;
    this.outline = scene.add.rectangle(0, -frameH / 2, outW, outH);
    this.outline.setStrokeStyle(2, 0xc45a2d, 0.9);
    this.outline.setFillStyle(0xc45a2d, 0.06);
    this.outline.setVisible(false);
    this.add(this.outline);

    // Status bubble
    this.bubbleBg = scene.add.rectangle(0, -frameH - 18, 60, 18, 0x14110e, 0.94);
    this.bubbleBg.setStrokeStyle(2, 0x3a2a1a);
    this.bubbleText = scene.add.text(0, -frameH - 18, '', {
      fontSize: '8px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#d4c8b8',
      align: 'center',
    });
    this.bubbleText.setOrigin(0.5, 0.5);
    this.bubble = scene.add.container(0, 0, [this.bubbleBg, this.bubbleText]);
    this.bubble.setVisible(false);
    this.add(this.bubble);

    // Create animations
    this.createAnimations(scene, spriteKey);

    // Setup state machine
    this.fsm = new StateMachine<AgentStatus>('idle');
    this.setupStateMachine();

    // Make interactive
    this.setSize(24, frameH * 1.5);
    this.setInteractive();
    this.on('pointerdown', () => this.handleClick());

    scene.add.existing(this);

    this.addLog('info', 'Agent spawned');
    this.emitUpdate();
  }

  private createAnimations(scene: Phaser.Scene, key: string): void {
    const dirs = ['down', 'up', 'right', 'left'];
    const prefix = `${key}-`;

    for (let d = 0; d < 4; d++) {
      const row = d * 4;

      if (!scene.anims.exists(`${prefix}idle-${dirs[d]}`)) {
        scene.anims.create({
          key: `${prefix}idle-${dirs[d]}`,
          frames: [{ key, frame: row }],
          frameRate: 1,
        });
      }

      if (!scene.anims.exists(`${prefix}walk-${dirs[d]}`)) {
        scene.anims.create({
          key: `${prefix}walk-${dirs[d]}`,
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

      if (!scene.anims.exists(`${prefix}work-${dirs[d]}`)) {
        scene.anims.create({
          key: `${prefix}work-${dirs[d]}`,
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

  private setupStateMachine(): void {
    this.fsm.addState('idle', {
      onEnter: () => {
        this.playAnim('idle');
        this.showBubble('idle', '#80c080');
        setTimeout(() => this.bubble.setVisible(false), 2000);
      },
      transitions: { assign: 'assigned' },
    });

    this.fsm.addState('assigned', {
      onEnter: () => {
        this.showBubble('assigned', '#e6c832');
        this.addLog('info', `Assigned to ${this.currentStation}`);
        this.navigateToStation();
      },
      transitions: { move: 'walking' },
    });

    this.fsm.addState('walking', {
      onEnter: () => {
        this.playAnim('walk');
        this.showBubble('moving...', '#80a0ff');
      },
      onUpdate: (dt) => this.updateWalking(dt),
      transitions: { arrive: 'working' },
    });

    this.fsm.addState('working', {
      onEnter: () => {
        this.playAnim('work');
        this.workTimer = 0;
        this.showBubble(this.task?.type ?? 'working', '#50c878');
        this.addLog('info', `Working: ${this.task?.description ?? 'unknown task'}`);
      },
      onUpdate: (dt) => this.updateWorking(dt),
      transitions: { complete: 'done' },
    });

    this.fsm.addState('done', {
      onEnter: () => {
        this.playAnim('idle');
        this.showBubble('done!', '#50c878');
        this.addLog('success', `Completed: ${this.task?.description ?? 'task'}`);
        this.task = null;
        this.currentStation = null;
        setTimeout(() => {
          this.fsm.forceState('idle');
          this.status = 'idle';
          this.emitUpdate();
        }, 1500);
      },
      transitions: { assign: 'assigned' },
    });
  }

  private async navigateToStation(): Promise<void> {
    if (!this.currentStation) return;

    const station = STATION_CONFIGS.find((s) => s.id === this.currentStation);
    if (!station) return;

    // Current grid position
    const cur = screenToIso(this.x, this.y);
    // Target: one tile in front of station (row + 1)
    const targetCol = station.col;
    const targetRow = station.row + 1;

    const path = await this.pathfinding.findPath(
      Math.round(cur.col), Math.round(cur.row),
      targetCol, targetRow
    );

    if (path.length > 0) {
      this.path = path;
      this.pathIndex = 0;
      this.fsm.transition('move');
      this.status = 'walking';
      this.emitUpdate();
    } else {
      // Can't pathfind — teleport
      const { x, y } = isoToScreen(targetCol, targetRow);
      this.setPosition(x, y);
      this.fsm.transition('move');
      this.path = [];
      this.pathIndex = 0;
      this.status = 'walking';
      this.fsm.transition('arrive');
      this.status = 'working';
      this.emitUpdate();
    }
  }

  private updateWalking(dt: number): void {
    if (this.pathIndex >= this.path.length) {
      this.fsm.transition('arrive');
      this.status = 'working';
      this.emitUpdate();
      return;
    }

    const target = this.path[this.pathIndex];
    const dx = target.x - this.x;
    const dy = target.y - this.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < 3) {
      this.pathIndex++;
      return;
    }

    const speed = AGENT_SPEED * dt;
    const nx = dx / dist;
    const ny = dy / dist;

    this.x += nx * speed;
    this.y += ny * speed;

    // Direction based on isometric movement
    if (Math.abs(dx) > Math.abs(dy)) {
      this.direction = dx > 0 ? 2 : 3; // right / left
    } else {
      this.direction = dy > 0 ? 0 : 1; // down / up
    }
    this.playAnim('walk');
  }

  private updateWorking(dt: number): void {
    this.workTimer += dt * 1000;
    if (this.task) {
      this.task.progress = Math.min(100, (this.workTimer / this.workDuration) * 100);
    }

    if (this.workTimer >= this.workDuration) {
      this.fsm.transition('complete');
      this.status = 'done';
      this.emitUpdate();
    }
  }

  public assignToStation(stationId: string, task: TaskState, duration: number): void {
    this.currentStation = stationId;
    this.task = task;
    this.workDuration = duration;
    this.workTimer = 0;
    this.status = 'assigned';
    this.fsm.forceState('idle');
    this.fsm.transition('assign');
    this.emitUpdate();
  }

  public update(_time: number, delta: number): void {
    const dt = delta / 1000;
    this.fsm.update(dt);

    // Isometric depth sort: objects further down-right should render in front
    const iso = screenToIso(this.x, this.y);
    this.setDepth((iso.col + iso.row) * 10 + 8);
  }

  private playAnim(action: 'idle' | 'walk' | 'work'): void {
    const dirs = ['down', 'up', 'right', 'left'];
    const key = getAgentSpriteKey(this.agentType, this.variant);
    const animKey = `${key}-${action}-${dirs[this.direction]}`;
    if (this.sprite.anims.currentAnim?.key !== animKey) {
      this.sprite.play(animKey);
    }
  }

  private showBubble(text: string, color: string): void {
    this.bubbleText.setText(text);
    this.bubbleText.setColor(color);
    const w = Math.max(this.bubbleText.width + 14, 40);
    this.bubbleBg.setSize(w, 18);
    this.bubble.setVisible(true);
  }

  private handleClick(): void {
    this.selected = !this.selected;
    this.outline.setVisible(this.selected);

    if (this.selected) {
      eventBus.emit('agent:selected', { agentId: this.agentId });
    } else {
      eventBus.emit('agent:deselected', {});
    }
  }

  public select(): void {
    this.selected = true;
    this.outline.setVisible(true);
  }

  public deselect(): void {
    this.selected = false;
    this.outline.setVisible(false);
  }

  public addLog(type: LogEntry['type'], message: string): void {
    this.logs.push({ timestamp: Date.now(), message, type });
    if (this.logs.length > 50) this.logs.shift();
  }

  public getState(): AgentState {
    return {
      id: this.agentId,
      name: this.agentName,
      type: this.agentType,
      status: this.status,
      currentStation: this.currentStation,
      task: this.task,
      x: this.x,
      y: this.y,
      logs: [...this.logs],
    };
  }

  private emitUpdate(): void {
    eventBus.emit('agent:updated', { agent: this.getState() });
  }
}
