import assert from "node:assert/strict";
import test from "node:test";
import {
  callId,
  evaluateScenario,
  SCENARIOS,
  type BridgeEvent
} from "../scripts/probes/bridge-contract.js";
import {
  MAX_ARGUMENT_BYTES,
  MAX_DELTA_LENGTH,
  MAX_JSON_DEPTH,
  createAppServerMessageParser,
  recordGrokToolResult,
  requestId,
  type AppServerCandidate,
  type AppServerCandidateContext,
  type AppServerParseResult,
  type ExpectedResponse,
  type JsonObject,
  type JsonValue,
  type RejectionCode,
  type ResponseMethod
} from "../scripts/probes/app-server-candidate.js";

const candidate: AppServerCandidate = "app-server-dynamic";
const context: AppServerCandidateContext = {
  candidate,
  expectedCwd: "/synthetic/workspace",
  expectedModel: "gpt-synthetic",
  activeThreadId: "thread-synthetic",
  activeTurnId: "turn-synthetic",
  registeredToolNames: ["weather_lookup"]
};

const rejectionEvents = {
  "protocol-failure": { kind: "failure", fault: { kind: "fault", code: "protocol-failure", count: { kind: "count", value: 1 } } },
  "forbidden-command": { kind: "forbidden-action", action: "command" },
  "forbidden-file": { kind: "forbidden-action", action: "file" },
  "forbidden-terminal": { kind: "forbidden-action", action: "terminal" },
  "forbidden-web": { kind: "forbidden-action", action: "web" },
  "forbidden-approval": { kind: "forbidden-action", action: "approval" },
  "forbidden-built-in": { kind: "forbidden-action", action: "built-in" },
  "unexpected-mcp": { kind: "forbidden-action", action: "unexpected-mcp" }
} as const satisfies Readonly<Record<RejectionCode, BridgeEvent>>;

const syntheticValue: JsonValue = "synthetic";
assert.equal(syntheticValue, "synthetic");

function expectedRejection(code: RejectionCode): AppServerParseResult {
  return { kind: "rejected", code, event: rejectionEvents[code] };
}

function parseAppServerMessage(raw: unknown, candidateContext: AppServerCandidateContext): AppServerParseResult {
  return createAppServerMessageParser().parse(raw, candidateContext);
}

function notification(method: string, params: unknown): unknown {
  return { method, params };
}

function dynamicCall(overrides: Record<string, unknown> = {}): unknown {
  return {
    id: "request-synthetic",
    method: "item/tool/call",
    params: {
      arguments: { city: "synthetic" },
      callId: "call-synthetic",
      threadId: context.activeThreadId,
      tool: "weather_lookup",
      turnId: context.activeTurnId,
      ...overrides
    }
  };
}

function responseContext(method: ResponseMethod): AppServerCandidateContext {
  const expectedResponse: ExpectedResponse = { id: requestId("response-synthetic"), method };
  return {
    ...context,
    expectedResponse
  };
}

function response(method: ResponseMethod, result: unknown): AppServerParseResult {
  return parseAppServerMessage({ id: "response-synthetic", result }, responseContext(method));
}

function validDynamicItem(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    arguments: { city: "synthetic" },
    id: "call-synthetic",
    namespace: null,
    status: "completed",
    success: true,
    tool: "weather_lookup",
    type: "dynamicToolCall",
    ...overrides
  };
}

function validModelResult(): Record<string, unknown> {
  return {
    data: [{
      defaultReasoningEffort: "high",
      description: "synthetic description",
      displayName: "Synthetic Model",
      hidden: false,
      id: "model-synthetic",
      isDefault: true,
      model: "gpt-synthetic",
      supportedReasoningEfforts: [{ description: "", reasoningEffort: "high" }]
    }],
    nextCursor: null
  };
}

