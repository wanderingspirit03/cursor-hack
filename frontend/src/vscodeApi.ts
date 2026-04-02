import { isBrowserRuntime } from './runtime';

let ws: WebSocket | null = null;
let messageQueue: unknown[] = [];

function getWsUrl(): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}/ws`;
}

function connectWebSocket(): void {
  ws = new WebSocket(getWsUrl());

  ws.onopen = () => {
    console.log('[WS] Connected');
    // Flush queued messages
    for (const msg of messageQueue) {
      ws!.send(JSON.stringify(msg));
    }
    messageQueue = [];
  };

  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data as string);
      // Dispatch as MessageEvent so useExtensionMessages handler picks it up
      window.dispatchEvent(new MessageEvent('message', { data }));
    } catch (e) {
      console.error('[WS] Failed to parse message:', e);
    }
  };

  ws.onclose = () => {
    console.log('[WS] Disconnected, reconnecting in 2s...');
    setTimeout(connectWebSocket, 2000);
  };

  ws.onerror = (err) => {
    console.error('[WS] Error:', err);
  };
}

function sendMessage(msg: unknown): void {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  } else {
    messageQueue.push(msg);
  }
}

// In browser mode, use WebSocket. In VS Code mode, use native API.
declare function acquireVsCodeApi(): { postMessage(msg: unknown): void };

export const vscode: { postMessage(msg: unknown): void } = isBrowserRuntime
  ? { postMessage: sendMessage }
  : (acquireVsCodeApi() as { postMessage(msg: unknown): void });

// Auto-connect in browser mode
if (isBrowserRuntime) {
  connectWebSocket();
}
