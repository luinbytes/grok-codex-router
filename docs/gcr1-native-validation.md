# GCR-1 native validation

Status: `PREPARED`, `RELEASE_BLOCKED`

This runbook prepares the authenticated and native Grok evidence lanes for GCR-1. It does not authorize a bridge, run a provider turn, or change an installed Grok Bot. The release remains blocked until every lane has current native evidence and the transport decision selects one eligible App Server candidate.

## Safety boundary

Use a dedicated Codex home. Never point these commands at a person's ordinary Codex home. Authentication belongs to the official Codex CLI, and the router must not read, copy, parse, hash, or print credential bytes.

Keep every live lane in a new private directory:

```sh
GCR_LANE_DIR="$(mktemp -d "${TMPDIR:-/tmp}/gcr1-lane.XXXXXX")"
chmod 700 "$GCR_LANE_DIR"
```

Create receipts and captures with mode `0600`. Do not commit or upload the directory. Record only a redacted result, artifact basename, and SHA-256 digest in `.audit/public-release-execution.tsv`. A live authenticated probe must always pass an explicit new `--output "$GCR_LANE_DIR/<name>.json"`; its default artifact path is not suitable for private evidence.

Stop with `BLOCK` when native Grok control, the expected Sand, authentication, or process-tree containment is unavailable. Browser-only automation and a separate remote host are not substitutes for control of the native Grok process on the test machine.

## Dedicated Codex home

Prepare a new directory owned by the current user with mode `0700`. Add one private regular marker file named `.grok-codex-router-home` containing exactly `GCR_CODEX_HOME_V1` followed by a newline. Before login, the directory must contain only that marker and must not contain `auth.json`.

Authenticate only with the official CLI:

```sh
export GCR_CODEX_HOME="$HOME/.local/share/grok-codex-router/gcr1-codex-home"
CODEX_HOME="$GCR_CODEX_HOME" codex login --device-auth
```

Do not copy an existing `auth.json`. After login, the authenticated probe validates ownership, modes, link counts, the fixed marker, exact Codex compatibility, effective file-backed credential storage, and the allowed generated state without reading credentials.

## Lane matrix

Run each row from a clean native Grok conversation. A screenshot is supporting evidence only. The receipt and deny-by-default event audit determine the result.

| Lane | Contract scenario | Native evidence | Required capture |
| ---: | --- | --- | --- |
| 1 | `authentication-status` | Codex CLI owns a signed-in dedicated home; no credential bytes are exposed | `bridge-auth-status.png` |
| 2 | `plain-text` | One plain response completes through native Grok; also run the trusted image-input subcase | `bridge-plain-turn.png`, `bridge-image-turn.png` |
| 3 | `one-tool` | Grok executes the only tool and returns the matching result | `bridge-single-tool.png` |
| 4 | `parallel-tools` | Grok executes both issued calls and preserves both identities | `bridge-parallel-tools.png` |
| 5 | `stream-order` | Stream events and tool lifecycle remain in contract order | `bridge-stream-order.png` |
| 6 | `continuation` | The next turn resumes the same verified thread identity | `bridge-continuation.png` |
| 7 | `cancellation` | Requested cancellation is observed and no late work is accepted | `bridge-cancel.png` |
| 8 | `malformed-tool-results` | A malformed result fails closed without misattribution | `bridge-tool-error.png` |
| 9 | `restart-behavior` | Restart and continuation preserve the expected identity and state | `bridge-restart.png` |
| 10 | `model-and-tool-inventory` | Requested model is available and Grok is the only tool executor | `bridge-model-tools.png` |

## Receipt contract

Write one private JSON receipt per lane against [`native-lane-receipt.schema.json`](../artifacts/gcr-1/native-lane-receipt.schema.json). The receipt contains semantic state, counts, basenames, and digests. It contains no usernames, account identifiers, prompts, message bodies, tool arguments, authorization material, credential contents, or absolute paths.

A valid receipt always records `releaseEligibility` as `blocked`. Passing receipts are inputs to the transport decision; they cannot select a bridge by themselves. Any forbidden or unknown event, non-Grok tool execution, missing native control, reused artifact path, or unverifiable containment produces `FAIL` or `BLOCK`, never a partial pass.

## Completion gate

GCR-1 can move from prepared to evaluated only when all ten lane receipts validate, every required native capture has a private digest, the image subcase preserves the trusted-attachment and redaction contract, the event audit contains zero forbidden and zero unknown events, Grok executes every requested tool, and Darwin and Linux containment evidence covers descendants that create a new session.

Until then, keep `SELECTED_BRIDGE=none` and `RELEASE_GATE=BLOCKED`.
