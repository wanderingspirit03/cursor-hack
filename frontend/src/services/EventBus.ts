import type { AgentState, StationState } from '../game/entities/AgentTypes';

export interface GameEvents {
  'agent:selected': { agentId: string };
  'agent:deselected': {};
  'agent:updated': { agent: AgentState };
  'agent:spawned': { agent: AgentState };
  'agent:removed': { agentId: string };
  'station:clicked': { stationId: string };
  'station:updated': { station: StationState };
  'command:assign': { agentId: string; stationId: string };
  'command:send': { agentId: string; command: string };
  'camera:follow': { agentId: string };
  'camera:unfollow': {};
}

type EventCallback<T> = (data: T) => void;

class EventBus {
  private listeners = new Map<string, Set<EventCallback<unknown>>>();

  on<K extends keyof GameEvents>(event: K, callback: EventCallback<GameEvents[K]>): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback as EventCallback<unknown>);
  }

  off<K extends keyof GameEvents>(event: K, callback: EventCallback<GameEvents[K]>): void {
    this.listeners.get(event)?.delete(callback as EventCallback<unknown>);
  }

  emit<K extends keyof GameEvents>(event: K, data: GameEvents[K]): void {
    this.listeners.get(event)?.forEach((cb) => cb(data));
  }
}

export const eventBus = new EventBus();
