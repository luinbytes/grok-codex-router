# Public release arena synthesis

## Pick

Candidate 1 is the base. It keeps GCR-1 as a decision-only gate, rejects a permanent MCP or direct fallback, and defines the clearest fail-closed install and recovery contract.

The cross-judge scored Candidates 1, 2, and 3 at 22, 21, and 23 of 25. It still chose Candidate 1 as the safer base because Candidate 3 coupled bridge proof and production adoption in one PR.

## Grafts

- From Candidate 2, release labels must follow current official documentation at the release SHA. A technically passing path remains alpha-only while its exact command or API is experimental or unsupported for production.
- From Candidate 2, the README, installer, status output, support matrix, release title, and release notes must agree on the support label.
- From Candidate 2, Codex CLI cannot be bundled or redistributed unless its exact license and release terms permit that artifact path.
- From Candidate 3, planning begins at `RELEASE_BLOCKED` until an authenticated native Sand receipt exists.
- From Candidate 3, the host hook points to a stable `current` install root so router updates and rollback do not rewrite the Grok host.
- From Candidate 3, a local MCP bridge is research-only unless an official passive-envelope contract proves Grok owns tool execution, approval, retry, and continuation.
- All candidates and the cross-judge proposed four PRs. The lead retained five after reading every rationale because GCR-2 produces a runnable, measured release tree before GCR-3 gains destructive lifecycle authority. That boundary keeps bridge packaging review separate from host mutation, rollback, and uninstall review.

## Rejections

- Candidate 1's initial stable App Server assumption was rejected. Current official documentation keeps `dynamicTools` experimental and WebSocket unsupported, while Codex CLI 0.151.0 labels the app-server command experimental.
- Candidate 2's proposed stable MCP proxy was rejected as unproved. Current documentation describes App Server-mediated MCP calls and approvals, not a passive Grok-owned hand-back loop.
- Candidate 3's combined proof and production-adapter PR was rejected. The first PR must be able to stop without changing production routing.
- The four-PR compression was rejected by the lead. Combining production bridge migration, package construction, path discovery, installer bootstrap, host mutation, service restart, rollback, and uninstall in one PR creates a larger failure and review domain. Five is the smallest safe decomposition because the packaged runtime is independently executable and verified before installation code may mutate a host.

## Candidate receipts

- Candidate 1 has SHA-256 `6bd7d291ae405c67772ad8ac416a57d92c6e7581af78efa99bb5be68c3367b85`.
- Candidate 2 has SHA-256 `9c29c78c201ff1ded3fb1f4a63d39ec06b6dc6b0e7a8aa42246d6acf0e3c940e`.
- Candidate 3 has SHA-256 `d43ee95529fe7e274e0a029373790dd9f5bb3befa074b139587f40393c9bae30`.
- The cross-judge has SHA-256 `7119733ea6e6fadb5a0fd80751d4ac3daedb10e3e69d150fdeb099f36fb562d4`.

No candidate dropped out. Every candidate used an isolated temporary directory.

## Verification

The technical-writing and unslop passes are complete. The adversarial review findings were either incorporated or dismissed with evidence. The Poteto plan checker and final diff audit passed after the last revision.
