import { randomUUID } from "node:crypto";
import { getModel } from "@mariozechner/pi-ai";
import { Type } from "@sinclair/typebox";
import {
  AuthStorage,
  createAgentSession,
  DefaultResourceLoader,
  ModelRegistry,
  SessionManager,
  type AgentToolResult,
  type ToolDefinition,
} from "@mariozechner/pi-coding-agent";
import type { AgentBackend, AgentEvent, AgentResult } from "./adapters/types.js";
import { MockAdapter } from "./adapters/mock.js";
import { PiAdapter } from "./adapters/pi.js";
import {
  KNOWN_ROLES,
  isKnownRole,
  loadRoleMemory,
  updateRoleMemory,
  type KnownRole,
} from "./memory.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SpawnedAgentDef {
  name: string;
  role: KnownRole;
  task: string;
}

export interface MissionAgent {
  id: string;
  name: string;
  role: KnownRole;
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

Available roles: ${KNOWN_ROLES.join(", ")}.

Role and memory rules:
- Every spawned agent must be assigned exactly one role from the available role list.
- Use roles consistently so each specialty builds durable memory over time.
- Agents automatically receive the saved memory for their assigned role as additional context.
- After reviewing agent results, call update_role_memory to persist important durable learnings for the relevant role.
- Use the orchestrator role for your own durable operating memory when useful.

Execution rules:
- Break the task into parallel work when possible using spawn_agents.
- Give each agent a clear, specific task description.
- Never assign two agents work on the same file. Separate agents by file/directory scope.
- Review agent results and spawn more agents if needed.
- Update role memory only with stable facts, not speculation.
- When all work is done, summarize what was accomplished.`;

const RoleSchema = Type.Union([
  Type.Literal("frontend"),
  Type.Literal("backend"),
  Type.Literal("testing"),
  Type.Literal("devops"),
  Type.Literal("database"),
  Type.Literal("orchestrator"),
]);

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
  const orchestratorMemory = await loadRoleMemory(cwd, "orchestrator");

  let round = 0;

  const SpawnAgentsParams = Type.Object({
    agents: Type.Array(
      Type.Object({
        name: Type.String({ description: "Short name for this agent (e.g. 'Setup', 'Frontend', 'Tests')" }),
        role: RoleSchema,
        task: Type.String({ description: "Detailed task description for the agent" }),
      }),
      { description: "Array of agents to spawn" },
    ),
  });

  const UpdateRoleMemoryParams = Type.Object({
    role: RoleSchema,
    truths: Type.Array(
      Type.String({ description: "A durable fact or learning worth saving for this role" }),
      { description: "Facts to append to this role's persistent memory" },
    ),
  });

  const spawnAgentsTool: ToolDefinition = {
    name: "spawn_agents",
    label: "Spawn Agents",
    description: "Spawn one or more coding agents to work on tasks in parallel. Each agent must have a role from the known role set and will receive that role's saved memory as context.",
    parameters: SpawnAgentsParams,
    execute: async (_toolCallId, params, _signal, _onUpdate, _ctx) => {
      const args = params as { agents: { name: string; role: string; task: string }[] };
      const requestedAgents = args.agents
        .filter((agent): agent is { name: string; role: KnownRole; task: string } => isKnownRole(agent.role))
        .slice(0, MAX_CONCURRENT_AGENTS);

      if (requestedAgents.length === 0) {
        return {
          content: [{ type: "text", text: "No valid agents were provided." }],
          details: [],
        } as AgentToolResult<any>;
      }

      round++;

      broadcast({
        type: "orchestrator_spawning",
        round,
        agents: requestedAgents.map((a) => ({ id: randomUUID().slice(0, 8), name: a.name, role: a.role })),
      });

      const results = await runAgentBatch(requestedAgents, adapter, broadcast, signal, cwd);
      const resultText = JSON.stringify(results);

      return {
        content: [{ type: "text", text: resultText }],
        details: results,
      } as AgentToolResult<any>;
    },
  };

  const updateRoleMemoryTool: ToolDefinition = {
    name: "update_role_memory",
    label: "Update Role Memory",
    description: "Append durable truths to a role's persistent memory file.",
    parameters: UpdateRoleMemoryParams,
    execute: async (_toolCallId, params) => {
      const args = params as { role: string; truths: string[] };
      if (!isKnownRole(args.role)) {
        throw new Error(`Unknown role: ${args.role}`);
      }

      const updatedMemory = await updateRoleMemory(cwd, args.role, args.truths);
      const truthCount = args.truths.map((truth) => truth.trim()).filter(Boolean).length;
      const message = truthCount > 0
        ? `Updated ${args.role} memory with ${truthCount} truth${truthCount === 1 ? "" : "s"}.`
        : `No new truths were added to ${args.role} memory.`;

      return {
        content: [{ type: "text", text: message }],
        details: { role: args.role, truths: args.truths, memory: updatedMemory },
      } as AgentToolResult<any>;
    },
  };

  const resourceLoader = new DefaultResourceLoader({
    cwd,
    appendSystemPromptOverride: (base) => [
      ...base,
      ORCHESTRATOR_SYSTEM_PROMPT,
      ...(orchestratorMemory.trim()
        ? [
            [
              "## Persistent Role Memory",
              "Role: orchestrator",
              "Use these saved truths as durable context, but verify them against the current repository before acting.",
              orchestratorMemory.trim(),
            ].join("\n\n"),
          ]
        : []),
    ],
  });
  await resourceLoader.reload();

  const { session } = await createAgentSession({
    model,
    thinkingLevel: "low",
    cwd,
    resourceLoader,
    customTools: [spawnAgentsTool, updateRoleMemoryTool],
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
        if (e.type === "agent_end") {
          u();
          resolve();
        }
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
  const mockAgents: SpawnedAgentDef[] = [
    { name: "Scaffolder", role: "devops", task: `Set up the project structure for: ${userPrompt}` },
    { name: "Implementer", role: "backend", task: `Implement the core logic for: ${userPrompt}` },
  ];
  if (userPrompt.toLowerCase().includes("test")) {
    mockAgents.push({ name: "Tester", role: "testing", task: `Write tests for: ${userPrompt}` });
  }

  broadcast({
    type: "orchestrator_spawning",
    round: 1,
    agents: mockAgents.map((a) => ({ id: randomUUID().slice(0, 8), name: a.name, role: a.role })),
  });

  const results = await runAgentBatch(mockAgents, adapter, broadcast, signal, cwd);

  const succeeded = results.filter((r) => r.success).length;
  return `Mock mission complete: ${succeeded}/${results.length} agents succeeded`;
}

// ---------------------------------------------------------------------------
// Agent batch runner
// ---------------------------------------------------------------------------

async function runAgentBatch(
  agentDefs: SpawnedAgentDef[],
  adapter: AgentBackend,
  broadcast: Broadcast,
  parentSignal: AbortSignal,
  cwd: string,
): Promise<AgentResult[]> {
  const promises = agentDefs.map((def) => runSingleAgent(def, adapter, broadcast, parentSignal, cwd));
  return Promise.all(promises);
}

async function runSingleAgent(
  def: SpawnedAgentDef,
  adapter: AgentBackend,
  broadcast: Broadcast,
  parentSignal: AbortSignal,
  cwd: string,
): Promise<AgentResult> {
  const agentId = randomUUID().slice(0, 8);
  const memoryContext = await loadRoleMemory(cwd, def.role);

  const agent: MissionAgent = {
    id: agentId,
    name: def.name,
    role: def.role,
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
      role: def.role,
      type: "worker",
      status: "idle",
      currentStation: null,
      task: {
        id: randomUUID().slice(0, 8),
        type: "compile",
        description: def.task,
        stationId: "coding-desk",
        progress: 0,
        startedAt: Date.now(),
      },
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
      role: def.role,
      memoryContext: memoryContext.trim().length > 0 ? memoryContext : undefined,
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
    case "read":
      return `Reading ${basename(String(args.file_path ?? args.path ?? "file"))}`;
    case "write":
      return `Writing ${basename(String(args.file_path ?? args.path ?? "file"))}`;
    case "edit":
      return `Editing ${basename(String(args.file_path ?? args.path ?? "file"))}`;
    case "bash":
    case "execute": {
      const cmd = String(args.command ?? args.cmd ?? "");
      return `Running: ${cmd.length > 60 ? cmd.slice(0, 57) + "..." : cmd}`;
    }
    case "grep":
    case "glob":
    case "find":
      return "Searching files";
    case "ls":
      return "Listing directory";
    default:
      return `${toolName}`;
  }
}

function basename(p: string): string {
  return p.split("/").pop() ?? p;
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
