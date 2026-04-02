/**
 * Orchestrator: manages the 4 fixed-role agents using pi-coding-agent SDK.
 *
 * Uses OpenRouter with anthropic/claude-opus-4.6 model.
 * API key is read from OPENROUTER_API_KEY env var.
 *
 * Pipeline: Planner → Coder → Tester → Reviewer → loop (self-improving)
 */

import { getModel } from "@mariozechner/pi-ai";
import {
  AuthStorage,
  createAgentSession,
  createCodingTools,
  ModelRegistry,
  SessionManager,
  type AgentSession,
} from "@mariozechner/pi-coding-agent";
import { randomUUID } from "node:crypto";
import { formatToolStatus, createBridgeHandler, emitAgentCreated } from "./bridge.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AgentRole {
  id: number;
  name: string;
  systemPrompt: string;
  /** The initial prompt to send to this agent each cycle */
  taskPrompt: string;
}

interface ManagedAgent {
  role: AgentRole;
  session: AgentSession;
  unsubscribe: () => void;
}

// ---------------------------------------------------------------------------
// Agent role definitions
// ---------------------------------------------------------------------------

const AGENT_ROLES: AgentRole[] = [
  {
    id: 1,
    name: "Planner",
    systemPrompt: `You are a senior code quality planner working in a software factory.
Your job is to analyze the codebase thoroughly, identify issues (bugs, missing tests, 
code smells, performance problems, security issues), and create a prioritized improvement plan.

Rules:
- Be specific about file paths, line numbers, and what needs to change
- Prioritize by impact: critical bugs > security > tests > code quality > performance
- Write your plan to FACTORY_PLAN.md in the repo root
- Keep the plan actionable -- each item should be completable by a single engineer
- Limit to the top 5 most impactful improvements per cycle`,
    taskPrompt: `Analyze the codebase and create an improvement plan. 
Start by exploring the project structure, reading key files, and running any existing tests.
Write your prioritized plan to FACTORY_PLAN.md with specific, actionable items.
Focus on the most impactful improvements.`,
  },
  {
    id: 2,
    name: "Coder",
    systemPrompt: `You are a senior software engineer working in a software factory.
Your job is to implement improvements from the plan created by the Planner.

Rules:
- Read FACTORY_PLAN.md first to understand what needs to be done
- Implement the highest priority item that hasn't been completed yet
- Write clean, well-structured code following existing conventions
- Add or update tests for any code you change
- Mark completed items in FACTORY_PLAN.md when done
- If you create new files, make sure they integrate properly with the existing codebase`,
    taskPrompt: `Read FACTORY_PLAN.md and implement the highest priority improvement that hasn't been completed yet.
Follow existing code conventions. Add tests for your changes. Mark the item as done in FACTORY_PLAN.md when complete.`,
  },
  {
    id: 3,
    name: "Tester",
    systemPrompt: `You are a QA engineer working in a software factory.
Your job is to verify that recent changes work correctly and the codebase is healthy.

Rules:
- Run the existing test suite first
- Check for regressions from recent changes
- Verify that the changes match what was planned in FACTORY_PLAN.md
- If tests fail, document the failures clearly in FACTORY_TEST_REPORT.md
- Run linting and type checking if available
- Report the overall health status`,
    taskPrompt: `Run all available tests, linting, and type checking.
Verify that recent changes work correctly. Write a test report to FACTORY_TEST_REPORT.md 
including: tests passed/failed, lint issues, type errors, and overall health assessment.`,
  },
  {
    id: 4,
    name: "Reviewer",
    systemPrompt: `You are a senior code reviewer working in a software factory.
Your job is to review recent changes for quality, correctness, and best practices.

Rules:
- Review the git diff of recent changes
- Check for bugs, security issues, and anti-patterns
- Verify test coverage for changed code
- Provide constructive, specific feedback
- Write your review to FACTORY_REVIEW.md
- Include suggestions for the next improvement cycle
- Be honest about what worked well and what needs improvement`,
    taskPrompt: `Review the recent changes by examining git diffs and modified files.
Check for bugs, security issues, code quality, and test coverage.
Write your review to FACTORY_REVIEW.md with specific feedback and suggestions for the next cycle.`,
  },
];

