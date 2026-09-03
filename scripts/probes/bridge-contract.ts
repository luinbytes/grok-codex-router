export type ScenarioId =
  | "authentication-status"
  | "plain-text"
  | "one-tool"
  | "parallel-tools"
  | "stream-order"
  | "continuation"
  | "cancellation"
  | "malformed-tool-results"
  | "restart-behavior"
  | "model-and-tool-inventory";

type ProbeAction =
  | { readonly kind: "check-authentication" }
  | { readonly kind: "send-text" }
  | { readonly kind: "request-tool" }
  | { readonly kind: "continue-turn" }
  | { readonly kind: "cancel-turn" }
  | { readonly kind: "inspect-inventory" }
  | { readonly kind: "restart-bridge" };

declare const CALL_ID: unique symbol;

export type CallId = string & { readonly [CALL_ID]: true };

export interface Count {
  readonly kind: "count";
  readonly value: number;
}

export type FaultCode =
  | "unknown-event"
  | "unexpected-event"
  | "forbidden-command"
  | "forbidden-file"
  | "forbidden-terminal"
  | "forbidden-web"
  | "forbidden-approval"
  | "forbidden-built-in"
  | "unexpected-mcp"
  | "wrong-executor"
  | "missing-event"
  | "duplicate-call-id"
  | "tool-result-order"
  | "tool-result-identity"
  | "unresolved-tool-call"
  | "invalid-continuation"
  | "dropped-cancellation"
  | "event-order"
  | "protocol-failure"
  | "malformed-tool-result"
  | "late-event-after-cancellation";

export interface Fault {
  readonly kind: "fault";
  readonly code: FaultCode;
  readonly count: Count;
}

type AuthenticationOwner = "codex" | "external";
type ToolExecutor = "grok" | "codex" | "candidate";
type ForbiddenAction = "command" | "file" | "terminal" | "web" | "approval" | "built-in" | "unexpected-mcp";
type EventKind = BridgeEvent["kind"];

export interface ContinuationIdentity {
  readonly instructions: "matched" | "changed";
  readonly model: "matched" | "changed";
  readonly toolSchema: "matched" | "changed";
  readonly historyPrefix: "matched" | "changed";
}

export const MATCHED_CONTINUATION_IDENTITY = {
  instructions: "matched",
  model: "matched",
  toolSchema: "matched",
  historyPrefix: "matched"
} as const satisfies ContinuationIdentity;

export type BridgeEvent =
  | { readonly kind: "authentication"; readonly owner: AuthenticationOwner }
  | { readonly kind: "text-delta"; readonly characters: Count }
  | { readonly kind: "reasoning-delta"; readonly characters: Count }
  | { readonly kind: "tool-request"; readonly callId: CallId; readonly executor: ToolExecutor }
  | { readonly kind: "tool-result"; readonly callId: CallId; readonly executor: ToolExecutor }
  | { readonly kind: "continuation"; readonly identity: ContinuationIdentity }
  | { readonly kind: "cancellation"; readonly state: "requested" | "observed" }
  | { readonly kind: "restart"; readonly state: "observed" }
  | { readonly kind: "inventory"; readonly model: "codex"; readonly tools: "grok-only" }
  | { readonly kind: "completed" }
  | { readonly kind: "failure"; readonly fault: Fault }
  | { readonly kind: "forbidden-action"; readonly action: ForbiddenAction };

interface FixtureTrace {
  readonly candidate: "direct";
  readonly scenario: ScenarioId;
}

export interface ScenarioSpec {
  readonly id: ScenarioId;
  readonly action: ProbeAction;
  readonly requiredEvents: readonly EventKind[];
  readonly allowedEvents: readonly EventKind[];
  readonly expectedFaults: readonly FaultCode[];
  readonly fixtureTrace: FixtureTrace;
  readonly predicate: (state: EvaluatorState) => readonly FaultCode[];
}

export interface ScenarioResult {
  readonly scenario: ScenarioId;
  readonly status: "passed" | "failed";
  readonly faults: readonly Fault[];
  readonly eventCount: Count;
}

export interface CandidateReport {
  readonly candidate: "direct";
  readonly evidence: "fixture";
  readonly protocol: "direct-fixture";
  readonly authenticationOwner: AuthenticationOwner;
  readonly scenarios: readonly ScenarioResult[];
  readonly releaseEligibility: "baseline-only";
}