function validThreadResult(turns: readonly unknown[] = []): Record<string, unknown> {
  return {
    approvalPolicy: "never",
    approvalsReviewer: "user",
    cwd: "/synthetic/workspace",
    model: "gpt-synthetic",
    modelProvider: "openai",
    runtimeWorkspaceRoots: [],
    sandbox: { networkAccess: false, type: "readOnly" },
    thread: {
      cliVersion: "0.151.0",
      createdAt: 1,
      cwd: "/synthetic/workspace",
      ephemeral: true,
      id: "thread-server-generated",
      modelProvider: "openai",
      preview: "",
      projectId: null,
      sessionId: "session-server-generated",
      source: "vscode",
      status: { type: "idle" },
      threadSource: "appServer",
      turns,
      updatedAt: 1
    }
  };
}

function itemNotification(method: "item/started" | "item/completed", item: unknown): unknown {
  const timestamp = method === "item/started" ? { startedAtMs: 1 } : { completedAtMs: 2 };
  return notification(method, {
    ...timestamp,
    item,
    threadId: context.activeThreadId,
    turnId: context.activeTurnId
  });
}

test("normalizes bounded turn events without preserving content", () => {
  assert.deepEqual(parseAppServerMessage(notification("turn/started", {
    threadId: context.activeThreadId,
    turn: { id: context.activeTurnId, items: [], status: "inProgress" }
  }), context), { kind: "accepted" });
  assert.deepEqual(parseAppServerMessage(notification("item/agentMessage/delta", {
    delta: "hello synthetic",
    itemId: "item-text",
    threadId: context.activeThreadId,
    turnId: context.activeTurnId
  }), context), { kind: "events", events: [{ kind: "text-delta", characters: { kind: "count", value: 15 } }] });
  assert.deepEqual(parseAppServerMessage(notification("item/reasoning/summaryTextDelta", {
    delta: "thinking",
    itemId: "item-reasoning",
    summaryIndex: 0,
    threadId: context.activeThreadId,
    turnId: context.activeTurnId
  }), context), { kind: "events", events: [{ kind: "reasoning-delta", characters: { kind: "count", value: 8 } }] });
  assert.deepEqual(parseAppServerMessage(notification("item/reasoning/textDelta", {
    contentIndex: 1,
    delta: "details",
    itemId: "item-reasoning",
    threadId: context.activeThreadId,
    turnId: context.activeTurnId
  }), context), { kind: "events", events: [{ kind: "reasoning-delta", characters: { kind: "count", value: 7 } }] });
  assert.deepEqual(parseAppServerMessage(notification("turn/completed", {
    threadId: context.activeThreadId,
    turn: { id: context.activeTurnId, items: [], status: "completed" }
  }), context), { kind: "events", events: [{ kind: "completed" }] });
  assert.deepEqual(parseAppServerMessage(notification("turn/completed", {
    threadId: context.activeThreadId,
    turn: { id: context.activeTurnId, items: [], status: "interrupted" }
  }), context), { kind: "events", events: [{ kind: "cancellation", state: "observed" }, { kind: "completed" }] });
  const failed = parseAppServerMessage(notification("turn/completed", {
    threadId: context.activeThreadId,
    turn: { error: { message: "secret synthetic error" }, id: context.activeTurnId, items: [], status: "failed" }
  }), context);
  assert.deepEqual(failed, {
    kind: "events",
    events: [rejectionEvents["protocol-failure"], { kind: "completed" }]
  });
  assert.equal(JSON.stringify(failed).includes("secret"), false);
});

test("correlates request IDs separately from call IDs and records Grok provenance", () => {
  const parsed = parseAppServerMessage(dynamicCall({ callId: "call-different" }), context);
  assert.equal(parsed.kind, "tool-handoff");
  if (parsed.kind !== "tool-handoff") return;
  assert.equal(parsed.requestId, "request-synthetic");
  assert.equal(parsed.callId, "call-different");
  assert.notEqual(parsed.requestId, parsed.callId);
  assert.equal(parsed.executor, "grok");
  assert.deepEqual(parsed.event, { kind: "tool-request", callId: callId("call-different"), executor: "grok" });
  assert.deepEqual(recordGrokToolResult(callId("call-different")), { kind: "tool-result", callId: callId("call-different"), executor: "grok" });
});

