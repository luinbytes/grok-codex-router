# Configuration reference

This page describes the router configuration file and its supported environment variables. The current public installation gate is blocked. Configuration changes do not select a release bridge.

## Configuration file

The router reads a JSON file from this path:

```text
$SAND_CODEX_ROUTER_CONFIG
```

If `SAND_CODEX_ROUTER_CONFIG` is unset, it uses:

```text
$SAND_DATA_ROOT/grok-codex-router.json
```

If `SAND_DATA_ROOT` is also unset, it uses:

```text
~/sand-data/grok-codex-router.json
```

The router validates the whole document before writing it. It writes the file with mode `0600`.

## Schema

The top-level fields are:

| Field | Values | Default |
| --- | --- | --- |
| `version` | `1` | `1` |
| `enabled` | `true` or `false` | `true` |
| `authStore` | `pi` or `codex` | `pi` |
| `contextWindows` | One value per router model | `272000` for each model |
| `default` | A model and reasoning effort | `gpt-5.6-sol`, `high` |
| `agents` | Immutable profile ID to route map | `{}` |
| `classes` | Workload class to route map | `gpt-5.6-sol`, `high` for each class |
| `transport` | Transport mode and retry count | `cached-websocket`, `5` |

The accepted router models are `gpt-5.6-sol`, `gpt-5.6-luna`, and `gpt-5.6-terra`.

The accepted reasoning efforts are `off`, `none`, `minimal`, `low`, `medium`, `high`, `xhigh`, and `max`.

The accepted context windows are `272000`, `472000`, and `872000` tokens. The CLI also accepts `272k`, `472k`, and `872k`.

The accepted transport modes are `cached-websocket`, `websocket`, and `sse`.

The workload classes are `summarization`, `subagent`, `browser`, `computer`, `automation`, and `group`.

Example shape:

```json
{
  "version": 1,
  "enabled": true,
  "authStore": "pi",
  "contextWindows": {
    "gpt-5.6-sol": 272000,
    "gpt-5.6-luna": 472000,
    "gpt-5.6-terra": 872000
  },
  "default": {
    "model": "gpt-5.6-sol",
    "reasoningEffort": "high"
  },
  "agents": {},
  "classes": {
    "summarization": { "model": "gpt-5.6-sol", "reasoningEffort": "high" },
    "subagent": { "model": "gpt-5.6-sol", "reasoningEffort": "high" },
    "browser": { "model": "gpt-5.6-sol", "reasoningEffort": "high" },
    "computer": { "model": "gpt-5.6-sol", "reasoningEffort": "high" },
    "automation": { "model": "gpt-5.6-sol", "reasoningEffort": "high" },
    "group": { "model": "gpt-5.6-sol", "reasoningEffort": "high" }
  },
  "transport": {
    "mode": "cached-websocket",
    "maxRetries": 5
  }
}
```

Do not add credential bytes, account identifiers, prompts, message bodies, or tool arguments to this file.

## CLI commands

Run these commands only after an eligible installation exists:

```bash
grok-codex-router status
grok-codex-router agents
grok-codex-router routes
grok-codex-router on
grok-codex-router off
grok-codex-router default gpt-5.6-sol high
grok-codex-router route "Agent Name" gpt-5.6-sol high
grok-codex-router class summarization gpt-5.6-luna medium
grok-codex-router auth-store pi
grok-codex-router context-window luna 472k
grok-codex-router recover
grok-codex-router diagnose
```

`route` resolves a profile name against live profiles and stores its immutable ID. `auth-store` selects an existing local store. It does not start login or copy credentials. `on` validates the configured store before enabling Codex routing. `off` returns new sessions to native inference.

## Environment variables

| Variable | Purpose | Default |
| --- | --- | --- |
| `SAND_CODEX_ROUTER_CONFIG` | Exact router configuration path | `$SAND_DATA_ROOT/grok-codex-router.json` |
| `SAND_DATA_ROOT` | Router state, agent data, telemetry, and recovery root | `~/sand-data` |
| `SAND_CODEX_ROUTER_PORT` | Local control service port | `21371` |
| `SAND_CODEX_ROUTER_HOME` | Installed router package root | The installed package root |
| `SAND_HOST_DIR` | Sand host directory | `~/sand-host` |
| `SAND_CODEX_ROUTER_BUN` | Bun executable used by the control supervisor | `/usr/local/bin/bun` |
| `SAND_CODEX_ROUTER_SERVICE_LOG` | Control supervisor log path | `/tmp/grok-codex-router-service.log` |
| `SAND_CODEX_ROUTER_LOG` | Router event log path | `$SAND_DATA_ROOT/grok-codex-router.log` |
| `SAND_SUPERVISOR_DIR` | Sand supervisor state directory | `/tmp/sand-supervisor` |

Set these variables only for a deliberate local or VM setup. Do not use them to point the router at another person's credentials, an installed bundle from an unrelated checkout, or a host that the compatibility check did not approve.

`SAND_CODEX_ROUTER_BUN` defaults to `/usr/local/bin/bun` in the current supervisor. That path is a legacy default, not a release contract. The installer and CI checks must establish the runtime explicitly.

The host hook currently falls back to `~/grok-codex-router` when `SAND_CODEX_ROUTER_HOME` is unset. That fallback is legacy behavior and is not a supported public installation path.

`CODEX_HOME` does not select the production router's OAuth store. The router uses the configured `authStore` and its existing local store. Do not copy credentials to make another path work.

## Release boundary

These settings control the existing router. They do not make the direct transport release-eligible, select an App Server bridge, provide rollback, or satisfy the native Grok matrix. Read [Install the router](install.md) before changing installation state.
