# Shell setup

## Sub-features

Help, human-readable readiness, JSON readiness, and invalid arguments.

## How to get to it (user POV)

Open a shell in the source checkout and run `sh install.sh --help`.

## Driving it with Node tests

Run `node --test dist/tests/install-preflight.test.js`. Also run `sh install.sh --check --json` directly. The check exits 1 with installation blocked; help exits 0; unsupported options exit 2.

## Gotchas

This does not install software. No network access, login, host patch, service startup, or restart is expected.
