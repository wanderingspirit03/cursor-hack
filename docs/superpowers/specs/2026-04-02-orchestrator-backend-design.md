# Software Factory: Orchestrator Backend Design

## Overview

Refactor the backend from a fixed-role pipeline to an LLM-driven orchestrator that dynamically spawns sub-agents based on user prompts. The orchestrator is itself an LLM session with a single tool (`spawn_agents`) that creates parallel coding agent sessions. Agent backends are pluggable (pi, openclaw, future: codex, claude code).

## Core Flow

1. User types a prompt in the UI (e.g., "build me a meditation app")
2. Frontend sends `{ type: "start_mission", prompt: "..." }` over WebSocket
3. Backend creates an orchestrator LLM session with one tool: `spawn_agents`
4. Orchestrator LLM thinks, calls `spawn_agents` with an array of `{ name, task }` objects
5. Backend spawns N agent sessions in parallel via the configured backend adapter
6. Each agent emits events (thinking, tool calls) bridged to the frontend
7. All agents finish -> results returned to orchestrator as tool result
8. Orchestrator reviews results, may call `spawn_agents` again or finish
9. Backend sends `{ type: "mission_complete", summary: "..." }`

## Orchestrator

The orchestrator is **not** run through the `AgentBackend` adapter. It is a bespoke pi-coding-agent session created directly in `mission.ts` with the `spawn_agents` tool injected. Sub-agents are run through the adapter. This keeps the adapter interface simple (no custom tools parameter) while giving the orchestrator its special capability.

```
mission.ts:
  orchestrator = createAgentSession({
    model: getModel("openrouter", ORCHESTRATOR_MODEL),
    cwd,
    tools: [spawnAgentsTool],   // <-- injected directly, not via adapter
    ...
  })

  // Sub-agents go through the adapter:
  adapter.runAgent({ cwd, task, onEvent, signal })
```

### System Prompt

```
You are a software factory orchestrator. You receive a task from the user and
break it down into work for sub-agents. Each sub-agent is a full coding agent
that can read, write, edit files and run commands in the repository.

Rules:
- Break the task into parallel work when possible using spawn_agents
- Give each agent a clear, specific task description
- Review agent results and spawn more agents if needed
- When all work is done, summarize what was accomplished
```

### Tool: `spawn_agents`

```typescript
// Schema
spawn_agents({
  agents: [
    { name: string, task: string },
    // ... 1 or more agents
  ]
})

// Returns structured result per agent:
[
  { name: "Setup", success: true, summary: "Created React project with Vite..." },
  { name: "Designer", success: true, summary: "Created 3 components: Timer, Controls, Settings..." },
]
```

- Spawns all agents in parallel
- Blocks until all complete (or error)
- Returns array of results back to the orchestrator LLM
- Each agent runs as a full coding agent session via the configured backend adapter
- Supports AbortSignal for mission cancellation

## Backend Adapter Interface

Pluggable interface for different coding agent backends.

```typescript
interface AgentBackend {
  name: string; // "pi", "openclaw"

  runAgent(config: {
    cwd: string;
    task: string;
    onEvent: (event: AgentEvent) => void;
    signal?: AbortSignal;
  }): Promise<AgentResult>;
}

type AgentEvent =
  | { type: "thinking" }
  | { type: "tool_start"; toolName: string; args: Record<string, unknown> }
  | { type: "tool_end"; toolId: string }
  | { type: "log"; message: string }
  | { type: "error"; message: string };

interface AgentResult {
  summary: string;
  success: boolean;
}
```

### Pi Adapter

Wraps `@mariozechner/pi-coding-agent` SDK:

- Creates session via `createAgentSession({ model, cwd, tools: createCodingTools(cwd), ... })`
- Sends task via `session.prompt(task)`
- Subscribes to session events, translates to `AgentEvent`:
  - `message_start` / `message_update` -> `{ type: "thinking" }`
  - `tool_execution_start` -> `{ type: "tool_start", toolName, args }`
  - `tool_execution_end` -> `{ type: "tool_end", toolId }`
  - `agent_end` -> resolve promise
