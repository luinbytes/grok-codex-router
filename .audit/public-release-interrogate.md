# Public release plan adversarial review

## Intent

Produce an executable plan for a safe one-command public release of Grok Codex Router. The plan starts blocked, targets supported Grok Sand only, leaves credentials with the official Codex client, ships one bridge, treats experimental transport as alpha-only, and makes host mutation transactional and fail-closed.

## Reviewers

- Reviewer A used the Arena judgment runner and returned eight findings.
- Reviewer B used the Arena fast runner and was interrupted after it failed to return within the bounded review window. It produced no finding.
- Reviewer C used the independent cross-judge runner and returned five findings.

## Act on

- Direct transport credential ownership. Reviewer A found that even an alpha direct bridge would violate official Codex credential ownership. The plan now keeps direct transport as a benchmark only and blocks release unless an App Server mode passes.
- Compatibility ordering. Reviewer A found that the installer rejected unknown hosts before a registry existed. GCR-3 now creates and tests the minimum current-host registry. GCR-4 extends it for updates.
- Release-day support evidence. Reviewer A found that stable promotion lacked a fresh official support receipt. GCR-5 now records and attests the official documentation hash, retrieval time, Codex version, exact protocol fields, and reviewed status. RC and stable tags fail without explicit production support.
- Live setup state. Reviewer C found that the shared boot recipe pre-installed the service before clean-install lanes. The recipe now declares pre-install, installed-runtime, and release-asset classes and preserves each scenario's required starting state.
- Machine evidence. Reviewer C found that screenshots could not prove negative predicates. Every lane now emits `lane-evidence.json`, and sensitive lanes require redacted item audits, access audits, before and after file hashes, and secret-isolation reports.
- Bootstrap contract and native turns. Reviewer A found undeclared command dependencies and weak architecture predicates. GCR-3 now declares its base commands and requires one named Grok-owned tool turn on x86_64 and arm64.

## Consider

- Four PRs versus five. The Arena favored four. The lead retained five because the packaged runtime is independently runnable and GCR-3 adds destructive mutation, rollback, and uninstall. This is a review and revert boundary, not a placeholder phase.

## Noted

- Reviewer B timed out. Two independent reviewers agreed on the stale PR-count mismatch that a stalled worker introduced. That mismatch is fixed and the checker now sees all five PRs.

## Dismissed

- A stale local Pstack checkout was reported missing. The plan does not use that path. Poteto Mode is resolved through the Codex plugin cache, and the program checklist treats it as an installed resource rather than a repository file.
- The PR-count, goal marker, and review-gate findings described a stale intermediate file after an interrupted four-PR rewrite. The plan was restored to a consistent five-PR sequence before final verification.

## Agreement map

Both completed reviewers found the temporary PR-count mismatch. Reviewer A uniquely found credential ownership, compatibility ordering, release-day support evidence, bootstrap dependencies, and weak tool-turn predicates. Reviewer C uniquely found the boot-state conflict and machine-evidence gap. Every high-confidence actionable finding was incorporated.
