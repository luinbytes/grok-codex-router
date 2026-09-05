---
name: verify-grok-codex-router
description: Verify Grok Codex Router's public shell and agent preflight CLI without touching a running Grok Bot, credentials, or provider.
---

# Verify public setup

## Launch

Work from a disposable source checkout, never the checkout loaded by a running host. With development dependencies installed, run `npm run check:portable`. No service is started. The intended runtime is the Grok Sand Linux VM; portable tests do not certify a native installation.

## Doctor

Run `node scripts/install-preflight.cjs --json`. Exit 1 with `status: "blocked"`, `selectedBridge: "none"`, and `activationImplemented: false` is the current expected result. Any ready result is a regression until the native release gates are implemented and accepted.

## Drive

Run `sh install.sh --help`, then `sh install.sh --check --json`. Expect exit 0 for help and exit 1 for the check. Run `node dist/bin/grok-codex-router.js install` and `recover`; both must exit 1 with `INSTALL_STATE=blocked` before accessing host or credential state. Use `node --test dist/tests/install-preflight.test.js` to exercise these entrypoints in temporary homes, a checkout path containing spaces, absent host/data paths, and an unreadable credential directory. The fixture verifies its directory inventory is unchanged.

## Evidence

Keep the command, exit code, JSON report, test summary, and checkout commit in a private file outside the checkout, for example in a directory created with `mktemp -d`. Do not capture auth files, environment dumps, host bundles, prompts, or provider output. A passing preflight test proves rejection, not successful activation. No provider, browser, login, or production service command is part of this verification.

## Cleanup

These commands terminate themselves. The fixture removes its own temporary directories. Confirm no child process remains and preserve the private evidence file. Do not stop unrelated services or delete the evidence.

## Helpers

`scripts/install-preflight.cjs` is the shared dependency-free checker. `scripts/test.cjs portable` runs compiled portable tests; it requires the prior build. See [the feature map](features/README.md) for entrypoint coverage.
