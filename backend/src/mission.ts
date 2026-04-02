import { randomUUID } from "node:crypto";
import { getModel } from "@mariozechner/pi-ai";
import { Type } from "@sinclair/typebox";
import {
  AuthStorage,
  createAgentSession,
  ModelRegistry,
  SessionManager,
  type ToolDefinition,
  type AgentToolResult,
} from "@mariozechner/pi-coding-agent";
import type { AgentBackend, AgentEvent, AgentResult } from "./adapters/types.js";
import { PiAdapter } from "./adapters/pi.js";
import { MockAdapter } from "./adapters/mock.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MissionAgent {
  id: string;
  name: string;
  status: "idle" | "working" | "done" | "error";
  logs: { timestamp: number; message: string; type: "info" | "success" | "error" | "warning" }[];
  currentTool: string | null;
  result?: AgentResult;
}

export interface MissionState {
  missionId: string;
  status: "running" | "complete" | "error" | "idle";
  agents: Map<string, MissionAgent>;
  summary?: string;
}

type Broadcast = (msg: Record<string, unknown>) => void;

// ---------------------------------------------------------------------------
// Adapter selection
// ---------------------------------------------------------------------------

function getAdapter(backendName?: string): AgentBackend {
  if (!process.env.OPENROUTER_API_KEY) return new MockAdapter();
  if (backendName === "mock") return new MockAdapter();
  return new PiAdapter();
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_CONCURRENT_AGENTS = Number(process.env.MAX_CONCURRENT_AGENTS ?? 5);
const AGENT_TIMEOUT_MS = Number(process.env.AGENT_TIMEOUT_MS ?? 5 * 60 * 1000);

const ORCHESTRATOR_SYSTEM_PROMPT = `You are a software factory orchestrator. You receive a task from the user and break it down into work for sub-agents. Each sub-agent is a full coding agent that can read, write, edit files and run commands in the repository.

Rules:
- Break the task into parallel work when possible using spawn_agents
- Give each agent a clear, specific task description
- Never assign two agents work on the same file. Separate agents by file/directory scope.
- Review agent results and spawn more agents if needed
- When all work is done, summarize what was accomplished`;

// ---------------------------------------------------------------------------
// Mission runner
// ---------------------------------------------------------------------------

let currentMission: MissionState | null = null;
let missionAbortController: AbortController | null = null;

export function getCurrentMission(): MissionState | null {
  return currentMission;
}

export async function startMission(
  prompt: string,
  broadcast: Broadcast,
  backendName?: string,
): Promise<void> {
  if (currentMission?.status === "running") {
    broadcast({ type: "mission_error", message: "A mission is already running" });
    return;
  }

  const missionId = randomUUID().slice(0, 8);
  const adapter = getAdapter(backendName);
  missionAbortController = new AbortController();

  currentMission = {
    missionId,
    status: "running",
    agents: new Map(),
  };

  broadcast({ type: "mission_started", missionId });
  console.log(`[mission] Started mission ${missionId} with ${adapter.name} backend`);

  try {
    const summary = await runOrchestrator(prompt, adapter, broadcast, missionAbortController.signal);
    currentMission.status = "complete";
    currentMission.summary = summary;
    broadcast({ type: "mission_complete", summary });
    console.log(`[mission] Mission ${missionId} complete`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    currentMission.status = "error";
    broadcast({ type: "mission_error", message: msg });
    console.error(`[mission] Mission ${missionId} error:`, msg);
  }
}

export function abortMission(broadcast: Broadcast): void {
  if (!currentMission || currentMission.status !== "running") return;
  missionAbortController?.abort();
  currentMission.status = "error";
  broadcast({ type: "mission_error", message: "Mission aborted by user" });
  console.log(`[mission] Mission ${currentMission.missionId} aborted`);
}

// ---------------------------------------------------------------------------
// Orchestrator session (bypasses adapter, uses pi SDK directly)
// ---------------------------------------------------------------------------

async function runOrchestrator(
  userPrompt: string,
  adapter: AgentBackend,
  broadcast: Broadcast,
  signal: AbortSignal,
): Promise<string> {
  const cwd = process.env.FACTORY_REPO_PATH ?? process.cwd();

  // If no API key, run a simple mock orchestrator
  if (!process.env.OPENROUTER_API_KEY) {
    return runMockOrchestrator(userPrompt, adapter, broadcast, signal, cwd);
  }

  const modelId = process.env.ORCHESTRATOR_MODEL ?? "anthropic/claude-sonnet-4";
  const model = getModel("openrouter", modelId as any);
  if (!model) throw new Error(`Orchestrator model ${modelId} not found`);

  const authStorage = AuthStorage.create();
  const modelRegistry = ModelRegistry.create(authStorage);

  let round = 0;

  const SpawnAgentsParams = Type.Object({
    agents: Type.Array(
      Type.Object({
        name: Type.String({ description: "Short name for this agent (e.g. 'Setup', 'Frontend', 'Tests')" }),
        task: Type.String({ description: "Detailed task description for the agent" }),
      }),
      { description: "Array of agents to spawn" },
    ),
  });

  const spawnAgentsTool: ToolDefinition = {
    name: "spawn_agents",
    label: "Spawn Agents",
    description: "Spawn one or more coding agents to work on tasks in parallel. Each agent can read, write, edit files and run commands.",
    parameters: SpawnAgentsParams,
    execute: async (_toolCallId, params, _signal, _onUpdate, _ctx) => {
      const args = params as { agents: { name: string; task: string }[] };
      round++;
      const agentDefs = args.agents.slice(0, MAX_CONCURRENT_AGENTS);

      broadcast({
        type: "orchestrator_spawning",
        round,
        agents: agentDefs.map((a) => ({ id: randomUUID().slice(0, 8), name: a.name })),
      });

      const results = await runAgentBatch(agentDefs, adapter, broadcast, signal, cwd);
      const resultText = JSON.stringify(results);

      return {
        content: [{ type: "text", text: resultText }],
        details: results,
      } as AgentToolResult<any>;
    },
  };

  const { session } = await createAgentSession({
    model,
    thinkingLevel: "low",
    cwd,
    customTools: [spawnAgentsTool],
    authStorage,
    modelRegistry,
    sessionManager: SessionManager.inMemory(),
  });

  if (signal.aborted) {
    session.abort();
    throw new Error("Aborted");
  }
  signal.addEventListener("abort", () => session.abort());

  // Subscribe to orchestrator events
  const unsub = session.subscribe((event: any) => {
    if (event.type === "message_start") {
      broadcast({ type: "orchestrator_thinking" });
    }
  });

  try {
    await session.prompt(userPrompt);
    // Wait for agent_end
    await new Promise<void>((resolve) => {
      const u = session.subscribe((e: any) => {
        if (e.type === "agent_end") { u(); resolve(); }
      });
    });
  } finally {
    unsub();
  }

  return currentMission?.summary ?? "Mission complete";
}

// ---------------------------------------------------------------------------
// Mock orchestrator (no API key)
// ---------------------------------------------------------------------------

async function runMockOrchestrator(
  userPrompt: string,
  adapter: AgentBackend,
  broadcast: Broadcast,
  signal: AbortSignal,
  cwd: string,
): Promise<string> {
  console.log(`[mission] Mock orchestrator analyzing: "${userPrompt.slice(0, 80)}..."`);
  broadcast({ type: "orchestrator_thinking" });
  await delay(2000);

  // Mock: generate 2-3 agents based on the prompt
  const mockAgents = [
    { name: "Scaffolder", task: `Set up the project structure for: ${userPrompt}` },
    { name: "Implementer", task: `Implement the core logic for: ${userPrompt}` },
  ];
  if (userPrompt.toLowerCase().includes("test")) {
    mockAgents.push({ name: "Tester", task: `Write tests for: ${userPrompt}` });
  }

  broadcast({
    type: "orchestrator_spawning",
    round: 1,
    agents: mockAgents.map((a) => ({ id: randomUUID().slice(0, 8), name: a.name })),
  });

  const results = await runAgentBatch(mockAgents, adapter, broadcast, signal, cwd);

  const succeeded = results.filter((r) => r.success).length;
  return `Mock mission complete: ${succeeded}/${results.length} agents succeeded`;
}

// ---------------------------------------------------------------------------
// Agent batch runner
// ---------------------------------------------------------------------------

async function runAgentBatch(
  agentDefs: { name: string; task: string }[],
  adapter: AgentBackend,
  broadcast: Broadcast,
  parentSignal: AbortSignal,
  cwd: string,
): Promise<AgentResult[]> {
  const promises = agentDefs.map((def) =>
    runSingleAgent(def, adapter, broadcast, parentSignal, cwd),
  );
  return Promise.all(promises);
}

async function runSingleAgent(
  def: { name: string; task: string },
  adapter: AgentBackend,
  broadcast: Broadcast,
  parentSignal: AbortSignal,
  cwd: string,
): Promise<AgentResult> {
  const agentId = randomUUID().slice(0, 8);

  const agent: MissionAgent = {
    id: agentId,
    name: def.name,
    status: "idle",
    logs: [],
    currentTool: null,
  };
  currentMission?.agents.set(agentId, agent);

  // Emit spawn
  broadcast({
    type: "agent:spawn",
    payload: {
      id: agentId,
      name: def.name,
      type: "worker",
      status: "idle",
      currentStation: null,
      task: { id: randomUUID().slice(0, 8), type: "compile", description: def.task, stationId: "coding-desk", progress: 0, startedAt: Date.now() },
      x: 0,
      y: 0,
      logs: [],
    },
  });

  // Per-agent abort (timeout + parent)
  const agentAbort = new AbortController();
  const timeout = setTimeout(() => agentAbort.abort(), AGENT_TIMEOUT_MS);
  if (parentSignal.aborted) agentAbort.abort();
  parentSignal.addEventListener("abort", () => agentAbort.abort());

  agent.status = "working";
  broadcast({
    type: "agent:update",
    payload: { id: agentId, status: "working" },
  });

  try {
    const result = await adapter.runAgent({
      cwd,
      task: def.task,
      signal: agentAbort.signal,
      onEvent: (event: AgentEvent) => {
        handleAgentEvent(agentId, agent, event, broadcast);
      },
    });

    clearTimeout(timeout);
    agent.status = "done";
    agent.result = result;
    appendLog(agent, result.success ? "success" : "error", result.summary);

    broadcast({
      type: "agent:update",
      payload: { id: agentId, status: "done" },
    });

    // Remove after brief delay so frontend can show "done" state
    setTimeout(() => {
      broadcast({ type: "agent:remove", payload: { id: agentId } });
    }, 2000);

    return result;
  } catch (err) {
    clearTimeout(timeout);
    const msg = err instanceof Error ? err.message : String(err);
    agent.status = "error";
    appendLog(agent, "error", msg);

    broadcast({
      type: "agent:update",
      payload: { id: agentId, status: "done" },
    });
    broadcast({ type: "agent:remove", payload: { id: agentId } });

    return { success: false, summary: msg };
  }
}

// ---------------------------------------------------------------------------
// Event handling
// ---------------------------------------------------------------------------

function handleAgentEvent(
  agentId: string,
  agent: MissionAgent,
  event: AgentEvent,
  broadcast: Broadcast,
): void {
  switch (event.type) {
    case "thinking":
      broadcast({
        type: "agent:update",
        payload: { id: agentId, status: "working" },
      });
      break;

    case "tool_start":
      agent.currentTool = event.toolName;
      appendLog(agent, "info", formatToolStatus(event.toolName, event.args));
      broadcast({
        type: "agent:update",
        payload: {
          id: agentId,
          status: "working",
          logs: agent.logs,
        },
      });
      break;

    case "tool_end":
      agent.currentTool = null;
      break;

    case "log":
      appendLog(agent, "info", event.message);
      broadcast({
        type: "agent:update",
        payload: { id: agentId, logs: agent.logs },
      });
      break;

    case "error":
      appendLog(agent, "error", event.message);
      broadcast({
        type: "agent:update",
        payload: { id: agentId, logs: agent.logs },
      });
      break;
  }
}

function appendLog(agent: MissionAgent, type: "info" | "success" | "error" | "warning", message: string): void {
  agent.logs.push({ timestamp: Date.now(), message, type });
  // Keep last 50 logs
  if (agent.logs.length > 50) agent.logs.splice(0, agent.logs.length - 50);
}

function formatToolStatus(toolName: string, args: Record<string, unknown>): string {
  switch (toolName.toLowerCase()) {
    case "read": return `Reading ${basename(String(args.file_path ?? args.path ?? "file"))}`;
    case "write": return `Writing ${basename(String(args.file_path ?? args.path ?? "file"))}`;
    case "edit": return `Editing ${basename(String(args.file_path ?? args.path ?? "file"))}`;
    case "bash":
    case "execute": {
      const cmd = String(args.command ?? args.cmd ?? "");
      return `Running: ${cmd.length > 60 ? cmd.slice(0, 57) + "..." : cmd}`;
    }
    case "grep":
    case "glob":
    case "find": return "Searching files";
    case "ls": return "Listing directory";
    default: return `${toolName}`;
  }
}

function basename(p: string): string { return p.split("/").pop() ?? p; }
function delay(ms: number): Promise<void> { return new Promise((r) => setTimeout(r, ms)); }
