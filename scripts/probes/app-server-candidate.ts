import {
  callId,
  count,
  fault,
  type BridgeEvent,
  type CallId
} from "./bridge-contract.js";

const MAX_ID_LENGTH = 1024;
const MAX_FIELD_BYTES = 64 * 1024;
const MAX_TOOL_NAMES = 256;
const MAX_TRACKED_IDENTITIES = 4096;
export const MAX_ARGUMENT_BYTES = 64 * 1024;
export const MAX_JSON_DEPTH = 16;
const MAX_JSON_NODES = 4096;
export const MAX_DELTA_LENGTH = 1024 * 1024;
const MAX_RESPONSE_BYTES = 4 * 1024 * 1024;

export type JsonValue = null | boolean | number | string | readonly JsonValue[] | JsonObject;

export interface JsonObject {
  readonly [key: string]: JsonValue;
}

export type AppServerCandidate = "app-server-dynamic" | "app-server-mcp";

export interface ExpectedResponse {
  readonly id: RequestId;
  readonly method: ResponseMethod;
}

export type ResponseMethod =
  | "initialize"
  | "account/read"
  | "model/list"
  | "thread/start"
  | "turn/start"
  | "turn/interrupt";

export interface AppServerCandidateContext {
  readonly candidate: AppServerCandidate;
  readonly expectedModel: string;
  readonly activeThreadId?: string;
  readonly activeTurnId?: string;
  readonly registeredToolNames: readonly string[];
  readonly expectedResponse?: ExpectedResponse;
}

export interface AppServerMessageParser {
  readonly parse: (raw: unknown, context: AppServerCandidateContext) => AppServerParseResult;
}

declare const REQUEST_ID: unique symbol;

export type RequestId = (string | number) & { readonly [REQUEST_ID]: true };

export type AppServerParseResult =
  | { readonly kind: "accepted" }
  | { readonly kind: "events"; readonly events: readonly BridgeEvent[] }
  | { readonly kind: "lifecycle"; readonly lifecycle: "model-available" }
  | { readonly kind: "lifecycle"; readonly lifecycle: "thread-started"; readonly threadId: string }
  | { readonly kind: "lifecycle"; readonly lifecycle: "turn-started"; readonly turnId: string }
  | {
      readonly kind: "tool-handoff";
      readonly requestId: RequestId;
      readonly callId: CallId;
      readonly tool: string;
      readonly arguments: JsonObject;
      readonly executor: "grok";
      readonly event: Extract<BridgeEvent, { readonly kind: "tool-request" }>;
    }
  | { readonly kind: "rejected"; readonly code: RejectionCode; readonly event: BridgeEvent };

export type RejectionCode =
  | "protocol-failure"
  | "forbidden-command"
  | "forbidden-file"
  | "forbidden-terminal"
  | "forbidden-web"
  | "forbidden-approval"
  | "forbidden-built-in"
  | "unexpected-mcp";

const RESPONSE_METHODS = new Set<ResponseMethod>([
  "initialize",
  "account/read",
  "model/list",
  "thread/start",
  "turn/start",
  "turn/interrupt"
]);

const PRIVILEGED_METHODS = new Map<string, RejectionCode>([
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
]);
const NON_TOOL_ITEM_TYPES = new Set([
  "agentMessage",
  "hookPrompt",
  "plan",
  "reasoning",
  "userMessage"
]);

const REQUEST_KEYS = ["id", "method", "params"] as const;
const RESPONSE_KEYS = ["id", "result"] as const;
const NOTIFICATION_KEYS = ["method", "params"] as const;

export function requestId(value: string | number): RequestId {
  if (!isRequestId(value)) throw new Error("request ID is invalid");
  return value;
}

export function recordGrokToolResult(toolCallId: CallId): Extract<BridgeEvent, { readonly kind: "tool-result" }> {
  return { kind: "tool-result", callId: toolCallId, executor: "grok" };
}

export function createAppServerMessageParser(): AppServerMessageParser {
  const identities: IdentityLedger = {
    callScopes: new Map<CallId, CallScope>(),
    completedCallIds: new Set<CallId>(),
    requestIds: new Set<RequestId>()
  };
  return {
    parse: (raw, context) => {
      const result = parseAppServerMessage(raw, context, identities);
      if (result.kind === "tool-handoff") {
        if (context.activeThreadId === undefined || context.activeTurnId === undefined) {
          return rejected("protocol-failure");
        }
        identities.requestIds.add(result.requestId);
        identities.callScopes.set(result.callId, {
          threadId: context.activeThreadId,
          turnId: context.activeTurnId
        });
      }
      return result;
    }
  };
}

