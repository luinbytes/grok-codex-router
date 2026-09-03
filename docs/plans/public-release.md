# Public Grok Codex Router release plan

This program turns the existing Sand router into a public, versioned v0.x release for Grok Bot users with Codex subscription access.
The planning state is `RELEASE_BLOCKED` until GCR-1 records an authenticated native Sand verdict.
Under current official documentation and the pinned Codex CLI, the highest eligible release is an alpha. The required `dynamicTools` handoff is experimental, WebSocket is unsupported, and Codex CLI 0.151.0 still labels the app-server command experimental.
The support promise covers Grok Bot's Linux Sand on x86_64 and arm64. The user's host operating system stays outside the patch boundary.
The first public release ships one Codex bridge, one Sand installer, transactional recovery, and verified GitHub artifacts.
The PRs merge in order as GCR-1, GCR-2, GCR-3, GCR-4, and GCR-5. No release proceeds past a failed transport or compatibility gate.

## How to read this

One box is one unit of work. Every box names the evidence that checks it. A nested box is a sub-step of the box above it. Check a box only when its evidence exists, a file, a log line, a screenshot, a test run, or a SHA. The body is a how-to. The appendices explain and record.

The program runs `pstack/skills/poteto-mode/playbooks/autopilot-stack.md`. The root opens and audits each PR. The operator lands GCR-1 through GCR-5. GCR-3, GCR-4, and GCR-5 stop for the operator's visual review before merge.

Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

Every PR artifact uses short, concrete sentences and no abstract metaphors.

## Program checklist

### Arm the program

- [ ] State the protocol and this plan to the operator, then stop. Start execution only on explicit go.
- [ ] On explicit go, run `/goal` with this exact text. "Execute `docs/plans/public-release.md` in GCR-1 through GCR-5 order. Require unit, live, and perf evidence at every exact head. The operator merges every PR. Done means the highest release level allowed by the measured bridge installs into a clean supported Sand, completes a real Grok tool turn through Codex subscription login, survives a known Grok update, rolls back safely, and has verified public artifacts. Experimental transport may produce an alpha only."
- [ ] Read these files from trunk at program start and at every audit tick.
  - [ ] `git show origin/main:AGENTS.md`
  - [ ] `git show origin/main:src/AGENTS.md`
  - [ ] `git show origin/main:scripts/AGENTS.md`
  - [ ] `git show origin/main:control/AGENTS.md`
  - [ ] `git show origin/main:bin/AGENTS.md`
  - [ ] `git show origin/main:ui/AGENTS.md`
- [ ] Record that `git show origin/main:pstack/...` is unavailable because this repository does not vendor Pstack. Resolve the installed Poteto Mode, autopilot stack, opening a PR, technical writing, unslop, show your work, and named principle resources. Record their package version in the audit trail.
- [ ] Arm a thread heartbeat for the 30-minute audit tick. Never hold a shell open to sleep.
- [ ] Use this tick prompt verbatim. "Re-read the execution playbook and the live goal. Audit the operation against both. Probe every active lane through supported status and judge progress by side effects only. Reconcile and stand down a stuck lane before one bounded replacement. Then send the operator the queue table, verdicts since the last tick, merges, open gates, and blockers as a status message."
- [ ] On the operator's hold or stand-down, send every owner a zero-writes order at once.

### Spawn owners

- [ ] Give one owner each PR's complete file boundary, acceptance criteria, and evidence contract. Tell every owner that other work exists and must not be reverted.
- [ ] Follow this dependency graph. GCR-1 branches from current `main`. GCR-2 follows GCR-1. GCR-3 follows GCR-2. GCR-4 follows GCR-3. GCR-5 follows GCR-4.
- [ ] Keep one writer on the shared stack at a time. Parallel work is read-only transport research, fixture capture, documentation review, and release threat review.
- [ ] Hold the file boundaries in each PR section. Never edit generated `dist/`, installed Sand files, or `node_modules/` by hand.
- [ ] Hold the review gate. GCR-3, GCR-4, and GCR-5 change installation, recovery, or onboarding. They wait for the operator's screenshots and video review in chat.
- [ ] Exclude the unrelated `grokbot-shim` checkout and every dirty image-attachment worktree. Reconcile clean local bugfix branches by behavior and tests, never by blind cherry-pick.

### PR mechanics, for every PR

- [ ] Create a task branch from the exact parent SHA. Record branch, parent SHA, owner, and worktree in `.audit/public-release-execution.tsv`.
- [ ] At each verified slice boundary, commit only the scoped files and push the task branch to the user's `fork` remote. Record the exact SHA. Never push to `origin`.
- [ ] Open the PR ready, never draft, with `gh pr create` and `draft: false` only after the operator authorizes GitHub writes.
- [ ] Run `bun run check` once before the PR-facing push. Push with hooks on.
- [ ] Run the installed deslop pass before each commit and no-comments pass before review. If either skill is unavailable, use unslop and record the fallback.
- [ ] Triage every review and security finding against task scope. Fix valid findings on the same branch and resolve each thread only after fresh checks.
- [ ] Rebase onto current trunk before the merge-ready audit. Repeat all affected evidence after any head change.

### Verdict and merge, for every PR

- [ ] At the merge-ready head SHA, run one gates lane, the ten live lanes in that PR, its perf lane, and one audit lane. The audit lane reads the diff and receipts and distrusts the PR body.
- [ ] Mark the verdict clean only when every lane is `PASS`. Send findings back to the owner. A new head gets a fresh verdict.
- [ ] Compare patch IDs before and after rebase. If the patch changes, discard the old verdict and rerun the affected lanes.
- [ ] Root reports the exact merge-ready SHA. The operator lands the PR. The next PR starts from the landed parent.

### Boot recipe, for every live lane

Each lane runs against the PR head in a fresh supported Sand through a detected native Grok control capability. A missing capability blocks the lane. The ten scenarios may run serially to protect the host and any existing Codex login store.

