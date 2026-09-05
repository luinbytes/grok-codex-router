# Codex bridge decision

Status: `RELEASE_BLOCKED`

No bridge is selected. Fixture results can validate the comparison code, but they cannot authorize a public release.

## Current evidence

The validation host has Codex CLI 0.153.4. `codex app-server --help` lists stdio as the default transport and labels the command experimental.

The current official App Server documentation separates non-experimental methods from fields that require `capabilities.experimentalApi`. The `dynamicTools` field and `item/tool/call` flow are experimental. WebSocket is experimental and unsupported.

Schema generation for Codex CLI 0.153.4 produced these v2 bundle hashes:

| Schema | SHA-256 |
| --- | --- |
| Stable | `d3eace08be5dca386bfd1f1e8df650058b4113f1e10870a284d775d75517576a` |
| Experimental | `e5f798fd1343c539f01fedea0e8a84a43c080fcca4615c80eb04a5edab4f7d0a` |

Only the experimental `ThreadStartParams` accepts `dynamicTools`.

The generated schemas do not set safe limits for arbitrary tool arguments or prove runtime ownership. The local parser therefore treats every unrecognized or privileged request as a failure, distinguishes JSON-RPC request IDs from Grok call IDs, rejects reused identities, and applies explicit byte, depth, and node ceilings. It accepts thread startup only when Codex reports the requested model, `never` approval policy, and a read-only sandbox with network disabled. A disabled remote-control status is harmless lifecycle evidence and is accepted. Active or malformed remote-control activity is rejected.

`shape-only` schema inspection exists for synthetic fixture tests and labels its receipt accordingly. Every installed-CLI gate uses `pinned` inspection, which requires the exact version and both registered bundle hashes. Shape-only evidence cannot promote or select a bridge.

The model-list parser returns only a `model-available` lifecycle receipt when the requested model appears in the bounded App Server catalog. It does not emit the contract's Grok-only inventory event. A live candidate may emit that event only after its item audit separately proves that Codex avoided built-in tools.

This candidate permits flat dynamic tool names only. Non-null namespaces fail closed. Its JSONL reader enforces a raw-byte ceiling before decoding and parsing. The reader also bounds queued messages and diagnostics, separates stdout from stderr, correlates responses, and owns bounded shutdown. The process client and parser remain evidence rather than a selectable transport.

The installed-schema receipt parses and hashes both 0.153.4 protocol bundles. Only the experimental `ThreadStartParams` exposes a valid `dynamicTools` schema. The isolated lifecycle probe passed initialize, an effective file credential-store check, signed-out account status, model discovery, and ephemeral read-only no-network thread creation after sending a dynamic-tool specification. It uses an empty temporary Codex home and workspace. It inherits no credential variables, audits post-start notifications to a quiet interval, starts no turn, and returns only after owned process-group shutdown and temporary cleanup. It does not prove that Codex registered or invoked the tool.

The probe resolves Codex only through absolute `PATH` entries, rejects every writable executable ancestor including sticky temporary directories, hashes the executable, and runs an independent bounded `codex --version` child before App Server startup. The exact accepted version is 0.153.4. The stdio client always supplies one frozen App Server argument vector; neither the CLI nor the shipped module API accepts an arbitrary executable or argument vector. The safe evidence projection includes the router package version and a digest of the compiled probe build; it contains no executable path, home path, child output, or credential data. Version output and a reported digest do not independently prove that the executable came from an official OpenAI release. Platform-specific release provenance remains a blocker.

The deterministic direct fixture still passes all ten contract scenarios. Every saved receipt ends with `SELECTED_BRIDGE=none` and `RELEASE_GATE=BLOCKED`. On 2026-09-05, the clean TypeScript build and suite excluding the live VM contract file passed 96 of 96 tests; Knip and the diff check also passed. The live VM contract remains outside this macOS release worktree. These results prove the evaluator, bounded local process code, isolated lifecycle, exact installed CLI and schema checks, and baseline fixture. They do not prove an authenticated provider turn through native Grok or authorize a release.

## Candidate state

| Candidate | Purpose | Current result | Release eligibility |
| --- | --- | --- | --- |
| Direct Responses | Fixture and performance baseline | Deterministic replay passes all ten fixture scenarios. No live GCR-1 benchmark has run. | Never eligible. It reads and refreshes credentials outside Codex CLI. |
| App Server dynamic tools | Primary stdio candidate | Bounded process, isolated signed-out lifecycle, and one authenticated local dynamic-tool round trip pass on Codex CLI 0.153.4. No authenticated native Grok turn has run. | Blocked. It may qualify for alpha only after every live case passes. |
| App Server MCP | Research comparison | No passive ownership proof exists. | Blocked. Fixture evidence cannot promote it. |

## Selection rules

A candidate passes only if all ten contract cases pass in an authenticated native Grok Sand. Grok must execute every tool. Codex CLI must own authentication. The event audit must contain no command, file, terminal, web, approval, built-in tool, unexpected MCP, or unknown server request.

The direct candidate remains baseline-only even if every behavioral case passes.

