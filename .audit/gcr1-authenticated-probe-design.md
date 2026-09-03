# GCR-1 authenticated probe design

## Decision

The authenticated App Server probe is one fixed, deep operation. It uses a dedicated Codex home that the user authenticated through the official Codex CLI, proves one dynamic-tool request and result, closes its owned process group, and returns a fixed safe receipt. It checks credential-file ownership and permissions without opening the file. It does not read, copy, parse, hash, or report credential bytes or authentication values.

The probe remains local App Server evidence. A passing receipt keeps `SELECTED_BRIDGE=none`, `RELEASE_GATE=BLOCKED`, and `nativeGrokProof=not-run`.

## Arena result

The initial arena preferred existing-login reuse. The real no-provider preflight invalidated that choice. Codex 0.151 loads authentication, user configuration, hooks, plugins, and MCP configuration from one `CODEX_HOME`, and its map overrides merge instead of replacing inherited MCP entries. A temporary home cannot reuse file, keyring, and encrypted-secret authentication portably without copying credentials or depending on private storage details.

The revised base uses a persistent router-dedicated Codex home. The user signs in through the official Codex CLI, and Codex stores and refreshes its own file-backed credentials there. The router passes only the home path in the child environment. It does not read or copy the credential file. Personal Codex configuration cannot enter the process. System and managed configuration remain authoritative, so the probe inventories and disables every MCP server and hook it can observe before the provider turn.

The cross-judge required these combined properties:

- Only `darwin` and `linux` may run the live probe. Every other platform refuses before spawn.
- The dedicated Codex home must be an absolute, real, mode-0700 directory owned by the current user. It must contain the fixed router-home marker and a private, current-owner, single-link `auth.json`. A version-pinned policy admits only observed Codex 0.151.0 databases, `installation_id`, and empty `skills` and `tmp` directories. Config, instructions, hooks, plugins, symlinks, special files, unsafe ownership, writable entries, and unknown names fail before startup.
- Global `mcpServerStatus/list` must return one bounded complete inventory. Names stay in memory and never enter receipts or errors.
- `hooks/list` for the temporary workspace must return one bounded complete inventory with no warnings or errors. Hook keys stay in memory.
- `thread/start` must disable every discovered MCP server and hook. A thread-scoped MCP read must report the exact same server set, all disabled, with no tools or resources.
- A dynamic-tool response consumes one parser-issued lease containing the request, call, thread, turn, tool, and arguments. The matching completion must close the same lease.
- Every operation requires a runtime-branded immutable Codex executable proof and constructs the same fixed App Server argument vector. Tests exercise this boundary with version-reporting fake executables rather than an arbitrary-command seam.
- The resolved executable must pass safe path and ownership checks, an independent exact-version child, and identity revalidation before App Server startup.
- `config/read` must report `cli_auth_credentials_store="file"` before `account/read`. The raw configuration response stays private and only that semantic result survives parsing.
- Failure returns one static error and creates no new artifact. Existing evidence is never replaced or removed. Success returns fixed enum values only.

The source receipts are:

- Candidate A SHA-256: `8d04e9a30075c80dfe2f1050f45c7068a6d05a617f2dd1fb025ddc2532dbb64c`
- Candidate B SHA-256: `714ab722434aa0a81e13d9677c562e58f2454ef0cd4df2864fa6d2b54930c6d8`
- Cross-judge SHA-256: `48f5e9c65b26403555d17b6693096e2391ed3df1ddce10b723ff94cc5ed5758c`

## Fixed protocol

The caller supplies only the model, package version, dedicated Codex-home path, and bounded timeouts. Prompt text, tool definition, expected arguments, result content, executable, and App Server arguments are fixed private values. The CLI exposes no prompt, tool payload, raw child arguments, event filter, or diagnostic switch.

The registered tool is `gcr_probe_echo`. Its schema requires one fixed challenge string and rejects additional properties. The prompt asks for that tool exactly once. The harness verifies the exact arguments, returns one fixed text result, requires the matching completed item and completed turn, and rejects a second handoff or any unresolved identity.

