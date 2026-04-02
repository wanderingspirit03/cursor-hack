# Pi-Agent → Pixel-Agents Event Mapping

## 1. Pixel-Agents Frontend Message Protocol (what the webview expects)

Messages are received via `window.addEventListener('message', handler)` and dispatched on `msg.type`.

| Message Type | Fields | Effect on UI |
|---|---|---|
| `layoutLoaded` | `layout: OfficeLayout \| null`, `wasReset?: boolean` | Rebuilds office from layout; adds buffered agents; sets `layoutReady=true` |
| `agentCreated` | `id: number`, `folderName?: string` | Adds agent character to office, selects it, saves seat assignment |
| `agentClosed` | `id: number` | Removes agent character; clears tools, statuses, subagents |
| `existingAgents` | `agents: number[]`, `agentMeta?: Record<id, {palette,hueShift,seatId}>`, `folderNames?: Record<id,string>` | Buffers agents for batch add after layout loads |
| `agentToolStart` | `id: number`, `toolId: string`, `status: string` | Adds a ToolActivity entry; sets character active; extracts tool name for animation. If status starts with `"Subtask:"`, spawns a subagent character |
| `agentToolDone` | `id: number`, `toolId: string` | Marks the specific ToolActivity as `done: true` |
| `agentToolsClear` | `id: number` | Clears ALL tools for agent; removes all subagent characters; resets character tool animation |
| `agentSelected` | `id: number` | Sets selected agent (UI highlight) |
| `agentStatus` | `id: number`, `status: string` ("active" \| "waiting") | `active` → character active, removes status. `waiting` → shows waiting bubble, plays done sound |
| `agentToolPermission` | `id: number` | Marks all non-done tools as `permissionWait: true`; shows permission bubble on character |
| `agentToolPermissionClear` | `id: number` | Clears `permissionWait` on all tools; clears permission bubble on character + subagents |
| `subagentToolStart` | `id: number`, `parentToolId: string`, `toolId: string`, `status: string` | Adds tool to subagent's tool list; sets subagent character active with tool animation |
| `subagentToolDone` | `id: number`, `parentToolId: string`, `toolId: string` | Marks subagent tool as done |
| `subagentToolPermission` | `id: number`, `parentToolId: string` | Shows permission bubble on subagent character |
| `subagentClear` | `id: number`, `parentToolId: string` | Removes subagent character and its tool list |
| `characterSpritesLoaded` | `characters: Array<{down,up,right}>` | Loads pre-colored sprite templates |
| `floorTilesLoaded` | `sprites: string[][][]` | Loads floor tile patterns |
| `wallTilesLoaded` | `sets: string[][][][]` | Loads wall tile sets |
| `furnitureAssetsLoaded` | `catalog: FurnitureAsset[]`, `sprites: Record<string, string[][]>` | Builds dynamic furniture catalog |
| `workspaceFolders` | `folders: WorkspaceFolder[]` | Sets available workspace folders for multi-root |
| `settingsLoaded` | `soundEnabled`, `watchAllSessions`, `alwaysShowLabels`, `externalAssetDirectories`, `lastSeenVersion`, `extensionVersion` | Initializes all user settings |
| `externalAssetDirectoriesUpdated` | `dirs: string[]` | Updates external asset directory list |

### Messages sent FROM webview TO backend

| Message Type | Purpose |
|---|---|
| `webviewReady` | Signals webview is ready; triggers asset loading + agent restore |
| `openClaude` | Launch new Claude terminal |
| `focusAgent` | Focus terminal for an agent |
| `closeAgent` | Close/dismiss an agent |
| `saveAgentSeats` | Persist seat assignments |
| `saveLayout` | Save office layout to file |
| `setSoundEnabled` | Toggle sound setting |
| `setLastSeenVersion` | Update seen version |
| `setAlwaysShowLabels` | Toggle label visibility |
| `setWatchAllSessions` | Toggle global session watching |
| `requestDiagnostics` | Request debug diagnostics |
| `exportLayout` / `importLayout` | Layout import/export |
| `addExternalAssetDirectory` / `removeExternalAssetDirectory` | Manage asset dirs |