- [ ] Fetch the branch and check out the exact head SHA. Record `git rev-parse HEAD` in the lane receipt.
- [ ] Declare the lane class as `pre-install`, `installed-runtime`, or `release-asset`. Record the required starting files, services, and auth state before setup.
- [ ] For an installed-runtime lane, create lane-local config, state, cache, backup, service, and log roots, then start the staged router and localhost control plane. Wait for `status --json` to report healthy.
- [ ] For a pre-install or release-asset lane, prove router files, state, and services are absent. Let the command under test create them. Do not run the router CLI during setup.
- [ ] Use the auth state named by the scenario. When a lane uses an existing Codex CLI login store, never copy, print, snapshot, or upload it. Signed-out lanes start without one.
- [ ] Deliver prompts and clicks only through the detected native Grok control capability. Use `grok-codex-router status --json`, `diagnose --json`, and redacted service logs as read-only diagnostics.
- [ ] Create a lane-local evidence directory with `mktemp -d`. Save `<slug>.png` and `lane-evidence.json` there with the exact machine checks, pre-state and post-state hashes, process identities, redacted event audit, and predicate result. Return both paths, exact SHA, and command transcript.
- [ ] Stop every lane-owned process and remove temporary state after its receipt is complete. Preserve only intentional screenshots, videos, and redacted logs.

## Choose the supported Codex bridge (GCR-1)

**Depends on.** None. This is the release gate for every later PR.

**Files.**

- [ ] Create `scripts/probes/codex-bridge-probe.ts` for fixture and authenticated bridge trials.
- [ ] Create `scripts/probes/app-server-candidate.ts` for local stdio JSON-RPC against a pinned Codex CLI, with dynamic-tool and local MCP variants.
- [ ] Create `scripts/probes/direct-candidate.ts` around the current Responses transport without changing production routing.
- [ ] Create `tests/transport-contract.test.ts` with recorded, redacted event fixtures.
- [ ] Create `docs/transport-decision.md` with the measured decision and support level.
- [ ] Edit `package.json` to expose the probe and contract commands.

**Build.**

- [ ] Define one bridge contract in the probe for streamed text, Grok dynamic tools, tool results, continuation, cancellation, errors, model discovery, and auth status.
- [ ] Preserve native image input through the production request-normalization boundary. Candidate adapters handle protocol events only; they never resolve attachment paths or serialize raw Grok messages.
- [ ] Run the current direct bridge, App Server dynamic tools, and an App Server local MCP proxy through the same ten contract scenarios. Use App Server stdio only. Do not use its unsupported WebSocket transport.
- [ ] Use App Server over its default stdio transport. Treat non-experimental methods as the stable API surface, but treat `dynamicTools` and every other capability-gated field as experimental. Codex CLI 0.151.0 also labels the app-server command experimental, so permit only an alpha release today.
- [ ] Grant stable eligibility only when release-day official documentation supports the exact non-experimental path for production and it passes every scenario, leaves Grok as the sole tool executor, lets Codex CLI own auth, and exposes no built-in command or file tool.
- [ ] Treat the MCP proxy as research-only unless it proves a passive schema and call envelope. Reject it if App Server owns tool execution, approval, continuation, retry, or a second agent loop.
- [ ] Audit every App Server item against a deny-by-default allowlist. Any command, filesystem, terminal, web, approval, unexpected MCP, or unknown event blocks stable eligibility.
- [ ] Keep the direct bridge as a read-only benchmark and fixture source. Its raw credential access makes it ineligible for every public artifact, including alpha.
- [ ] Permit an alpha only when an App Server candidate passes every safety case with official Codex-owned auth. If no App Server candidate passes, stop the program.
- [ ] Record the selected bridge, rejected bridge, pinned Codex version, event schema hash, limitations, and removal trigger in `docs/transport-decision.md`.

**You see.**

- [ ] `bun run probe:bridges` ends with `SELECTED_BRIDGE=<app-server-dynamic|app-server-mcp|none>` and `RELEASE_GATE=PASS`, or exits nonzero with `RELEASE_GATE=BLOCKED`. Direct results are reported only as `BASELINE_BRIDGE=direct`.
- [ ] The same receipt prints `STABLE_RELEASE=<eligible|blocked>` and `ALPHA_RELEASE=<eligible|blocked>`. It starts blocked until live evidence exists.
- [ ] The decision document names evidence for every contract case and contains no unverified stable claim.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `tests/transport-contract.test.ts` rejects missing deltas, duplicate tool calls, reordered tool results, dropped cancellation, invalid continuation, hidden built-in tools, secrets in logs, and unknown event schemas. Run `bun run check`.
- [ ] After `bugfix/grokbot-local-image-attachments` has a stable commit, rebase or port it without copying the uncommitted worktree. Run its native-byte, trusted-root, traversal, symlink, size, MIME, and non-image-redaction wire tests.
- [ ] Replay every redacted fixture with `bun run probe:bridges -- --fixtures-only`. Save `artifacts/gcr-1/fixture-report.json`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on `gpt-5.6-terra` at the PR head, per the boot recipe.

- [ ] Lane 1. Check ChatGPT subscription login through all candidates without printing the credential store. Save `bridge-auth-status.png`. Pass when each candidate reports the same signed-in workspace or a documented candidate failure and no token appears.
- [ ] Lane 2. Ask for a text-only answer and then describe a native image through all candidates. Save `bridge-plain-turn.png` and `bridge-image-turn.png`. Pass when every completed stream preserves text order, the image reaches Codex without exposing bytes or paths in the receipt, and the decision receipt classifies each failure.
- [ ] Lane 3. Force one harmless Grok tool call through all candidates. Save `bridge-single-tool.png`. Pass when Grok executes exactly one named tool and receives exactly one result.
- [ ] Lane 4. Request two independent harmless Grok tools through all candidates. Save `bridge-parallel-tools.png`. Pass when call IDs, arguments, and results remain paired with no built-in Codex tool execution.
- [ ] Lane 5. Capture streamed reasoning summary and answer deltas through all candidates. Save `bridge-stream-order.png`. Pass when each supported event maps once and in order.
- [ ] Lane 6. Continue a completed conversation through all candidates. Save `bridge-continuation.png`. Pass when the second turn uses prior context without replaying the first tool side effect.
- [ ] Lane 7. Interrupt an active turn through all candidates. Save `bridge-cancel.png`. Pass when generation stops, late deltas are ignored, and the next turn succeeds.
- [ ] Lane 8. Return a malformed tool result through all candidates. Save `bridge-tool-error.png`. Pass when the turn fails closed with an actionable error and the router stays healthy.
- [ ] Lane 9. Restart each bridge between turns. Save `bridge-restart.png`. Pass when auth remains valid, continuation behavior matches the contract, and no duplicate response is emitted.
- [ ] Lane 10. Inspect model discovery and tool inventory through all candidates. Save `bridge-model-tools.png`. Pass when a redacted raw-item allowlist report proves models are discovered, no built-in tool item appeared, only Grok tool IDs were requested, and the decision rule selects one App Server mode or blocks release.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Measure p95 time to first assistant delta and peak resident memory for each bridge.
- [ ] Probe. Run ten interleaved plain turns per candidate after two warmups with the same model, prompt, account, Sand, and network window. Save raw samples and summary JSON.
- [ ] Baseline. Record the current direct bridge on trunk first.
- [ ] Rule. The selected bridge must keep p95 latency within 15 percent of trunk and peak memory within 50 MiB of trunk. A slower candidate loses unless the direct bridge fails the safety contract.