test("clones bounded tool arguments as JSON data", () => {
  const inputArguments: JsonObject = { city: "synthetic", list: [null, false, 3, "value"] };
  const parsed = parseAppServerMessage(dynamicCall({ arguments: inputArguments }), context);
  assert.equal(parsed.kind, "tool-handoff");
  if (parsed.kind !== "tool-handoff") return;
  assert.deepEqual(parsed.arguments, { city: "synthetic", list: [null, false, 3, "value"] });
  assert.notEqual(parsed.arguments, inputArguments);
});

test("validates each correlated response and exposes only semantic results", () => {
  assert.deepEqual(response("initialize", {
    codexHome: "/synthetic/codex",
    platformFamily: "unix",
    platformOs: "synthetic",
    userAgent: "synthetic-agent"
  }), { kind: "accepted" });

  const signedIn = response("account/read", {
    account: { email: "private@example.invalid", planType: "plus", type: "chatgpt" },
    requiresOpenaiAuth: false
  });
  assert.deepEqual(signedIn, { kind: "events", events: [{ kind: "authentication", owner: "codex", status: "signed-in" }] });
  assert.equal(JSON.stringify(signedIn).includes("private@example.invalid"), false);

  assert.deepEqual(response("account/read", { account: null, requiresOpenaiAuth: true }), {
    kind: "events",
    events: [{ kind: "authentication", owner: "codex", status: "signed-out" }]
  });
  assert.deepEqual(response("account/read", { requiresOpenaiAuth: true }), {
    kind: "events",
    events: [{ kind: "authentication", owner: "codex", status: "signed-out" }]
  });

  const inventory = response("model/list", validModelResult());
  assert.deepEqual(inventory, { kind: "lifecycle", lifecycle: "model-available" });
  assert.equal(JSON.stringify(inventory).includes("gpt-synthetic"), false);

  const thread = response("thread/start", validThreadResult());
  assert.deepEqual(thread, { kind: "lifecycle", lifecycle: "thread-started", threadId: "thread-server-generated" });
  assert.equal(JSON.stringify(thread).includes("/synthetic/workspace"), false);

  assert.deepEqual(parseAppServerMessage(notification("thread/started", {
    thread: validThreadResult().thread
  }), { ...context, activeThreadId: "thread-server-generated" }), { kind: "accepted" });
  assert.deepEqual(parseAppServerMessage({ emittedAtMs: 1, method: "remoteControl/status/changed", params: {
    environmentId: null,
    installationId: "installation-synthetic",
    serverName: "server-synthetic",
    status: "disabled"
  } }, context), { kind: "accepted" });
  assert.deepEqual(parseAppServerMessage({ emittedAtMs: -1, method: "remoteControl/status/changed", params: {
    environmentId: null,
    installationId: "installation-synthetic",
    serverName: "server-synthetic",
    status: "disabled"
  } }, context), expectedRejection("protocol-failure"));
  assert.deepEqual(parseAppServerMessage(notification("remoteControl/status/changed", {
    environmentId: null,
    installationId: "installation-synthetic",
    serverName: "server-synthetic",
    status: "connected"
  }), context), expectedRejection("forbidden-built-in"));

  assert.deepEqual(response("turn/start", {
    turn: { id: "turn-server-generated", items: [], status: "inProgress" }
  }), { kind: "lifecycle", lifecycle: "turn-started", turnId: "turn-server-generated" });
  assert.deepEqual(response("turn/interrupt", {}), {
    kind: "events",
    events: [{ kind: "cancellation", state: "requested" }]
  });

  assert.deepEqual(parseAppServerMessage({ id: "wrong", result: validModelResult() }, responseContext("model/list")), expectedRejection("protocol-failure"));
  assert.deepEqual(parseAppServerMessage({ id: "response-synthetic", result: validModelResult() }, context), expectedRejection("protocol-failure"));
  assert.deepEqual(response("initialize", validModelResult()), expectedRejection("protocol-failure"));
  assert.deepEqual(response("model/list", { data: [] }), expectedRejection("protocol-failure"));
  assert.deepEqual(response("model/list", {
    ...validModelResult(),
    data: [{
      defaultReasoningEffort: "low",
      description: "other",
      displayName: "Other",
      hidden: false,
      id: "other",
      isDefault: true,
      model: "other",
      supportedReasoningEfforts: [{ description: "", reasoningEffort: "low" }]
    }]
  }), expectedRejection("protocol-failure"));
  assert.deepEqual(response("thread/start", { thread: { id: "wrong-shape", turns: [] } }), expectedRejection("protocol-failure"));
  assert.deepEqual(response("thread/start", {
    ...validThreadResult(),
    approvalPolicy: "on-request"
  }), expectedRejection("protocol-failure"));
  assert.deepEqual(response("thread/start", {
    ...validThreadResult(),
    modelProvider: "other",
    thread: { ...(validThreadResult().thread as Record<string, unknown>), modelProvider: "other" }
  }), expectedRejection("protocol-failure"));
  assert.deepEqual(response("thread/start", {
    ...validThreadResult(),
    thread: { ...(validThreadResult().thread as Record<string, unknown>), ephemeral: false }
  }), expectedRejection("protocol-failure"));
  assert.deepEqual(response("thread/start", {
    ...validThreadResult(),
    thread: { ...(validThreadResult().thread as Record<string, unknown>), threadSource: "other" }
  }), expectedRejection("protocol-failure"));
  const appServerSource = validThreadResult().thread as Record<string, unknown>;
  const { threadSource: ignoredThreadSource, ...threadWithoutAnalyticsSource } = appServerSource;
  assert.equal(ignoredThreadSource, "appServer");
  assert.deepEqual(response("thread/start", {
    ...validThreadResult(),
    thread: { ...threadWithoutAnalyticsSource, source: "appServer" }
  }), { kind: "lifecycle", lifecycle: "thread-started", threadId: "thread-server-generated" });
  assert.deepEqual(response("thread/start", {
    ...validThreadResult(),
    thread: threadWithoutAnalyticsSource
  }), expectedRejection("protocol-failure"));
  assert.deepEqual(response("thread/start", {
    ...validThreadResult(),
    approvalsReviewer: "bogus"
  }), expectedRejection("protocol-failure"));
  assert.deepEqual(response("thread/start", {
    ...validThreadResult(),
    approvalsReviewer: "auto_review"
  }), expectedRejection("protocol-failure"));
  assert.deepEqual(response("thread/start", {
    ...validThreadResult(),
    runtimeWorkspaceRoots: ["/synthetic/external"]
  }), expectedRejection("protocol-failure"));
  assert.deepEqual(response("thread/start", {
    ...validThreadResult(),
    cwd: "/synthetic/other",
    thread: { ...(validThreadResult().thread as Record<string, unknown>), cwd: "/synthetic/other" }
  }), expectedRejection("protocol-failure"));
  assert.deepEqual(response("thread/start", {
    ...validThreadResult(),
    cwd: ""
  }), expectedRejection("protocol-failure"));
  assert.deepEqual(response("thread/start", {
    ...validThreadResult(),
    sandbox: { type: "dangerFullAccess" }
  }), expectedRejection("protocol-failure"));
  assert.deepEqual(response("thread/start", {
    ...validThreadResult(),
    sandbox: {}
  }), expectedRejection("protocol-failure"));
  const wrongSource = validThreadResult();
  wrongSource.thread = {
    ...(wrongSource.thread as Record<string, unknown>),
    source: "bogus"
  };
  assert.deepEqual(response("thread/start", wrongSource), expectedRejection("protocol-failure"));
  assert.deepEqual(response("turn/start", { turn: { id: "wrong-status", items: [], status: "completed" } }), expectedRejection("protocol-failure"));
  assert.deepEqual(response("turn/interrupt", { extra: true }), expectedRejection("protocol-failure"));
});