interface IdentityLedger {
  readonly callScopes: Map<CallId, CallScope>;
  readonly completedCallIds: Set<CallId>;
  readonly requestIds: Set<RequestId>;
}

interface CallScope {
  readonly threadId: string;
  readonly turnId: string;
}

function parseAppServerMessage(raw: unknown, context: AppServerCandidateContext, identities: IdentityLedger): AppServerParseResult {
  try {
    if (!isValidContext(context) || !isPlainObject(raw) || hasDangerousKey(raw) || hasAccessor(raw)) return rejected("protocol-failure");

    const hasId = hasOwn(raw, "id");
    const hasMethod = hasOwn(raw, "method");
    const hasResult = hasOwn(raw, "result");
    const hasError = hasOwn(raw, "error");

    if (hasMethod && hasId && !hasResult && !hasError) return parseRequest(raw, context, identities);
    if (hasMethod && !hasId && !hasResult && !hasError) return parseNotification(raw, context, identities);
    if (hasId && hasResult && !hasMethod && !hasError) return parseResponse(raw, context, identities.callScopes);
    if (hasId && hasError && !hasMethod && !hasResult) return rejected("protocol-failure");
    return rejected("protocol-failure");
  } catch {
    return rejected("protocol-failure");
  }
}

function parseRequest(raw: Record<string, unknown>, context: AppServerCandidateContext, identities: IdentityLedger): AppServerParseResult {
  if (!hasOnlyKeys(raw, REQUEST_KEYS) || typeof raw.method !== "string" || !isRequestId(raw.id)) {
    return rejected("protocol-failure");
  }

  const privileged = PRIVILEGED_METHODS.get(raw.method);
  if (privileged !== undefined) return rejected(privileged);
  if (raw.method !== "item/tool/call") return rejected("protocol-failure");
  if (context.candidate === "app-server-mcp") return rejected("unexpected-mcp");
  if (!isPlainObject(raw.params) || hasDangerousKey(raw.params) || hasAccessor(raw.params)
    || !hasOnlyKeys(raw.params, ["arguments", "callId", "namespace", "threadId", "tool", "turnId"])) {
    return rejected("protocol-failure");
  }

  const params = raw.params;
  if (!hasOwn(params, "arguments") || !hasOwn(params, "callId") || !hasOwn(params, "threadId")
    || !hasOwn(params, "tool") || !hasOwn(params, "turnId")) return rejected("protocol-failure");
  if (!isBoundedText(params.callId) || !isBoundedText(params.threadId) || !isBoundedText(params.turnId) || !isBoundedText(params.tool)) {
    return rejected("protocol-failure");
  }
  const parsedCallId = callId(params.callId);
  if (identities.requestIds.size >= MAX_TRACKED_IDENTITIES || identities.callScopes.size >= MAX_TRACKED_IDENTITIES
    || identities.requestIds.has(raw.id) || identities.callScopes.has(parsedCallId)) {
    return rejected("protocol-failure");
  }
  if (params.threadId !== context.activeThreadId || params.turnId !== context.activeTurnId) return rejected("protocol-failure");
  if (hasOwn(params, "namespace") && params.namespace !== null) return rejected("unexpected-mcp");
  if (!context.registeredToolNames.includes(params.tool)) return rejected("protocol-failure");

  const argumentsValue = parseBoundedArguments(params.arguments);
  if (argumentsValue === undefined) return rejected("protocol-failure");
  const event: Extract<BridgeEvent, { readonly kind: "tool-request" }> = {
    kind: "tool-request",
    callId: parsedCallId,
    executor: "grok"
  };
  return {
    kind: "tool-handoff",
    requestId: raw.id,
    callId: parsedCallId,
    tool: params.tool,
    arguments: argumentsValue,
    executor: "grok",
    event
  };
}

function parseNotification(raw: Record<string, unknown>, context: AppServerCandidateContext, identities: IdentityLedger): AppServerParseResult {
  if (!hasOnlyKeys(raw, NOTIFICATION_KEYS) || typeof raw.method !== "string") {
    return rejected("protocol-failure");
  }
  const params = parseBoundedJson(raw.params, MAX_RESPONSE_BYTES);
  if (!isJsonObject(params)) return rejected("protocol-failure");
  switch (raw.method) {
    case "turn/started":
      return parseTurnStarted(params, context, identities.callScopes);
    case "turn/completed":
      return parseTurnCompleted(params, context, identities.callScopes);
    case "item/agentMessage/delta":
      return parseAgentDelta(params, context);
    case "item/reasoning/summaryTextDelta":
      return parseReasoningDelta(params, context, ["delta", "itemId", "summaryIndex", "threadId", "turnId"]);
    case "item/reasoning/textDelta":
      return parseReasoningDelta(params, context, ["contentIndex", "delta", "itemId", "threadId", "turnId"]);
    case "item/started":
      return parseItemLifecycle(params, context, "started", identities);
    case "item/completed":
      return parseItemLifecycle(params, context, "completed", identities);
    case "error":
      return parseErrorNotification(params, context);
    default:
      return rejected("protocol-failure");
  }
}