// ---------------------------------------------------------------------------
// Mock simulation (fallback when no API key)
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface MockTool {
  toolName: string;
  args: Record<string, unknown>;
  duration: number;
}

const MOCK_TOOLS: Record<string, MockTool[]> = {
  Planner: [
    { toolName: "read", args: { file_path: "src/index.ts" }, duration: 1200 },
    { toolName: "read", args: { file_path: "src/utils.ts" }, duration: 900 },
    { toolName: "grep", args: { pattern: "TODO|FIXME|HACK" }, duration: 1500 },
    { toolName: "bash", args: { command: "npm test -- --reporter=json" }, duration: 2000 },
    { toolName: "write", args: { file_path: "FACTORY_PLAN.md" }, duration: 1800 },
  ],
  Coder: [
    { toolName: "read", args: { file_path: "FACTORY_PLAN.md" }, duration: 800 },
    { toolName: "read", args: { file_path: "src/utils.ts" }, duration: 700 },
    { toolName: "edit", args: { file_path: "src/utils.ts" }, duration: 2500 },
    { toolName: "write", args: { file_path: "src/helpers.ts" }, duration: 2000 },
    { toolName: "task", args: { description: "Refactor error handling" }, duration: 3000 },
    { toolName: "write", args: { file_path: "src/__tests__/utils.test.ts" }, duration: 1800 },
  ],
  Tester: [
    { toolName: "bash", args: { command: "npm test" }, duration: 3000 },
    { toolName: "read", args: { file_path: "test-results.json" }, duration: 500 },
    { toolName: "bash", args: { command: "npm run lint" }, duration: 2000 },
    { toolName: "bash", args: { command: "npm run typecheck" }, duration: 1800 },
    { toolName: "write", args: { file_path: "FACTORY_TEST_REPORT.md" }, duration: 1200 },
  ],
  Reviewer: [
    { toolName: "bash", args: { command: "git diff HEAD~1" }, duration: 1200 },
    { toolName: "read", args: { file_path: "src/utils.ts" }, duration: 800 },
    { toolName: "read", args: { file_path: "src/helpers.ts" }, duration: 700 },
    { toolName: "read", args: { file_path: "FACTORY_TEST_REPORT.md" }, duration: 600 },
    { toolName: "write", args: { file_path: "FACTORY_REVIEW.md" }, duration: 2200 },
  ],
};

async function simulateAgent(
  role: AgentRole,
  broadcast: (msg: Record<string, unknown>) => void,
): Promise<void> {
  broadcast({ type: "agentCreated", id: role.id, folderName: role.name });
  await sleep(300);
  broadcast({ type: "agentStatus", id: role.id, status: "active" });
  broadcast({ type: "agentToolsClear", id: role.id });

  const tools = MOCK_TOOLS[role.name] ?? [];
  for (const tool of tools) {
    const toolId = randomUUID();
    const status = formatToolStatus(tool.toolName, tool.args);
    broadcast({ type: "agentToolStart", id: role.id, toolId, status });
    await sleep(tool.duration);
    broadcast({ type: "agentToolDone", id: role.id, toolId });
    await sleep(200);
  }

  broadcast({ type: "agentToolsClear", id: role.id });
  broadcast({ type: "agentStatus", id: role.id, status: "waiting" });
}

// ---------------------------------------------------------------------------
// Real pi-coding-agent integration
// ---------------------------------------------------------------------------

async function createPiAgent(
  role: AgentRole,
  repoPath: string,
  broadcast: (msg: Record<string, unknown>) => void,
): Promise<ManagedAgent> {
  const model = getModel("openrouter", "anthropic/claude-opus-4.6");
  if (!model) throw new Error("Model anthropic/claude-opus-4.6 not found");

  const authStorage = AuthStorage.create();
  const modelRegistry = ModelRegistry.create(authStorage);

  const { session } = await createAgentSession({
    model,
    thinkingLevel: "low",
    cwd: repoPath,
    tools: createCodingTools(repoPath),
    authStorage,
    modelRegistry,
    sessionManager: SessionManager.inMemory(),
  });

  // Subscribe to events and bridge to pixel-agents protocol
  const bridgeHandler = createBridgeHandler(role.id, broadcast);
  const unsubscribe = session.subscribe((event: any) => {
    bridgeHandler(event);
  });

  return { role, session, unsubscribe };
}