test("requires a Codex-owned ChatGPT account for signed-in status", () => {
  assert.deepEqual(response("account/read", {
    account: { email: null, planType: "plus", type: "chatgpt" },
    requiresOpenaiAuth: true
  }), expectedRejection("protocol-failure"));
  assert.deepEqual(response("account/read", {
    account: null,
    requiresOpenaiAuth: false
  }), expectedRejection("protocol-failure"));
  assert.deepEqual(response("account/read", {
    account: { type: "apiKey" },
    requiresOpenaiAuth: false
  }), expectedRejection("protocol-failure"));
  assert.deepEqual(response("account/read", {
    account: { type: "amazonBedrock", usesCodexManagedCredentials: true },
    requiresOpenaiAuth: false
  }), expectedRejection("protocol-failure"));
});

test("rejects every privileged request family and redacts raw errors", () => {
  const cases: readonly (readonly [string, RejectionCode])[] = [
    ["item/commandExecution/requestApproval", "forbidden-command"],
    ["item/fileChange/requestApproval", "forbidden-file"],
    ["item/permissions/requestApproval", "forbidden-approval"],
    ["item/tool/requestUserInput", "forbidden-approval"],
    ["mcpServer/elicitation/request", "unexpected-mcp"],
    ["account/chatgptAuthTokens/refresh", "forbidden-approval"],
    ["attestation/generate", "forbidden-approval"],
    ["currentTime/read", "forbidden-built-in"],
    ["mcpServer/tool/call", "unexpected-mcp"],
    ["applyPatchApproval", "forbidden-file"],
    ["execCommandApproval", "forbidden-command"]
  ];
  for (const [method, code] of cases) {
    const parsed = parseAppServerMessage({ id: "privileged-synthetic", method, params: { secret: "synthetic" } }, context);
    assert.deepEqual(parsed, expectedRejection(code));
    assert.equal(JSON.stringify(parsed).includes("synthetic"), false);
  }

  const notificationError = parseAppServerMessage(notification("error", {
    error: { additionalDetails: "private details", message: "secret synthetic server error" },
    threadId: context.activeThreadId,
    turnId: context.activeTurnId,
    willRetry: false
  }), context);
  assert.deepEqual(notificationError, { kind: "events", events: [rejectionEvents["protocol-failure"]] });
  assert.equal(JSON.stringify(notificationError).includes("secret"), false);

  const responseError = parseAppServerMessage({
    error: { code: -1, message: "secret synthetic response error" },
    id: "response-synthetic"
  }, responseContext("model/list"));
  assert.deepEqual(responseError, expectedRejection("protocol-failure"));
  assert.equal(JSON.stringify(responseError).includes("secret"), false);
});