---

## 2. Pi-Agent-Core Event Types

Events emitted by `Agent` via `subscribe()`. Listeners receive `(event: AgentEvent, signal: AbortSignal)`.

| Event Type | Fields | When Emitted |
|---|---|---|
| `agent_start` | _(none)_ | Run begins (after `prompt()` or `continue()`) |
| `agent_end` | `messages: AgentMessage[]` | Run finishes (final event, listeners still run) |
| `turn_start` | _(none)_ | Before each LLM request |
| `turn_end` | `message: AgentMessage`, `toolResults: ToolResultMessage[]` | After assistant response + all tool results |
| `message_start` | `message: AgentMessage` | When a new message begins (user, assistant, toolResult) |
| `message_update` | `message: AgentMessage`, `assistantMessageEvent: AssistantMessageEvent` | Streaming token updates for assistant messages |
| `message_end` | `message: AgentMessage` | Message finalized and appended to transcript |
| `tool_execution_start` | `toolCallId: string`, `toolName: string`, `args: any` | Before tool execute() is called |
| `tool_execution_update` | `toolCallId: string`, `toolName: string`, `args: any`, `partialResult: any` | Partial tool progress (via onUpdate callback) |
| `tool_execution_end` | `toolCallId: string`, `toolName: string`, `result: any`, `isError: boolean` | Tool execution completed |

### Agent State (accessible via `agent.state`)

| Property | Type | Notes |
|---|---|---|
| `systemPrompt` | `string` | Current system prompt |
| `model` | `Model` | Active model |
| `thinkingLevel` | `ThinkingLevel` | Reasoning level |
| `tools` | `AgentTool[]` | Available tools (each has `name`, `label`, `description`) |
| `messages` | `AgentMessage[]` | Full transcript |
| `isStreaming` | `boolean` | Whether actively processing |
| `streamingMessage` | `AgentMessage?` | Partial assistant message during streaming |
| `pendingToolCalls` | `ReadonlySet<string>` | Tool call IDs currently executing |
| `errorMessage` | `string?` | Last error/abort message |

---

## 3. Event Mapping: Pi-Agent → Pixel-Agents

### Direct Mappings

| Pi Event | → Pixel Message | Transformation Notes |
|---|---|---|
| `agent_start` | `agentCreated` | Must assign a numeric `id`. Pi doesn't use numeric IDs — the bridge must generate and track them. |
| `agent_end` | `agentStatus { status: "waiting" }` then optionally `agentClosed` | `agent_end` means the run finished. Map to "waiting" (idle). Only send `agentClosed` if the agent session is truly terminated. |
| `tool_execution_start` | `agentToolStart` | `toolCallId` → `toolId`. Must format `status` string from `toolName` + `args` (use a `formatToolStatus`-like function). |
| `tool_execution_end` | `agentToolDone` | `toolCallId` → `toolId`. Send after a short delay (pixel-agents uses `TOOL_DONE_DELAY_MS`). |
| `turn_end` | `agentToolsClear` + `agentStatus { status: "waiting" }` | Equivalent to `system.turn_duration` in Claude Code JSONL. Clears all tools, marks as waiting. |
| `turn_start` | `agentStatus { status: "active" }` | Agent starting a new turn = active again. |
| `message_start` (assistant) | `agentStatus { status: "active" }` | When assistant starts responding, agent becomes active. |

### Derived / Synthesized Mappings

| Pi Concept | → Pixel Message | How to Derive |
|---|---|---|
| Tool with `name === "Task"` or custom subtask tool | `agentToolStart` with `status: "Subtask: {description}"` | The `status` string must start with `"Subtask:"` to trigger subagent character creation. Check `toolName` and `args.description`. |
| Subtask tool calls (from progress/streaming) | `subagentToolStart` / `subagentToolDone` | Pi doesn't have native `progress` records. If using nested agents, the parent agent's bridge must emit these from the child agent's events. |
| Tool blocked by `beforeToolCall` | `agentToolPermission` | If `beforeToolCall` returns `{ block: true }` for permission reasons, emit permission bubble. |
| Permission granted (tool re-enabled) | `agentToolPermissionClear` | When user approves a blocked tool. |
| `agent.state.isStreaming === false` | `agentStatus { status: "waiting" }` | Poll or subscribe; when streaming stops, agent is idle/waiting. |