**Review gate.** None. GCR-1 adds evidence and a bridge decision but changes no user interaction.

**Merge.**

- [ ] Root records a clean verdict at the exact head SHA and links all ten lane receipts.
- [ ] Review and security findings are resolved with evidence.
- [ ] The PR is rebased onto current trunk and its patch ID is unchanged after the verdict.
- [ ] The operator merges only when `RELEASE_GATE=PASS` names exactly one bridge.

## Package one portable router runtime (GCR-2)

**Depends on.** GCR-1 merged with one selected bridge.

**Files.**

- [ ] Create `src/codex-bridge.ts` as the production boundary selected by GCR-1.
- [ ] Create `src/app-server-bridge.ts` for the App Server mode selected by GCR-1.
- [ ] Edit `src/session.ts`, `src/turn-execution.ts`, `src/transport.ts`, `src/config.ts`, and `src/diagnostics.ts` to use the selected boundary.
- [ ] Delete `src/oauth.ts`, `src/sse-transport.ts`, `src/websocket-transport.ts`, and private transport helper modules from production code.
- [ ] Edit `scripts/patch-host.ts` and `tests/host-patch.test.ts` to retain current summarization boundaries and duplicate-anchor rejection.
- [ ] Create `scripts/package-runtime.ts` and `tests/package-runtime.test.ts`.
- [ ] Edit `package.json`, `README.md`, and `AGENTS.md` for the fork name, repository links, runtime contract, and source ownership.

**Build.**

- [ ] Implement only the App Server mode selected by GCR-1. Delete every direct auth, transport, header, stream, continuation, retry, and dependency path from the staged runtime.
- [ ] Use a pinned official Codex CLI, `codex login status`, and `model/list`. Never read, parse, refresh, copy, or log the credential store.
- [ ] Preserve the existing Grok wire and turn contract, Grok-owned tools, cancellation, continuation, current summarization boundary support, and duplicate-anchor rejection.
- [ ] Replace personal repository paths, fixed home directories, fixed Bun paths, and fixed model lists with runtime discovery and XDG-aware configuration.
- [ ] Build staged x86_64 and arm64 runtime trees with compiled router code, static UI, and one release-owned pinned Bun runtime. Users do not clone Git, install npm packages, compile TypeScript, or run `bun link`.
- [ ] Keep Bun for v0.x because telemetry uses `bun:sqlite`. Include its license and digest, never use a global Bun, and block packaging if its distribution terms do not permit the exact archive.
- [ ] Port behavior from `bugfix/current-summary-anchor` and `bugfix/host-update-recovery` only where a failing test proves origin main lacks it. Reconcile the image attachment behavior only from its stable commit; never copy its dirty worktree.

**You see.**

- [ ] `bun run package:runtime` creates `artifacts/runtime/linux-x64/` and `artifacts/runtime/linux-arm64/` with the CLI, router, control service, patcher, UI, pinned Bun, licenses, notice, and manifest.
- [ ] Each runtime manifest contains no absolute user path, token, private key, mutable branch URL, or unpinned tool version.
- [ ] Starting the staged CLI prints the selected bridge and discovered supported models without mentioning the original developer's home directory.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Extend routing, continuation, stream decoding, recovery, wire, and host patch tests for the selected bridge and both known host summary boundaries. Run `bun run check`.
- [ ] `tests/package-runtime.test.ts` extracts both staged trees under random homes, rejects undeclared files and absolute paths, and starts `status --json` without a source checkout or system Bun. Run `bun test tests/package-runtime.test.ts`.
- [ ] Run `rg -n '/Users/|/home/[^$]|/usr/local/bin/bun|IgorWarzocha|howaboua' artifacts/runtime`. Pass only when allowed license and notice attribution are the sole matches.
- [ ] Run `rg -n 'chatgpt.com/backend-api|src/oauth|sse-transport|websocket-transport' artifacts/runtime`. Pass only with no matches.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on `gpt-5.6-terra` at the PR head, per the boot recipe.

- [ ] Lane 1. Start the staged runtime from a random home with no source checkout present and complete a plain Codex turn. Save `runtime-random-home.png`. Pass when the access audit names only the staged install, XDG roots, Sand host, and official Codex paths.
- [ ] Lane 2. Complete one Grok tool turn with the selected bridge. Save `runtime-tool-turn.png`. Pass when Grok owns the tool call and one result returns.
- [ ] Lane 3. Continue a tool conversation after a router restart. Save `runtime-continuation.png`. Pass when context survives and the prior side effect does not repeat.
- [ ] Lane 4. Cancel a long turn and start another. Save `runtime-cancel.png`. Pass when the first ends once and the second completes.
- [ ] Lane 5. Switch between Codex and native inference using current controls. Save `runtime-provider-switch.png`. Pass when the change applies without a router restart and native mode still works.
- [ ] Lane 6. Select two discovered Codex models in successive turns. Save `runtime-model-discovery.png`. Pass when both offered models route correctly and no fixed local list overrides discovery.
- [ ] Lane 7. Return an invalid tool payload. Save `runtime-invalid-tool.png`. Pass when the turn shows an actionable error and the service remains healthy.
- [ ] Lane 8. Remove network access during a turn, then restore it. Save `runtime-network-recovery.png`. Pass when the failure is bounded and a retry succeeds without reinstall.
- [ ] Lane 9. Start two turns close together. Save `runtime-overlap.png`. Pass when lane and continuation isolation prevent crossed deltas or results.
- [ ] Lane 10. Open the localhost control UI from the staged package. Save `runtime-control-ui.png`. Pass when health, provider, model, and recent redacted activity render with no source checkout.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Measure cold CLI startup, router idle memory, and packaged byte size.
- [ ] Probe. Run five interleaved starts from trunk and head under random homes, then sample idle memory after sixty seconds and measure the staged tree.
- [ ] Baseline. Record trunk from a clean source install first.
- [ ] Rule. Head cold startup and idle memory may regress by at most 10 percent. The compressed runtime for either architecture must stay under 40 MiB or the PR blocks for an explicit artifact review.

