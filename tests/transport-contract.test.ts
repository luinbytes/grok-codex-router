import assert from "node:assert/strict";
import test from "node:test";
import {
  SCENARIOS,
  MATCHED_CONTINUATION_IDENTITY,
  callId,
  count,
  decideRelease,
  evaluateScenario,
  projectSafeReport,
  type ContinuationIdentity,
  type ScenarioId
} from "../scripts/probes/bridge-contract.js";
import { directFixture } from "../scripts/probes/direct-candidate.js";
import { DIRECT_FIXTURES, RAW_REJECTION_CASES } from "./fixtures/bridge-events.js";

function resultFor(id: ScenarioId, trace: readonly unknown[]) {
  return evaluateScenario(SCENARIOS[id], trace);
}

test("direct fixture replay passes every GCR-1 scenario deterministically and remains release-blocked", () => {
  const first = directFixture();
  const second = directFixture();

  assert.deepEqual(first, second);
  assert.equal(first.scenarios.length, 10);
  assert.deepEqual(first.scenarios.map((scenario) => scenario.status), Array(10).fill("passed"));
  assert.deepEqual(decideRelease([first]), {
    BASELINE_BRIDGE: "direct",
    SELECTED_BRIDGE: "none",
    STABLE_RELEASE: "blocked",
    ALPHA_RELEASE: "blocked",
    RELEASE_GATE: "BLOCKED"
  });
});

test("forbidden actions fail closed", () => {
  for (const event of Object.values(RAW_REJECTION_CASES).filter((value) => value.kind === "forbidden-action")) {
    const trace = [...DIRECT_FIXTURES["plain-text"].slice(0, 1), event, { kind: "completed" }];
    assert.equal(resultFor("plain-text", trace).status, "failed");
  }
});

test("missing deltas, duplicate IDs, reordered results, dropped cancellation, invalid continuation, and unknown events fail closed", () => {
  assert.equal(resultFor("plain-text", [{ kind: "completed" }]).status, "failed");
  assert.equal(resultFor("stream-order", [
    { kind: "text-delta", characters: count(1) },
    { kind: "reasoning-delta", characters: count(1) },
    { kind: "text-delta", characters: count(1) },
    { kind: "completed" }
  ]).status, "failed");

  assert.equal(resultFor("authentication-status", [
    { kind: "authentication", owner: "external", status: "signed-in" },
    { kind: "tool-request", callId: callId("unexpected-tool"), executor: "grok" },
    { kind: "completed" }
  ]).status, "failed");

  const duplicate = callId("duplicate");
  assert.equal(resultFor("one-tool", [
    { kind: "tool-request", callId: duplicate, executor: "grok" },
    { kind: "tool-request", callId: duplicate, executor: "grok" },
    { kind: "tool-result", callId: duplicate, executor: "grok" },
    { kind: "completed" }
  ]).status, "failed");

  const extra = callId("extra");
  assert.equal(resultFor("one-tool", [
    { kind: "tool-request", callId: duplicate, executor: "grok" },
    { kind: "tool-request", callId: extra, executor: "grok" },
    { kind: "tool-result", callId: duplicate, executor: "grok" },
    { kind: "tool-result", callId: extra, executor: "grok" },
    { kind: "completed" }
  ]).status, "failed");

  const first = callId("first");
  const second = callId("second");
  assert.equal(resultFor("parallel-tools", [
    { kind: "tool-request", callId: first, executor: "grok" },
    { kind: "tool-request", callId: second, executor: "grok" },
    { kind: "tool-result", callId: second, executor: "grok" },
    { kind: "tool-result", callId: first, executor: "grok" },
    { kind: "completed" }
  ]).status, "failed");
  assert.equal(resultFor("parallel-tools", [
    { kind: "tool-request", callId: first, executor: "grok" },
    { kind: "tool-result", callId: first, executor: "grok" },
    { kind: "tool-request", callId: second, executor: "grok" },
    { kind: "tool-result", callId: second, executor: "grok" },
    { kind: "completed" }
  ]).status, "failed");

  assert.equal(resultFor("cancellation", [
    { kind: "cancellation", state: "requested" },
    { kind: "completed" }
  ]).status, "failed");
  assert.equal(resultFor("cancellation", [
    { kind: "cancellation", state: "requested" },
    { kind: "text-delta", characters: count(1) },
    { kind: "cancellation", state: "observed" },
    { kind: "completed" }
  ]).status, "failed");
  assert.equal(resultFor("cancellation", [
    { kind: "cancellation", state: "requested" },
    { kind: "cancellation", state: "observed" },
    { kind: "text-delta", characters: count(1) },
    { kind: "completed" }
  ]).status, "failed");
  for (const component of ["instructions", "model", "toolSchema", "historyPrefix"] as const) {
    const identity: ContinuationIdentity = { ...MATCHED_CONTINUATION_IDENTITY, [component]: "changed" };
    assert.equal(resultFor("continuation", [
      { kind: "continuation", identity },
      { kind: "completed" }
    ]).status, "failed");
  }
  assert.equal(resultFor("continuation", [
    { kind: "continuation", identity: MATCHED_CONTINUATION_IDENTITY },
    { kind: "tool-request", callId: callId("unresolved"), executor: "grok" },
    { kind: "completed" }
  ]).status, "failed");
  assert.equal(resultFor("plain-text", [RAW_REJECTION_CASES.unknown, { kind: "completed" }]).status, "failed");
});

test("wrong executors and protocol failures fail closed", () => {
  const call = callId("wrong-executor");
  assert.equal(resultFor("one-tool", [
    { kind: "tool-request", callId: call, executor: "codex" },
    { kind: "tool-result", callId: call, executor: "grok" },
    { kind: "completed" }
  ]).status, "failed");
  assert.equal(resultFor("one-tool", [
    { kind: "tool-request", callId: call, executor: "grok" },
    { kind: "tool-result", callId: call, executor: "candidate" },
    { kind: "completed" }
  ]).status, "failed");
  assert.equal(resultFor("plain-text", [
    { kind: "text-delta", characters: count(1) },
    { kind: "failure", fault: { kind: "fault", code: "protocol-failure", count: count(1) } },
    { kind: "completed" }
  ]).status, "failed");
});

test("safe JSON projection excludes secret-bearing values and raw events", () => {
  const report = directFixture();
  const source = "prompt-body tool-arguments call-id conversation-id account-id credential raw-error raw-event secret-bearing-value";
  const rejected = resultFor("plain-text", [
    { kind: "text-delta", characters: count(1), prompt: source },
    { kind: "completed" }
  ]);
  const json = JSON.stringify(projectSafeReport({
    ...report,
    scenarios: [rejected, ...report.scenarios.slice(1)]
  }));

  for (const value of source.split(" ")) assert.equal(json.includes(value), false);
  assert.equal(json.includes("direct-one-tool"), false);
  assert.equal(json.includes("direct-parallel-first"), false);
});
