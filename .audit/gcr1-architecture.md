# GCR-1 architecture

## Synthesis decision

Candidate A is the base. It scored 26.5 of 30 in the independent review. Its semantic `BridgeSession` boundary, branded tool-call identity, and explicit authentication owner preserve the rules that matter.

The design takes four parts from Candidate B:

- One exhaustive `ScenarioSpec` registry owns the ten scenarios.
- One pure reducer evaluates normalized events.
- Fixture scenarios run serially and without a clock.
- The CLI prints the exact `BASELINE_BRIDGE`, `SELECTED_BRIDGE`, `STABLE_RELEASE`, `ALPHA_RELEASE`, and `RELEASE_GATE` fields.

The design rejects Candidate B's live direct wrapper. The direct implementation remains a fixture benchmark because a live run can read or refresh credentials outside Codex CLI. It also rejects ordinal-only tool pairing and open receipt maps.

The independent review proposed making MCP permanently ineligible. The approved plan does not support that conclusion. MCP remains research-only by default. A later live run may make it eligible only if it proves a passive call envelope, Grok-owned execution, Codex-owned authentication, and every other GCR-1 case. Fixture evidence cannot promote it.

## Caller's view

```ts
const report = await evaluateBridges({
  candidates: [directFixture(), appServerDynamic(codex), appServerMcp(codex)],
  mode: "fixture",
});

printVerdict(report);
```

```sh
bun run probe:bridges -- --fixtures-only
bun run probe:bridges -- --schemas-only
bun run probe:bridges -- --isolated-lifecycle --model gpt-5.6-sol
```

Fixture mode never starts a process, reads authentication state, accesses the network, or records wall-clock timing. Schema and isolated-lifecycle modes own their subprocesses and close them before writing a receipt. Every mode remains release-blocked.

## Data shape

`ScenarioId` is a closed union for authentication status, plain text, one tool, parallel tools, stream order, continuation, cancellation, malformed tool results, restart behavior, and model plus tool inventory.

`ProbeAction` is a closed union for the semantic actions a candidate can perform. `BridgeEvent` is a closed union for authentication ownership, text and reasoning deltas, Grok tool requests, tool results, continuation, cancellation, restart, inventory, completion, and bounded failures. Tool requests and results carry executor provenance. Tool calls use a branded `CallId` until safe-report projection removes the value.

A continuation event records only whether instructions, model, tool schema, and history prefix match the immutable prior request. Any changed component fails the scenario. The report omits the underlying values and hashes.

`ScenarioSpec` declares the required events, forbidden events, fixture trace, and predicate for one scenario. `evaluateScenario()` reduces semantic events into a `ScenarioResult`. It fails on missing events, duplicate call IDs, reordered results, late cancellation events, invalid continuation, a wrong executor, or any unknown protocol event.

`CandidateReport` carries the candidate ID, evidence level, protocol metadata, authentication owner class, ten scenario results, and release eligibility. `BridgeDecision` derives the five CLI verdict fields. Direct is always baseline-only. Fixture-only App Server evidence is always release-blocked.

## Module map

- `scripts/probes/bridge-contract.ts` owns domain types, the scenario registry, the pure reducer, eligibility, and safe-report projection.
- `scripts/probes/direct-candidate.ts` replays checked-in redacted semantic fixtures. It has no live mode.
- `scripts/probes/app-server-candidate.ts` owns strict JSON-RPC parsing, semantic normalization, and the scoped request and call identity ledger.
- `scripts/probes/app-server-stdio.ts` owns bounded JSONL framing, Codex child lifecycle, response correlation, dynamic-tool responses, and isolated lifecycle receipts.
- `scripts/probes/app-server-schema.ts` generates and inspects version-specific stable and experimental schema bundles without checking them in.
- `scripts/probes/codex-process.ts` owns the small environment allowlist used by probes that must not inherit user credentials or configuration.
- `scripts/probes/codex-bridge-probe.ts` parses CLI arguments, composes candidates, writes safe fixture, schema, or isolated-lifecycle reports, prints the five verdict fields, and sets the exit code.
- `tests/fixtures/bridge-events.ts` stores deterministic semantic traces and raw rejection cases. TypeScript keeps the fixtures in the compiled test tree without changing the build.
- `tests/transport-contract.test.ts` proves all ten scenarios, every forbidden event, redaction, and deterministic fixture output.
- `docs/transport-decision.md` records measured facts. It begins blocked and never claims a selected bridge before live evidence exists.

Production files do not import these modules. GCR-1 does not edit `src/session.ts`, `src/turn-execution.ts`, `src/transport.ts`, or `scripts/patch-host.ts`.

## Native image compatibility

The App Server adapter handles protocol events only. It must reuse the production request-normalization boundary after the image fix has a stable commit; it must not serialize raw Grok messages or resolve attachment paths itself. The authenticated comparison adds an image-input subcase to the plain-turn lane and records only the input modality, output event counts, and verdict.

