# Compiled installation commands

## Sub-features

Installation and recovery both stop at the shared gate.

## How to get to it (user POV)

After a development build, invoke `node dist/bin/grok-codex-router.js install` or `recover`.

## Driving it with Node tests

Run `node --test dist/tests/install-preflight.test.js`. Both commands must exit 1 and print `INSTALL_STATE=blocked` even when host and credential paths are unavailable.

## Gotchas

Legacy developer commands are not an alternative supported installation path. Do not run host mutation or provider commands to bypass the gate.