test("audits started, completed, historical, and embedded turn items", () => {
  assert.deepEqual(parseAppServerMessage(itemNotification("item/started", {
    id: "item-reasoning",
    type: "reasoning"
  }), context), { kind: "accepted" });
  const lifecycleParser = createAppServerMessageParser();
  assert.equal(lifecycleParser.parse(dynamicCall(), context).kind, "tool-handoff");
  assert.deepEqual(lifecycleParser.parse(itemNotification("item/completed", validDynamicItem()), context), { kind: "accepted" });

  const itemCases: readonly (readonly [Record<string, unknown>, RejectionCode])[] = [
    [{ id: "item-command", type: "commandExecution" }, "forbidden-command"],
    [{ id: "item-file", type: "fileChange" }, "forbidden-file"],
    [{ id: "item-web", type: "webSearch" }, "forbidden-web"],
    [{ id: "item-mcp", type: "mcpToolCall" }, "unexpected-mcp"],
    [{ id: "item-image", type: "imageGeneration" }, "forbidden-built-in"],
    [{ id: "item-future", type: "futureItem" }, "forbidden-built-in"],
    [validDynamicItem({ tool: "unregistered_tool" }), "protocol-failure"],
    [{ id: "item-incomplete", type: "dynamicToolCall" }, "protocol-failure"]
  ];
  for (const [item, code] of itemCases) {
    assert.deepEqual(parseAppServerMessage(itemNotification("item/completed", item), context), expectedRejection(code));
  }

  assert.deepEqual(parseAppServerMessage(itemNotification("item/completed", validDynamicItem()), {
    ...context,
    candidate: "app-server-mcp"
  }), expectedRejection("unexpected-mcp"));
  assert.deepEqual(parseAppServerMessage(itemNotification("item/completed", validDynamicItem({
    contentItems: { bad: true }
  })), context), expectedRejection("protocol-failure"));

  assert.deepEqual(parseAppServerMessage(notification("turn/completed", {
    threadId: context.activeThreadId,
    turn: { id: context.activeTurnId, items: [{ id: "embedded-command", type: "commandExecution" }], status: "completed" }
  }), context), expectedRejection("forbidden-command"));
  assert.deepEqual(response("turn/start", {
    turn: { id: "turn-server-generated", items: [{ id: "embedded-mcp", type: "mcpToolCall" }], status: "inProgress" }
  }), expectedRejection("unexpected-mcp"));
  assert.deepEqual(response("thread/start", validThreadResult([{
    id: "historical-turn",
    items: [{ id: "historical-web", type: "webSearch" }],
    status: "completed"
  }])), expectedRejection("forbidden-web"));
});

