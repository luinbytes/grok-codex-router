# Codex CLI update and recovery design

Status: `DESIGN_ONLY`

The router must not update the Codex CLI used by the bridge until this design is implemented and verified. An unfamiliar Codex version remains inert. It must never replace a known-working runtime merely because `codex --version` succeeds.

## User experience

The planned workflow is:

```text
grok-codex-router codex status
grok-codex-router codex check-update
grok-codex-router codex update
grok-codex-router codex rollback
grok-codex-router codex diagnose
```

Grok Bot agents may run `status`, `check-update`, `rollback`, and `diagnose` without editing files. `update` stages and verifies a candidate before activation. The commands must not accept arbitrary executable, state, or installation paths.

If a candidate fails before activation, the router keeps the current runtime. If it fails the post-activation health check, the router automatically restores the previous known-good runtime and reports the rejected version. When no verified previous runtime exists, it stops and gives recovery instructions instead of guessing.

## Storage model

Use router-owned state inside the VM:

```text
state/
  codex/
    releases/<version>/<platform>-<architecture>/
    receipts/<version>.json
    active.json
    lock.json
```

Keep each complete versioned release tree. Do not copy a single executable out of its package. `active.json` is the sole activation pointer and identifies a verified receipt by digest. A lock protects staging, activation, rollback, and cleanup.

Every operation must be idempotent. The lock records the owning process and start time. Recovery may clear it only after proving that the owner is gone and that no activation is in progress. Write new state to a same-filesystem temporary file, flush it, rename it atomically, and flush the parent directory. Do not maintain paired manifests that can disagree after interruption.

## Candidate admission

The updater must use an explicit version and platform. It must obtain the official release through a reviewed, versioned installer path and verify the publisher's checksum or signature before executing it. A mutable remote installer must not be piped directly into a shell.

A candidate stays in staging until all of these pass:

1. The release source, version, platform, architecture, and package digest match an approved compatibility record.
2. The complete installed tree matches the package manifest and has safe ownership, links, modes, and ancestors.
3. `codex --version` returns the exact requested version from the staged tree.
4. Stable and experimental App Server schemas match the approved digests.
5. The signed-out isolated lifecycle passes with no inherited credentials, MCP activity, hooks, built-in tools, or unowned processes.
6. The authenticated local tool round trip passes in the router-dedicated Codex home without reading credential contents.
7. The native Grok Bot compatibility matrix passes for the exact router build, Codex release tree, Grok Bot host digest, and platform.

No individual receipt can promote a candidate. The activation receipt must bind all required evidence to the same immutable candidate and current host state. Tests must prove that forged, missing, stale, mismatched, and replayed receipts fail closed.

## Activation and rollback

Activation changes only the atomic pointer. Production launchers resolve the CLI through that pointer and revalidate its receipt and installed-tree digest before each start. They must never fall back to ambient `PATH`.

After activation, run a bounded health check through the same launcher production uses. On failure:

1. Restore the previous pointer atomically.
2. Revalidate and health-check the previous runtime.
3. Quarantine the failed candidate without deleting its evidence.
4. Record a redacted diagnostic that contains versions and digests, not paths, credentials, prompts, or tool arguments.
5. Tell the user that the update was rejected and that the bridge remains on the last known-good Codex version.

Manual rollback follows the same path. It may select only a previously verified, locally retained receipt. Cleanup must retain the active version, the previous known-good version, and any quarantined version referenced by a diagnostic.

## Update survival contract

- Grok Bot and Codex updates are separate transactions.
- Updating the router never overwrites its active CLI pointer without a successful migration and verification pass.
- Updating Codex never patches Grok Bot.
- An unknown Codex or Grok Bot version leaves production unchanged.
- Interrupted staging is removable; interrupted activation resolves to either the old or new complete pointer, never a hybrid.
- Rollback remains available offline after the candidate has been downloaded.
- The current production route stays unchanged until the native release gate selects the App Server bridge.

## Work still required

- Collect and approve official package provenance for each supported macOS and Linux architecture.
- Implement the single-state activation record, stale-lock recovery, staging quarantine, and production launcher integration.
- Define exact lifecycle-specific manifests for the dedicated Codex home or create a mutation ledger from marker-only bootstrap through official login and every later run.
- Add fault-injection tests for interruption at every write and rename boundary.
- Run the ten native Grok Bot lanes for every supported platform and compatible Grok Bot host digest.
- Test a deliberately incompatible Codex candidate and prove automatic return to the previous runtime.

Until those items pass, agents must report `DESIGN_ONLY` and direct users to pin the already working Codex CLI outside this router.