**Review gate.** None. GCR-2 preserves the existing interaction and changes packaging internals.

**Merge.**

- [ ] Root records a clean verdict at the exact head SHA and verifies the losing bridge is absent.
- [ ] Review and security findings are resolved with evidence.
- [ ] The PR is rebased onto GCR-1's landed head and its patch ID is unchanged after the verdict.
- [ ] The operator merges after the staged runtime completes a native Grok tool turn.

## Install and remove the router as one transaction (GCR-3)

**Depends on.** GCR-2 merged with one staged runtime.

**Files.**

- [ ] Replace `install.sh` with a small POSIX bootstrap that runs inside Grok Sand without root.
- [ ] Create `scripts/install.ts`, `scripts/check-secret-isolation.ts`, `src/install-state.ts`, `src/paths.ts`, and `src/release-manifest.ts`.
- [ ] Create the minimum current-host registry in `compat/hosts.json` and its validator in `src/host-compatibility.ts`.
- [ ] Edit `scripts/package-runtime.ts` and `tests/package-runtime.test.ts` so every release-like tree includes the validated current-host registry.
- [ ] Edit `bin/grok-codex-router.ts` to add `install`, `update`, `rollback`, `uninstall`, `status`, `doctor`, and `diagnose` commands.
- [ ] Edit `src/control-service.ts`, `src/sand-supervisor.ts`, `src/diagnostics.ts`, and `scripts/restart-host.ts` for discovered paths and transactional health checks.
- [ ] Create `tests/installer.test.ts`, `tests/install-state.test.ts`, `tests/host-compatibility.test.ts`, and `tests/fixtures/install/`.
- [ ] Create `docs/install.md` and `docs/uninstall.md` with the Sand-only support boundary and recovery steps.

**Build.**

- [ ] Make the install boundary the user's Grok Sand. Support Linux x86_64 and arm64. Do not patch macOS, Windows, WSL, Docker, or host Grok files directly.
- [ ] Generate one release-specific command whose visible SHA-256 pins the downloaded bootstrap before execution. Do not publish a pipe-to-shell shortcut.
- [ ] Declare POSIX `sh`, `curl`, `mktemp`, `sha256sum`, and archive extraction as the supported Sand bootstrap contract. Fail before managed-target mutation when one is absent.
- [ ] Detect the Sand host, writable user paths, architecture, libc, bootstrap commands, existing router state, and existing Codex CLI login before any mutation.
- [ ] Build one validated `InstallContext` that owns release, config, state, cache, host, supervisor, control, log, runtime, architecture, and compatibility paths. Pass it to every lifecycle component.
- [ ] Use XDG defaults with flags for every path. Never assume `/usr/local/bin/bun`, `~/sand-host`, `~/sand-data`, or a repository checkout.
- [ ] Verify and use the release-owned pinned Bun from the architecture-specific runtime tree. Never select a global or unrelated user Bun.
- [ ] If the selected bridge needs Codex CLI, download its pinned official release and verify it. Do not redistribute it unless its license and release terms allow that exact artifact.
- [ ] Implement a versioned install journal with absent, staging, installed, rolling-back, and failed states. Store it with mode `0600` under the state root.
- [ ] Acquire one cross-process lifecycle lock before mutation. Use a unique temporary file for every config, state, host, and release write.
- [ ] Install versioned release directories side by side, retain one prior release, and switch a `current` link atomically only after candidate verification.
- [ ] Make the injected host hook reference the stable `current` install path. A router update or rollback must not rewrite the host when its patch contract is unchanged.
- [ ] Require the live host to match the full pristine SHA-256 and unique anchors in the current-host registry before the first install may patch it.
- [ ] Stage every file beside its target, verify manifest hashes and host anchors, syntax-check the patched host, fsync files and parent directories, then atomically rename. Start services only after all disk state is committed.
- [ ] On any failure, stop lane-owned services, restore only the matching pristine host snapshot, remove the staged release, and leave a redacted diagnostic receipt.
- [ ] Make repeated `install`, `update`, `rollback`, and `uninstall` calls idempotent. Never restore an old host snapshot over a newer Grok host.
- [ ] Remove only manifest-owned files whose current hash still matches. Preserve drifted files and print their exact safe recovery action.
- [ ] Preserve the Codex login store in place. Never copy it into router state. If login is absent, finish installation safely and print the official `codex login --device-auth` next step.
- [ ] Make `check-secret-isolation.ts` emit only pre-state and post-state file hashes, forbidden-copy counts, and a boolean verdict. It never prints credential content or reusable token hashes.
- [ ] Bind the control plane to loopback, create service directories with mode `0700`, create secret-bearing files with mode `0600`, and redact auth headers, tokens, tool payload secrets, and account identity from logs.

The release generator emits this command shape with an immutable tag and real digests.

```sh
sh -c 'set -eu; v=v0.1.0-alpha.1; f=$(mktemp); trap '\''rm -f "$f"'\'' EXIT; curl -fsSL "https://github.com/luinbytes/grok-codex-router/releases/download/$v/install.sh" -o "$f"; printf "%s  %s\n" INSTALLER_SHA256 "$f" | sha256sum -c -; sh "$f" --release "$v" --manifest-sha256 MANIFEST_SHA256'
```

**You see.**

- [ ] The pinned one-line command ends with `INSTALL_STATE=installed`, the installed version, selected bridge, host compatibility ID, and `NEXT_ACTION=none` or the official login command.
- [ ] A second run ends with `INSTALL_STATE=installed` and `ACTION=no-op` without restarting a healthy service.
- [ ] `grok-codex-router doctor` performs a read-only preflight and prints one actionable next step for every failed check.
- [ ] `grok-codex-router uninstall` restores native Grok behavior and leaves Codex credentials untouched.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `tests/installer.test.ts` covers clean install, existing install, wrong architecture, bad checksum, unavailable download, unwritable path, missing host, missing auth, interrupted download, interrupted patch, and failed health check. Run `bun run check`.
- [ ] `tests/install-state.test.ts` explores every legal state transition and rejects stale journals, path traversal, symlink escapes, broad deletion targets, and mismatched host snapshots. `tests/host-compatibility.test.ts` rejects an unknown hash before patching. Run both tests.
- [ ] Run the bootstrap in disposable containers for Linux x86_64 and arm64 with only its declared base commands. Save `artifacts/gcr-3/container-matrix.json`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on `gpt-5.6-terra` at the PR head, per the boot recipe.

