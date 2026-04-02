export type AgentEvent =
  | { type: "thinking" }
  | { type: "tool_start"; toolName: string; args: Record<string, unknown> }
  | { type: "tool_end"; toolId: string }
  | { type: "log"; message: string }
  | { type: "error"; message: string };

export interface AgentResult {
  summary: string;
  success: boolean;
}

export interface AgentBackend {
  name: string;

  runAgent(config: {
    cwd: string;
    task: string;
    role?: string;
    memoryContext?: string;
    onEvent: (event: AgentEvent) => void;
    signal?: AbortSignal;
  }): Promise<AgentResult>;
}
