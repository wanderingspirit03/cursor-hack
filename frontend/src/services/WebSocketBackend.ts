import type { AgentBackendService } from './AgentService';
import type { AgentState, AgentType, TaskState } from '../game/entities/AgentTypes';
import { eventBus } from './EventBus';

const ROLE_TO_STATION: Record<string, string> = {
  frontend: 'coding-desk',
  backend: 'coding-desk',
  testing: 'test-chamber',
  devops: 'deploy-bay',
  database: 'data-pipeline',
  orchestrator: 'review-terminal',
};

function roleToStation(role: string): string {
  return ROLE_TO_STATION[role] ?? 'coding-desk';
}

export class WebSocketBackendService implements AgentBackendService {
  private ws: WebSocket | null = null;
  private url: string;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private connected = false;
  private shouldReconnect = true;
  private agentCache = new Map<string, AgentState>();

  constructor(url = 'ws://localhost:3001') {
    this.url = url;
  }

  async connect(): Promise<void> {
    this.shouldReconnect = true;
    return this.doConnect();
  }

  private doConnect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.url);
      } catch (e) {
        reject(e);
        return;
      }

      this.ws.onopen = () => {
        this.connected = true;
        eventBus.emit('connection:changed', { connected: true });
        console.log('[WS] Connected to backend');
        resolve();
      };

      this.ws.onerror = (e) => {
        if (!this.connected) reject(e);
      };

      this.ws.onclose = () => {
        const wasConnected = this.connected;
        this.connected = false;
        if (wasConnected) {
          eventBus.emit('connection:changed', { connected: false });
          console.log('[WS] Disconnected');
        }
        if (this.shouldReconnect) {
          this.scheduleReconnect();
        }
      };

      this.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          this.handleMessage(msg);
        } catch (e) {
          console.error('[WS] Bad message:', e);
        }
      };
    });
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      console.log('[WS] Reconnecting...');
      this.doConnect().catch(() => {
        if (this.shouldReconnect) this.scheduleReconnect();
      });
    }, 2000);
  }

  disconnect(): void {
    this.shouldReconnect = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.ws?.close();
    this.ws = null;
    this.connected = false;
  }

  onAgentUpdate(_callback: (agent: AgentState) => void): void {}
  onTaskUpdate(_callback: (task: TaskState) => void): void {}

  async assignAgent(agentId: string, stationId: string): Promise<void> {
    this.send({ type: 'task:assign', payload: { agentId, stationId } });
  }

  async sendCommand(agentId: string, command: string): Promise<void> {
    this.send({ type: 'command', payload: { agentId, command } });
  }

  startMission(prompt: string, backend?: string): void {
    this.send({ type: 'start_mission', prompt, backend });
  }

  abortMission(): void {
    this.send({ type: 'abort_mission' });
  }

  isConnected(): boolean {
    return this.connected;
  }

  private send(msg: unknown): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  private handleMessage(msg: Record<string, unknown>): void {
    const type = msg.type as string;

    switch (type) {
      case 'mission_state': {
        this.agentCache.clear();
        const agents = (msg.agents as any[]) ?? [];
        const agentStates: AgentState[] = agents.map((a) => {
          const state = this.buildFullAgentState(a);
          this.agentCache.set(state.id, state);
          return state;
        });
        eventBus.emit('mission:state', {
          missionId: (msg.missionId as string) ?? null,
          status: (msg.status as string) ?? 'idle',
          agents: agentStates,
        });
        break;
      }

      case 'mission_started':
        this.agentCache.clear();
        eventBus.emit('mission:started', { missionId: msg.missionId as string });
        break;

      case 'mission_complete':
        this.agentCache.clear();
        eventBus.emit('mission:complete', { summary: msg.summary as string });
        break;

      case 'mission_error':
        eventBus.emit('mission:error', { message: msg.message as string });
        break;

      case 'orchestrator_thinking':
        eventBus.emit('orchestrator:thinking', {});
        break;

      case 'orchestrator_spawning':
        eventBus.emit('orchestrator:spawning', {
          round: msg.round as number,
          agents: msg.agents as { id: string; name: string; role: string }[],
        });
        break;

      case 'agent:spawn': {
        const p = msg.payload as any;
        const state = this.buildFullAgentState(p);
        this.agentCache.set(state.id, state);
        eventBus.emit('agent:spawned', { agent: state });
        break;
      }

      case 'agent:update': {
        const p = msg.payload as any;
        const state = this.mergeAgentUpdate(p);
        eventBus.emit('agent:updated', { agent: state });
        break;
      }

      case 'agent:remove': {
        const p = msg.payload as any;
        this.agentCache.delete(p.id);
        eventBus.emit('agent:removed', { agentId: p.id });
        break;
      }

      default:
        console.log('[WS] Unhandled:', type, msg);
    }
  }

  private buildFullAgentState(raw: any): AgentState {
    const role = raw.role ?? 'backend';
    const station = roleToStation(role);
    const status = raw.status === 'error' ? 'done' : (raw.status ?? 'idle');
    return {
      id: raw.id,
      name: raw.name ?? 'Agent',
      type: (raw.type ?? 'worker') as AgentType,
      status,
      currentStation: raw.currentStation ?? station,
      task: raw.task ?? null,
      x: raw.x ?? 0,
      y: raw.y ?? 0,
      logs: raw.logs ?? [],
    };
  }

  private mergeAgentUpdate(partial: any): AgentState {
    const cached = this.agentCache.get(partial.id);
    if (!cached) {
      return this.buildFullAgentState(partial);
    }

    const merged: AgentState = { ...cached };
    if (partial.status !== undefined) {
      merged.status = partial.status === 'error' ? 'done' : partial.status;
    }
    if (partial.logs !== undefined) {
      merged.logs = partial.logs;
    }
    if (partial.currentStation !== undefined) {
      merged.currentStation = partial.currentStation;
    }
    if (partial.task !== undefined) {
      merged.task = partial.task;
    }
    if (partial.name !== undefined) {
      merged.name = partial.name;
    }

    this.agentCache.set(merged.id, merged);
    return merged;
  }
}