interface SafeScenarioResult {
  readonly scenario: ScenarioId;
  readonly status: "passed" | "failed";
  readonly faultCodes: readonly FaultCode[];
  readonly eventCount: number;
}

export interface SafeCandidateReport {
  readonly candidate: "direct";
  readonly evidence: "fixture";
  readonly protocol: "direct-fixture";
  readonly authenticationOwner: AuthenticationOwner;
  readonly scenarios: readonly SafeScenarioResult[];
  readonly releaseEligibility: "baseline-only";
}

export interface BridgeDecision {
  readonly BASELINE_BRIDGE: "direct";
  readonly SELECTED_BRIDGE: "none";
  readonly STABLE_RELEASE: "blocked";
  readonly ALPHA_RELEASE: "blocked";
  readonly RELEASE_GATE: "BLOCKED";
}

interface EvaluatorState {
  readonly seen: readonly EventKind[];
  readonly requestedCalls: readonly CallId[];
  readonly resolvedCalls: readonly CallId[];
  readonly faults: readonly Fault[];
  readonly continuation: "absent" | "valid" | "invalid";
  readonly cancellation: "absent" | "requested" | "observed";
  readonly restart: "absent" | "observed";
  readonly completed: boolean;
  readonly textBeforeReasoning: boolean;
  readonly eventCount: Count;
}

const SCENARIO_IDS = [
  "authentication-status",
  "plain-text",
  "one-tool",
  "parallel-tools",
  "stream-order",
  "continuation",
  "cancellation",
  "malformed-tool-results",
  "restart-behavior",
  "model-and-tool-inventory"
] satisfies readonly ScenarioId[];

type ScenarioSpecInput = Omit<ScenarioSpec, "fixtureTrace" | "predicate"> & {
  readonly predicate?: (state: EvaluatorState) => readonly FaultCode[];
};

function constantSpec(input: ScenarioSpecInput): ScenarioSpec {
  return {
    ...input,
    fixtureTrace: { candidate: "direct", scenario: input.id },
    predicate: input.predicate ?? (() => [])
  };
}

export const SCENARIOS = {
  "authentication-status": constantSpec({
    id: "authentication-status",
    action: { kind: "check-authentication" },
    requiredEvents: ["authentication", "completed"],
    allowedEvents: ["authentication", "completed"],
    expectedFaults: [],
    predicate: (state) => exactEventCardinality(state, "authentication", 1)
  }),
  "plain-text": constantSpec({
    id: "plain-text",
    action: { kind: "send-text" },
    requiredEvents: ["text-delta", "completed"],
    allowedEvents: ["reasoning-delta", "text-delta", "completed"],
    expectedFaults: []
  }),
  "one-tool": constantSpec({
    id: "one-tool",
    action: { kind: "request-tool" },
    requiredEvents: ["tool-request", "tool-result", "completed"],
    allowedEvents: ["reasoning-delta", "text-delta", "tool-request", "tool-result", "completed"],
    expectedFaults: [],
    predicate: (state) => exactToolCardinality(state, 1, 1)
  }),
  "parallel-tools": constantSpec({
    id: "parallel-tools",
    action: { kind: "request-tool" },
    requiredEvents: ["tool-request", "tool-result", "completed"],
    allowedEvents: ["reasoning-delta", "text-delta", "tool-request", "tool-result", "completed"],
    expectedFaults: [],
    predicate: (state) => [
      ...exactToolCardinality(state, 2, 2),
      ...(allParallelRequestsPrecedeResults(state) ? [] : ["event-order"] as const)
    ]
  }),
  "stream-order": constantSpec({
    id: "stream-order",
    action: { kind: "send-text" },
    requiredEvents: ["reasoning-delta", "text-delta", "completed"],
    allowedEvents: ["reasoning-delta", "text-delta", "completed"],
    expectedFaults: [],
    predicate: (state) => state.textBeforeReasoning ? ["event-order"] : []
  }),
  continuation: constantSpec({
    id: "continuation",
    action: { kind: "continue-turn" },
    requiredEvents: ["continuation", "completed"],
    allowedEvents: ["continuation", "reasoning-delta", "text-delta", "tool-request", "tool-result", "completed"],
    expectedFaults: [],
    predicate: (state) => [
      ...(state.continuation === "valid" ? [] : ["invalid-continuation"] as const),
      ...exactEventCardinality(state, "continuation", 1),
      ...(allToolRequestsResolved(state) ? [] : ["unresolved-tool-call"] as const)
    ]
  }),
  cancellation: constantSpec({
    id: "cancellation",
    action: { kind: "cancel-turn" },
    requiredEvents: ["cancellation", "completed"],
    allowedEvents: ["reasoning-delta", "text-delta", "cancellation", "completed"],
    expectedFaults: [],
    predicate: (state) => [
      ...(state.cancellation === "observed" ? [] : ["dropped-cancellation"] as const),
      ...exactEventCardinality(state, "cancellation", 2)
    ]
  }),
  "malformed-tool-results": constantSpec({
    id: "malformed-tool-results",
    action: { kind: "request-tool" },
    requiredEvents: ["tool-request", "failure", "completed"],
    allowedEvents: ["tool-request", "failure", "completed"],
    expectedFaults: ["malformed-tool-result"],
    predicate: (state) => [
      ...exactToolCardinality(state, 1, 0),
      ...exactEventCardinality(state, "failure", 1),
      ...(countFaults(state.faults, "malformed-tool-result") === 1 ? [] : ["malformed-tool-result"] as const)
    ]
  }),
  "restart-behavior": constantSpec({
    id: "restart-behavior",
    action: { kind: "restart-bridge" },
    requiredEvents: ["restart", "continuation", "completed"],
    allowedEvents: ["restart", "continuation", "reasoning-delta", "text-delta", "completed"],
    expectedFaults: [],
    predicate: (state) => [
      ...(state.restart === "observed" && state.continuation === "valid" ? [] : ["invalid-continuation"] as const),
      ...exactEventCardinality(state, "restart", 1),
      ...exactEventCardinality(state, "continuation", 1)
    ]
  }),
  "model-and-tool-inventory": constantSpec({
    id: "model-and-tool-inventory",
    action: { kind: "inspect-inventory" },
    requiredEvents: ["inventory", "completed"],
    allowedEvents: ["inventory", "completed"],
    expectedFaults: [],
    predicate: (state) => exactEventCardinality(state, "inventory", 1)
  })
} satisfies Record<ScenarioId, ScenarioSpec>;

