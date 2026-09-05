# Development

This guide separates portable source checks from live VM checks and native release evidence.

## Development environment

Use Node.js 22.19 or newer and Bun 1.4 or newer. Node.js 22.19 is the package minimum. CI currently tests Node.js 26.5. Use the CI version when you need to reproduce CI exactly. The intended runtime target is a Grok Bot Sand VM on Linux x64 or Linux arm64.

The repository can run portable checks on a development host. Those checks do not prove that a Sand host, Grok Bot process, provider account, or native tool turn works.

## Prepare a clean checkout

Clone into a directory that is separate from any active installation. Never build an active installation because the clean build replaces `dist/`.

```bash
git clone https://github.com/luinbytes/grok-codex-router.git ~/grok-codex-router-dev
cd ~/grok-codex-router-dev
bun install --frozen-lockfile --ignore-scripts
```

The dependency install is for isolated development. It does not authenticate an account, patch a host, start a service, or clear the public release gate.

## Source layout

Treat these paths as canonical:

- `src/` owns the router, transport, OAuth boundary, and turn state.
- `control/` owns the optional local control service, telemetry, and recovery orchestration.
- `scripts/` owns checked host patching, probes, and process helpers.
- `bin/` owns the thin CLI composition layer.
- `ui/` owns the dependency-free local control UI.
- `tests/` owns portable contracts and explicit VM contracts.

Do not hand-edit `dist/`, `node_modules/`, or an installed Sand bundle.

## Run the portable gate

Run the portable gate for normal source and documentation work:

```bash
npm run check:portable
```

The portable gate performs a clean build, runs Knip, runs all non-VM tests, and checks shell readiness behavior. It must not contact OpenAI, read credentials, start a provider turn, or mutate a host.

Run the source preflight directly when you need the machine-readable release boundary:

```bash
node scripts/install-preflight.cjs --json
```

The result uses `schemaVersion: 1`. Keep `status: blocked` and `selectedBridge: none` until the transport decision and native matrix change them.

## Run the VM gate

Run the live VM gate only inside the intended Grok Bot Sand VM:

```bash
npm run check:vm
```

The VM gate checks live host compatibility, the patched bundle, the package entry point, the Sand supervisor, service state, local agent discovery, and private file modes. It requires VM-owned state that is absent from a normal development checkout.

The historical full gate remains available:

```bash
bun run check
```

It includes VM contracts and the telemetry check. Record which checks ran and which environment-dependent checks were skipped or blocked.

## Native release evidence

Native release evidence is separate from both test gates. A release candidate needs the ten-lane native Grok matrix, Codex CLI ownership of authentication, platform-specific executable provenance, tool-executor provenance, and process containment evidence.

The checked-in fixture and local App Server probes remain release-blocked. Do not select a bridge, publish an installation, or describe a portable test as native acceptance.

## Documentation and review

Keep the README short and task-oriented. Use `docs/install.md` for shell installation, `docs/agent-install.md` for agent behavior, and `docs/configuration.md` for lookup.

Run a prose pass before committing. Remove credentials, private receipts, raw logs, stale manual rollback commands, and claims that exceed the current evidence.
