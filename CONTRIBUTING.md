# Contributing

Contributions must preserve the router's safety boundary and its distinction between local evidence, VM evidence, and native Grok release evidence.

This repository is a public-release preparation fork of work originally authored by [Igor Warzocha](https://github.com/IgorWarzocha). Keep the copyright notice in [LICENSE](LICENSE). Use the `luinbytes/grok-codex-router` repository for issues and pull requests.

## Before you change a file

Read the nearest `AGENTS.md` file. Treat `src/`, `control/`, `scripts/`, `bin/`, and `ui/` as the source of truth. Do not edit `dist/`, `node_modules/`, or an installed Sand bundle by hand.

Keep credentials, prompts, message bodies, tool arguments, authorization headers, and account identifiers out of source, fixtures, logs, and documentation. Use redacted fixtures for protocol work.

Do not claim that the public release is ready. The current gate remains blocked because no bridge is selected, the direct transport does not use the Codex CLI as its credential owner, and the native Grok validation matrix has not run.

The installer and `recover` command are gated. Other legacy commands such as `patch-host`, `restart-host`, `service-start`, `service-restart`, `service-stop`, `on`, and `off` do not establish release eligibility and are not supported public installation paths.

## Development checks

Use Node.js 22.19 or newer and Bun 1.4 or newer for the full repository workflow. The intended runtime target is a Linux x64 or Linux arm64 Grok Bot Sand VM.

Run the portable gate first:

```bash
npm run check:portable
```

This command cleans the build output, builds the TypeScript sources, runs Knip, runs every non-VM test, and checks the shell installer readiness path. It must not contact OpenAI, start Grok Bot, read an OAuth store, or patch a host. An authorized developer may install locked dependencies in an isolated checkout for this test; that is not a public installation.

Run the VM gate only on the intended Sand VM:

```bash
npm run check:vm
```

This command covers live VM contracts. It requires the host bundle, supervisor, data root, local service, and other VM-owned state that portable checks do not provide.

The full historical gate remains:

```bash
bun run check
```

The full gate includes VM contracts and the telemetry check. Passing it does not authorize a public release. Native Grok validation is a separate ten-lane matrix.

The router does not provide a sandbox. Keep the existing Sand and Grok Bot permission boundary in scope when reviewing changes.

Inspect the release gate without changing state:

```bash
node scripts/install-preflight.cjs --json
```

The preflight result has `schemaVersion: 1`, `status`, `selectedBridge`, and a `blockers` array. Keep the result blocked until the transport decision and native matrix provide current evidence.

## Documentation changes

Keep each guide in one Diátaxis mode. Use the README for orientation, `docs/install.md` for installation steps, `docs/configuration.md` for lookup, and `docs/development.md` for contributor workflow.

Document the command or file that a reader must use. Do not document a manual host-bundle copy, an ambient `git pull` update, or a rollback path that the repository does not ship.

When a guide describes a release decision, name the evidence that would change it. Do not turn a fixture pass, a local App Server probe, or a green portable check into native provider acceptance.

## Pull requests

Keep a pull request focused. Include the affected paths, the checks you ran, and any VM or native evidence that remains outstanding.

Do not add a release badge, version claim, or installation success claim while the preflight reports `status: blocked` and `selectedBridge: none`.
