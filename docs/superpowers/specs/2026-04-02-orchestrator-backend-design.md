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

A single LLM session (using the configured backend) with a minimal system prompt and one tool.

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

## WebSocket Protocol

### Frontend -> Backend (Inbound)

| Type | Fields | Description |
|------|--------|-------------|
| `start_mission` | `prompt: string, backend?: string` | Start a new mission |
| `abort_mission` | — | Cancel the running mission |

### Backend -> Frontend (Outbound)

| Type | Fields | Description |
|------|--------|-------------|
| `mission_started` | `missionId: string` | Mission accepted |
| `orchestrator_thinking` | — | Orchestrator LLM is thinking |
| `orchestrator_spawning` | `agents: { id, name }[]` | Orchestrator decided to spawn agents |
| `agent_spawned` | `id: number, name: string` | Agent session created and running |
| `agent_thinking` | `id: number` | Agent is generating response |
| `agent_tool` | `id: number, toolName: string, status: string` | Agent executing a tool |
| `agent_tool_done` | `id: number` | Agent tool finished |
| `agent_done` | `id: number, summary: string` | Agent completed its task |
| `agent_error` | `id: number, message: string` | Agent failed |
| `mission_complete` | `summary: string` | All work done |
| `mission_error` | `message: string` | Mission failed |

## Backend File Structure

```
backend/src/
├── index.ts              # Entry point, WebSocket server, mission routing
├── server.ts             # HTTP + WebSocket server (existing, unchanged)
├── mission.ts            # Mission lifecycle: create orchestrator, handle spawn_agents tool
├── adapters/
│   ├── types.ts          # AgentBackend, AgentEvent, AgentResult interfaces
│   ├── pi.ts             # Pi adapter (createAgentSession + event bridge)
│   └── openclaw.ts       # OpenClaw adapter (same as pi for v1)
└── bridge.ts             # AgentEvent -> WebSocket message translation
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

3. **Agents share the repo directory.** The orchestrator is responsible for sequencing work to avoid conflicts. No git worktrees or isolation.

4. **No predefined roles.** The orchestrator LLM decides agent names and tasks dynamically based on the user's prompt. No Planner/Coder/Tester/Reviewer presets.

5. **Backend adapter is a simple interface.** `runAgent(config) -> Promise<AgentResult>`. Any coding agent that can accept a task string and emit tool events can be plugged in.

6. **Orchestrator and sub-agents use the same backend adapter.** The orchestrator is just another agent session, but with the `spawn_agents` tool injected.

7. **Mission is the unit of work.** One user prompt = one mission = one orchestrator session. Aborting the mission aborts the orchestrator + all active sub-agents.