function parseResponse(raw: Record<string, unknown>, context: AppServerCandidateContext, issuedCallScopes: ReadonlyMap<CallId, CallScope>): AppServerParseResult {
  if (!hasOnlyKeys(raw, RESPONSE_KEYS) || !isRequestId(raw.id) || context.expectedResponse === undefined) {
    return rejected("protocol-failure");
  }
  if (raw.id !== context.expectedResponse.id || !RESPONSE_METHODS.has(context.expectedResponse.method)) {
    return rejected("protocol-failure");
  }
  const result = parseBoundedJson(raw.result, MAX_RESPONSE_BYTES);
  if (result === undefined || !isJsonObject(result)) return rejected("protocol-failure");
  switch (context.expectedResponse.method) {
    case "initialize":
      return isInitializeResult(result) ? accepted() : rejected("protocol-failure");
    case "account/read":
      return parseAccountResult(result);
    case "model/list":
      return isModelListResult(result, context.expectedModel)
        ? { kind: "lifecycle", lifecycle: "model-available" }
        : rejected("protocol-failure");
    case "thread/start":
      return parseThreadStartResult(result, context);
    case "turn/start":
      return parseTurnStartResult(result, context, issuedCallScopes);
    case "turn/interrupt":
      return isEmptyObject(result) ? events([{ kind: "cancellation", state: "requested" }]) : rejected("protocol-failure");
    default: {
      const exhaustive: never = context.expectedResponse.method;
      return exhaustive;
    }
  }
}

const PLAN_TYPES = new Set([
  "free",
  "go",
  "plus",
  "pro",
  "prolite",
  "team",
  "self_serve_business_prolite",
  "self_serve_business_usage_based",
  "business",
  "ent26",
  "enterprise_cbp_automation",
  "enterprise_cbp_usage_based",
  "enterprise",
  "edu",
  "edu_plus",
  "edu_pro",
  "unknown"
]);

function isInitializeResult(result: JsonObject): boolean {
  return hasOnlyKeys(result, ["codexHome", "platformFamily", "platformOs", "userAgent"])
    && isBoundedField(result.codexHome)
    && isBoundedField(result.platformFamily)
    && isBoundedField(result.platformOs)
    && isBoundedField(result.userAgent);
}

function parseAccountResult(result: JsonObject): AppServerParseResult {
  if (!hasOnlyKeys(result, ["account", "requiresOpenaiAuth"])
    || !hasOwn(result, "requiresOpenaiAuth") || typeof result.requiresOpenaiAuth !== "boolean") return rejected("protocol-failure");
  const account = result.account;
  if (account === undefined || account === null) {
    return result.requiresOpenaiAuth
      ? events([{ kind: "authentication", owner: "codex", status: "signed-out" }])
      : rejected("protocol-failure");
  }
  if (result.requiresOpenaiAuth || !isChatgptAccount(account)) return rejected("protocol-failure");
  return events([{ kind: "authentication", owner: "codex", status: "signed-in" }]);
}

function isChatgptAccount(value: JsonValue): value is JsonObject {
  return isJsonObject(value)
    && hasOnlyKeys(value, ["email", "planType", "type"])
    && value.type === "chatgpt"
    && (value.email === null || isBoundedField(value.email))
    && isBoundedText(value.planType)
    && PLAN_TYPES.has(value.planType);
}

function isModelListResult(result: JsonObject, expectedModel: string): boolean {
  if (!hasOnlyKeys(result, ["data", "nextCursor"]) || !Array.isArray(result.data) || result.data.length === 0) return false;
  if (hasOwn(result, "nextCursor") && result.nextCursor !== null && !isBoundedText(result.nextCursor)) return false;
  return result.data.every(isModelSummary)
    && result.data.some((model) => isJsonObject(model) && model.model === expectedModel);
}

function isModelSummary(value: JsonValue): boolean {
  if (!isJsonObject(value)
    || !hasOwn(value, "defaultReasoningEffort")
    || !hasOwn(value, "description")
    || !hasOwn(value, "displayName")
    || !hasOwn(value, "hidden")
    || !hasOwn(value, "id")
    || !hasOwn(value, "isDefault")
    || !hasOwn(value, "model")
    || !hasOwn(value, "supportedReasoningEfforts")) return false;
  if (!isBoundedText(value.defaultReasoningEffort)
    || !isBoundedField(value.description)
    || !isBoundedText(value.displayName)
    || typeof value.hidden !== "boolean"
    || !isBoundedText(value.id)
    || typeof value.isDefault !== "boolean"
    || !isBoundedText(value.model)
    || !Array.isArray(value.supportedReasoningEfforts)) return false;
  return value.supportedReasoningEfforts.every(isReasoningEffortOption);
}

