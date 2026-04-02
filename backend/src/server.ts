import { createServer as createHttpServer } from "node:http";
import { WebSocketServer, WebSocket } from "ws";

export interface ServerHandle {
  /** Broadcast a message to all connected WebSocket clients. */
  broadcast: (msg: Record<string, unknown>) => void;
  /** Set of currently connected clients. */
  clients: Set<WebSocket>;
  /** Shut down the server. */
  close: () => void;
}

/**
 * Creates an HTTP + WebSocket server.
 *
 * - HTTP server on the given port (default 3001).
 * - WebSocket upgrade handler.
 * - Broadcasts JSON messages to all connected clients.
 * - Receives messages from the frontend and logs them (handlers can be added later).
 */
export function createServer(
  port: number,
  options?: {
    /** Called when a frontend sends a message to the backend. */
    onClientMessage?: (ws: WebSocket, msg: Record<string, unknown>) => void;
    /** Called when a new client connects (send initial state here). */
    onClientConnect?: (ws: WebSocket) => void;
  },
): ServerHandle {
  const httpServer = createHttpServer((_req, res) => {
    // Simple health-check endpoint
    res.writeHead(200, {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    });
    res.end(JSON.stringify({ status: "ok" }));
  });

  const wss = new WebSocketServer({ server: httpServer });

  const clients = new Set<WebSocket>();

  wss.on("connection", (ws) => {
    clients.add(ws);
    console.log(`[server] Client connected (total: ${clients.size})`);

    // Notify caller so they can send initial state
    options?.onClientConnect?.(ws);

    ws.on("message", (raw) => {
      try {
        const msg = JSON.parse(raw.toString()) as Record<string, unknown>;
        console.log(`[server] Received from client:`, msg.type);
        options?.onClientMessage?.(ws, msg);
      } catch {
        console.warn("[server] Failed to parse client message");
      }
    });

    ws.on("close", () => {
      clients.delete(ws);
      console.log(`[server] Client disconnected (total: ${clients.size})`);
    });

    ws.on("error", (err) => {
      console.error("[server] WebSocket error:", err.message);
      clients.delete(ws);
    });
  });

  const broadcast = (msg: Record<string, unknown>) => {
    const data = JSON.stringify(msg);
    for (const client of clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(data);
      }
    }
  };

  httpServer.listen(port, () => {
    console.log(`[server] WebSocket server listening on ws://localhost:${port}`);
  });

  const close = () => {
    for (const client of clients) {
      client.close();
    }
    wss.close();
    httpServer.close();
  };

  return { broadcast, clients, close };
}