An experimental candidate can qualify only for an alpha prerelease. A stable release also requires release-day official support for the exact command, transport, fields, and tool handoff.

If no App Server candidate passes, the program stops. It does not fall back to the private direct transport.

## Evidence still required

- Authenticated App Server stdio trials through Grok's native control path.
- Platform-specific proof that the tested Codex executable came from an approved official release.
- Exact, lifecycle-specific Codex-home manifests or an installation-owned mutation ledger. The current validator proves only a bounded, current-user-owned allowlist.
- A native image-input subcase that preserves the trusted attachment and redaction contract without exposing bytes or paths in the report.
- One and two-tool turns that prove Grok is the only executor.
- Continuation, cancellation, malformed-result, and restart trials.
- Model discovery and a deny-by-default raw event audit.
- Interleaved latency and memory measurements against the direct baseline.
- A reverse tool-result handoff from Grok's executor into the App Server request lifecycle.
- Platform containment that catches descendants which create a new session, with fresh Darwin and Linux evidence. POSIX process-group cleanup alone is insufficient.

The native-image result reported for `bugfix/grokbot-local-image-attachments` is separate evidence. It cannot select an App Server bridge, and the uncommitted worktree must not be copied or merged. Reconcile it only after that fix has a stable commit.

The authenticated and native lane procedure is prepared in [GCR-1 native validation](gcr1-native-validation.md). Its checked-in schema fixes the ten scenario identifiers, fail-closed result states, redacted evidence fields, and permanently blocked per-lane release verdict. Live receipts remain private and must use new output paths. Preparation is not execution: no authenticated provider turn or native Grok lane is claimed here.

## Authenticated local probe

The repository now contains a bounded authenticated App Server probe for GCR-1. Its public CLI mode is `--authenticated-tool-roundtrip --model <model> --codex-home <absolute-private-directory>`, with optional `--output <new-path>`. Authenticated mode resolves `codex` through the sanitized child path and uses a fixed App Server argument vector.

The Codex home must already exist as a real mode-0700 directory owned by the current user. A private fixed marker identifies it as router-dedicated. Authenticated mode requires `auth.json` to be a private, current-owner, single-link regular file, but never opens it. A fail-closed 0.153.4 compatibility policy admits only bounded, current-user-owned entries observed from Codex login and App Server, including the exact generated system-skill tree. Config, user instructions, hooks, plugins, unexpected symlinks, special files, unsafe ownership, writable entries, and unknown names fail before startup. The same policy runs again after shutdown. This is an allowlist, not proof that Codex created every admitted file, and it does not yet model exact pre-login, post-login, and post-App-Server manifests.

The dedicated home used for the live probe was authenticated through Codex CLI device authorization with file-backed credentials. The fixed App Server command requests file storage, and the parser also requires the effective `config/read` result to report `cli_auth_credentials_store="file"` before it accepts the account result. The router never reads, copies, parses, hashes, or prints credential bytes. Reusing a person's ordinary Codex home is deliberately unsupported because Codex uses one home for authentication and configuration and exposes no App Server flag that separates them.

The probe creates a separate mode-0700 temporary workspace and launches `codex app-server --stdio` through an owned process group. It inventories configured MCP servers and hook keys without returning their names, then starts a thread with every discovered entry disabled. Before the provider turn, it requires the thread-scoped MCP inventory to contain exactly the discovered names, all disabled, with no tools or resources. It also requires a quiet post-start audit. The turn accepts exactly one fixed dynamic-tool challenge and matching completion. The parser rejects MCP activity, hook activity, commands, file changes, terminal use, web use, approvals, connectors, apps, subagents, active remote control, and unknown built-ins.

A successful receipt contains fixed semantic values only: an account reported as signed in through the dedicated Codex home, effective file-store configuration, MCP disabled before the provider turn, configured and quiet hooks, one identity-preserving probe-harness tool round trip, a closed process group, same-process-group-only containment, post-start observation, removed workspace, `nativeGrokExecution=not-run`, and `releaseEligibility=blocked`. On 2026-09-05, that probe passed against the dedicated home and `gpt-5.6-luna`; the private receipt digest is recorded in the execution ledger. Any failure returns one static error and writes no report. Evidence files are immutable. The CLI refuses every existing output path, whether recognized or not, so a failed rerun cannot destroy prior evidence. Callers use a new output path for each run. This is local App Server evidence. It does not prove official executable provenance, exact Codex ownership of the admitted home state, startup-time managed configuration was inert, process-tree containment, native Grok or Sand execution, and it does not select a release bridge.

## Removal trigger

GCR-2 may remove the private direct transport only after GCR-1 selects exactly one App Server candidate and records every required receipt. Until then, GCR-1 changes no production route.

## References

- [Codex App Server documentation](https://learn.chatgpt.com/docs/app-server)
- [Codex authentication documentation](https://learn.chatgpt.com/docs/auth)
- [Codex issue 16045 on non-replacing MCP map overrides](https://github.com/openai/codex/issues/16045)
- `codex app-server --help`
- `codex app-server generate-json-schema --out <dir>`
- `codex app-server generate-json-schema --experimental --out <dir>`
