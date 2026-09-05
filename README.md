# Grok Codex Router

[![CI](https://github.com/luinbytes/grok-codex-router/actions/workflows/ci.yml/badge.svg)](https://github.com/luinbytes/grok-codex-router/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Status: experimental and installation blocked](https://img.shields.io/badge/status-experimental%20%7C%20installation--blocked-orange.svg)](docs/install.md)

> [!WARNING]
> This is an unofficial experimental project. It patches Grok Bot and uses a private ChatGPT Codex endpoint that can change without notice. It may break a Sand VM, lose work, violate service terms, or get an account restricted or banned. Use it at your own risk.

Grok Codex Router connects Grok Bot to the ChatGPT Codex Responses endpoint without replacing Grok Bot's interface, tools, permissions, or agent loop. It routes GPT-5.6 models per agent and keeps background workloads configurable.

This repository is a public-release preparation fork of the router originally authored by [Igor Warzocha](https://github.com/IgorWarzocha). The [MIT license](LICENSE) and its attribution remain in force.

## Release status

The public installation gate is blocked. This repository does not publish a supported release or claim that the router is ready for general installation.

The current evidence has these limits:

- No App Server bridge is selected. `SELECTED_BRIDGE=none` remains required.
- The direct Responses transport is a fixture and comparison baseline. Its credential owner is not the Codex CLI, so it is not eligible for release.
- The native Grok Bot validation matrix has not run.
- Codex CLI update and rollback support is design-only. No updater or rollback command ships here.

Read [the installation gate](docs/install.md) before running any installer command. While the gate is blocked, `./install.sh` stops before dependency installation, authentication, or host mutation.

## Intended runtime

The intended runtime is a Grok Bot Sand VM on Linux x64 or Linux arm64. The project does not promise support for Windows, generic Linux hosts, macOS, or other architectures.

Local checks can run on a development machine. Passing local checks does not prove that a Sand VM, Grok Bot host, provider account, or native tool turn works.

## Install

Use the shell entry point to inspect readiness:

```bash
git clone https://github.com/luinbytes/grok-codex-router.git ~/grok-codex-router
cd ~/grok-codex-router
node --version
./install.sh --check
./install.sh --check --json
```

Install Node.js 22.19 or newer before running the check. The portable check uses Node.js and does not require Bun.

The JSON preflight is also available directly:

```bash
node scripts/install-preflight.cjs --json
```

The result uses `schemaVersion: 1`. It reports `status`, `selectedBridge`, and a `blockers` array with machine-readable `code` values. A blocked result is a stop condition. Do not run login, dependency installation, host patching, service startup, or a native turn after it.

The no-argument installer is reserved for a future eligible release. It fails closed while the public gate is blocked. Do not bypass that check with a manual package install or a copied host bundle.

The installer and `recover` command are gated. Other legacy CLI commands such as `patch-host`, `restart-host`, `service-start`, `service-restart`, `service-stop`, `on`, and `off` are not supported public installation paths. Do not use them to bypass a blocked preflight.

The dependency-install ban applies to public setup and recovery. An authorized developer may install locked dependencies in an isolated checkout for portable tests. That does not install the router or clear the release gate.

See [Install the router](docs/install.md) for the full preflight contract and [Install for agents](docs/agent-install.md) for Grok Bot agents or other assistants with shell access.

## Agent installation

The repository includes a self-contained workflow at [`.agents/skills/grok-codex-router/SKILL.md`](.agents/skills/grok-codex-router/SKILL.md). Give your Grok Bot agent the [agent guide](docs/agent-install.md) and ask it to inspect readiness from a separate checkout inside its VM. Any assisting agent must run the same preflight as the shell installer and stop when the result is blocked. Automatic Codex skill discovery is not required to follow the guide.

The shell installer and the agent workflow are two entry points to the same safety boundary. Neither entry point starts authentication or changes an installed Grok Bot while the gate is blocked.

## Configure routing

Configuration is managed through the local control UI or the CLI after an eligible installation.

- **Default** sets the model and reasoning used by ordinary agents.
- **Agents** adds an override for one discovered Grok Bot profile.
- **Task models** controls summarization, subagents, browser use, computer use, automations, and group turns.
- **Settings** selects an existing local credential store and transport mode.
- **Stats** shows retained token and latency fields.
- **Activity** shows sanitized routing and transport events.

Read [Configuration](docs/configuration.md) for the file schema, environment variables, and CLI commands. The router does not provide a login flow and must not copy or inspect credential contents.

The router does not provide a sandbox. It runs inside the existing Sand and Grok Bot permission boundary. Do not treat the router as isolation from the host, account, or provider.

## Transport and routing behavior

The production router supports cached WebSocket, WebSocket, and SSE modes. Cached WebSocket is the default. It sends a continuation delta only after validating the prior request and reconstructed response prefix.

Every request keeps a stable prompt-cache identity for its workload. Provider-reported cache reads and token use appear in retained statistics. Codex turn state remains connected across native tool calls and transport retries.

The UI and CLI can switch the saved inference source for new sessions:

```bash
grok-codex-router off
grok-codex-router on
```

An active turn finishes on its current source. The switch does not restart the host.

These routing controls describe the existing router behavior. They do not select a public-release bridge or clear the release gate.

## Verify changes

Use the portable checks for source and documentation changes:

```bash
npm run check:portable
```

The portable check performs a clean build, runs Knip, runs the non-VM test suite, and tests shell readiness behavior. Run the live VM checks only inside the intended Sand environment:

```bash
npm run check:vm
```

The existing full gate remains available with Bun:

```bash
bun run check
```

The full gate includes VM contracts. None of these commands substitutes for the missing native Grok validation matrix. Read [Development](docs/development.md) for the check boundary.

## Recovery and updates

The checked-in recovery and update material is a design record. It does not ship an updater, a candidate store, or a rollback command.

Do not use `git pull` as an update mechanism for an installed router. Do not copy a Sand host backup by hand. Keep the current installation unchanged and record a sanitized diagnostic if an existing installation needs attention:

```bash
grok-codex-router diagnose
```

Review the output privately. Never attach the Sand host bundle, OAuth files, prompts, tool arguments, request logs, or authorization data. See [Security](SECURITY.md) before reporting a problem.

## Contributing

Read [Contributing](CONTRIBUTING.md) before changing source, checks, or release documentation. Read [Development](docs/development.md) for the test split and release evidence boundary.

## Project links

- [Installation gate](docs/install.md)
- [Agent installation](docs/agent-install.md)
- [Configuration reference](docs/configuration.md)
- [Development guide](docs/development.md)
- [Release readiness](docs/release-readiness.md)
- [Security policy](SECURITY.md)
- [Issue tracker](https://github.com/luinbytes/grok-codex-router/issues)
