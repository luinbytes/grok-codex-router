# Public release readiness

Status: **blocked**. This investigation covers the source merged in PR #1 and the subsequent public-preflight changes. It is not a production certification or a completed new formal security scan.

Open acceptance checklist: [release blockers #2](https://github.com/luinbytes/grok-codex-router/issues/2).

## Available now

The shell checker and agent checker share one dependency-free, non-mutating readiness result. The public `install` and `recover` commands stop before configuration, authentication, patching, or restart. Development verification separates portable fixtures from the live VM contracts. Linux and macOS CI tests source portability, not a native Grok installation.

The gate is not a sandbox around the repository. Legacy patching, routing, service, and control APIs remain for existing installations and development; they can mutate a host when deliberately invoked. They are not supported public setup alternatives. Do not use them to bypass the gate.

## Blocking findings

| Area | Evidence | Required before activation |
| --- | --- | --- |
| Subscription transport | `src/session.ts` uses the direct Responses transport; `src/oauth.ts` reads and refreshes credentials itself. The App Server code is a probe, not the production route. | Integrate the selected Codex-owned transport and prove native Grok tools, images, streaming, cancellation, and continuation. No direct fallback. |
| Codex provenance | GCR-1 receipts record unverified executable provenance. | Verify official immutable artifacts and bind compatibility evidence to their exact identities. |
| Updates and rollback | `docs/codex-update-recovery.md` is design-only; the CLI has no managed Codex update or rollback command. | Stage versioned candidates, validate before activation, retain the working runtime, and offer verified rollback after failure. |
| Install transaction | `scripts/patch-host.ts` writes the bundle directly; backup rollover and activation are not a recoverable transaction. | Atomic activation, durable backups, interruption tests, readiness checks, and recovery. |
| Install location | Injected hooks default to `~/grok-codex-router`. | Persist the resolved installation location without relying on the caller's transient environment or clone directory name. |
| Runtime portability | Supervisor defaults to `/usr/local/bin/bun`; service ownership uses Linux `/proc`. | Discover and validate the executable. Certify Linux Sand VM architectures; reject unsupported hosts explicitly. macOS source tests are not desktop-runtime support. |
| Credential location | Production OAuth lookup ignores custom `CODEX_HOME`. | Let the selected official CLI own credentials in the explicitly configured dedicated home. Do not copy tokens or extend router-owned refresh logic. |
| Service lifecycle | Startup reports before listener readiness; supervisor spawn errors and child teardown need stronger handling. | Prove readiness and owned-process cleanup, including missing executable, crash, restart, and timeout cases. |
| Build/update safety | Development builds replace `dist/` in place. | Never build in an active installation. Use immutable staged release directories for updates. |

Home-relative Sand data paths, loopback ports, protocol endpoints, and the public OAuth client ID are not personal secrets. Some are platform or protocol defaults, but they still need documented configuration and compatibility contracts. Removing every literal would not fix the installation and transport ownership problems above.

## Acceptance still required

1. Close the transport and provenance decision in [transport-decision.md](transport-decision.md).
2. Implement the install/update transaction and consent-based recovery in [codex-update-recovery.md](codex-update-recovery.md).
3. Run the [native validation matrix](gcr1-native-validation.md) in isolated supported Grok/Sand environments, including fresh installation, relocated paths, updates, failure injection, and rollback.
4. Complete a fresh security review of the final activation code and verify packaged artifacts from an immutable release.
5. Only then enable public installation and publish a production release.

This investigation did not inspect credential contents, change the running Grok Bot, or execute a native provider lane. Those boundaries remain separate from fixture and CI results.
