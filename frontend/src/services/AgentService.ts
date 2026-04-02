import type { AgentState, TaskState } from '../game/entities/AgentTypes';

export interface AgentBackendService {
  connect(): Promise<void>;
  disconnect(): void;
  onAgentUpdate(callback: (agent: AgentState) => void): void;
  onTaskUpdate(callback: (task: TaskState) => void): void;
  assignAgent(agentId: string, stationId: string): Promise<void>;
  sendCommand(agentId: string, command: string): Promise<void>;
}
