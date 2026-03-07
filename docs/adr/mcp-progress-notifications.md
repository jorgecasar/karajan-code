# ADR: MCP Progress Notifications

## Status: Proposed

## Context

Karajan Code runs long-running tool calls (kj_run, kj_code, kj_review, kj_plan) that can take several minutes. During this time, the MCP host (Claude Code, Codex CLI) shows no feedback to the user unless the server actively sends progress updates. This ADR documents the available mechanisms, what the codebase already implements, and what hosts actually display.

## Investigation

### 1. MCP SDK Methods Available (SDK v1.26.0)

The `Server` class (from `@modelcontextprotocol/sdk/server/index.js`) provides two mechanisms for server-to-host communication during tool execution:

#### a) `server.sendLoggingMessage(params)`

Sends a `notifications/message` JSON-RPC notification. Parameters:

```js
server.sendLoggingMessage({
  level: "debug" | "info" | "notice" | "warning" | "error",
  logger: "karajan",    // optional: identifies the source
  data: { ... }         // any JSON-serializable payload
});
```

- Requires `logging: {}` in server capabilities (already declared in server.js line 28).
- Fire-and-forget (returns `Promise<void>`).
- The server respects client-set log levels via `logging/setLevel` requests; messages below the threshold are suppressed internally by the SDK.

#### b) `extra.sendNotification()` with `notifications/progress`

Available in the `extra` parameter passed to request handlers. Sends a progress notification tied to a specific in-flight request via a progress token:

```js
extra.sendNotification({
  method: "notifications/progress",
  params: {
    progressToken,        // opaque token from client's _meta
    progress: 5,          // current step (number)
    total: 20,            // total steps (optional)
    message: "Coder running"  // human-readable (optional)
  }
});
```

- Only works if the client sends `_meta.progressToken` in the request.
- The progress token links the notification back to the originating tool call.
- The SDK `Protocol` class supports `resetTimeoutOnProgress` on the client side, meaning progress notifications can prevent request timeouts.

#### c) `server.notification()` (low-level)

The base `Protocol` class exposes a generic `notification()` method that can send any `ServerNotification`. This is what `sendLoggingMessage` uses internally. Not typically called directly.

### 2. What the Current Code Already Does

#### `buildProgressHandler(server)` (progress.js, line 106-118)

Attached to the progress EventEmitter for `kj_run` and `kj_resume`. Forwards **every** progress event as a `sendLoggingMessage` call with appropriate log levels:

- `agent:output` -> `debug`
- `agent:heartbeat` -> `debug`
- `agent:stall` -> `warning`
- `status: "fail"` -> `error`
- Everything else -> `info`

This means pipeline stage transitions (coder:start, reviewer:end, etc.) are already sent as logging messages.

#### `buildProgressNotifier(extra)` (progress.js, line 120-148)

Attached alongside `buildProgressHandler` for `kj_run` and `kj_resume`. Sends `notifications/progress` for known `PROGRESS_STAGES` events, but **only if** the client provides a `progressToken` in `extra._meta`. Maps each stage to a numeric progress index out of 32 total stages.

#### `buildDirectEmitter(server, runLog)` (server-handlers.js, line 253-265)

Used by `kj_code`, `kj_review`, and `kj_plan` (single-agent tools). Sends logging messages for each progress event with appropriate levels. Does NOT use `notifications/progress` (no progressNotifier attached).

#### `sendTrackerLog(server, stageName, status, summary)` (progress.js, line 81-96)

Sends a compact `pipeline:tracker` logging message for individual stage updates. Used by kj_code, kj_review, and kj_plan to report stage status changes.

### 3. What Hosts Actually Display

#### Claude Code