export function callId(value: string): CallId {
  if (value.length === 0) throw new Error("call ID must not be empty");
  return value as CallId;
}

export function count(value: number): Count {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error("count must be a non-negative safe integer");
  return { kind: "count", value };
}

export function fault(code: FaultCode, occurrences = 1): Fault {
  return { kind: "fault", code, count: count(occurrences) };
}

function scenarioIds(): readonly ScenarioId[] {
  return SCENARIO_IDS;
}

export function evaluateScenario(spec: ScenarioSpec, trace: readonly unknown[]): ScenarioResult {
  const reduced = trace.reduce(reduceEvent, emptyState());
  const missing = spec.requiredEvents.filter((kind) => !reduced.seen.includes(kind)).map(() => fault("missing-event"));
  const unexpectedEvents = reduced.seen.filter((kind) => !spec.allowedEvents.includes(kind)).map(() => fault("unexpected-event"));
  const predicateFaults = spec.predicate(reduced).map((code) => fault(code));
  const unexpectedFaults = reduced.faults.filter((entry) => !spec.expectedFaults.includes(entry.code));
  const faults = [...missing, ...unexpectedEvents, ...predicateFaults, ...unexpectedFaults];
  return {
    scenario: spec.id,
    status: faults.length === 0 ? "passed" : "failed",
    faults,
    eventCount: reduced.eventCount
  };
}

export function evaluateDirectFixture(traces: Readonly<Record<ScenarioId, readonly unknown[]>>): CandidateReport {
  const scenarios = scenarioIds().map((id) => evaluateScenario(SCENARIOS[id], traces[id]));
  return {
    candidate: "direct",
    evidence: "fixture",
    protocol: "direct-fixture",
    authenticationOwner: "external",
    scenarios,
    releaseEligibility: "baseline-only"
  };
}

export function projectSafeReport(report: CandidateReport): SafeCandidateReport {
  return {
    candidate: report.candidate,
    evidence: report.evidence,
    protocol: report.protocol,
    authenticationOwner: report.authenticationOwner,
    scenarios: report.scenarios.map((scenario) => ({
      scenario: scenario.scenario,
      status: scenario.status,
      faultCodes: scenario.faults.map((entry) => entry.code),
      eventCount: scenario.eventCount.value
    })),
    releaseEligibility: report.releaseEligibility
  };
}