### Missing: Pi Events That Have No Pixel-Agents Equivalent

| Pi Event | Notes |
|---|---|
| `message_update` (streaming tokens) | Pixel-agents doesn't show streaming text. Could be used for a text overlay or typing animation but no handler exists. |
| `tool_execution_update` (partial tool results) | Pixel-agents doesn't show tool progress. Could drive a progress bar. |
| `agent.state.errorMessage` | No error display in pixel-agents. Could show error bubble on character. |
| `agent.state.streamingMessage` | No streaming text display. |
| `agent.state.pendingToolCalls` (set of active tool IDs) | Pixel-agents tracks this in its own state via `agentTools`. Bridge should NOT send this directly. |

### Missing: Pixel-Agents Messages That Pi Doesn't Provide Natively

| Pixel Message | What's Needed | How to Provide |
|---|---|---|
| `layoutLoaded` | Office layout JSON | Static asset — load from file/URL, not from Pi. |
| `existingAgents` | List of already-running agents on startup | Bridge must track active agent sessions and emit on webview connect. |
| `agentSelected` | Which agent is "focused" | Bridge must track UI selection state. |
| `characterSpritesLoaded` | Pre-colored sprite arrays | Static asset loading — serve from web server. |
| `floorTilesLoaded` | Floor tile sprites | Static asset loading. |
| `wallTilesLoaded` | Wall tile sprites | Static asset loading. |
| `furnitureAssetsLoaded` | Furniture catalog + sprites | Static asset loading. |
| `workspaceFolders` | Workspace folder list | Bridge can provide from config or filesystem. |
| `settingsLoaded` | User preferences | Bridge must persist and serve settings. |
| `agentToolPermission` | Permission-wait state | Pi's `beforeToolCall` hook can drive this. Emit when tool is blocked pending user approval. |
| `subagentToolPermission` | Subagent permission state | Same as above, scoped to subagent. |

---

## 4. VS Code-Specific Dependencies in the Frontend

| File / Module | Dependency | What It Does | Web Replacement |
|---|---|---|---|
| `vscodeApi.ts` | `acquireVsCodeApi()` | Posts messages to VS Code extension host | **Already handled**: `runtime.ts` detects browser mode and stubs `postMessage` with `console.log`. Replace with WebSocket/SSE sender. |
| `runtime.ts` | `typeof acquireVsCodeApi` | Detects VS Code vs browser runtime | Already has browser detection. No change needed. |
| `useExtensionMessages.ts` | `window.addEventListener('message', ...)` | Receives messages from extension host | Replace with WebSocket `onmessage` handler. The message format stays the same — only the transport changes. |
| `hooks/useEditorActions.ts` | `vscode.postMessage(...)` | Sends editor commands (openClaude, focusAgent, etc.) | Replace postMessage with WebSocket/HTTP calls to bridge server. |
| `components/SettingsModal.tsx` | `vscode.postMessage(...)` | Saves settings to VS Code global state | Replace with HTTP API to bridge server for persistence. |
| `components/DebugView.tsx` | `vscode.postMessage({ type: 'requestDiagnostics' })` | Requests agent diagnostics | Replace with HTTP/WS call to bridge server. |
| `components/BottomToolbar.tsx` | `vscode.postMessage(...)` | UI toolbar actions | Replace with bridge API calls. |
| `components/AgentLabels.tsx` | `vscode.postMessage(...)` | Agent label interactions | Replace with bridge API calls. |
| `App.tsx` | `vscode.postMessage(...)` | Various app-level commands | Replace with bridge API calls. |

### Key Finding: The frontend already has browser runtime detection

`runtime.ts` exports `isBrowserRuntime` and `vscodeApi.ts` already stubs `postMessage` in browser mode. This means **the frontend is partially ready for web deployment**. The main work is:

1. Replace the `console.log` stub in `vscodeApi.ts` with real WebSocket communication
2. Create a message dispatcher that receives WebSocket messages and dispatches them as `window.postMessage` (or directly to the handler)