function isReasoningEffortOption(value: JsonValue): boolean {
  return isJsonObject(value)
    && hasOnlyKeys(value, ["description", "reasoningEffort"])
    && isBoundedField(value.description)
    && isBoundedText(value.reasoningEffort);
}

function parseThreadStartResult(result: JsonObject, context: AppServerCandidateContext): AppServerParseResult {
  const thread = result.thread;
  if (!hasOwn(result, "approvalPolicy") || !hasOwn(result, "approvalsReviewer") || !hasOwn(result, "cwd")
    || !hasOwn(result, "model") || !hasOwn(result, "modelProvider") || !hasOwn(result, "sandbox")
    || result.approvalPolicy !== "never" || !isApprovalsReviewer(result.approvalsReviewer)
    || !isBoundedNonEmptyField(result.cwd) || result.model !== context.expectedModel || !isBoundedText(result.modelProvider)
    || !isReadOnlySandbox(result.sandbox) || !isThreadSummary(thread)
    || thread.cwd !== result.cwd || thread.modelProvider !== result.modelProvider) {
    return rejected("protocol-failure");
  }
  const itemFault = auditThreadTurns(thread.turns, context);
  return itemFault === undefined ? { kind: "lifecycle", lifecycle: "thread-started", threadId: thread.id } : rejected(itemFault);
}

function isApprovalsReviewer(value: JsonValue | undefined): boolean {
  return value === "user" || value === "auto_review" || value === "guardian_subagent";
}

function isReadOnlySandbox(value: JsonValue | undefined): boolean {
  return isJsonObject(value)
    && hasOnlyKeys(value, ["networkAccess", "type"])
    && value.type === "readOnly"
    && (!hasOwn(value, "networkAccess") || value.networkAccess === false);
}

function isThreadSummary(value: JsonValue | undefined): value is JsonObject & { readonly id: string; readonly turns: readonly JsonValue[] } {
  if (!isJsonObject(value)
    || !hasRequiredKeys(value, ["cliVersion", "createdAt", "cwd", "ephemeral", "id", "modelProvider", "preview", "projectId", "sessionId", "source", "status", "turns", "updatedAt"])
    || !isBoundedText(value.cliVersion) || !isFiniteInteger(value.createdAt) || value.createdAt < 0
    || !isBoundedNonEmptyField(value.cwd) || typeof value.ephemeral !== "boolean" || !isBoundedText(value.id)
    || !isBoundedText(value.modelProvider) || !isBoundedField(value.preview)
    || (value.projectId !== null && !isBoundedField(value.projectId)) || !isBoundedText(value.sessionId)
    || value.source !== "appServer" || !isThreadStatus(value.status)
    || !Array.isArray(value.turns) || !isFiniteInteger(value.updatedAt) || value.updatedAt < 0) return false;
  return true;
}

function isThreadStatus(value: JsonValue | undefined): boolean {
  if (!isJsonObject(value) || typeof value.type !== "string") return false;
  if (value.type === "active") {
    return hasOnlyKeys(value, ["activeFlags", "type"])
      && Array.isArray(value.activeFlags)
      && value.activeFlags.every((flag) => flag === "waitingOnApproval" || flag === "waitingOnUserInput");
  }
  return (value.type === "notLoaded" || value.type === "idle" || value.type === "systemError")
    && hasOnlyKeys(value, ["type"]);
}

function parseTurnStartResult(result: JsonObject, context: AppServerCandidateContext, issuedCallScopes: ReadonlyMap<CallId, CallScope>): AppServerParseResult {
  const turn = result.turn;
  if (!isJsonObject(turn) || !isBoundedText(turn.id) || turn.status !== "inProgress" || !Array.isArray(turn.items)) {
    return rejected("protocol-failure");
  }
  const itemFault = auditItems(turn.items, context, issuedCallScopes);
  if (itemFault !== undefined) return rejected(itemFault);
  return dynamicItemsMatchPhase(turn.items, "started")
    ? { kind: "lifecycle", lifecycle: "turn-started", turnId: turn.id }
    : rejected("protocol-failure");
}