- [ ] Lane 1. Run the pinned command in a clean x86_64 Grok Sand, then request one named harmless Grok tool. Save `install-clean-x64.png`. Pass when the transaction commits, Grok executes the tool once, the result returns, and the App Server item audit shows no second executor.
- [ ] Lane 2. Run the pinned command in a clean arm64 Grok Sand, then request the same named harmless Grok tool. Save `install-clean-arm64.png`. Pass when the manifest contract, tool ownership, result, and event audit match lane 1.
- [ ] Lane 3. Run install twice in the same Sand. Save `install-idempotent.png`. Pass when the second run is a no-op and service identity remains stable.
- [ ] Lane 4. Corrupt one downloaded byte. Save `install-bad-checksum.png`. Pass when no target changes, no service starts, and the checksum error names the asset.
- [ ] Lane 5. Interrupt after staging and rerun. Save `install-resume.png`. Pass when the journal drives cleanup or resume and ends in one installed release.
- [ ] Lane 6. Remove the Codex login store before install. Save `install-no-login.png`. Pass when installation succeeds without a copied secret and prints the official device login action.
- [ ] Lane 7. Point the installer at an unknown host file. Save `install-unknown-host.png`. Pass when it fails closed before patching and native Grok remains healthy.
- [ ] Lane 8. Run `status --json` and `diagnose --json` after install. Save `install-diagnostics.png`. Pass when paths, hashes, versions, and service state are useful and all identity data is redacted.
- [ ] Lane 9. Hash the credential store, uninstall a healthy installation, and hash it again. Save `install-uninstall.png`. Pass when native Grok completes a turn, router processes stop, managed files are gone, the two file hashes match, and the secret-isolation report passes.
- [ ] Lane 10. Force the post-patch health check to fail. Save `install-rollback.png`. Pass when the matching pristine host returns atomically and native Grok completes a turn.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Measure cold install duration, warm no-op duration, peak installer memory, and service downtime.
- [ ] Probe. Run five interleaved installs from trunk and head with the same warm asset cache, then repeat head once with a cold cache on each architecture.
- [ ] Baseline. Record trunk's documented clone, dependency install, build, link, patch, and restart path first.
- [ ] Rule. Warm head install must finish within 60 seconds, a no-op within 10 seconds, peak memory within 256 MiB, and service downtime within 20 seconds. Any limit breach blocks merge even if head beats trunk.

**Review gate.** The operator reviews the complete install and removal interaction before merge.

- [ ] Copy the lane 1, 3, 6, 7, 9, and 10 screenshots into `docs/media/gcr-3-review-<slug>.png`.
- [ ] Record a 45 to 90 second video showing the pinned command, a successful Codex tool turn, a repeat no-op, diagnose output, uninstall, and native Grok recovery. Save it as `docs/media/gcr-3-review.mp4`.
- [ ] Post the screenshots and video in chat with the exact SHA. Stop at merge-ready and wait for the operator's approval.

**Merge.**

- [ ] Root records a clean verdict at the exact head SHA and verifies every destructive target is lane-local or installer-owned.
- [ ] Review and security findings are resolved with evidence.
- [ ] The PR is rebased onto GCR-2's landed head and its patch ID is unchanged after the verdict.
- [ ] The operator merges only after approving the install, diagnosis, rollback, and uninstall interaction.

## Recover safely across Grok host updates (GCR-4)

**Depends on.** GCR-3 merged with the transactional installer.

**Files.**

- [ ] Edit `compat/hosts.json` and `src/host-compatibility.ts` to add retained-version update states and records.
- [ ] Edit `scripts/patch-host.ts`, `src/recovery.ts`, `src/install-state.ts`, `control/reconcile.ts`, and `src/control-service.ts`.
- [ ] Edit `tests/host-patch.test.ts`, `tests/recovery.test.ts`, and `tests/vm-contract.test.ts`.
- [ ] Create sanitized fixtures under `tests/fixtures/hosts/<host-version>/` with pristine hashes and expected markers.
- [ ] Create `scripts/capture-host-fixture.ts` and `scripts/check-compatibility.ts`.
- [ ] Create `docs/compatibility.md` and edit the control UI files that show compatibility and recovery state.

**Build.**

- [ ] Define each known host by Grok version, pristine SHA-256, patcher revision, required unique anchors, expected injected markers, and patched SHA-256.
- [ ] Model absent, pristine-known, patched-current, changed-unknown, and interrupted states as an exhaustive tagged union. Reject an impossible state before disk mutation.
- [ ] Require every anchor exactly once in the pristine input and every marker exactly once in the patched output. Keep `scripts/patch-host.ts` as the sole patch owner.
- [ ] On startup, compare the live host with installed state and the compatibility registry. Patch a new known host through the GCR-3 transaction. Leave an unknown host untouched and keep native inference available.
- [ ] Key pristine snapshots by their source hash. Restore a snapshot only when the currently installed patch record names that exact source. Never copy an older snapshot over a newer Grok host.
- [ ] Recover stale PIDs, private service directory permissions, interrupted journals, and a control child crash without widening file permissions or restarting unrelated processes.
- [ ] Add `grok-codex-router recover` for a bounded retry after a known host arrives. Make `diagnose` explain unknown version, hash, missing anchor, duplicate marker, and safe next action.
- [ ] Sanitize proprietary host fixtures to the smallest structural slices allowed for tests. Do not publish a complete Grok host bundle.
- [ ] Keep the compatibility registry data-only. A new known host needs a fixture, patch tests, live update evidence, and a release. It never downloads executable patch logic at runtime.

**You see.**

- [ ] A known Grok update changes status from `HOST_STATE=changed-known` to `HOST_STATE=patched-current` and completes one Codex turn without manual file repair.
- [ ] An unknown Grok update reports `HOST_STATE=changed-unknown`, preserves the new host bytes, leaves native inference usable, and links the compatibility support page.
- [ ] The control UI shows installed router release, live host version and hash prefix, compatibility state, last recovery action, and a redacted error when blocked.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `tests/host-patch.test.ts` covers every known fixture, old and current summary anchors, duplicate anchors, duplicate markers, truncated input, already patched input, and unknown hash. Run `bun run check`.
- [ ] `tests/recovery.test.ts` covers known update, unknown update, stale PID, mode repair, interrupted transaction, failed restart, matching rollback, mismatched rollback, and repeated recovery. Run `bun test tests/recovery.test.ts`.
- [ ] `scripts/check-compatibility.ts` verifies registry schema, unique hashes, fixture coverage, expected markers, and no complete proprietary host artifact. Save `artifacts/gcr-4/compatibility-report.json`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on `gpt-5.6-terra` at the PR head, per the boot recipe.

