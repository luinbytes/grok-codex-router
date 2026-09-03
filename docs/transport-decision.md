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

The deterministic direct fixture now passes all ten contract scenarios. The focused contract suite passes 5 tests, and the complete non-live suite passes 31 tests with Knip, TypeScript build, and the telemetry check clean. This proves the evaluator and baseline fixture only. It does not prove an App Server candidate or authorize a release.

## Candidate state

| Candidate | Purpose | Current result | Release eligibility |
| --- | --- | --- | --- |
| Direct Responses | Fixture and performance baseline | Deterministic replay passes all ten fixture scenarios. No live GCR-1 benchmark has run. | Never eligible. It reads and refreshes credentials outside Codex CLI. |
| App Server dynamic tools | Primary stdio candidate | Not measured in an authenticated Grok Sand. | Blocked. It may qualify for alpha only after every live case passes. |
| App Server MCP | Research comparison | No passive ownership proof exists. | Blocked. Fixture evidence cannot promote it. |

## Selection rules

A candidate passes only if all ten contract cases pass in an authenticated native Grok Sand. Grok must execute every tool. Codex CLI must own authentication. The event audit must contain no command, file, terminal, web, approval, built-in tool, unexpected MCP, or unknown server request.

The direct candidate remains baseline-only even if every behavioral case passes.

An experimental candidate can qualify only for an alpha prerelease. A stable release also requires release-day official support for the exact command, transport, fields, and tool handoff.

If no App Server candidate passes, the program stops. It does not fall back to the private direct transport.

## Evidence still required

- A fixture CLI report and saved artifact for the already-passing ten-scenario deterministic replay.
- Authenticated App Server stdio trials through Grok's native control path.
- A native image-input subcase that preserves the trusted attachment and redaction contract without exposing bytes or paths in the report.
- One and two-tool turns that prove Grok is the only executor.
- Continuation, cancellation, malformed-result, and restart trials.
- Model discovery and a deny-by-default raw event audit.
- Interleaved latency and memory measurements against the direct baseline.

The native-image result reported for `bugfix/grokbot-local-image-attachments` is separate evidence. It cannot select an App Server bridge, and the uncommitted worktree must not be copied or merged. Reconcile it only after that fix has a stable commit.

## Removal trigger

GCR-2 may remove the private direct transport only after GCR-1 selects exactly one App Server candidate and records every required receipt. Until then, GCR-1 changes no production route.

## References

- [Codex App Server documentation](https://learn.chatgpt.com/docs/app-server)
- [Codex authentication documentation](https://learn.chatgpt.com/docs/auth)
- `codex app-server --help`
- `codex app-server generate-json-schema --out <dir>`
- `codex app-server generate-json-schema --experimental --out <dir>`
