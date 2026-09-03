# GCR-1 grounding

## Existing flow

`scripts/patch-host.ts` injects `createCodexRouterSession()` into the Grok host. `src/session.ts` keeps one executor per immutable Grok conversation and workload. Each turn calls `executeCodexTurn()` in `src/turn-execution.ts`.

`buildRequest()` in `src/wire.ts` converts Grok messages and tools into a Responses request. `src/transport.ts` sends that request through the current private WebSocket or SSE implementation. `ResponseAccumulator` in `src/response.ts` converts provider events back into Grok stream parts.

The router emits tool calls but never executes them. Grok executes the tool and sends the result through the same executor. `continuationRequest()` in `src/continuation.ts` sends a delta only when the rebuilt request matches the recorded prefix.

## Required invariants

- Grok remains the only tool executor.
- Conversation, tool-call, and tool-result identities remain stable.
- A changed instruction, model, tool schema, or history prefix disables delta continuation.
- `AbortSignal` cancellation reaches every candidate and ignores late events.
- Codex CLI owns ChatGPT authentication. The probe never reads, copies, refreshes, or prints credentials.
- Reports contain scenario results and protocol metadata only. They exclude prompts, message bodies, tool arguments, account identifiers, and authorization data.

## GCR-1 boundary

GCR-1 adds an isolated comparison runner. It does not import a new candidate into `src/turn-execution.ts`, `src/transport.ts`, `src/session.ts`, or the host patch.

The runner applies one contract to three candidates:

1. The current direct Responses implementation as an unshippable fixture benchmark.
2. Codex App Server over stdio with experimental `dynamicTools`.
3. A research-only App Server MCP form.

The contract covers authentication status, plain text, one tool, parallel tools, stream order, continuation, cancellation, malformed tool results, restart behavior, and model plus tool inventory.

## Native image boundary

The separate `bugfix/grokbot-local-image-attachments` worktree is not an implementation source until it has a stable commit. Its current diff establishes requirements that every selectable bridge must preserve:

- Native `Buffer` and `Uint8Array` payloads reach request normalization without Sand flattening them.
- PNG, JPEG, GIF, and WebP bytes become data URLs. Native bytes and trusted local files are limited to 20 MiB.
- Local files are accepted only from the current agent's resolved attachment root. Cross-agent paths, traversal, arbitrary paths, and symlinked roots fail closed.
- Non-image wrappers keep their privacy-redacted JSON shape.
- Candidate adapters neither read attachment files nor place image bytes, paths, prompts, or message bodies in probe reports.

The user's report says that worktree passes 34 router tests and one native-pixel image trial. That evidence belongs to the separate uncommitted worktree and has not been independently reproduced here. GCR-1 still needs an App Server image-input receipt before selecting a bridge.

## Current Codex evidence

- The installed CLI is `codex-cli 0.151.0`.
- `codex app-server --help` labels the command experimental and lists stdio as the default transport.
- Official documentation separates non-experimental methods from fields gated by `capabilities.experimentalApi`.
- `dynamicTools` and its `item/tool/call` flow are experimental.
- WebSocket is experimental and unsupported.
- Generated stable and experimental schemas differ at `ThreadStartParams`. Only the experimental schema accepts `dynamicTools`.
- The generated v2 schema hashes are `2442b15801bc019ad55987ad03e0f0ae60c51417825b9b6d708db640e6c2651c` for stable and `a586cdc50f84c56c7654387e869b470a689796fa1c57678dcafb5921bb2d5255` for experimental.

## Architect inputs

Define the contract before the candidate adapters. Parse JSON-RPC messages at the adapter boundary into a closed event union. Feed those events into one pure scenario evaluator. Keep subprocess ownership, credential status queries, and live provider work outside the evaluator. Fail a candidate on an unknown event or any command, file, web, approval, or unexpected MCP execution request.