---

## 5. Recommended Bridge/Adapter Architecture

### Bridge Server (Node.js / Bun)

```
┌─────────────┐       WebSocket        ┌──────────────┐       subscribe()      ┌──────────────┐
│  Pixel-Agents│ ◄──────────────────►  │  Bridge       │ ◄──────────────────►  │  Pi-Agent    │
│  Web Frontend│                       │  Server       │                       │  Instance(s) │
└─────────────┘                        └──────────────┘                        └──────────────┘
```

### Bridge Responsibilities

1. **Agent ID Management**: Pi agents don't have numeric IDs. Bridge assigns `nextAgentId++` and maintains a `Map<agentSessionId, numericId>`.

2. **Event Translation** (Pi → Pixel):
   ```typescript
   agent.subscribe((event, signal) => {
     const agentId = bridgeIdMap.get(sessionId);
     switch (event.type) {
       case "agent_start":
         ws.send({ type: "agentCreated", id: agentId });
         break;
       case "tool_execution_start":
         ws.send({
           type: "agentToolStart",
           id: agentId,
           toolId: event.toolCallId,
           status: formatToolStatus(event.toolName, event.args)
         });
         break;
       case "tool_execution_end":
         setTimeout(() => {
           ws.send({ type: "agentToolDone", id: agentId, toolId: event.toolCallId });
         }, 300);
         break;
       case "turn_end":
         ws.send({ type: "agentToolsClear", id: agentId });
         ws.send({ type: "agentStatus", id: agentId, status: "waiting" });
         break;
       case "turn_start":
         ws.send({ type: "agentStatus", id: agentId, status: "active" });
         break;
     }
   });
   ```

3. **`formatToolStatus` Function**: Port from `transcriptParser.ts`. Maps tool names to human-readable status strings:
   - `Read` → `"Reading filename.ts"`
   - `Edit` → `"Editing filename.ts"`
   - `Bash`/`Execute` → `"Running: command..."`
   - `Grep`/`Glob` → `"Searching files"`
   - Custom tools → `"Using toolName"`

4. **Subagent Support**: If pi-agent uses `Task`/`Agent`-like delegation tools, the bridge must:
   - Detect subtask tool calls by name
   - Format status as `"Subtask: description"` to trigger subagent character creation
   - Subscribe to child agent events and emit `subagentToolStart`/`subagentToolDone`

5. **Permission Flow**: If `beforeToolCall` is used for permission gating:
   - Emit `agentToolPermission` when tool is blocked
   - Emit `agentToolPermissionClear` when user approves
   - Forward approval/denial to pi-agent via `beforeToolCall` callback resolution

6. **Static Asset Serving**: Serve sprite sheets, layouts, furniture catalogs from the bridge's HTTP server. On `webviewReady`, send `characterSpritesLoaded`, `floorTilesLoaded`, `wallTilesLoaded`, `furnitureAssetsLoaded`, `settingsLoaded`, `layoutLoaded`.

7. **Webview-to-Pi Commands**: Handle messages from the frontend:
   - `openClaude` → Create new pi-agent instance
   - `focusAgent` → UI-only (no terminal to focus)
   - `closeAgent` → Abort pi-agent, remove from tracking

### Minimal Integration (Hackathon MVP)

For a minimal working demo, only these messages are required:

| Category | Messages | Priority |
|---|---|---|
| **Bootstrap** | `settingsLoaded`, `layoutLoaded`, `characterSpritesLoaded`, `furnitureAssetsLoaded` | Must-have |
| **Agent lifecycle** | `agentCreated`, `agentClosed` | Must-have |
| **Tool animation** | `agentToolStart`, `agentToolDone`, `agentToolsClear` | Must-have |
| **Status** | `agentStatus` (active/waiting) | Must-have |
| **Selection** | `agentSelected` | Nice-to-have |
| **Subagents** | `subagentToolStart`, `subagentToolDone`, `subagentClear` | Nice-to-have |
| **Permissions** | `agentToolPermission`, `agentToolPermissionClear` | Nice-to-have |
