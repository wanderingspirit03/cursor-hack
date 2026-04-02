import "dotenv/config";
import { WebSocket } from "ws";
import { createServer } from "./server.js";
import { startFactory, getActiveAgentIds, getAvailableRoles, spawnAgent, killAgent } from "./orchestrator.js";

const PORT = Number(process.env.PORT ?? 3001);

/**
 * Send initial state to a newly connected client.
 */
function sendInitialState(ws: WebSocket): void {
  // Settings the frontend expects on connect
  const settingsMsg = {
    type: "settingsLoaded",
    soundEnabled: false,
    watchAllSessions: false,
    alwaysShowLabels: true,
    externalAssetDirectories: [],
    lastSeenVersion: "1.0.0",
    extensionVersion: "1.0.0",
  };
  ws.send(JSON.stringify(settingsMsg));

  // Report existing agents
  const existingAgents = getActiveAgentIds();
  const existingAgentsMsg = {
    type: "existingAgents",
    agents: existingAgents,
  };
  ws.send(JSON.stringify(existingAgentsMsg));

  // Send available roles
  const rolesMsg = {
    type: "availableRoles",
    roles: getAvailableRoles(),
  };
  ws.send(JSON.stringify(rolesMsg));
}

/**
 * Handle messages received from the frontend.
 */
function handleClientMessage(_ws: WebSocket, msg: Record<string, unknown>): void {
  switch (msg.type) {
    case "webviewReady":
      console.log("[index] Frontend webview is ready");
      break;
    case "closeAgent": {
      console.log(`[index] Close agent requested: ${msg.id}`);
      const closeId = msg.id as number;
      killAgent(closeId, broadcast);
      break;
    }
    case "focusAgent":
      console.log(`[index] Focus agent requested: ${msg.id}`);
      break;
    case "openClaude": {
      console.log("[index] Open new Claude requested");
      const role = (msg.role as string) ?? "Coder";
      spawnAgent(role, broadcast)
        .then((newId) => console.log(`[index] Spawned agent ${newId} with role ${role}`))
        .catch((err) => console.error(`[index] Failed to spawn agent:`, err));
      break;
    }
    case "setSoundEnabled":
      console.log(`[index] Sound enabled: ${msg.enabled}`);
      break;
    case "setAlwaysShowLabels":
      console.log(`[index] Always show labels: ${msg.enabled}`);
      break;
    case "saveLayout":
      console.log("[index] Save layout requested");
      break;
    default:
      console.log(`[index] Unhandled message type: ${msg.type}`);
  }
}

// --- Start the server and orchestrator ---

let broadcast: (msg: Record<string, unknown>) => void;

const serverHandle = createServer(PORT, {
  onClientConnect: sendInitialState,
  onClientMessage: handleClientMessage,
});
broadcast = serverHandle.broadcast;

// Auto-loop disabled — agents are spawned on-demand from the UI
// To re-enable: uncomment the line below
// startFactory(broadcast).catch((err) => {
//   console.error("[index] Orchestrator error:", err);
//   process.exit(1);
// });

console.log(`[index] Pixel-agents backend started on port ${PORT}`);