The success receipt contains only these facts:

- Codex reported a signed-in ChatGPT account.
- The process used a dedicated Codex home and Codex-owned credentials.
- The thread-scoped MCP inventory matched the configured inventory, with every entry disabled and no exposed tools or resources.
- Every discovered hook was disabled in thread configuration, and no hook activity, warning, or error was observed.
- One dynamic-tool request/result completed with preserved identity.
- No forbidden protocol activity was observed.
- The owned process group closed and the temporary workspace was removed.
- Process-tree containment remains unproven because a descendant can escape with `setsid`.
- Native Grok execution was not run and release remains blocked.

It contains no model name, account metadata, prompt, arguments, result text, protocol identity, path, environment value, child output, timestamp, duration, or raw event.

## Launch and authentication boundary

Authenticated mode requires a dedicated Codex home. Its environment allowlist carries `CODEX_HOME` and only the operating-system values required to start Codex. It omits API keys, tokens, credential values, the person's ordinary home, and user configuration roots. The fixed command selects Codex's documented file-backed auth store. Before account inspection, the bounded App Server parser requires the effective configuration to report that store as `file`. Codex resolves and refreshes its own login. Repository code observes only the semantic `signed-in` or `signed-out` result from `account/read`.

The current home policy is intentionally pinned to the exact observed 0.151.0 layout. It does not claim provenance for arbitrary safe-looking files. The installer phase will create a marker-only platform-state home, own the official login mutation, and introduce the persistent mutation ledger selected by the architecture arena. GCR1 does not retroactively trust an existing home through a new ledger.

The fixed command uses stdio and defense-in-depth configuration overrides accepted by the installed CLI. Before `thread/start`, the client records only bounded MCP names and hook keys in memory. It generates structured per-name disable entries, then verifies the effective thread MCP state. Pagination, duplicate names, malformed responses, warnings, errors, an extra effective server, a non-disabled server, exposed tools, or exposed resources fail before the provider turn.

The temporary workspace is mode `0700` and contains no project instructions or files. `thread/start` remains ephemeral, read-only, no-network, OpenAI-backed, approval-free, and without runtime workspace roots or environments. The strict parser rejects MCP, hook, command, file, terminal, web, approval, connector, app, subagent, active remote-control, or unknown activity at every later phase. It accepts only a disabled remote-control status.

## Identity and process ownership

The parser issues a private dynamic-tool lease only after it validates both JSON-RPC request ID and tool call ID against the active thread and turn. The response operation consumes the entire lease once. It reserves the identity before writing, then requires the corresponding completed item before accepting turn completion. No identifier survives safe-receipt projection.

Each child starts as a detached process-group leader. Cleanup closes stdin, waits briefly, checks the group even if the direct child has already exited, sends `SIGTERM`, then `SIGKILL` if needed, and proves `kill(-pgid, 0)` reports absence. A surviving member of that group prevents a receipt.

This is process-group cleanup, not process-tree containment. A descendant that creates a new session can escape the group. The receipt names the boundary as same-process-group-only, and release remains blocked until Darwin and Linux containment tests close that gap. Likewise, MCP and hook inventory occurs after App Server startup. It proves observed and configured state, not that managed startup inputs never ran.

## Verification contract

Fake-server tests must cover success, signed-out status, effective credential-store mismatch, bounded global inventories, paginated or malformed inventories, thread isolation mismatches, hook warnings or errors, duplicate tool requests, wrong request or call identity, wrong arguments, mismatched results, failed or premature completion, command, file, web, approval, MCP and hook notifications, unknown built-ins, child timeout, ordinary and escaped descendants, private-home validation, post-run home replacement, hostile `PATH`, exact-version mismatch, and every unsupported platform class. CLI tests must prove the fixed surface, immutable output refusal, unknown-target preservation, build provenance, and artifact redaction.

Only after those tests pass may one explicit local provider turn run. That command is evidence for authenticated App Server handoff only. Native Grok and Sand execution, image input, continuation, parallel tools, cancellation, restart, and production callback integration remain separate GCR-1 gates.
