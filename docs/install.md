# Install the router

This guide covers the shell installer and its release gate. The current gate is blocked, so these steps inspect readiness only.

## Check the release gate

Run the check from the repository root:

```bash
./install.sh --check
```

To consume the result in a script, request JSON:

```bash
./install.sh --check --json
```

You can call the source preflight without the shell wrapper:

```bash
node scripts/install-preflight.cjs --json
```

The preflight output uses this stable top-level shape:

```json
{
  "schemaVersion": 1,
  "status": "blocked",
  "selectedBridge": "none",
  "blockers": [
    { "code": "..." }
  ]
}
```

The `blockers` array contains machine-readable `code` values. Treat any non-empty array as a stop condition. Do not infer that installation is safe from a partial check or from a fixture report.

The check is read-only. It does not install dependencies, authenticate an account, write router configuration, patch the Sand host, start a service, or restart Grok Bot.

## Understand the current result

The current result must remain blocked for these reasons:

- `selectedBridge` is `none`.
- The direct transport does not use the Codex CLI as its credential owner.
- The native Grok validation matrix has not run.
- Codex CLI update and rollback support is design-only.

The checked-in fixture and local App Server evidence can test evaluator behavior. They cannot select a release bridge or authorize installation.

## Do not bypass a blocked gate

While the gate is blocked, do not run the no-argument installer:

```bash
./install.sh
```

The installer must fail before dependency installation, authentication, host patching, service startup, or any other mutation. Do not bypass that order with `bun install`, a copied OAuth file, or a hand-edited host bundle. The `grok-codex-router install` and `recover` commands are gated too.

The installer and `recover` command are gated. Other legacy CLI commands such as `patch-host`, `restart-host`, `service-start`, `service-restart`, `service-stop`, `on`, and `off` are not supported public installation paths. Do not call them after a blocked result.

The dependency-install ban applies to public setup and recovery. An authorized developer may install locked dependencies in an isolated checkout for portable tests. That does not install the router or clear the release gate.

Do not use `git pull` to update an installed router. The update design requires an immutable, verified candidate and is not implemented. Do not use a manual backup copy as rollback.

## Intended installation target

The intended target is a Grok Bot Sand VM running Linux x64 or Linux arm64. The project does not promise support for Windows, generic Linux, macOS, or other architectures.

The target environment will need Node.js 22.19 or newer, Bun 1.4 or newer, and an existing official Codex CLI authentication path when the release gate permits installation. The router does not provide a login flow.

The router does not provide a sandbox. It runs inside the existing Sand and Grok Bot permission boundary. A Linux process check or a path under `/proc` does not change that boundary.

## Future eligible installation

When the release gate becomes eligible, the no-argument shell installer may become a supported installation entry point:

```bash
./install.sh
```

The installer will still run the preflight first. The immutable staged installation design, activation sequence, and runtime verification contract are not defined yet. Do not infer that a future installer may build or link a live checkout, or that it may activate a mutable branch.

Do not treat this section as current authorization. The present preflight result is blocked.

Do not assume that `/usr/local/bin/bun` or `~/grok-codex-router` is a supported installation contract. They are legacy defaults in the current code and do not prove that a runtime is authentic, portable, or release-eligible.

## Existing installations

If an older local installation needs diagnosis, use its sanitized report command:

```bash
grok-codex-router diagnose
```

Review the output privately before sharing it. Remove credentials, account identifiers, prompts, tool arguments, authorization data, raw logs, and host-bundle contents. Read [Security](../SECURITY.md) before opening a report.
