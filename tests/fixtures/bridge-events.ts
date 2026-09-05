import { MATCHED_CONTINUATION_IDENTITY, callId, count, fault, type BridgeEvent, type ScenarioId } from "../../scripts/probes/bridge-contract.js";

const ONE_TOOL = callId("direct-one-tool");
const PARALLEL_FIRST = callId("direct-parallel-first");
const PARALLEL_SECOND = callId("direct-parallel-second");
const MALFORMED = callId("direct-malformed");

export const DIRECT_FIXTURES = {
  "authentication-status": [
    { kind: "authentication", owner: "external", status: "signed-in" },
    { kind: "completed" }
  ],
  "plain-text": [
    { kind: "text-delta", characters: count(12) },
    { kind: "completed" }
  ],
  "one-tool": [
    { kind: "tool-request", callId: ONE_TOOL, executor: "grok" },
    { kind: "tool-result", callId: ONE_TOOL, executor: "grok" },
    { kind: "completed" }
  ],
  "parallel-tools": [
    { kind: "tool-request", callId: PARALLEL_FIRST, executor: "grok" },
    { kind: "tool-request", callId: PARALLEL_SECOND, executor: "grok" },
    { kind: "tool-result", callId: PARALLEL_FIRST, executor: "grok" },
    { kind: "tool-result", callId: PARALLEL_SECOND, executor: "grok" },
    { kind: "completed" }
  ],
  "stream-order": [
    { kind: "reasoning-delta", characters: count(4) },
    { kind: "text-delta", characters: count(12) },
    { kind: "completed" }
  ],
  continuation: [
    { kind: "continuation", identity: MATCHED_CONTINUATION_IDENTITY },
    { kind: "completed" }
  ],
  cancellation: [
    { kind: "cancellation", state: "requested" },
    { kind: "cancellation", state: "observed" },
    { kind: "completed" }
  ],
  "malformed-tool-results": [
    { kind: "tool-request", callId: MALFORMED, executor: "grok" },
    { kind: "failure", fault: fault("malformed-tool-result") },
    { kind: "completed" }
  ],
  "restart-behavior": [
    { kind: "restart", state: "observed" },
    { kind: "continuation", identity: MATCHED_CONTINUATION_IDENTITY },
    { kind: "completed" }
  ],
  "model-and-tool-inventory": [
    { kind: "inventory", model: "codex", tools: "grok-only" },
    { kind: "completed" }
  ]
} satisfies Record<ScenarioId, readonly BridgeEvent[]>;

export const RAW_REJECTION_CASES = {
  command: { kind: "forbidden-action", action: "command" },
  file: { kind: "forbidden-action", action: "file" },
  terminal: { kind: "forbidden-action", action: "terminal" },
  web: { kind: "forbidden-action", action: "web" },
  approval: { kind: "forbidden-action", action: "approval" },
  builtIn: { kind: "forbidden-action", action: "built-in" },
  unexpectedMcp: { kind: "forbidden-action", action: "unexpected-mcp" },
  unknown: { kind: "opaque-event", credential: "secret-bearing-value" }
};
