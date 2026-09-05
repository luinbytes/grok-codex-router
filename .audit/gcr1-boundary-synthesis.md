# GCR1 boundary synthesis

> Historical snapshot from Codex CLI 0.151.0. See `docs/transport-decision.md` for the current compatibility evidence and release decision.

## Decision

Candidate B is the target architecture: one diagnostic operation owns home admission, executable proof, App Server ordering, process cleanup, and safe evidence projection. Candidate A contributes the finite error model, mandatory signed-out prerequisite, independent version proof, descriptor-oriented validation, and allowlisted artifact provenance.

GCR1 will not create a persistence ledger retroactively. A ledger proves provenance only when the router owns the marker-only bootstrap, official Codex login, and every later mutation while holding the home lock. The installer phase will introduce that managed lifecycle. Until then, GCR1 admits only the observed Codex 0.151.0 state classes under a strict, version-pinned policy and remains release-blocked.

## Current checkpoint shape

The public probe CLI expresses intent. Authenticated mode accepts a dedicated home and expected model, but no executable override. Internal modules own the following capabilities:

- `codex-process.ts` resolves a safe executable from absolute `PATH` entries, proves exact Codex 0.151.0 with a bounded one-shot child, and owns POSIX process-group shutdown.
- `app-server-schema.ts` uses the verified executable and the same child boundary for both schema generations.
- `app-server-stdio.ts` owns JSONL framing, request identity, lifecycle order, runtime MCP and hook observation, thread isolation, and group closure.
- `app-server-authenticated.ts` validates the dedicated home, requires metadata-safe `auth.json`, runs one exact dynamic-tool handoff, and returns only bounded status fields.
- `codex-bridge-probe.ts` projects safe provenance and writes a create-only private artifact.

Tests place a fake version-reporting Codex executable in a repository-local safe path and obtain the same runtime-branded proof as production. The stdio API accepts only that immutable proof and always launches the fixed App Server argument vector. Neither tests nor the installed CLI can inject a command or argument vector.

## Home policy for Codex 0.151.0

The root must be an absolute, real, current-owner directory with mode 0700. Its marker must have exact content and size and be a private, current-owner, single-link regular file. Authenticated mode also requires `auth.json` to be a private, current-owner, single-link regular file. The router checks only credential metadata and never opens, parses, copies, hashes, logs, or serializes credential bytes.

The temporary compatibility policy admits only:

- the router marker and `auth.json`;
- `installation_id`;
- the observed `goals`, `logs`, `memories`, `queue`, and `state` generation databases, including SQLite WAL and SHM companions;
- empty `skills` and `tmp` directories.

Every admitted entry must be current-owner, single-link where applicable, the expected file type, and not writable by group or other users. Symlinks, devices, sockets, unknown names, config, instructions, hooks, plugins, prompts, rules, commands, and nonempty skill or temporary directories fail before Codex starts. The inventory is bounded and checked again after shutdown. A future Codex layout change requires a tested router release; it never widens admission automatically.

## Proof limits

The fixed App Server command requests file credential storage and disables known external surfaces before initialization. A required dedicated `auth.json`, independent CLI version proof, signed-in account result, and runtime inventory are corroborating evidence. They do not prove that system, administrator, or managed configuration was absent before process startup. The receipt therefore says observed and configured, not never started.

POSIX process groups contain the launched process and ordinary descendants. A descendant may call `setsid` and escape. GCR1 proves only group closure, exposes the limitation in its safe receipt, and remains blocked for production until platform containment is implemented and tested on Darwin and Linux.

## Rejected shapes

- A caller-selected executable is rejected because it defeats version and binary authority.
- A copied or linked credential file is rejected because the router must not transport auth material.
- A permissive filename pattern without a managed ledger is rejected because safe-looking content has no provenance.
- A retroactive ledger is rejected because it would bless state the router did not create.
- A successful production claim based on post-start inventory is rejected because startup-time activity remains unproven.

## Installer handoff

The installer will replace the temporary home admission policy with a router-managed platform-state home. It will create the marker-only home, run official Codex device login under that home, record only safe mutations while holding a single home lock, and refuse to adopt or copy an existing credential store. That is the point where Candidate B's mutation ledger becomes trustworthy and update-safe.