function auditThreadTurns(turns: readonly JsonValue[], context: AppServerCandidateContext): RejectionCode | undefined {
  for (const turn of turns) {
    if (!isJsonObject(turn) || !isBoundedText(turn.id) || !isTurnStatus(turn.status) || !Array.isArray(turn.items)) return "protocol-failure";
    const itemFault = auditItems(turn.items, context);
    if (itemFault !== undefined) return itemFault;
    const phase = turn.status === "inProgress" ? "started" : "completed";
    if (!dynamicItemsMatchPhase(turn.items, phase)) return "protocol-failure";
  }
  return undefined;
}

function auditItems(items: readonly JsonValue[], context: AppServerCandidateContext, issuedCallScopes?: ReadonlyMap<CallId, CallScope>): RejectionCode | undefined {
  for (const item of items) {
    const itemFault = auditItem(item, context, issuedCallScopes);
    if (itemFault !== undefined) return itemFault;
  }
  return undefined;
}

function auditItem(value: JsonValue, context: AppServerCandidateContext, issuedCallScopes?: ReadonlyMap<CallId, CallScope>): RejectionCode | undefined {
  if (!isJsonObject(value) || !isBoundedText(value.id) || typeof value.type !== "string") return "protocol-failure";
  if (value.type === "mcpToolCall") return "unexpected-mcp";
  if (value.type === "dynamicToolCall") {
    if (context.candidate === "app-server-mcp") return "unexpected-mcp";
    if (!isDynamicToolItem(value, context)) return "protocol-failure";
    if (issuedCallScopes !== undefined) {
      const scope = issuedCallScopes.get(callId(value.id));
      if (scope === undefined || scope.threadId !== context.activeThreadId || scope.turnId !== context.activeTurnId) {
        return "protocol-failure";
      }
    }
    return undefined;
  }
  if (NON_TOOL_ITEM_TYPES.has(value.type)) return undefined;
  if (value.type === "commandExecution") return "forbidden-command";
  if (value.type === "fileChange") return "forbidden-file";
  if (value.type === "webSearch") return "forbidden-web";
  return "forbidden-built-in";
}

function isDynamicToolItem(value: JsonObject, context: AppServerCandidateContext): boolean {
  return hasOnlyKeys(value, ["arguments", "contentItems", "durationMs", "id", "namespace", "status", "success", "tool", "type"])
    && isBoundedText(value.tool)
    && context.registeredToolNames.includes(value.tool)
    && isDynamicToolStatus(value.status)
    && (!hasOwn(value, "namespace") || value.namespace === null)
    && (!hasOwn(value, "durationMs") || value.durationMs === null || (isFiniteInteger(value.durationMs) && value.durationMs >= 0))
    && (!hasOwn(value, "success") || value.success === null || typeof value.success === "boolean")
    && (!hasOwn(value, "contentItems") || value.contentItems === null || isDynamicContentItems(value.contentItems))
    && parseBoundedArguments(value.arguments) !== undefined;
}

function isDynamicContentItems(value: unknown): boolean {
  return Array.isArray(value) && value.every((item) => {
    if (!isJsonObject(item) || typeof item.type !== "string") return false;
    if (item.type === "inputText") return hasOnlyKeys(item, ["text", "type"]) && isBoundedContent(item.text);
    if (item.type === "inputImage") return hasOnlyKeys(item, ["imageUrl", "type"]) && isBoundedContent(item.imageUrl);
    if (item.type === "inputAudio") return hasOnlyKeys(item, ["audioUrl", "type"]) && isBoundedContent(item.audioUrl);
    return false;
  });
}

function isDynamicToolStatus(value: JsonValue | undefined): boolean {
  return value === "inProgress" || value === "completed" || value === "failed";
}

function parseTurnStarted(params: Record<string, unknown>, context: AppServerCandidateContext, issuedCallScopes: ReadonlyMap<CallId, CallScope>): AppServerParseResult {
  if (context.activeThreadId === undefined || context.activeTurnId === undefined
    || !hasOnlyKeys(params, ["threadId", "turn"]) || params.threadId !== context.activeThreadId || !isPlainObject(params.turn)) {
    return rejected("protocol-failure");
  }
  if (hasAccessor(params.turn)) return rejected("protocol-failure");
  const turn = parseBoundedJson(params.turn, MAX_RESPONSE_BYTES);
  if (!isJsonObject(turn) || !isTurn(turn, context.activeTurnId, ["inProgress"]) || !Array.isArray(turn.items)) return rejected("protocol-failure");
  const itemFault = auditItems(turn.items, context, issuedCallScopes);
  if (itemFault !== undefined) return rejected(itemFault);
  return dynamicItemsMatchPhase(turn.items, "started") ? accepted() : rejected("protocol-failure");
}

