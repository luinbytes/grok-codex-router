# Install for agents

This guide is for a Codex-compatible agent that is asked to install, recover, or inspect Grok Codex Router. It is self-contained. Do not assume access to a personal skill, a private reference file, a credential store, or an installed Grok Bot.

## Start with the preflight

Run this command from the repository root before any install or recovery action:

```bash
node scripts/install-preflight.cjs --json
```

The result has `schemaVersion: 1`, `status`, `selectedBridge`, and `blockers`. The current safe result is:

```text
status=blocked
selectedBridge=none
```

If `status` is `blocked`, stop. Do not install dependencies, run login, read or copy credentials, write configuration, patch a host, start or stop a service, restart Grok Bot, or run a provider turn. Report the blocker codes and the exact commit you inspected.

The installer and `recover` command are gated. Other legacy commands such as `patch-host`, `restart-host`, `service-start`, `service-restart`, `service-stop`, `on`, and `off` do not re-establish the release gate. They are not supported public installation paths.

The dependency-install ban applies to public setup and recovery. An authorized developer may install locked dependencies in an isolated checkout for portable tests. That does not install the router or clear the release gate.

The shell wrapper exposes the same read-only check:

```bash
./install.sh --check --json
```

## Read-only inspection

An agent may inspect these items before it stops:

```bash
git status --short --branch
git rev-parse HEAD
node scripts/install-preflight.cjs --json
```

An agent may read `README.md`, `SECURITY.md`, `docs/install.md`, `docs/configuration.md`, `docs/development.md`, and the checked-in release evidence. It must keep private receipts, host bundles, and credentials out of output.

## Release facts

The direct Responses transport is not release-eligible because its credential owner is outside the Codex CLI boundary. No App Server bridge is selected. The native Grok validation matrix is absent. Codex CLI update and rollback support is design-only.

Portable tests and fixture probes do not replace native Grok evidence. A passing test is not permission to install or claim release readiness.

## Agent safety rules

Keep these rules in force for every request:

1. Work from the requested checkout. Do not switch to another worktree or copy files from an installed Grok Bot.
2. Use the repository preflight before installation or recovery.
3. Stop on `status: blocked` or on a missing, malformed, or unrecognized preflight result.
4. Do not read, copy, hash, print, or ask the user to paste OAuth credentials.
5. Do not expose prompts, message bodies, tool arguments, authorization headers, account identifiers, host bundles, or raw logs.
6. Do not use `git pull` as an installation update or copy a host backup as rollback.
7. Do not claim native Grok execution from a fixture, a local App Server process, or a portable test.

The router does not provide a sandbox. It relies on the existing Sand and Grok Bot permission boundary. A process observation under Linux `/proc` is not a sandbox guarantee.

`CODEX_HOME` does not redirect the production router's OAuth store. Do not assume that setting it changes the configured `pi` or `codex` store, and do not copy credentials into a router directory.

The intended runtime is a Linux x64 or Linux arm64 Grok Bot Sand VM. A macOS checkout is not evidence that a VM installation works.