- **`notifications/message` (logging)**: Claude Code receives these but does **not** display them to the user in real-time during tool execution. They are silently consumed. The MCP spec says the client "MAY" display them, and Claude Code currently does not surface them in the terminal UI.
- **`notifications/progress`**: Claude Code **does** support progress tokens and displays progress notifications. When a tool call includes `_meta.progressToken`, Claude Code shows a progress indicator with the `message` field. However, Claude Code does not always send a progress token -- it is at the client's discretion.
- **Tool result**: The only guaranteed user-visible output is the final tool result returned from the `CallToolRequest` handler. This is always displayed.

#### Codex CLI (OpenAI)

- **`notifications/message` (logging)**: Codex CLI has limited MCP support. Logging messages are typically not displayed.
- **`notifications/progress`**: Codex CLI does not send progress tokens and does not display progress notifications.
- **Tool result**: Only the final result is displayed.

#### Summary Table

| Mechanism | Method | Claude Code displays? | Codex CLI displays? | Requires client cooperation? |
|-----------|--------|----------------------|--------------------|-----------------------------|
| Logging | `server.sendLoggingMessage()` | No (silent) | No | No |
| Progress | `extra.sendNotification(notifications/progress)` | Yes (when token sent) | No | Yes (progressToken) |
| Tool result | Return from handler | Always | Always | No |

### 4. Other SDK Capabilities Explored

- **`server.elicitInput()`**: For interactive prompts during tool execution. Already used by Karajan (buildAskQuestion). Not a progress mechanism.
- **`server.createMessage()`**: For LLM sampling requests. Not applicable to progress.
- **Experimental Tasks API**: The SDK v1.26.0 includes experimental task support (`server.experimental.tasks`) for "call-now, fetch-later" patterns. This could theoretically support long-running operations with polling, but is experimental and not supported by any current host.

## Decision

### Keep the current dual approach, with improvements:

1. **Continue sending `sendLoggingMessage`** for all progress events. Even though hosts do not currently display these, the MCP spec allows future hosts to surface them. The cost is minimal (fire-and-forget, best-effort). This also enables MCP Inspector and debugging tools to capture the full event stream.

2. **Continue sending `notifications/progress`** when the client provides a progress token. This is the only mechanism that Claude Code actually displays to users today.

3. **Extend `notifications/progress` to single-agent tools** (kj_code, kj_review, kj_plan). Currently only kj_run and kj_resume wire up `buildProgressNotifier`. The `extra` parameter is already passed to `handleCodeDirect`, `handleReviewDirect`, and `handlePlanDirect` but not used for progress notifications.

4. **Do NOT adopt the experimental Tasks API** at this time. It is not supported by any production host and the API is explicitly marked as unstable.

5. **Use `kj_status` as the primary user-facing progress mechanism**. Since hosts do not reliably display server-initiated notifications, the existing `kj_status` tool (which reads the run log) remains the most reliable way for users (via the host LLM) to check progress during long-running operations.

### Implementation notes for item 3:

In `handleCodeDirect`, `handleReviewDirect`, and `handlePlanDirect`, add:

```js
const progressNotifier = buildProgressNotifier(extra);
if (progressNotifier) emitter.on("progress", progressNotifier);
```

This is a one-line addition per handler, consistent with the pattern already used in `handleRunDirect`.

## Consequences

### Positive

- Users of Claude Code will see progress indicators for all long-running tools (not just kj_run) when Claude Code sends a progress token.
- The logging stream provides full observability for debugging and MCP Inspector users.
- `kj_status` continues to work as a reliable fallback regardless of host capabilities.
- No dependency on experimental/unstable SDK features.

### Negative

- Progress visibility remains host-dependent. Users of hosts that do not send progress tokens (Codex CLI, others) will not see real-time updates.
- `sendLoggingMessage` calls add minor overhead even when no host displays them, though the best-effort pattern ensures no failures.

### Risks

- If Claude Code changes how/when it sends progress tokens, the progress notifications may stop working. The kj_status fallback mitigates this.
- Future MCP spec changes to the logging or progress notification schemas could require updates.