function parseTurnCompleted(params: Record<string, unknown>, context: AppServerCandidateContext, issuedCallScopes: ReadonlyMap<CallId, CallScope>): AppServerParseResult {
  if (context.activeThreadId === undefined || context.activeTurnId === undefined
    || !hasOnlyKeys(params, ["threadId", "turn"]) || params.threadId !== context.activeThreadId || !isPlainObject(params.turn)) {
    return rejected("protocol-failure");
  }
  if (hasAccessor(params.turn)) return rejected("protocol-failure");
  const turn = parseBoundedJson(params.turn, MAX_RESPONSE_BYTES);
  if (!isJsonObject(turn) || !isTurn(turn, context.activeTurnId, ["completed", "interrupted", "failed"]) || !Array.isArray(turn.items)) return rejected("protocol-failure");
  const itemFault = auditItems(turn.items, context, issuedCallScopes);
  if (itemFault !== undefined) return rejected(itemFault);
  if (!dynamicItemsMatchPhase(turn.items, "completed")) return rejected("protocol-failure");
  if (turn.status === "completed") return events([{ kind: "completed" }]);
  if (turn.status === "interrupted") return events([{ kind: "cancellation", state: "observed" }, { kind: "completed" }]);
  return events([{ kind: "failure", fault: fault("protocol-failure") }, { kind: "completed" }]);
}

function parseAgentDelta(params: Record<string, unknown>, context: AppServerCandidateContext): AppServerParseResult {
  if (context.activeThreadId === undefined || context.activeTurnId === undefined
    || !hasOnlyKeys(params, ["delta", "itemId", "threadId", "turnId"]) || !isDelta(params.delta)
    || !isBoundedText(params.itemId) || params.threadId !== context.activeThreadId || params.turnId !== context.activeTurnId) {
    return rejected("protocol-failure");
  }
  return events([{ kind: "text-delta", characters: count(params.delta.length) }]);
}

function parseReasoningDelta(params: Record<string, unknown>, context: AppServerCandidateContext, keys: readonly string[]): AppServerParseResult {
  if (context.activeThreadId === undefined || context.activeTurnId === undefined
    || !hasOnlyKeys(params, keys) || !isDelta(params.delta) || !isBoundedText(params.itemId)
    || params.threadId !== context.activeThreadId || params.turnId !== context.activeTurnId) {
    return rejected("protocol-failure");
  }
  const index = params.summaryIndex ?? params.contentIndex;
  if (typeof index !== "number" || !Number.isSafeInteger(index) || index < 0) return rejected("protocol-failure");
  return events([{ kind: "reasoning-delta", characters: count(params.delta.length) }]);
}

function parseItemLifecycle(
  params: Record<string, unknown>,
  context: AppServerCandidateContext,
  phase: "started" | "completed",
  identities: IdentityLedger
): AppServerParseResult {
  const timestampKey = phase === "started" ? "startedAtMs" : "completedAtMs";
  if (context.activeThreadId === undefined || context.activeTurnId === undefined
    || !hasOnlyKeys(params, [timestampKey, "item", "threadId", "turnId"])
    || params.threadId !== context.activeThreadId || params.turnId !== context.activeTurnId || !isPlainObject(params.item)
    || !isFiniteInteger(params[timestampKey]) || params[timestampKey] < 0 || hasDangerousKey(params.item) || hasAccessor(params.item)) {
    return rejected("protocol-failure");
  }
  const item = parseBoundedJson(params.item, MAX_RESPONSE_BYTES);
  if (item === undefined) return rejected("protocol-failure");
  const itemFault = auditItem(item, context, phase === "completed" ? identities.callScopes : undefined);
  if (itemFault === undefined && isJsonObject(item) && item.type === "dynamicToolCall" && !isDynamicLifecyclePhase(item, phase)) {
    return rejected("protocol-failure");
  }
  if (itemFault !== undefined) return rejected(itemFault);
  if (phase === "completed" && isJsonObject(item) && item.type === "dynamicToolCall") {
    if (!isBoundedText(item.id)) return rejected("protocol-failure");
    const completedCallId = callId(item.id);
    if (identities.completedCallIds.size >= MAX_TRACKED_IDENTITIES || identities.completedCallIds.has(completedCallId)) {
      return rejected("protocol-failure");
    }
    identities.completedCallIds.add(completedCallId);
  }
  return accepted();
}

function isDynamicLifecyclePhase(item: JsonObject, phase: "started" | "completed"): boolean {
  if (phase === "started") {
    return item.status === "inProgress" && (!hasOwn(item, "success") || item.success === null);
  }
  if (item.status === "completed") return item.success === true;
  if (item.status === "failed") return item.success === false;
  return false;
}

function dynamicItemsMatchPhase(items: readonly JsonValue[], phase: "started" | "completed"): boolean {
  return items.every((item) => !isJsonObject(item) || item.type !== "dynamicToolCall" || isDynamicLifecyclePhase(item, phase));
}