- [ ] Lane 1. Install on the oldest retained known Grok version. Save `compat-old-install.png`. Pass when the matching registry entry patches once and a Codex tool turn completes.
- [ ] Lane 2. Update that Sand to the current known Grok version. Save `compat-known-update.png`. Pass when recovery patches the new pristine host and conversation routing returns without an old snapshot restore.
- [ ] Lane 3. Substitute a structurally changed unknown host. Save `compat-unknown-update.png`. Pass when the bytes remain unchanged, native inference works, and Codex routing is marked blocked.
- [ ] Lane 4. Interrupt after the new host snapshot but before patch commit. Save `compat-interrupted.png`. Pass when restart reconciles to pristine-known or patched-current with no mixed state.
- [ ] Lane 5. Kill the router child during a Codex turn. Save `compat-child-crash.png`. Pass when the supervisor restarts only its child and a later turn succeeds.
- [ ] Lane 6. Leave a stale PID and restart control. Save `compat-stale-pid.png`. Pass when no unrelated process is signalled and the owned child starts once.
- [ ] Lane 7. Widen the service directory mode before recovery. Save `compat-private-mode.png`. Pass when recovery restores mode `0700` and secret files remain `0600`.
- [ ] Lane 8. Add one manual byte to a patched host. Save `compat-manual-change.png`. Pass when recovery refuses automatic overwrite and reports the changed hash.
- [ ] Lane 9. Roll back after a known update. Save `compat-matching-rollback.png`. Pass when only the matching current host snapshot is restored and native Grok works.
- [ ] Lane 10. Uninstall after two known Grok updates. Save `compat-update-uninstall.png`. Pass when the current host returns to its matching pristine bytes and the oldest snapshot is never restored.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Measure automatic recovery downtime and compatibility scan duration.
- [ ] Probe. Run ten interleaved known-update recoveries and one hundred fixture scans on GCR-3 parent and GCR-4 head with identical Sand snapshots.
- [ ] Baseline. Record GCR-3 manual diagnose, reinstall, and restart downtime first, plus its single-host scan time.
- [ ] Rule. Known-update recovery must restore healthy routing within 30 seconds and each compatibility scan within 250 ms. No automatic recovery may restart more than one owned host service and one owned control child.

**Review gate.** The operator reviews known and unknown update behavior before merge.

- [ ] Copy the lane 2, 3, 4, 8, 9, and 10 screenshots into `docs/media/gcr-4-review-<slug>.png`.
- [ ] Record a 45 to 90 second video showing a known update recovery, an unknown update fail-closed state, diagnose output, and preserved native inference. Save it as `docs/media/gcr-4-review.mp4`.
- [ ] Post the screenshots and video in chat with the exact SHA. Stop at merge-ready and wait for the operator's approval.

**Merge.**

- [ ] Root records a clean verdict at the exact head SHA and independently hashes the before and after host files.
- [ ] Review and security findings are resolved with evidence.
- [ ] The PR is rebased onto GCR-3's landed head and its patch ID is unchanged after the verdict.
- [ ] The operator merges only after approving known recovery and unknown fail-closed behavior.

## Publish verified public release artifacts (GCR-5)

**Depends on.** GCR-4 merged with approved install and update recovery.

**Files.**

- [ ] Create `.github/workflows/ci.yml`, `.github/workflows/release.yml`, and `.github/workflows/dependency-review.yml`.
- [ ] Create `scripts/build-release.ts`, `scripts/verify-release.ts`, `scripts/check-transport-support.ts`, and `scripts/generate-install-command.ts`.
- [ ] Create `SECURITY.md`, `SUPPORT.md`, `CONTRIBUTING.md`, `NOTICE`, and `docs/support-matrix.md`.
- [ ] Create `.github/CODEOWNERS`, issue forms, and a pull request template.
- [ ] Edit `README.md`, `LICENSE`, `package.json`, `AGENTS.md`, and every public repository or issue link.
- [ ] Create `tests/release-artifacts.test.ts` and `tests/public-docs.test.ts`.

**Build.**

- [ ] Keep `luinbytes/grok-codex-router` as the public fork with its upstream history. Preserve Igor Warzocha's MIT notice and add clear fork attribution. Do not rewrite authorship.
- [ ] Mark the package private to npm and remove accidental npm publication metadata. GitHub Releases are the only public distribution channel in v0.x.
- [ ] Run credential, private path, proprietary fixture, generated artifact, dependency, and license scans on the repository and reachable history. If a secret is found, stop publication and rotate it before any history decision.
- [ ] Run credential-free lint, typecheck, unit, fixture, installer container, compatibility, and package checks for public pull requests. Never expose Codex subscription credentials to forked pull requests.
- [ ] Put authenticated provider and native Grok acceptance behind a protected GitHub environment and explicit operator approval. Keep those receipts redacted and out of artifacts.
- [ ] Build immutable Linux x86_64 and arm64 runtime archives with the UI, compatibility registry, license, notice, install manifest, and uninstall support.
- [ ] Publish `install.sh`, both runtime archives, `SHA256SUMS`, a signed checksum statement, SPDX SBOMs, and GitHub artifact attestations. Pin every action by commit SHA and use least-privilege permissions.
- [ ] Generate the primary one-line command from the release tag, immutable installer URL, and visible installer SHA-256. Never use `main` or an unpinned `latest` URL as the recommended command.
- [ ] Create the GitHub Release as a draft, upload all assets, download them into a clean verifier, check hashes, signatures, attestations, archive contents, version, commit, and installer command, then publish only after acceptance.
- [ ] At release preparation, fetch the official App Server Markdown, record its URL, retrieval time, content SHA-256, pinned Codex version, exact selected protocol fields, and reviewed support status in `artifacts/gcr-5/transport-support.json`. Attest that receipt with the release workflow.
- [ ] Reject every RC or stable tag unless the release-day receipt explicitly records the exact selected path as non-experimental and supported for production. Technical success alone cannot override official support status.
- [ ] If GCR-1 selected an experimental App Server path, publish `v0.1.0-alpha.1` as a prerelease and do not mark it latest. If a release-day receipt later permits a supportable official path, publish an RC first and promote the same accepted commit to `v0.1.0` only on a separate explicit release approval.
- [ ] Make the README, installer, `status --json`, support matrix, release title, and release notes show the same support label. CI rejects any mismatch.
- [ ] Write the README for a first-time user. State the supported Sand, ChatGPT subscription requirement, one-line install, official device login, first turn, status, doctor, update, rollback, uninstall, known host matrix, limitations, and support route.
- [ ] Keep GitHub Releases as the changelog. Make release jobs idempotent and reject a tag, draft, or asset that points to a conflicting commit.