- Uses `getModel("openrouter", modelId)` with API key from env
- Abort via `session.abort()` on signal

### OpenClaw Adapter

Uses the same pi-coding-agent SDK (OpenClaw embeds pi). Same implementation as Pi adapter but may use OpenClaw's custom tool suite or resource loader if needed. For v1, identical to Pi adapter.

### Mock Adapter

Simulates agent work without API calls. Used when no API key is set or for demos/development.

```typescript
// adapters/mock.ts
class MockAdapter implements AgentBackend {
  name = "mock";

  async runAgent(config: {
    cwd: string;
    task: string;
    onEvent: (event: AgentEvent) => void;
    signal?: AbortSignal;
  }): Promise<AgentResult> {
    // Simulate thinking (1-2s)
    config.onEvent({ type: "thinking" });
    await delay(1500);

    // Simulate 2-4 tool calls with realistic names
    const tools = pickRandom(MOCK_TOOLS, 2 + Math.floor(Math.random() * 3));
    for (const tool of tools) {
      if (config.signal?.aborted) return { success: false, summary: "Aborted" };
      config.onEvent({ type: "tool_start", toolName: tool.name, args: tool.args });
      config.onEvent({ type: "log", message: tool.logMessage });
      await delay(1000 + Math.random() * 2000);
      config.onEvent({ type: "tool_end", toolId: crypto.randomUUID() });
    }

    return { success: true, summary: `Completed: ${config.task.slice(0, 80)}...` };
  }
}

const MOCK_TOOLS = [
  { name: "bash", args: { cmd: "npm init -y" }, logMessage: "Initialized package.json" },
  { name: "write", args: { path: "src/index.ts" }, logMessage: "Created src/index.ts" },
  { name: "bash", args: { cmd: "npm test" }, logMessage: "All tests passed (3/3)" },
  { name: "edit", args: { path: "src/App.tsx" }, logMessage: "Updated App component" },
  // ... more entries
];
```

Selection logic in `mission.ts`:
```typescript
function getAdapter(): AgentBackend {
  if (!process.env.OPENROUTER_API_KEY) return new MockAdapter();
  return process.env.AGENT_BACKEND === "openclaw" ? new OpenClawAdapter() : new PiAdapter();
}
```

## WebSocket Protocol

The new Phaser frontend expects `agent:spawn`, `agent:update`, `agent:remove` messages with `AgentState` payloads. The bridge translates internal events to this protocol.

### Frontend -> Backend (Inbound)

| Type | Fields | Description |
|------|--------|-------------|
| `start_mission` | `prompt: string, backend?: string` | Start a new mission |
| `abort_mission` | `missionId?: string` | Cancel the running mission |

### Backend -> Frontend (Outbound)

| Type | Fields | Description |
|------|--------|-------------|
| `mission_started` | `missionId: string` | Mission accepted |
| `agent:spawn` | `payload: AgentState` | Agent created (frontend creates game entity) |
| `agent:update` | `payload: Partial<AgentState>` | Agent status/logs/task changed |
| `agent:remove` | `payload: { id: string }` | Agent finished or killed |
| `mission_complete` | `summary: string` | All work done |
| `mission_error` | `message: string` | Mission failed |

### AgentState Payload (matches frontend types)

```typescript
{
  id: string;            // UUID
  name: string;          // orchestrator-assigned name (e.g., "Setup", "Designer")
  type: "worker";        // always "worker" for now (frontend supports worker/robot/drone)
  status: AgentStatus;   // "idle" | "assigned" | "walking" | "working" | "done"
  currentStation: string | null;  // mapped from task type (see station mapping below)
  task: TaskState | null;
  x: number;
  y: number;
  logs: LogEntry[];      // <-- agent_log events get appended here
}
```

### Bridge: Internal Events -> Frontend Messages

| Internal Event | Frontend Message | Details |
|----------------|------------------|---------|
| Agent created | `agent:spawn` | Full `AgentState` with `status: "idle"` |
| `AgentEvent.thinking` | `agent:update` | `{ status: "working" }` |
| `AgentEvent.tool_start` | `agent:update` | `{ status: "working", task: { type, description } }` + append to `logs` |
| `AgentEvent.tool_end` | `agent:update` | Update `task.progress` |
| `AgentEvent.log` | `agent:update` | Append `LogEntry` to `logs` array |
| `AgentEvent.error` | `agent:update` | Append error `LogEntry`, `status: "done"` |
| Agent completed | `agent:update` + `agent:remove` | `{ status: "done" }`, then remove after delay |