function parseErrorNotification(params: Record<string, unknown>, context: AppServerCandidateContext): AppServerParseResult {
  if (context.activeThreadId === undefined || context.activeTurnId === undefined
    || !hasOnlyKeys(params, ["error", "threadId", "turnId", "willRetry"])
    || params.threadId !== context.activeThreadId || params.turnId !== context.activeTurnId
    || typeof params.willRetry !== "boolean" || !isPlainObject(params.error) || hasDangerousKey(params.error) || hasAccessor(params.error)
    || !isBoundedField(params.error.message) || parseBoundedJson(params.error, MAX_FIELD_BYTES) === undefined) return rejected("protocol-failure");
  return events([{ kind: "failure", fault: fault("protocol-failure") }]);
}

type TurnStatus = "completed" | "interrupted" | "failed" | "inProgress";

function isTurn(value: Record<string, unknown>, expectedId: string, statuses: readonly TurnStatus[]): value is Record<string, unknown> & { readonly status: TurnStatus } {
  return hasOwn(value, "id") && hasOwn(value, "status") && value.id === expectedId
    && isTurnStatus(value.status) && statuses.includes(value.status);
}

function isTurnStatus(value: unknown): value is TurnStatus {
  return value === "completed" || value === "interrupted" || value === "failed" || value === "inProgress";
}

function isValidContext(context: AppServerCandidateContext): boolean {
  return isPlainObject(context)
    && !hasDangerousKey(context)
    && !hasAccessor(context)
    && hasOnlyKeys(context, ["activeThreadId", "activeTurnId", "candidate", "expectedModel", "expectedResponse", "registeredToolNames"])
    && (context.candidate === "app-server-dynamic" || context.candidate === "app-server-mcp")
    && isBoundedText(context.expectedModel)
    && (context.activeThreadId === undefined || isBoundedText(context.activeThreadId))
    && (context.activeTurnId === undefined || isBoundedText(context.activeTurnId))
    && Array.isArray(context.registeredToolNames)
    && context.registeredToolNames.length <= MAX_TOOL_NAMES
    && context.registeredToolNames.every(isBoundedText)
    && new Set(context.registeredToolNames).size === context.registeredToolNames.length
    && (context.expectedResponse === undefined || isExpectedResponse(context.expectedResponse));
}

function isExpectedResponse(value: ExpectedResponse): boolean {
  return isPlainObject(value) && !hasDangerousKey(value) && !hasAccessor(value)
    && hasOnlyKeys(value, ["id", "method"]) && isRequestId(value.id) && RESPONSE_METHODS.has(value.method);
}

function isRequestId(value: unknown): value is RequestId {
  if (typeof value === "number") return Number.isSafeInteger(value);
  return typeof value === "string" && value.length > 0 && value.length <= MAX_ID_LENGTH && utf8ByteLength(value) <= MAX_ID_LENGTH;
}

function isFiniteInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value);
}

function isBoundedField(value: unknown): value is string {
  return typeof value === "string" && value.length <= MAX_FIELD_BYTES && utf8ByteLength(value) <= MAX_FIELD_BYTES;
}

function isBoundedNonEmptyField(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= MAX_FIELD_BYTES && utf8ByteLength(value) <= MAX_FIELD_BYTES;
}

function isBoundedText(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= MAX_ID_LENGTH && utf8ByteLength(value) <= MAX_ID_LENGTH;
}

function isDelta(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= MAX_DELTA_LENGTH && utf8ByteLength(value) <= MAX_DELTA_LENGTH;
}

function isBoundedContent(value: unknown): value is string {
  return typeof value === "string" && value.length <= MAX_RESPONSE_BYTES && utf8ByteLength(value) <= MAX_RESPONSE_BYTES;
}

function parseBoundedArguments(value: unknown): JsonObject | undefined {
  if (!isPlainObject(value)) return undefined;
  const parsed = parseBoundedJson(value, MAX_ARGUMENT_BYTES);
  if (parsed === undefined || !isJsonObject(parsed)) return undefined;
  return parsed;
}

function parseBoundedJson(value: unknown, maxBytes: number): JsonValue | undefined {
  const parsed = parseJsonValue(value, new WeakSet<object>(), { bytes: 0, depth: 0, maxBytes, nodes: 0 });
  if (parsed === undefined) return undefined;
  const serialized = JSON.stringify(parsed);
  return serialized !== undefined && utf8ByteLength(serialized) <= maxBytes ? parsed : undefined;
}