**You see.**

- [ ] The public release page contains only verified assets for one commit and a copyable version-pinned command with its visible installer digest.
- [ ] A fresh reader can identify support status, supported architectures, compatible Grok versions, auth ownership, update policy, rollback, uninstall, and alpha limitations without reading source.
- [ ] The repository landing page links to the correct owner, issue tracker, security policy, support matrix, upstream attribution, and latest eligible release.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `tests/release-artifacts.test.ts` verifies archive allowlists, executable modes, manifest hashes, version agreement, license and notice presence, no absolute paths, and no secret-shaped values. Run `bun run check`.
- [ ] `tests/public-docs.test.ts` verifies every documented command against generated help, rejects mutable install URLs, validates the transport-support receipt schema, and requires alpha warnings when the selected bridge is experimental. Run `bun test tests/public-docs.test.ts`.
- [ ] Run the release workflow in dry-run mode at the exact head and save `artifacts/gcr-5/release-verification.json`, both SBOMs, and attestation receipts.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on `gpt-5.6-terra` at the PR head, per the boot recipe.

- [ ] Lane 1. Download the draft x86_64 assets into a clean Sand and run the generated command. Save `release-install-x64.png`. Pass when all digests and the attested release-day transport receipt verify and one Codex tool turn completes.
- [ ] Lane 2. Download the draft arm64 assets into a clean Sand and run the generated command. Save `release-install-arm64.png`. Pass when all digests verify and one Codex tool turn completes.
- [ ] Lane 3. Follow only the README from a clean signed-out Sand. Save `release-first-user.png`. Pass when install finishes, the official login action is clear, and no repository checkout is needed.
- [ ] Lane 4. Tamper with the installer, manifest, and runtime in three attempts. Save `release-tamper.png`. Pass when every attempt stops before target mutation with the failed layer named.
- [ ] Lane 5. Complete official device login after install. Save `release-device-login.png`. Pass when `codex login status` becomes ready, the credential file hash changes only through Codex CLI, and the secret-isolation report finds no credential copy in router-owned paths.
- [ ] Lane 6. Complete a native Grok tool and delivery turn through the installed release. Save `release-native-turn.png`. Pass when the final response reaches Grok and all tool IDs match.
- [ ] Lane 7. Apply one known Grok update to the released install. Save `release-known-update.png`. Pass when automatic recovery returns healthy routing within the GCR-4 limit.
- [ ] Lane 8. Update from the prior router release to the candidate, then roll back. Save `release-router-rollback.png`. Pass when the current link switches atomically, one prior release remains, and both versions pass status at their turn.
- [ ] Lane 9. Remove network access during asset download and retry. Save `release-download-retry.png`. Pass when partial assets never execute and retry converges without manual cleanup.
- [ ] Lane 10. Uninstall using only README instructions. Save `release-public-uninstall.png`. Pass when native Grok works, managed files are absent, credentials are unchanged, and the support receipt contains no identity data.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Measure public cold install duration, archive bytes, release verification duration, and first-turn overhead.
- [ ] Probe. Run five public-asset installs per architecture, interleaved with five GCR-4 local-asset installs, under the same network window and model. Verify every asset on each run.
- [ ] Baseline. Record GCR-4 local staged install and first-turn values first.
- [ ] Rule. Public install must finish within 120 seconds and no more than 30 seconds slower than local staging. Each runtime archive must stay under 50 MiB. First-turn overhead may regress by at most 10 percent.

**Review gate.** The operator reviews the public onboarding and release page before publication.

- [ ] Copy the lane 1, 2, 3, 4, 6, 7, and 10 screenshots into `docs/media/gcr-5-review-<slug>.png`.
- [ ] Record a 60 to 120 second video from the public README through install, device login, one native Grok tool turn, status, update, rollback, and uninstall. Save it as `docs/media/gcr-5-review.mp4`.
- [ ] Post the screenshots, video, draft release link, and exact SHA in chat. Stop before publication and wait for the operator's approval.

**Merge.**

- [ ] Root records a clean verdict at the exact head SHA and verifies the draft assets against a clean download.
- [ ] Review, dependency, license, and security findings are resolved with evidence.
- [ ] The PR is rebased onto GCR-4's landed head and its patch ID is unchanged after the verdict.
- [ ] The operator merges GCR-5. A separate explicit release approval publishes the prerelease, RC, or stable tag allowed by the GCR-1 support decision.

## Close the program

- [ ] Every box above is checked with its named evidence, or the program is explicitly blocked at the first failed release gate.
- [ ] The selected release level matches `docs/transport-decision.md`. An experimental bridge can produce a public prerelease but never a stable or latest release.
- [ ] The public repository, exact merged SHA, tag, release level, asset digests, attestations, supported Sand matrix, known Grok matrix, and native acceptance receipt agree.
- [ ] No owner process, temporary service, validation container, watcher, checkout, or credential copy remains after evidence capture.
- [ ] Reply to the operator with the five PR links and SHAs, merge state, release URL, one-line command, acceptance evidence, limitations, and any stable-transport blocker.

## Appendix A. Prototype evidence

No authenticated transport or native Grok prototype ran during planning. This host had no Sand host, installed router CLI, supervisor status, Sand data directory, or native Grok control capability. The prototype branch and SHA are therefore none. GCR-1 owns the transport bakeoff and cannot pass without live Sand evidence.

Repository inspection used the clean `docs/public-release-plan` worktree based on `origin/main` at `599a2013b15592d17fe897126f549974351e4c3f`. The separate uncommitted image attachment worktree was not touched. Local summary and host recovery branches still contain unique commits, but origin main has overlapping newer behavior. Execution must reconcile behavior through tests rather than cherry-pick any branch wholesale.

Current source evidence shows a development-checkout installer. It requires Git, Node, Bun, dependency installation, compilation, global linking, host patching, restart, and authenticated verification. The direct SSE and WebSocket transports call a private ChatGPT Codex Responses endpoint, while `src/oauth.ts` parses and refreshes another client's credential store. Those facts make the transport decision and credential owner release gates.