test("rejects uncorrelated methods, IDs, namespaces, contexts, and envelopes", () => {
  assert.deepEqual(parseAppServerMessage(dynamicCall(), { ...context, candidate: "app-server-mcp" }), expectedRejection("unexpected-mcp"));
  assert.deepEqual(parseAppServerMessage(dynamicCall({ namespace: "mcp" }), context), expectedRejection("unexpected-mcp"));
  assert.deepEqual(parseAppServerMessage(dynamicCall({ threadId: "other" }), context), expectedRejection("protocol-failure"));
  assert.deepEqual(parseAppServerMessage(dynamicCall({ turnId: "other" }), context), expectedRejection("protocol-failure"));
  assert.deepEqual(parseAppServerMessage(dynamicCall({ tool: "unregistered_tool" }), context), expectedRejection("protocol-failure"));
  assert.deepEqual(parseAppServerMessage({ id: "request-synthetic", method: "unknown/server/request", params: {} }, context), expectedRejection("protocol-failure"));
  assert.deepEqual(parseAppServerMessage({ id: "request-synthetic", method: "item/tool/call", params: {
    arguments: {},
    callId: "call",
    extra: true,
    threadId: context.activeThreadId,
    tool: "weather_lookup",
    turnId: context.activeTurnId
  } }, context), expectedRejection("protocol-failure"));
  assert.deepEqual(parseAppServerMessage(notification("unknown/notification", {}), context), expectedRejection("protocol-failure"));
  assert.deepEqual(parseAppServerMessage({ emittedAtMs: 1, method: "turn/started", params: {} }, context), expectedRejection("protocol-failure"));
  assert.deepEqual(parseAppServerMessage({ id: "request-synthetic", method: "item/tool/call", params: {}, trace: {} }, context), expectedRejection("protocol-failure"));
  assert.deepEqual(parseAppServerMessage(notification("item/agentMessage/delta", {
    delta: "x",
    itemId: "item",
    threadId: context.activeThreadId,
    turnId: context.activeTurnId
  }), {
    candidate,
    expectedCwd: "/synthetic/workspace",
    expectedModel: "gpt-synthetic",
    registeredToolNames: ["weather_lookup"]
  }), expectedRejection("protocol-failure"));
  assert.deepEqual(parseAppServerMessage(dynamicCall(), {
    ...context,
    registeredToolNames: ["weather_lookup", "weather_lookup"]
  }), expectedRejection("protocol-failure"));
});

