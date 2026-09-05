# Agent setup

## Sub-features

Dependency-free structured readiness and explicit blocking reasons.

## How to get to it (user POV)

Follow `docs/agent-install.md` from the checked-out repository.

## Driving it with Node tests

Run `node scripts/install-preflight.cjs --json`. Expect schema version 1, blocked status, no selected bridge, and four release blockers.

## Gotchas

Do not interpret exit 1 as permission to repair production or copy credentials. There is no force option.