Current official Codex documentation says ChatGPT sign-in provides subscription access. It lists stdio as the default App Server transport and separates a stable API surface from capability-gated experimental fields. WebSocket is experimental and unsupported. `dynamicTools` is experimental. The pinned Codex CLI 0.151.0 also labels the app-server command experimental. GCR-1 must test stable-only fields, a research-only local MCP proxy, dynamic tools, and the current direct transport benchmark. A functionally passing experimental App Server path can support an alpha, not a stable claim. The direct path cannot ship because it reads and refreshes another client's credentials.

Open questions that remain live evidence tasks are the native command path available to an average Grok user, arm64 Sand parity, access to one retained prior Grok version, the exact safe official tool bridge, and native Grok automation capability. GCR-1, GCR-3, and GCR-4 fail closed when those cannot be proved.

## Appendix B. Alternatives rejected

- Package the current checkout unchanged. It lost because it builds from mutable source, uses global linking, owns raw OAuth refresh, and can restore an unowned backup.
- Declare App Server the answer before testing. It lost because dynamic tools remain experimental and App Server has a distinct event and agent lifecycle that needs a real adapter.
- Keep direct and App Server as permanent production fallbacks. It lost because two auth and continuation owners create drift and ambiguous support.
- Rewrite the full runtime to remove Bun before release. It lost because Bun SQLite is localized and a pinned user-local runtime is cheaper to prove than a telemetry rewrite.
- Build native macOS, Windows, and Linux host installers. It lost because the patch target lives inside the common Grok Sand and host-wide support multiplies discovery and rollback risk.
- Merge the standalone `grokbot-shim` project into this repository. It lost because that project is a separate runtime experiment, not the installed router's release boundary.
- Convert the repository into a monorepo. It lost because current module boundaries already separate runtime, control, patching, CLI, tests, and static UI.
- Recommend a mutable `curl` command from `main` or `latest`. It lost because the user cannot know which bytes will execute. The primary command pins a release URL and installer digest.
- Detach or rewrite the public fork. It lost because the fork already provides transparent lineage and the MIT license permits distribution with preserved notice.

## Appendix C. Risks

- GCR-1 watches upstream transport support. The private endpoint remains a benchmark and blocks public distribution. A passing experimental App Server path limits the result to a prerelease. A schema or terms change can block release.
- GCR-1 watches agent ownership. App Server must not silently run built-in tools or a second autonomous loop around Grok's tools.
- GCR-2 watches credential ownership. The staged runtime must contain no direct OAuth reader, refresh writer, private endpoint, or copied credential.
- GCR-2 watches model drift. Hardcoded model names and context limits must be replaced by discovery or a versioned fallback registry.
- GCR-3 watches bootstrap trust. The command pins the installer digest, and the release page attests the command and installer. No pipe-to-shell shortcut is supported.
- GCR-3 watches filesystem races. A cross-process lock, versioned journal, unique temporary files, fsync, syntax check, and atomic rename are mandatory.
- GCR-3 watches secret exposure. Diagnostic errors, absolute credential paths, service logs, crash reports, screenshots, and videos need redaction.
- GCR-4 watches proprietary host drift. Unknown host bytes stay untouched. Compatibility updates need sanitized fixtures and live evidence for each known version.
- GCR-4 watches backup ownership. A snapshot restores only when its full source hash matches the installed patch record.
- GCR-4 watches shared writers. Config, recovery, and telemetry state need separate owners and a serialized mutation boundary where they meet.
- GCR-5 watches supply chain. Actions are SHA-pinned, permissions are minimal, assets are immutable, SBOMs and attestations are verified, and forked PRs receive no credentials.
- GCR-5 watches legal and naming boundaries. Preserve upstream MIT notice, audit third-party distribution terms, avoid OpenAI or xAI endorsement claims, and keep experimental labels visible.
- Every PR watches the missing native Grok control capability. A screenshot or source review cannot substitute for a driven native turn. Missing control blocks the affected lane.
- The native-image fix remains uncommitted in a separate worktree. No PR copies or resets it. After it has a stable commit, GCR-1 must reconcile its wire behavior and pass the native-image bridge subcase before selecting a transport.

## Appendix D. Links and reading list

Read the repository instructions in `AGENTS.md`, `src/AGENTS.md`, `scripts/AGENTS.md`, `control/AGENTS.md`, `bin/AGENTS.md`, and `ui/AGENTS.md` before each owned scope. Read `src/session.ts`, `src/turn-execution.ts`, `src/oauth.ts`, `src/transport.ts`, `scripts/patch-host.ts`, `control/reconcile.ts`, `src/sand-supervisor.ts`, `install.sh`, and `tests/vm-contract.test.ts` before changing shared behavior.

Official references are `https://learn.chatgpt.com/docs/auth` for subscription login and credential storage, and `https://learn.chatgpt.com/docs/app-server` for App Server lifecycle, stdio transport, model discovery, MCP support, experimental APIs, and dynamic tools.

Execution uses the installed Poteto Mode runtime contract, `playbooks/autopilot-stack.md`, `playbooks/opening-a-pr.md`, technical writing, unslop, show your work, and the live control capability detected for Grok Sand. GCR-1, GCR-3, GCR-4, and GCR-5 use the full live swarm. Every PR gets the audit lane and perf lane.

The principles changed concrete choices. Laziness kept Bun for v0.x. Foundational thinking created one install context, bridge boundary, compatibility record, and journal before installer branches. Experience first put the command, doctor, rollback, and uninstall in the primary path. Outcome-oriented execution requires one production bridge. Idempotency requires convergent lifecycle commands. Prove it works split unit, live Sand, provider, and native Grok evidence. Sequence work into verifiable units made the stack linear. Encode lessons in structure created machine-checked manifests and states. Subtract before add excluded the shim, monorepo, native host installers, and permanent dual transports. Model the domain and type discipline require tagged install and host states. Boundary discipline made Sand the support boundary. Build the lever created bridge, compatibility, package, and release checkers. Exhaust the design space compares direct, App Server dynamic tools, and an App Server MCP bridge. Never block on the human turns technical unknowns into measurable gates while reserving publication and interaction judgment for the operator. Guard context requires instruction rereads and append-only evidence.

The append-only planning trail is `.audit/grok-codex-router-public-release-plan.tsv`. A generic Poteto delegate inspected the repository read-only because a custom profile was unavailable. It ran no provider request, edited no file, and independently identified the private transport, unowned backup, non-atomic patch, hardcoded paths, missing workflows, and Sand-only portability boundary.
