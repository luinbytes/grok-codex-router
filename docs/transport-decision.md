# Codex bridge decision

Status: `RELEASE_BLOCKED`

No bridge is selected. Fixture results can validate the comparison code, but they cannot authorize a public release.

## Current evidence

The planning host has Codex CLI 0.151.0. `codex app-server --help` lists stdio as the default transport and labels the command experimental.

The current official App Server documentation separates non-experimental methods from fields that require `capabilities.experimentalApi`. The `dynamicTools` field and `item/tool/call` flow are experimental. WebSocket is experimental and unsupported.

Schema generation for Codex CLI 0.151.0 produced these v2 bundle hashes:

| Schema | SHA-256 |
| --- | --- |
| Stable | `2442b15801bc019ad55987ad03e0f0ae60c51417825b9b6d708db640e6c2651c` |
| Experimental | `a586cdc50f84c56c7654387e869b470a689796fa1c57678dcafb5921bb2d5255` |

Only the experimental `ThreadStartParams` accepts `dynamicTools`.

The generated schemas do not set safe limits for arbitrary tool arguments or prove runtime ownership. The local parser therefore treats every unrecognized or privileged request as a failure, distinguishes JSON-RPC request IDs from Grok call IDs, rejects reused identities, and applies explicit byte, depth, and node ceilings. It accepts thread startup only when Codex reports the requested model, `never` approval policy, and a read-only sandbox with network disabled.

The model-list parser returns only a `model-available` lifecycle receipt when the requested model appears in the bounded App Server catalog. It does not emit the contract's Grok-only inventory event. A live candidate may emit that event only after its item audit separately proves that Codex avoided built-in tools.

This candidate permits flat dynamic tool names only. Non-null namespaces fail closed. Its JSONL reader enforces a raw-byte ceiling before decoding and parsing. The reader also bounds queued messages and diagnostics, separates stdout from stderr, correlates responses, and owns bounded shutdown. The process client and parser remain evidence rather than a selectable transport.

The installed-schema receipt parses and hashes both 0.151.0 protocol bundles. Only the experimental `ThreadStartParams` exposes a valid `dynamicTools` schema. The isolated lifecycle probe passed initialize, signed-out account status, model discovery, and ephemeral read-only no-network thread creation after sending a dynamic-tool specification. It uses an empty temporary Codex home and workspace. It inherits no credential variables, audits post-start notifications to a quiet interval, starts no turn, and returns only after direct-child shutdown and temporary cleanup. It does not prove that Codex registered or invoked the tool.

The deterministic direct fixture still passes all ten contract scenarios. Every saved receipt ends with `SELECTED_BRIDGE=none` and `RELEASE_GATE=BLOCKED`. The focused parser, stdio, schema, CLI, and contract suite passes 42 tests. The complete non-live suite passes 68 tests with Knip, TypeScript build, and the telemetry check clean. The repository-wide check passes 69 of 72 tests. Its only failures are the same three live VM contracts unavailable in this macOS worktree. These results prove the evaluator, the bounded local process code, the isolated lifecycle, and the baseline fixture. They do not prove an authenticated App Server candidate or authorize a release.

## Candidate state

| Candidate | Purpose | Current result | Release eligibility |
| --- | --- | --- | --- |
| Direct Responses | Fixture and performance baseline | Deterministic replay passes all ten fixture scenarios. No live GCR-1 benchmark has run. | Never eligible. It reads and refreshes credentials outside Codex CLI. |
| App Server dynamic tools | Primary stdio candidate | Bounded process and isolated signed-out thread lifecycle pass. No dynamic tool turn or authenticated native Grok turn has run. | Blocked. It may qualify for alpha only after every live case passes. |
| App Server MCP | Research comparison | No passive ownership proof exists. | Blocked. Fixture evidence cannot promote it. |

## Selection rules

A candidate passes only if all ten contract cases pass in an authenticated native Grok Sand. Grok must execute every tool. Codex CLI must own authentication. The event audit must contain no command, file, terminal, web, approval, built-in tool, unexpected MCP, or unknown server request.

The direct candidate remains baseline-only even if every behavioral case passes.

An experimental candidate can qualify only for an alpha prerelease. A stable release also requires release-day official support for the exact command, transport, fields, and tool handoff.

If no App Server candidate passes, the program stops. It does not fall back to the private direct transport.

## Evidence still required

- Authenticated App Server stdio trials through Grok's native control path.
- An authenticated-mode isolation boundary that prevents configured MCP startup rather than hiding its notifications.
- A native image-input subcase that preserves the trusted attachment and redaction contract without exposing bytes or paths in the report.
- One and two-tool turns that prove Grok is the only executor.
- Continuation, cancellation, malformed-result, and restart trials.
- Model discovery and a deny-by-default raw event audit.
- Interleaved latency and memory measurements against the direct baseline.
- A reverse tool-result handoff from Grok's executor into the App Server request lifecycle.
- Windows Job Object or equivalent process-tree containment before enabling live probes there.

The native-image result reported for `bugfix/grokbot-local-image-attachments` is separate evidence. It cannot select an App Server bridge, and the uncommitted worktree must not be copied or merged. Reconcile it only after that fix has a stable commit.

## Removal trigger

GCR-2 may remove the private direct transport only after GCR-1 selects exactly one App Server candidate and records every required receipt. Until then, GCR-1 changes no production route.

## References

- [Codex App Server documentation](https://learn.chatgpt.com/docs/app-server)
- [Codex authentication documentation](https://learn.chatgpt.com/docs/auth)
- `codex app-server --help`
- `codex app-server generate-json-schema --out <dir>`
- `codex app-server generate-json-schema --experimental --out <dir>`
