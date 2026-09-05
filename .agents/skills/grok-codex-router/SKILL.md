---
name: grok-codex-router
description: "Use when an agent must inspect, install, configure, recover, or diagnose Grok Codex Router in a requested checkout."
---

# Grok Codex Router

Use this workflow for this repository only. It is self-contained. Do not depend on personal skills, private reference files, an installed Grok Bot, or a user's credential store.

## Stop at the release gate

Run the source preflight before installation or recovery:

```bash
node scripts/install-preflight.cjs --json
```

The result uses `schemaVersion: 1` and includes `status`, `selectedBridge`, and `blockers`. The current safe result is:

```text
status=blocked
selectedBridge=none
```

If the result is blocked, stop. Do not install dependencies, run login, read or copy credentials, write router configuration, patch the Sand host, start or stop the service, restart Grok Bot, or run a provider turn. Report the blocker `code` values and the inspected commit.

The shell wrapper provides the same read-only check:

```bash
./install.sh --check --json
```

The no-argument installer is not an escape hatch. It must fail before dependencies, authentication, or host mutation while the gate is blocked.

The installer and `recover` command are gated. Other legacy CLI commands such as `patch-host`, `restart-host`, `service-start`, `service-restart`, `service-stop`, `on`, and `off` are not supported public installation paths. Do not call them to bypass a blocked result.

The dependency-install ban applies to public setup and recovery. An authorized developer may install locked dependencies in an isolated checkout for portable tests. That does not install the router or clear the release gate.

## Read-only inspection

Before an allowed action, confirm the requested checkout and branch:

```bash
git status --short --branch
git rev-parse --show-toplevel
git rev-parse HEAD
```

Treat `src/`, `control/`, `scripts/`, `bin/`, and `ui/` as canonical. Never edit `dist/`, `node_modules/`, `host-main.cjs`, or an installed Sand bundle by hand.

Read `README.md`, `SECURITY.md`, and the relevant guide under `docs/` before changing installation or recovery state.

## Credential and privacy boundary

The router does not provide login. Never read, copy, hash, print, or request pasted OAuth credentials. Never log or publish access tokens, refresh tokens, account identifiers, authorization headers, callback material, prompts, message bodies, tool arguments, raw provider responses, host bundles, or unredacted service logs.

The direct Responses transport is a fixture and comparison baseline. Its credential owner is outside the Codex CLI boundary, so it is not release-eligible. Do not describe a direct fixture or a local App Server probe as a native Grok turn.

## Supported runtime boundary

The intended runtime is a Grok Bot Sand VM on Linux x64 or Linux arm64. A macOS or generic Linux checkout can run portable checks, but it does not prove VM or native behavior.

The router does not provide a sandbox. It relies on the existing Sand and Grok Bot permission boundary. A process observation under Linux `/proc` is not a sandbox guarantee. `CODEX_HOME` does not redirect the production router's OAuth store.

The native Grok validation matrix has not run. No bridge is selected. Codex CLI update and rollback support is design-only. Do not use `git pull` to update an installation or copy a host backup as rollback.

## Verification

For source changes, run the portable gate:

```bash
npm run check:portable
```

Run live VM checks only in the intended Sand environment:

```bash
npm run check:vm
```

The historical full gate remains:

```bash
bun run check
```

Record which checks ran. Keep portable, VM, and native release evidence separate.

## Safe recovery

Use the control UI and the CLI only after the release gate permits installation. Let the checked recovery owner inspect and patch compatible host updates. If compatibility fails, stop before mutation and report the sanitized diagnostic.

Use this command to create a report from an existing installation:

```bash
grok-codex-router diagnose
```

Review the output privately and redact it before sharing. Never attach credentials, prompts, tool arguments, authorization data, raw logs, or the Sand bundle.
