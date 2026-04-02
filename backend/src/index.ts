import { WebSocket } from "ws";
import { createServer } from "./server.js";
import { startFactory, getActiveAgentIds } from "./orchestrator.js";

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
}

/**
 * Handle messages received from the frontend.
 */
function handleClientMessage(_ws: WebSocket, msg: Record<string, unknown>): void {
  switch (msg.type) {
    case "webviewReady":
      console.log("[index] Frontend webview is ready");
      break;
    case "closeAgent":
      console.log(`[index] Close agent requested: ${msg.id}`);
      break;
    case "focusAgent":
      console.log(`[index] Focus agent requested: ${msg.id}`);
      break;
    case "openClaude":
      console.log("[index] Open new Claude requested");
      break;
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

const { broadcast } = createServer(PORT, {
  onClientConnect: sendInitialState,
  onClientMessage: handleClientMessage,
});

// Start the mock orchestrator (runs forever, simulating agents)
startFactory(broadcast).catch((err) => {
  console.error("[index] Orchestrator error:", err);
  process.exit(1);
});

console.log(`[index] Pixel-agents backend started on port ${PORT}`);
