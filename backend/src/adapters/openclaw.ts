import { getModel } from "@mariozechner/pi-ai";
import {
  AuthStorage,
  createAgentSession,
  createCodingTools,
  ModelRegistry,
  SessionManager,
} from "@mariozechner/pi-coding-agent";
import type { AgentBackend, AgentEvent, AgentResult } from "./types.js";

export class OpenClawAdapter implements AgentBackend {
  name = "openclaw";

  async runAgent(config: {
    cwd: string;
    task: string;
    onEvent: (event: AgentEvent) => void;
    signal?: AbortSignal;
  }): Promise<AgentResult> {
    const modelId = process.env.AGENT_MODEL ?? "anthropic/claude-sonnet-4";
    const model = getModel("openrouter", modelId as any);
    if (!model) throw new Error(`Model ${modelId} not found`);

    const authStorage = AuthStorage.create();
    const modelRegistry = ModelRegistry.create(authStorage);

    const { session } = await createAgentSession({
      model,
      thinkingLevel: "low",
      cwd: config.cwd,
      agentDir: "/tmp/factory-agent",  // Skip pi extensions (e.g. pi-threads)
      tools: createCodingTools(config.cwd),
      authStorage,
      modelRegistry,
      sessionManager: SessionManager.inMemory(),
    });

    if (config.signal?.aborted) {
      session.abort();
      return { success: false, summary: "Aborted before start" };
    }

    config.signal?.addEventListener("abort", () => {
      session.abort();
    });

    return new Promise<AgentResult>((resolve) => {
      let lastToolName = "";

      const unsubscribe = session.subscribe((event: any) => {
        switch (event.type) {
          case "message_start":
            config.onEvent({ type: "thinking" });
            break;
          case "tool_execution_start":
            lastToolName = event.toolName ?? "unknown";
            config.onEvent({
              type: "tool_start",
              toolName: lastToolName,
              args: event.args ?? {},
            });
            config.onEvent({
              type: "log",
              message: formatToolLog(lastToolName, event.args),
            });
            break;
          case "tool_execution_end":
            config.onEvent({ type: "tool_end", toolId: event.toolCallId ?? "" });
            break;
          case "agent_end":
            unsubscribe();
            resolve({ success: true, summary: "Agent completed" });
            break;
        }
      });

      session.prompt(config.task).catch((err) => {
        unsubscribe();
        config.onEvent({ type: "error", message: String(err) });
        resolve({ success: false, summary: String(err) });
      });
    });
  }
}

function formatToolLog(toolName: string, args?: Record<string, unknown>): string {
  const a = args ?? {};
  switch (toolName.toLowerCase()) {
    case "read":
      return `Reading ${basename(String(a.file_path ?? a.path ?? "file"))}`;
    case "write":
      return `Writing ${basename(String(a.file_path ?? a.path ?? "file"))}`;
    case "edit":
      return `Editing ${basename(String(a.file_path ?? a.path ?? "file"))}`;
    case "bash":
    case "execute": {
      const cmd = String(a.command ?? a.cmd ?? "");
      return `Running: ${cmd.length > 80 ? cmd.slice(0, 77) + "..." : cmd}`;
    }
    default:
      return `${toolName}(${JSON.stringify(a).slice(0, 80)})`;
  }
}

function basename(p: string): string {
  return p.split("/").pop() ?? p;
}
