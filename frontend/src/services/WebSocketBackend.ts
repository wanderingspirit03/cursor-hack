import type { AgentBackendService } from './AgentService';
import type { AgentState, TaskState } from '../game/entities/AgentTypes';

/**
 * Stub WebSocket backend — your friend fills this in.
 *
 * Expected WebSocket protocol:
 * { "type": "agent:spawn", "payload": { "id": "...", "type": "worker", ... } }
 * { "type": "agent:update", "payload": { "id": "...", "status": "working", ... } }
 * { "type": "agent:remove", "payload": { "id": "..." } }
 * { "type": "task:assign", "payload": { "agentId": "...", "stationId": "..." } }
 * { "type": "command", "payload": { "agentId": "...", "command": "..." } }
 */
export class WebSocketBackendService implements AgentBackendService {
  private ws: WebSocket | null = null;
  private url: string;

  constructor(url = 'ws://localhost:8080') {
    this.url = url;
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.url);
      this.ws.onopen = () => resolve();
      this.ws.onerror = (e) => reject(e);
      this.ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        this.handleMessage(msg);
      };
    });
  }

  disconnect(): void {
    this.ws?.close();
    this.ws = null;
  }

  onAgentUpdate(_callback: (agent: AgentState) => void): void {
    // TODO: wire to WebSocket messages
  }

  onTaskUpdate(_callback: (task: TaskState) => void): void {
    // TODO: wire to WebSocket messages
  }

  async assignAgent(agentId: string, stationId: string): Promise<void> {
    this.send({ type: 'task:assign', payload: { agentId, stationId } });
  }

  async sendCommand(agentId: string, command: string): Promise<void> {
    this.send({ type: 'command', payload: { agentId, command } });
  }

  private send(msg: unknown): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  private handleMessage(msg: { type: string; payload: unknown }): void {
    // TODO: parse incoming messages and emit via EventBus
    console.log('[WebSocket]', msg);
  }
}
