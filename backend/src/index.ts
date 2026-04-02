import "dotenv/config";
import { WebSocket } from "ws";
import { createServer } from "./server.js";
import { startMission, abortMission, getCurrentMission } from "./mission.js";

const PORT = Number(process.env.PORT ?? 3001);

function sendCurrentState(ws: WebSocket): void {
  const mission = getCurrentMission();
  if (mission && mission.status === "running") {
    const agents = Array.from(mission.agents.values()).map((a) => ({
      id: a.id,
      name: a.name,
      type: "worker" as const,
      status: a.status === "working" ? "working" : a.status === "done" ? "done" : "idle",
      currentStation: null,
      task: null,
      x: 0,
      y: 0,
      logs: a.logs,
    }));

    ws.send(JSON.stringify({
      type: "mission_state",
      missionId: mission.missionId,
      status: mission.status,
      agents,
    }));
  } else {
    ws.send(JSON.stringify({
      type: "mission_state",
      missionId: null,
      status: "idle",
      agents: [],
    }));
  }
}

function handleClientMessage(_ws: WebSocket, msg: Record<string, unknown>): void {
  switch (msg.type) {
    case "start_mission": {
      const prompt = msg.prompt as string;
      if (!prompt) {
        broadcast({ type: "mission_error", message: "No prompt provided" });
        return;
      }
      const backend = msg.backend as string | undefined;
      console.log(`[index] Starting mission: "${prompt.slice(0, 80)}..."`);
      startMission(prompt, broadcast, backend).catch((err) => {
        console.error("[index] Mission error:", err);
      });
      break;
    }
    case "abort_mission":
      console.log("[index] Aborting mission");
      abortMission(broadcast);
      break;
    default:
      console.log(`[index] Unhandled message type: ${msg.type}`);
  }
}

let broadcast: (msg: Record<string, unknown>) => void;

const serverHandle = createServer(PORT, {
  onClientConnect: sendCurrentState,
  onClientMessage: handleClientMessage,
});
broadcast = serverHandle.broadcast;

console.log(`[index] Factory backend started on port ${PORT}`);
console.log(`[index] API key: ${process.env.OPENROUTER_API_KEY ? "set" : "NOT SET (mock mode)"}`);
console.log(`[index] Repo: ${process.env.FACTORY_REPO_PATH ?? process.cwd()}`);