function parseJsonValue(value: unknown, ancestors: WeakSet<object>, state: JsonState): JsonValue | undefined {
  if (state.depth >= MAX_JSON_DEPTH) return undefined;
  state.nodes += 1;
  if (state.nodes > MAX_JSON_NODES) return undefined;
  if (value === null) return consumeBytes(state, 4) ? value : undefined;
  if (typeof value === "boolean") return consumeBytes(state, value ? 4 : 5) ? value : undefined;
  if (typeof value === "string") return consumeText(state, value) ? value : undefined;
  if (typeof value === "number") return Number.isFinite(value) && consumeBytes(state, String(value).length) ? value : undefined;
  if (typeof value !== "object" || hasDangerousKey(value) || hasAccessor(value)) return undefined;
  if (ancestors.has(value)) return undefined;
  ancestors.add(value);
  const nested = { bytes: state.bytes, depth: state.depth + 1, maxBytes: state.maxBytes, nodes: state.nodes };
  let result: JsonValue | undefined;
  if (Array.isArray(value)) {
    const values: JsonValue[] = [];
    for (const key of Reflect.ownKeys(value)) {
      if (key === "length") continue;
      if (typeof key !== "string" || !/^\d+$/.test(key) || Number(key) >= value.length) {
        ancestors.delete(value);
        return undefined;
      }
      const item = parseJsonValue(value[Number(key)], ancestors, nested);
      if (item === undefined) {
        ancestors.delete(value);
        return undefined;
      }
      values.push(item);
    }
    if (values.length !== value.length) {
      ancestors.delete(value);
      return undefined;
    }
    result = values;
  } else if (isPlainObject(value)) {
    const object: Record<string, JsonValue> = {};
    const keys = Object.keys(value);
    if (Reflect.ownKeys(value).length !== keys.length) {
      ancestors.delete(value);
      return undefined;
    }
    for (const key of keys) {
      if (!consumeText(nested, key)) {
        ancestors.delete(value);
        return undefined;
      }
      const item = parseJsonValue(value[key], ancestors, nested);
      if (item === undefined) {
        ancestors.delete(value);
        return undefined;
      }
      object[key] = item;
    }
    result = object;
  }
  ancestors.delete(value);
  state.bytes = nested.bytes;
  state.nodes = nested.nodes;
  return result;
}

interface JsonState {
  bytes: number;
  depth: number;
  maxBytes: number;
  nodes: number;
}

function consumeText(state: JsonState, value: string): boolean {
  const remaining = state.maxBytes - state.bytes;
  if (value.length > remaining) return false;
  const bytes = utf8ByteLength(value);
  return consumeBytes(state, bytes);
}

function consumeBytes(state: JsonState, bytes: number): boolean {
  if (bytes > state.maxBytes - state.bytes) return false;
  state.bytes += bytes;
  return true;
}

function isJsonObject(value: unknown): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isEmptyObject(value: JsonObject): boolean {
  return Object.keys(value).length === 0;
}

function utf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function hasOwn(value: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  return Object.keys(value).every((key) => allowed.includes(key));
}

function hasRequiredKeys(value: Record<string, unknown>, required: readonly string[]): boolean {
  return required.every((key) => hasOwn(value, key));
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  try {
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  } catch {
    return false;
  }
}

function hasDangerousKey(value: object): boolean {
  try {
    return Reflect.ownKeys(value).some((key) => typeof key === "symbol" || key === "__proto__" || key === "prototype" || key === "constructor");
  } catch {
    return true;
  }
}

function hasAccessor(value: object): boolean {
  try {
    return Reflect.ownKeys(value).some((key) => {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      return descriptor === undefined || descriptor.get !== undefined || descriptor.set !== undefined;
    });
  } catch {
    return true;
  }
}

function accepted(): AppServerParseResult {
  return { kind: "accepted" };
}

function events(value: readonly BridgeEvent[]): AppServerParseResult {
  return { kind: "events", events: value };
}

function rejected(code: RejectionCode): AppServerParseResult {
  return { kind: "rejected", code, event: rejectionEvent(code) };
}

function rejectionEvent(code: RejectionCode): BridgeEvent {
  switch (code) {
    case "protocol-failure":
      return { kind: "failure", fault: fault("protocol-failure") };
    case "forbidden-command":
      return { kind: "forbidden-action", action: "command" };
    case "forbidden-file":
      return { kind: "forbidden-action", action: "file" };
    case "forbidden-terminal":
      return { kind: "forbidden-action", action: "terminal" };
    case "forbidden-web":
      return { kind: "forbidden-action", action: "web" };
    case "forbidden-approval":
      return { kind: "forbidden-action", action: "approval" };
    case "forbidden-built-in":
      return { kind: "forbidden-action", action: "built-in" };
    case "unexpected-mcp":
      return { kind: "forbidden-action", action: "unexpected-mcp" };
    default: {
      const exhaustive: never = code;
      return exhaustive;
    }
  }
}
