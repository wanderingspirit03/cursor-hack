export type AgentType = 'worker' | 'robot' | 'drone';

export type AgentStatus = 'idle' | 'assigned' | 'walking' | 'working' | 'done' | 'error';

export interface AgentState {
  id: string;
  name: string;
  type: AgentType;
  status: AgentStatus;
  currentStation: string | null;
  task: TaskState | null;
  x: number;
  y: number;
  logs: LogEntry[];
}

export interface TaskState {
  id: string;
  type: string;
  description: string;
  stationId: string;
  progress: number; // 0-100
  startedAt: number;
}

export interface LogEntry {
  timestamp: number;
  message: string;
  type: 'info' | 'success' | 'error' | 'warning';
}

export interface StationState {
  id: string;
  label: string;
  status: 'idle' | 'active' | 'error';
  assignedAgentId: string | null;
}

export const AGENT_NAMES: Record<AgentType, string[]> = {
  worker: ['Ada', 'Linus', 'Grace', 'Dennis', 'Margaret', 'Ken', 'Barbara', 'Bjarne'],
  robot: ['RX-7', 'CL-4', 'MK-9', 'ND-2', 'QT-5', 'ZP-8'],
  drone: ['Scout-1', 'Hawk-3', 'Raven-2', 'Falcon-5', 'Osprey-4'],
};

export const TASK_TYPES = [
  { type: 'compile', description: 'Compiling module', station: 'coding-desk' },
  { type: 'test', description: 'Running test suite', station: 'test-chamber' },
  { type: 'review', description: 'Code review pass', station: 'review-terminal' },
  { type: 'deploy', description: 'Deploying build', station: 'deploy-bay' },
  { type: 'process', description: 'Processing data batch', station: 'data-pipeline' },
  { type: 'refactor', description: 'Refactoring legacy code', station: 'coding-desk' },
  { type: 'debug', description: 'Debugging failing tests', station: 'test-chamber' },
  { type: 'analyze', description: 'Analyzing data stream', station: 'data-pipeline' },
];
