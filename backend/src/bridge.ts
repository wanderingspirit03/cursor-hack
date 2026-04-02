/**
 * Bridge module: translates pi-agent-core events to pixel-agents frontend messages.
 *
 * The bridge subscribes to a pi Agent instance's events and emits pixel-agents
 * protocol messages via a broadcast function.
 */

/** The event shape from pi-agent-core's Agent.subscribe(). */
export interface PiAgentEvent {
  type: string;
  toolCallId?: string;
  toolName?: string;
  args?: Record<string, unknown>;
  message?: Record<string, unknown>;
  messages?: Record<string, unknown>[];
  result?: unknown;
  isError?: boolean;
  toolResults?: unknown[];
}

/**
 * Format a pi tool call into a human-readable status string for the pixel-agents UI.
 *
 * Special case: if toolName is 'task' or 'agent', the status starts with "Subtask:"
 * which triggers sub-agent character spawning in the frontend.
 */
export function formatToolStatus(toolName: string, args: Record<string, unknown> | undefined): string {
  const safeArgs = args ?? {};

  switch (toolName.toLowerCase()) {
    case "read": {
      const filename = (safeArgs.file_path ?? safeArgs.path ?? safeArgs.filePath ?? "file") as string;
      return `Reading ${basename(filename)}`;
    }
    case "write": {
      const filename = (safeArgs.file_path ?? safeArgs.path ?? safeArgs.filePath ?? "file") as string;
      return `Writing ${basename(filename)}`;
    }
    case "edit": {
      const filename = (safeArgs.file_path ?? safeArgs.path ?? safeArgs.filePath ?? "file") as string;
      return `Editing ${basename(filename)}`;
    }
    case "bash":
    case "execute": {
      const command = (safeArgs.command ?? safeArgs.cmd ?? "") as string;
      const truncated = command.length > 60 ? command.slice(0, 57) + "..." : command;
      return `Running: ${truncated}`;
    }
    case "task":
    case "agent": {
      const description = (safeArgs.description ?? safeArgs.prompt ?? safeArgs.message ?? "working...") as string;
      const truncated = description.length > 60 ? description.slice(0, 57) + "..." : description;
      return `Subtask: ${truncated}`;
    }
    case "dispatch": {
      const tasks = safeArgs.tasks as Array<Record<string, unknown>> | undefined;
      if (tasks && tasks.length > 0) {
        const first = (tasks[0].action ?? tasks[0].thread ?? "tasks") as string;
        const truncated = first.length > 40 ? first.slice(0, 37) + "..." : first;
        return `Dispatching ${tasks.length} tasks: ${truncated}`;
      }
      return "Dispatching parallel tasks";
    }
    case "grep":
    case "glob":
    case "find": {
      return "Searching files";
    }
    case "ls": {
      return "Listing directory";
    }
    default: {
      const firstArgKey = Object.keys(safeArgs)[0];
      const firstArgVal = firstArgKey ? String(safeArgs[firstArgKey]) : "";
      const label = toolName.charAt(0).toUpperCase() + toolName.slice(1);
      if (firstArgVal) {
        const truncated = firstArgVal.length > 50 ? firstArgVal.slice(0, 47) + "..." : firstArgVal;
        return `${label}: ${truncated}`;
      }
      return label;
    }
  }
}

/**
 * Create a bridge that subscribes to pi-agent-core events for a given agent
 * and emits pixel-agents protocol messages.
 *
 * @param agentId - Numeric ID for this agent in the pixel-agents UI
 * @param broadcast - Function to broadcast messages to all WebSocket clients
 * @returns An event handler compatible with pi-agent-core Agent.subscribe()
 */
export function createBridgeHandler(
  agentId: number,
  broadcast: (msg: Record<string, unknown>) => void,
): (event: PiAgentEvent) => void {
  return (event: PiAgentEvent) => {
    switch (event.type) {
      case "agent_start":
        // Note: agentCreated is sent separately when the agent is first created,
        // not on every agent_start. agent_start means a new prompt run began.
        broadcast({ type: "agentStatus", id: agentId, status: "active" });
        break;

      case "turn_start":
        broadcast({ type: "agentStatus", id: agentId, status: "active" });
        broadcast({ type: "agentToolsClear", id: agentId });
        break;

      case "message_start": {
        const thinkingId = `thinking-${agentId}-${Date.now()}`;
        broadcast({
          type: "agentToolStart",
          id: agentId,
          toolId: thinkingId,
          status: "Thinking...",
        });
        break;
      }

      case "message_end":
        broadcast({ type: "agentToolsClear", id: agentId });
        break;

      case "tool_execution_start":
        broadcast({
          type: "agentToolStart",
          id: agentId,
          toolId: event.toolCallId,
          status: formatToolStatus(event.toolName ?? "unknown", event.args),
        });
        break;

      case "tool_execution_end":
        broadcast({
          type: "agentToolDone",
          id: agentId,
          toolId: event.toolCallId,
        });
        break;

      case "turn_end":
        // Turn finished — tools are done for this turn
        break;

      case "agent_end":
        broadcast({ type: "agentToolsClear", id: agentId });
        broadcast({ type: "agentStatus", id: agentId, status: "waiting" });
        break;

      // message_start, message_update, message_end — no pixel-agents equivalent
      default:
        break;
    }
  };
}

/**
 * Emit the "agent created" message. Called once when an agent is first added.
 */
export function emitAgentCreated(
  agentId: number,
  broadcast: (msg: Record<string, unknown>) => void,
  folderName?: string,
): void {
  broadcast({ type: "agentCreated", id: agentId, folderName });
}

/**
 * Emit the "agent closed" message. Called when an agent is removed.
 */
export function emitAgentClosed(
  agentId: number,
  broadcast: (msg: Record<string, unknown>) => void,
): void {
  broadcast({ type: "agentClosed", id: agentId });
}

/** Helper to extract basename from a file path. */
function basename(filePath: string): string {
  const parts = filePath.split("/");
  return parts[parts.length - 1] ?? filePath;
}