test("atomically rejects reused request IDs, call IDs, and completion notifications", () => {
  const parser = createAppServerMessageParser();
  assert.equal(parser.parse(dynamicCall(), context).kind, "tool-handoff");
  assert.deepEqual(parser.parse(dynamicCall(), context), expectedRejection("protocol-failure"));
  assert.deepEqual(parser.parse({
    ...dynamicCall({ callId: "call-synthetic" }) as Record<string, unknown>,
    id: "request-different"
  }, context), expectedRejection("protocol-failure"));
  assert.deepEqual(parser.parse(itemNotification("item/completed", validDynamicItem()), context), { kind: "accepted" });
  assert.deepEqual(parser.parse(itemNotification("item/completed", validDynamicItem()), context), expectedRejection("protocol-failure"));

  const scopedParser = createAppServerMessageParser();
  const oldContext = { ...context, activeTurnId: "turn-old" };
  assert.equal(scopedParser.parse(dynamicCall({
    callId: "call-old",
    turnId: "turn-old"
  }), oldContext).kind, "tool-handoff");
  assert.deepEqual(scopedParser.parse(notification("item/completed", {
    completedAtMs: 2,
    item: validDynamicItem({ id: "call-old" }),
    threadId: context.activeThreadId,
    turnId: "turn-new"
  }), { ...context, activeTurnId: "turn-new" }), expectedRejection("protocol-failure"));
});

test("ties dynamic tool status and success to the item lifecycle phase", () => {
  assert.deepEqual(parseAppServerMessage(itemNotification("item/started", validDynamicItem({
    status: "inProgress",
    success: null
  })), context), { kind: "accepted" });
  assert.deepEqual(parseAppServerMessage(itemNotification("item/started", validDynamicItem()), context), expectedRejection("protocol-failure"));

  const parser = createAppServerMessageParser();
  assert.equal(parser.parse(dynamicCall(), context).kind, "tool-handoff");
  assert.deepEqual(parser.parse(itemNotification("item/completed", validDynamicItem({
    status: "inProgress",
    success: null
  })), context), expectedRejection("protocol-failure"));
  assert.deepEqual(parser.parse(itemNotification("item/completed", validDynamicItem()), context), { kind: "accepted" });

  const failedParser = createAppServerMessageParser();
  assert.equal(failedParser.parse(dynamicCall(), context).kind, "tool-handoff");
  assert.deepEqual(failedParser.parse(itemNotification("item/completed", validDynamicItem({
    status: "failed",
    success: false
  })), context), { kind: "accepted" });

  const completedTurnParser = createAppServerMessageParser();
  assert.equal(completedTurnParser.parse(dynamicCall(), context).kind, "tool-handoff");
  assert.deepEqual(completedTurnParser.parse(notification("turn/completed", {
    threadId: context.activeThreadId,
    turn: {
      id: context.activeTurnId,
      items: [validDynamicItem({ status: "inProgress", success: null })],
      status: "completed"
    }
  }), context), expectedRejection("protocol-failure"));
});