export function decideRelease(_reports: readonly CandidateReport[]): BridgeDecision {
  return {
    BASELINE_BRIDGE: "direct",
    SELECTED_BRIDGE: "none",
    STABLE_RELEASE: "blocked",
    ALPHA_RELEASE: "blocked",
    RELEASE_GATE: "BLOCKED"
  };
}

function emptyState(): EvaluatorState {
  return {
    seen: [],
    requestedCalls: [],
    resolvedCalls: [],
    faults: [],
    continuation: "absent",
    cancellation: "absent",
    restart: "absent",
    completed: false,
    textBeforeReasoning: false,
    eventCount: count(0)
  };
}

function reduceEvent(state: EvaluatorState, raw: unknown): EvaluatorState {
  if (!isBridgeEvent(raw)) return appendFault(state, "unknown-event");
  const next = { ...state, seen: [...state.seen, raw.kind], eventCount: count(state.eventCount.value + 1) };
  if (state.completed) return appendFault(next, "event-order");
  if (state.cancellation !== "absent" && raw.kind !== "cancellation" && raw.kind !== "completed") {
    return appendFault(next, "late-event-after-cancellation");
  }
  switch (raw.kind) {
    case "authentication":
    case "inventory":
      return next;
    case "text-delta":
      return { ...next, textBeforeReasoning: state.textBeforeReasoning || !state.seen.includes("reasoning-delta") };
    case "reasoning-delta":
      return next;
    case "tool-request":
      if (raw.executor !== "grok") return appendFault(next, "wrong-executor");
      if (containsCallId(state.requestedCalls, raw.callId)) return appendFault(next, "duplicate-call-id");
      return { ...next, requestedCalls: [...state.requestedCalls, raw.callId] };
    case "tool-result":
      if (raw.executor !== "grok") return appendFault(next, "wrong-executor");
      if (!containsCallId(state.requestedCalls, raw.callId)) return appendFault(next, "tool-result-order");
      if (containsCallId(state.resolvedCalls, raw.callId)) return appendFault(next, "duplicate-call-id");
      if (!sameCallId(state.requestedCalls[state.resolvedCalls.length], raw.callId)) return appendFault(next, "tool-result-identity");
      return { ...next, resolvedCalls: [...state.resolvedCalls, raw.callId] };
    case "continuation":
      return isExactContinuation(raw.identity) ? { ...next, continuation: "valid" } : appendFault({ ...next, continuation: "invalid" }, "invalid-continuation");
    case "cancellation":
      if (raw.state === "requested") return state.cancellation === "absent" ? { ...next, cancellation: "requested" } : appendFault(next, "event-order");
      return state.cancellation === "requested" ? { ...next, cancellation: "observed" } : appendFault(next, "dropped-cancellation");
    case "restart":
      return { ...next, restart: "observed" };
    case "failure":
      return { ...next, faults: [...state.faults, raw.fault] };
    case "forbidden-action":
      return appendFault(next, forbiddenFault(raw.action));
    case "completed":
      return { ...next, completed: true };
    default: {
      const exhaustive: never = raw;
      return exhaustive;
    }
  }
}

function appendFault(state: EvaluatorState, code: FaultCode): EvaluatorState {
  return { ...state, faults: [...state.faults, fault(code)] };
}

function countFaults(faults: readonly Fault[], code: FaultCode): number {
  return faults.reduce((total, entry) => entry.code === code ? total + entry.count.value : total, 0);
}

function exactToolCardinality(state: EvaluatorState, requested: number, resolved: number): readonly FaultCode[] {
  return state.requestedCalls.length === requested && state.resolvedCalls.length === resolved ? [] : ["missing-event"];
}

function exactEventCardinality(state: EvaluatorState, kind: EventKind, expected: number): readonly FaultCode[] {
  return state.seen.filter((seen) => seen === kind).length === expected ? [] : ["event-order"];
}

function allParallelRequestsPrecedeResults(state: EvaluatorState): boolean {
  const firstResult = state.seen.indexOf("tool-result");
  return firstResult >= 0 && state.seen.slice(0, firstResult).filter((kind) => kind === "tool-request").length === 2;
}

function allToolRequestsResolved(state: EvaluatorState): boolean {
  return state.requestedCalls.length === state.resolvedCalls.length;
}

function isExactContinuation(identity: ContinuationIdentity): boolean {
  return identity.instructions === "matched"
    && identity.model === "matched"
    && identity.toolSchema === "matched"
    && identity.historyPrefix === "matched";
}