### Station Mapping

The frontend has 5 stations. The bridge maps agent tasks to stations based on keywords:

| Station | Keywords in task |
|---------|-----------------|
| `coding-desk` | write, create, implement, build, add |
| `test-chamber` | test, verify, check, validate |
| `review-terminal` | review, analyze, audit, inspect |
| `deploy-bay` | deploy, ship, release, publish |
| `data-pipeline` | data, process, transform, migrate |

### Reconnection Support

On new WebSocket connection, the backend sends current mission state:

```typescript
// Sent immediately on ws connect if a mission is active
{
  type: "mission_state",
  missionId: string,
  agents: AgentState[],  // current state of all active agents
  status: "running" | "idle"
}
```

This allows the frontend to rebuild the game scene after a page refresh without losing the mission.

## Backend File Structure

```
backend/src/
├── index.ts              # Entry point, WebSocket server, mission routing, reconnection state
├── server.ts             # HTTP + WebSocket server (existing, unchanged)
├── mission.ts            # Mission lifecycle: create orchestrator, handle spawn_agents tool
├── adapters/
│   ├── types.ts          # AgentBackend, AgentEvent, AgentResult interfaces
│   ├── pi.ts             # Pi adapter (createAgentSession + event bridge)
│   ├── openclaw.ts       # OpenClaw adapter (same as pi for v1)
│   └── mock.ts           # Mock adapter for demos/development (no API key needed)
└── bridge.ts             # AgentEvent -> frontend message translation (agent:spawn/update/remove)
```

Files removed:
- `orchestrator.ts` -- replaced by `mission.ts`

## Configuration

Environment variables in `backend/.env`:

```
OPENROUTER_API_KEY=sk-or-v1-...
FACTORY_REPO_PATH=/path/to/target/repo
ORCHESTRATOR_MODEL=anthropic/claude-sonnet-4     # model for orchestrator
AGENT_MODEL=anthropic/claude-sonnet-4            # model for sub-agents
AGENT_BACKEND=pi                                 # "pi" or "openclaw"
```

## Key Design Decisions

1. **One tool, not two.** `spawn_agents` handles both single and parallel agents (array of 1 or many). Keeps the orchestrator's tool surface minimal.

2. **Orchestrator blocks on spawn_agents.** The tool call doesn't return until all spawned agents finish. This gives the orchestrator full results to plan the next step.

3. **Agents share the repo directory.** The orchestrator is responsible for sequencing work to avoid conflicts. No git worktrees or isolation. System prompt explicitly tells LLM to separate agents by file/directory scope.

4. **No predefined roles.** The orchestrator LLM decides agent names and tasks dynamically based on the user's prompt. No Planner/Coder/Tester/Reviewer presets.

5. **Backend adapter is a simple interface.** `runAgent(config) -> Promise<AgentResult>`. Any coding agent that can accept a task string and emit tool events can be plugged in.

6. **Orchestrator bypasses the adapter.** The orchestrator is a bespoke pi session with `spawn_agents` injected directly. Sub-agents go through the adapter. This keeps the adapter interface clean (no custom tools parameter).

7. **Mission is the unit of work.** One user prompt = one mission = one orchestrator session. Aborting the mission aborts the orchestrator + all active sub-agents.

8. **Mock adapter for demos.** When no API key is set, the system automatically uses `MockAdapter` which simulates agent work with realistic timing and tool calls. No code changes needed to switch modes.

9. **Frontend protocol compatibility.** The bridge translates internal events to the Phaser frontend's expected `agent:spawn` / `agent:update` / `agent:remove` protocol with `AgentState` payloads. This avoids any frontend changes for backend refactoring.

10. **Reconnection support.** On new WebSocket connection, the backend sends current mission state so the frontend can rebuild after a page refresh.
