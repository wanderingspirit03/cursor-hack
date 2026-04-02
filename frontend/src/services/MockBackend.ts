import type { AgentBackendService } from './AgentService';
import type { AgentState, AgentType, TaskState } from '../game/entities/AgentTypes';
import { AGENT_NAMES, TASK_TYPES } from '../game/entities/AgentTypes';
import { STATION_CONFIGS, WORK_DURATION_MIN, WORK_DURATION_MAX } from '../game/constants';
import { eventBus } from './EventBus';
import type { FactoryScene } from '../game/scenes/FactoryScene';

interface MockAgent {
  id: string;
  name: string;
  type: AgentType;
  variant: number;
}

export class MockBackendService implements AgentBackendService {
  private scene: FactoryScene | null = null;
  private agents: MockAgent[] = [];
  private tickInterval: ReturnType<typeof setInterval> | null = null;
  private agentUpdateCallbacks: ((agent: AgentState) => void)[] = [];
  private taskUpdateCallbacks: ((task: TaskState) => void)[] = [];
  private agentCounter = 0;
  private usedNames: Set<string> = new Set();

  setScene(scene: FactoryScene): void {
    this.scene = scene;
  }

  async connect(): Promise<void> {
    if (!this.scene) throw new Error('Scene not set');

    // Spawn initial agents
    this.spawnInitialAgents();

    // Start activity loop
    this.tickInterval = setInterval(() => this.tick(), 3000);
  }

  disconnect(): void {
    if (this.tickInterval) {
      clearInterval(this.tickInterval);
      this.tickInterval = null;
    }
  }

  onAgentUpdate(callback: (agent: AgentState) => void): void {
    this.agentUpdateCallbacks.push(callback);
  }

  onTaskUpdate(callback: (task: TaskState) => void): void {
    this.taskUpdateCallbacks.push(callback);
  }

  async assignAgent(agentId: string, stationId: string): Promise<void> {
    if (!this.scene) return;

    const agent = this.scene.getAgent(agentId);
    if (!agent) return;

    const taskType = TASK_TYPES.find((t) => t.station === stationId) ?? TASK_TYPES[0];
    const task: TaskState = {
      id: `task-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      type: taskType.type,
      description: taskType.description,
      stationId,
      progress: 0,
      startedAt: Date.now(),
    };

    const duration = WORK_DURATION_MIN + Math.random() * (WORK_DURATION_MAX - WORK_DURATION_MIN);
    agent.assignToStation(stationId, task, duration);

    agent.addLog('info', `Assigned: ${taskType.description} at ${stationId}`);
  }

  async sendCommand(agentId: string, command: string): Promise<void> {
    const agent = this.scene?.getAgent(agentId);
    if (agent) {
      agent.addLog('info', `Command received: ${command}`);
      eventBus.emit('agent:updated', { agent: agent.getState() });
    }
  }

  startMission(_prompt: string, _backend?: string): void {}
  abortMission(): void {}
  isConnected(): boolean { return true; }


  private spawnInitialAgents(): void {
    if (!this.scene) return;

    const agentsToSpawn: { type: AgentType; count: number }[] = [
      { type: 'worker', count: 3 },
      { type: 'robot', count: 1 },
      { type: 'drone', count: 1 },
    ];

    for (const { type, count } of agentsToSpawn) {
      for (let i = 0; i < count; i++) {
        this.spawnAgent(type);
      }
    }
  }

  private spawnAgent(type: AgentType): MockAgent | null {
    if (!this.scene) return null;

    const names = AGENT_NAMES[type];
    const available = names.filter((n) => !this.usedNames.has(n));
    const name = available.length > 0
      ? available[Math.floor(Math.random() * available.length)]
      : `${type}-${this.agentCounter}`;

    this.usedNames.add(name);

    const id = `agent-${this.agentCounter++}`;
    const variant = Math.floor(Math.random() * 24);
    const mockAgent: MockAgent = { id, name, type, variant };

    this.scene.spawnAgent(id, name, type, variant);
    this.agents.push(mockAgent);

    return mockAgent;
  }

  private tick(): void {
    if (!this.scene) return;

    // Find idle agents and give them work
    for (const mockAgent of this.agents) {
      const agent = this.scene.getAgent(mockAgent.id);
      if (!agent) continue;

      if (agent.status === 'idle') {
        // 60% chance to assign a task
        if (Math.random() < 0.6) {
          const taskType = TASK_TYPES[Math.floor(Math.random() * TASK_TYPES.length)];
          const station = STATION_CONFIGS.find((s) => s.id === taskType.station);
          if (station) {
            this.assignAgent(mockAgent.id, taskType.station);
          }
        }
      }
    }
  }
}