async function runPiAgent(
  agent: ManagedAgent,
  broadcast: (msg: Record<string, unknown>) => void,
): Promise<void> {
  emitAgentCreated(agent.role.id, broadcast, agent.role.name);
  await sleep(300);

  try {
    const fullPrompt = `${agent.role.systemPrompt}\n\n${agent.role.taskPrompt}`;
    await agent.session.prompt(fullPrompt);
    await waitForIdle(agent.session);
  } catch (err) {
    console.error(`[orchestrator] Agent ${agent.role.name} error:`, err);
    broadcast({ type: "agentToolsClear", id: agent.role.id });
    broadcast({ type: "agentStatus", id: agent.role.id, status: "waiting" });
  }
}

function waitForIdle(session: AgentSession): Promise<void> {
  return new Promise((resolve) => {
    const unsub = session.subscribe((event: any) => {
      if (event.type === "agent_end") {
        unsub();
        resolve();
      }
    });
  });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

let activeAgentIds: number[] = [];

export function getActiveAgentIds(): number[] {
  return [...activeAgentIds];
}

/**
 * Start the factory orchestrator.
 *
 * If OPENROUTER_API_KEY is set, uses real pi-coding-agent sessions.
 * Otherwise, runs in mock/simulation mode for demo purposes.
 */
export async function startFactory(
  broadcast: (msg: Record<string, unknown>) => void,
  repoPath?: string,
): Promise<void> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  const targetRepo = repoPath ?? process.env.FACTORY_REPO_PATH ?? process.cwd();

  if (!apiKey) {
    console.log("[orchestrator] No OPENROUTER_API_KEY set — running in mock/simulation mode");
    console.log("[orchestrator] Set OPENROUTER_API_KEY to use real pi-coding-agent");
    await runMockLoop(broadcast);
    return;
  }

  console.log(`[orchestrator] Starting real factory on: ${targetRepo}`);
  console.log(`[orchestrator] Using model: openrouter/anthropic/claude-opus-4.6`);
  await runRealLoop(broadcast, targetRepo);
}

async function runMockLoop(
  broadcast: (msg: Record<string, unknown>) => void,
): Promise<void> {
  console.log("[orchestrator] Starting mock factory simulation...");

  while (true) {
    for (const role of AGENT_ROLES) {
      activeAgentIds = AGENT_ROLES.map((r) => r.id);
      console.log(`[orchestrator] Agent ${role.id} (${role.name}) starting...`);
      await simulateAgent(role, broadcast);
      console.log(`[orchestrator] Agent ${role.id} (${role.name}) finished.`);
      await sleep(1500);
    }
    console.log("[orchestrator] Full cycle complete. Restarting in 3s...");
    await sleep(3000);
  }
}

async function runRealLoop(
  broadcast: (msg: Record<string, unknown>) => void,
  repoPath: string,
): Promise<void> {
  console.log("[orchestrator] Starting real factory pipeline...");
  let cycle = 1;

  while (true) {
    console.log(`[orchestrator] === Cycle ${cycle} ===`);

    for (const role of AGENT_ROLES) {
      activeAgentIds = AGENT_ROLES.map((r) => r.id);
      console.log(`[orchestrator] Agent ${role.id} (${role.name}) starting...`);

      try {
        const agent = await createPiAgent(role, repoPath, broadcast);
        await runPiAgent(agent, broadcast);
        agent.unsubscribe();
        console.log(`[orchestrator] Agent ${role.id} (${role.name}) finished.`);
      } catch (err) {
        console.error(`[orchestrator] Agent ${role.name} failed:`, err);
        broadcast({ type: "agentStatus", id: role.id, status: "waiting" });
      }

      await sleep(2000);
    }

    cycle++;
    console.log(`[orchestrator] Cycle ${cycle - 1} complete. Starting cycle ${cycle} in 5s...`);
    await sleep(5000);
  }
}
