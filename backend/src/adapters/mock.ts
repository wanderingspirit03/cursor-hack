import { randomUUID } from "node:crypto";
import type { AgentBackend, AgentEvent, AgentResult } from "./types.js";

const MOCK_TOOLS = [
  { name: "read", args: { file_path: "src/index.ts" }, log: "Reading index.ts", duration: 800 },
  { name: "read", args: { file_path: "package.json" }, log: "Reading package.json", duration: 600 },
  { name: "grep", args: { pattern: "TODO" }, log: "Searching for TODOs", duration: 1000 },
  { name: "bash", args: { command: "npm test" }, log: "Running: npm test", duration: 2000 },
  { name: "write", args: { file_path: "src/utils.ts" }, log: "Writing utils.ts", duration: 1500 },
  { name: "edit", args: { file_path: "src/App.tsx" }, log: "Editing App.tsx", duration: 1200 },
  { name: "bash", args: { command: "npm run build" }, log: "Running: npm run build", duration: 2500 },
  { name: "write", args: { file_path: "src/components/Button.tsx" }, log: "Writing Button.tsx", duration: 1800 },
];

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function pickRandom<T>(arr: T[], count: number): T[] {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

export class MockAdapter implements AgentBackend {
  name = "mock";

  async runAgent(config: {
    cwd: string;
    task: string;
    onEvent: (event: AgentEvent) => void;
    signal?: AbortSignal;
  }): Promise<AgentResult> {
    // Simulate thinking
    config.onEvent({ type: "thinking" });
    config.onEvent({ type: "log", message: "Analyzing task..." });
    await delay(1000 + Math.random() * 1000);

    if (config.signal?.aborted) return { success: false, summary: "Aborted" };

    // Simulate 2-4 tool calls
    const tools = pickRandom(MOCK_TOOLS, 2 + Math.floor(Math.random() * 3));
    for (const tool of tools) {
      if (config.signal?.aborted) return { success: false, summary: "Aborted" };

      config.onEvent({ type: "tool_start", toolName: tool.name, args: tool.args });
      config.onEvent({ type: "log", message: tool.log });
      await delay(tool.duration + Math.random() * 500);
      config.onEvent({ type: "tool_end", toolId: randomUUID() });
    }

    const summary = `Completed: ${config.task.slice(0, 100)}`;
    config.onEvent({ type: "log", message: "Done." });
    return { success: true, summary };
  }
}
