# Security policy

The router changes a Grok Bot Sand host and sends requests to a private ChatGPT Codex endpoint. Treat both the host and the credential boundary as sensitive.

## Current release boundary

The public installation gate is blocked. No bridge is selected. The direct Responses transport is a fixture and comparison baseline because it reads and refreshes credentials outside the Codex CLI ownership boundary. The App Server candidate still lacks native Grok validation, official executable provenance, and complete platform containment evidence.

The update and rollback material in [`docs/codex-update-recovery.md`](docs/codex-update-recovery.md) is design-only. It is not an installed updater. Do not use `git pull` to update an installation. Do not copy or restore a host bundle by hand.

## Do not expose secrets

Never commit or paste any of these values:

- OAuth files, access tokens, refresh tokens, or account identifiers.
- Authorization headers or callback material.
- Prompts, message bodies, tool arguments, or raw provider responses.
- Sand host bundles or unredacted service logs.
- Private native validation receipts or screenshots.

The router's diagnostics and telemetry are intended to contain routing, transport, timing, usage, and sanitized error fields only. Check a report before sharing it.

The router does not provide a sandbox. It relies on the existing Sand and Grok Bot permission boundary. Process checks, including Linux `/proc` observations, are evidence about a process and are not a general isolation guarantee.

## Report a vulnerability

Do not open a public issue for a credential leak, an authorization bypass, or a report that contains private host or account data.

Use [GitHub's private vulnerability reporting page](https://github.com/luinbytes/grok-codex-router/security/advisories/new) when it is available. If private reporting is unavailable, open a minimal issue with no sensitive data and ask for a private reporting channel.

Include the affected commit or version, the smallest safe reproduction, the observed impact, and the checks that demonstrate the problem. Redact all secrets before attaching files.

## Safe validation

Run `./install.sh --check --json` or `node scripts/install-preflight.cjs --json` before any installation action. A result with `status: blocked` is a hard stop. Do not run login, copy credentials, patch the host, start the control service, restart Grok Bot, or run a provider turn after that result.

The intended runtime is a Linux x64 or Linux arm64 Grok Bot Sand VM. A local macOS or Linux test run does not prove native Grok safety. The native ten-lane matrix remains outstanding.

The installer and `recover` command are gated. Other legacy CLI commands such as `patch-host`, `restart-host`, `service-start`, `service-restart`, `service-stop`, `on`, and `off` are not supported public installation paths. Do not call them to bypass a blocked preflight.

The dependency-install ban applies to public setup and recovery. An authorized developer may install locked dependencies in an isolated checkout for portable tests. That does not install the router or clear the release gate.