test("rejects malformed, cyclic, deep, large, dangerous, and non-JSON values", () => {
  const cyclic: Record<string, unknown> = {};
  cyclic.self = cyclic;
  assert.deepEqual(parseAppServerMessage(dynamicCall({ arguments: cyclic }), context), expectedRejection("protocol-failure"));

  let deep: JsonObject = {};
  for (let index = 0; index < MAX_JSON_DEPTH; index += 1) deep = { nested: deep };
  assert.deepEqual(parseAppServerMessage(dynamicCall({ arguments: deep }), context), expectedRejection("protocol-failure"));
  assert.deepEqual(parseAppServerMessage(dynamicCall({ arguments: { value: "x".repeat(MAX_ARGUMENT_BYTES) } }), context), expectedRejection("protocol-failure"));

  for (const key of ["__proto__", "prototype", "constructor"]) {
    const dangerous: Record<string, unknown> = {};
    Object.defineProperty(dangerous, key, { enumerable: true, value: "synthetic" });
    assert.deepEqual(parseAppServerMessage(dynamicCall({ arguments: dangerous }), context), expectedRejection("protocol-failure"));
  }

  const accessor: Record<string, unknown> = {};
  Object.defineProperty(accessor, "secret", { enumerable: true, get: () => "synthetic" });
  assert.deepEqual(parseAppServerMessage(dynamicCall({ arguments: accessor }), context), expectedRejection("protocol-failure"));

  const hidden: Record<string, unknown> = {};
  Object.defineProperty(hidden, "secret", { enumerable: false, value: "synthetic" });
  assert.deepEqual(parseAppServerMessage(dynamicCall({ arguments: hidden }), context), expectedRejection("protocol-failure"));

  class CustomValue {
    readonly value = "synthetic";
  }
  assert.deepEqual(parseAppServerMessage(dynamicCall({ arguments: new CustomValue() }), context), expectedRejection("protocol-failure"));
  assert.deepEqual(parseAppServerMessage(dynamicCall({ arguments: { functionValue: () => true } }), context), expectedRejection("protocol-failure"));
  assert.deepEqual(parseAppServerMessage(dynamicCall({ arguments: { nonFinite: Number.NaN } }), context), expectedRejection("protocol-failure"));

  const manyNodes: Record<string, unknown> = {};
  for (let index = 0; index < 4097; index += 1) manyNodes[`key-${index}`] = index;
  assert.deepEqual(parseAppServerMessage(dynamicCall({ arguments: manyNodes }), context), expectedRejection("protocol-failure"));
  assert.deepEqual(parseAppServerMessage(dynamicCall({ arguments: null }), context), expectedRejection("protocol-failure"));
});

test("enforces UTF-8 byte ceilings and non-empty streamed deltas", () => {
  const oversizedId = "😀".repeat(257);
  assert.throws(() => requestId(oversizedId), /request ID is invalid/);
  assert.deepEqual(parseAppServerMessage({ ...dynamicCall() as Record<string, unknown>, id: oversizedId }, context), expectedRejection("protocol-failure"));
  assert.deepEqual(parseAppServerMessage(dynamicCall({ callId: oversizedId }), context), expectedRejection("protocol-failure"));

  const baseDelta = {
    itemId: "item",
    threadId: context.activeThreadId,
    turnId: context.activeTurnId
  };
  assert.deepEqual(parseAppServerMessage(notification("item/agentMessage/delta", {
    ...baseDelta,
    delta: ""
  }), context), expectedRejection("protocol-failure"));
  assert.deepEqual(parseAppServerMessage(notification("item/agentMessage/delta", {
    ...baseDelta,
    delta: "😀".repeat(Math.floor(MAX_DELTA_LENGTH / 4) + 1)
  }), context), expectedRejection("protocol-failure"));
  assert.deepEqual(parseAppServerMessage(notification("error", {
    error: { message: "x".repeat(64 * 1024 + 1) },
    threadId: context.activeThreadId,
    turnId: context.activeTurnId,
    willRetry: false
  }), context), expectedRejection("protocol-failure"));
});

test("turns every rejection into an evaluator-visible semantic failure", () => {
  const parsed = parseAppServerMessage(notification("unknown/notification", { secret: "synthetic" }), context);
  assert.deepEqual(parsed, expectedRejection("protocol-failure"));
  assert.equal(parsed.kind, "rejected");
  if (parsed.kind !== "rejected") return;
  const result = evaluateScenario(SCENARIOS["plain-text"], [parsed.event, { kind: "completed" }]);
  assert.equal(result.status, "failed");
  assert.equal(result.faults.some((entry) => entry.code === "protocol-failure"), true);
  assert.equal(JSON.stringify(parsed).includes("synthetic"), false);

  const first = parseAppServerMessage(dynamicCall({ arguments: { deterministic: [1, true, "value"] } }), context);
  const second = parseAppServerMessage(dynamicCall({ arguments: { deterministic: [1, true, "value"] } }), context);
  assert.deepEqual(first, second);
});