The image branch and this fixture slice have no file overlap. A later production integration may overlap `src/message-wire.ts`, `src/sand-values.ts`, `src/wire.ts`, and `tests/wire.test.ts`, so it must rebase or port the stable image commit and rerun its wire tests before touching the bridge.

## Protocol boundary

The App Server adapter accepts `unknown` JSON values. It recognizes only the JSON-RPC responses, notifications, and server requests required by the contract. It converts those values into `BridgeEvent` before the evaluator sees them.

Any command, file, terminal, web, approval, built-in tool, unexpected MCP, or unknown server request becomes a bounded failure. Raw events never enter a report.

The parser keeps JSON-RPC request IDs separate from Grok tool-call IDs. A parser-owned ledger reserves each call with its thread and turn before exposing a handoff, then rejects reused identities, cross-turn completion, or duplicate completion notifications. Tool arguments accept JSON objects only, with fixed byte, depth, and node ceilings. IDs, deltas, and protocol results are bounded before normalization. Each rejection carries a semantic failure event so the evaluator cannot drop it silently.

Thread startup is a safety receipt, not a generic acknowledgement. The response must match the requested working directory, model, OpenAI provider, `user` reviewer, `never` approval policy, empty runtime roots, ephemeral state, and a read-only sandbox with network disabled. Model discovery emits only a `model-available` lifecycle receipt. The live candidate must combine that receipt with its item audit before it emits the contract's Grok-only inventory event.

The dynamic candidate supports flat Grok tool names only. A non-null dynamic namespace is unsupported and fails as unexpected MCP traffic. The stdio client enforces a raw-byte ceiling before UTF-8 decoding and `JSON.parse()`. It requires newline termination, bounds queued messages, tool results, and stderr, keeps stdout separate from diagnostics, correlates each response, and owns bounded TERM/KILL shutdown. Operations are serialized. Lifecycle notifications received before their response remain bounded until the response establishes their thread or turn identity.

Notifications may carry a top-level server emission timestamp. The parser accepts it only as a bounded non-negative integer. The parser consumes a disabled remote-control status without retaining its installation identity. An enabled status fails closed.

Codex reports thread origin and caller-supplied analytics source separately. The 0.151.0 schema makes `threadSource` optional, but the observed correlated App Server response reported `source: "vscode"` with `threadSource: "appServer"`. The parser accepts the schema-native `source: "appServer"` shape with no conflicting analytics value. It also accepts that exact 0.151.0 compatibility pair. It rejects every other origin pair and never exposes either field.

Live mode generates the installed Codex stable and experimental schema bundles in a temporary directory. Each bounded command runs in an owned POSIX process group so a timeout also terminates wrapper descendants. The probe records the CLI version and bundle hashes, parses both complete bundles, then confirms that only the experimental `ThreadStartParams` contains the expected `dynamicTools` shape. The adapter does not check in the full generated schema and adds no runtime validation package.

The isolated lifecycle command creates an empty temporary Codex home and workspace. It passes only a small environment allowlist. It sends a thread request containing the dynamic-tool specification, validates the returned thread policy, audits post-start notifications until a short quiet interval, starts no turn, closes its direct child, and removes the temporary tree before returning. POSIX launches use an owned process group for descendant teardown. Live process probes refuse Windows until the project has Job Object or equivalent process-tree containment. The receipt proves that the thread request completed and that local framing is compatible while remaining signed out. It does not prove dynamic-tool registration or execution, subscription authentication, or native Grok ownership.

Production integration still needs a tool-result callback. `PromptExecutor.stream()` returns Grok-visible tool requests but gives an App Server client no way to receive Grok's result. GCR-1 must design and prove that callback in the native Sand before any production transport import.

The probe client accepts only protocol-bounded dynamic result content. The future native callback must separately enforce trusted attachment roots, media types, and privacy policy before it can construct text, image, or audio output.

## Tradeoffs

- We accept a small internal event model in exchange for one auditable contract across three different protocols.
- We accept serial live scenarios in exchange for repeatable cancellation and restart evidence with lower host load.
- We accept hand-written strict parsers for the small allowed message set in exchange for no new dependency and no checked-in schema bundle with tens of thousands of lines.
- We accept an alpha ceiling while the selected tool handoff or pinned command remains experimental.

## First implementation slice

Implement `bridge-contract.ts`, the fixture module, `direct-candidate.ts`, and `tests/transport-contract.test.ts`. Make deterministic fixture replay and all fail-closed cases pass before adding a Codex subprocess.

## Arena receipts

- Candidate A SHA-256 is `f4a1c70d51e99b73c890b490e31c3bc32a4f43c2d5c4986e88b08358eadd157e`.
- Candidate B SHA-256 is `429d8ad34571c10800f2d7b96c1592a82fa977cf447f0b48b60eb0822f62070b`.
- Cross-judge SHA-256 is `fe3ecc841b4f5196e9223e04d80c3551cdd974430c344d64fb4dfa5132f9d38d`.