function containsCallId(callIds: readonly CallId[], candidate: CallId): boolean {
  return callIds.some((call) => sameCallId(call, candidate));
}

function sameCallId(expected: CallId | undefined, actual: CallId): boolean {
  return expected !== undefined && expected === actual;
}

function forbiddenFault(action: ForbiddenAction): FaultCode {
  switch (action) {
    case "command": return "forbidden-command";
    case "file": return "forbidden-file";
    case "terminal": return "forbidden-terminal";
    case "web": return "forbidden-web";
    case "approval": return "forbidden-approval";
    case "built-in": return "forbidden-built-in";
    case "unexpected-mcp": return "unexpected-mcp";
    default: {
      const exhaustive: never = action;
      return exhaustive;
    }
  }
}

function isBridgeEvent(value: unknown): value is BridgeEvent {
  if (!isRecord(value) || typeof value.kind !== "string") return false;
  switch (value.kind) {
    case "authentication": return hasOnlyKeys(value, ["kind", "owner"]) && (value.owner === "codex" || value.owner === "external");
    case "text-delta":
    case "reasoning-delta": return hasOnlyKeys(value, ["kind", "characters"]) && isCount(value.characters);
    case "tool-request": return hasOnlyKeys(value, ["kind", "callId", "executor"]) && isCallId(value.callId) && (value.executor === "grok" || value.executor === "codex" || value.executor === "candidate");
    case "tool-result": return hasOnlyKeys(value, ["kind", "callId", "executor"]) && isCallId(value.callId) && (value.executor === "grok" || value.executor === "codex" || value.executor === "candidate");
    case "continuation": return hasOnlyKeys(value, ["kind", "identity"]) && isContinuationIdentity(value.identity);
    case "cancellation": return hasOnlyKeys(value, ["kind", "state"]) && (value.state === "requested" || value.state === "observed");
    case "restart": return hasOnlyKeys(value, ["kind", "state"]) && value.state === "observed";
    case "inventory": return hasOnlyKeys(value, ["kind", "model", "tools"]) && value.model === "codex" && value.tools === "grok-only";
    case "completed": return hasOnlyKeys(value, ["kind"]);
    case "failure": return hasOnlyKeys(value, ["kind", "fault"]) && isFault(value.fault);
    case "forbidden-action": return hasOnlyKeys(value, ["kind", "action"]) && isForbiddenAction(value.action);
    default: return false;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  return Object.keys(value).every((key) => allowed.includes(key));
}

function isCallId(value: unknown): value is CallId {
  return typeof value === "string" && value.length > 0;
}

function isCount(value: unknown): value is Count {
  return isRecord(value) && hasOnlyKeys(value, ["kind", "value"]) && value.kind === "count" && typeof value.value === "number" && Number.isSafeInteger(value.value) && value.value >= 0;
}

function isContinuationIdentity(value: unknown): value is ContinuationIdentity {
  return isRecord(value)
    && hasOnlyKeys(value, ["instructions", "model", "toolSchema", "historyPrefix"])
    && (value.instructions === "matched" || value.instructions === "changed")
    && (value.model === "matched" || value.model === "changed")
    && (value.toolSchema === "matched" || value.toolSchema === "changed")
    && (value.historyPrefix === "matched" || value.historyPrefix === "changed");
}

function isFault(value: unknown): value is Fault {
  return isRecord(value) && hasOnlyKeys(value, ["kind", "code", "count"]) && value.kind === "fault" && isFaultCode(value.code) && isCount(value.count);
}

function isFaultCode(value: unknown): value is FaultCode {
  return typeof value === "string" && [
    "unknown-event", "unexpected-event", "forbidden-command", "forbidden-file", "forbidden-terminal", "forbidden-web", "forbidden-approval", "forbidden-built-in", "unexpected-mcp", "wrong-executor", "missing-event", "duplicate-call-id", "tool-result-order", "tool-result-identity", "unresolved-tool-call", "invalid-continuation", "dropped-cancellation", "event-order", "protocol-failure", "malformed-tool-result", "late-event-after-cancellation"
  ].includes(value);
}

function isForbiddenAction(value: unknown): value is ForbiddenAction {
  switch (value) {
    case "command":
    case "file":
    case "terminal":
    case "web":
    case "approval":
    case "built-in":
    case "unexpected-mcp":
      return true;
    default:
      return false;
  }
}
