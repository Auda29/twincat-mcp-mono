![Pi TwinCAT ADS Extension](./logo.png)

# twincat-mcp

Official TwinCAT MCP monorepo for ADS-backed packages:

- `twincat-mcp-core`: transport-agnostic ADS runtime and safety model
- `pi-twincat-ads`: Pi extension package backed by the core runtime
- `twincat-mcp`: MCP stdio server backed by the core runtime

The packages share one TypeScript workspace and one ADS domain layer. Protocol
adapters stay thin: Pi owns lifecycle hooks and context injection, MCP owns MCP
tool registration and stdio transport, and the core owns ADS operations.

## Packages

| Package | Path | Purpose |
| --- | --- | --- |
| `twincat-mcp-core` | `packages/core` | Config validation, `AdsService`, runtime operations, watches, write gates |
| `pi-twincat-ads` | `packages/pi` | Pi extension, tools, hooks, skill bundle, local smoke runner |
| `twincat-mcp` | `packages/mcp` | MCP stdio server exposing the same core PLC operations as tools |

## Workspace Commands

```bash
npm run check
npm run check:workspace
npm test
npm run build
npm run pack:dry-run
```

The root test command runs Core, Pi, and MCP tests separately. The workspace
check verifies internal Core dependencies stay on the matching package version.
`pack:dry-run` validates package contents for all three published packages.

## Configuration

All packages use the same core runtime config. Router mode is the default and is
the usual choice when the host already has a working ADS router:

```json
{
  "connectionMode": "router",
  "targetAmsNetId": "localhost",
  "targetAdsPort": 851,
  "readOnly": true,
  "writeAllowlist": [],
  "contextSnapshotSymbols": [],
  "notificationCycleTimeMs": 250,
  "maxNotifications": 128,
  "maxWaitUntilMs": 600000,
  "services": {
    "plc": {
      "targetAdsPort": 851,
      "symbolGroups": {}
    },
    "nc": {
      "targetAdsPort": 500,
      "axes": []
    },
    "io": {
      "targetAdsPort": 300,
      "dataPoints": [],
      "groups": {}
    }
  },
  "diagnostics": {
    "maxEvents": 50,
    "maxLogBytes": 65536,
    "eventSources": [
      {
        "id": "local-windows-application",
        "kind": "windowsEventLog",
        "logName": "Application",
        "providerNames": ["TwinCAT", "Beckhoff", "TcSysSrv", "TcSysUi", "TcIoSrv", "TcNc", "TcEvent"],
        "commandTimeoutMs": 8000
      }
    ],
    "logSources": [
      {
        "id": "local-windows-application-log",
        "kind": "windowsEventLog",
        "logName": "Application",
        "providerNames": ["TwinCAT", "Beckhoff", "TcSysSrv", "TcSysUi", "TcIoSrv", "TcNc", "TcEvent"],
        "commandTimeoutMs": 8000
      }
    ]
  }
}
```

Direct mode is available when no local ADS router is available and the client
connects directly to the PLC or router endpoint:

```json
{
  "connectionMode": "direct",
  "targetAmsNetId": "192.168.1.120.1.1",
  "targetAdsPort": 851,
  "routerAddress": "192.168.1.120",
  "routerTcpPort": 48898,
  "localAmsNetId": "192.168.1.50.1.1",
  "localAdsPort": 32000,
  "readOnly": true,
  "writeAllowlist": [],
  "services": {
    "plc": {
      "targetAdsPort": 851,
      "symbolGroups": {
        "machine": ["MAIN.State", "MAIN.Mode"]
      }
    },
    "nc": {
      "targetAdsPort": 500,
      "axes": [
        { "name": "X", "id": 1 }
      ]
    },
    "io": {
      "targetAdsPort": 300,
      "dataPoints": [
        {
          "name": "Input1",
          "indexGroup": 61472,
          "indexOffset": 128000,
          "type": "BOOL"
        }
      ],
      "groups": {
        "inputs": ["Input1"]
      }
    }
  }
}
```

Common fields:

- `targetAmsNetId`: target AMS Net ID, or `localhost` for loopback
- `targetAdsPort`: PLC runtime ADS port, usually `851`
- `readOnly`: config-level write gate, defaults to `true`
- `writeAllowlist`: exact symbol names allowed for writes
- `contextSnapshotSymbols`: symbols read for Pi lifecycle context
- `notificationCycleTimeMs`: default watch cycle time, default `250`
- `maxNotifications`: local notification cap, default `128`
- `maxWaitUntilMs`: maximum accepted `plc_wait_until` timeout, default `600000`
- `services.plc.targetAdsPort`: effective PLC ADS port, default `851`
- `services.plc.symbolGroups`: named PLC symbol groups for `plc_read_group`
- `services.nc.targetAdsPort`: NC ADS port, default `500`
- `services.nc.axes`: configured NC axes for `nc_list_axes`, `nc_read_axis`, and `nc_read_error`
- `services.io.targetAdsPort`: IO ADS port, default `300`
- `services.io.dataPoints`: named IO raw ADS addresses with `indexGroup`, `indexOffset`, and type
- `services.io.groups`: named IO data point groups for `io_read_group`
- `diagnostics.eventSources`: sources for `tc_event_list` and `tc_runtime_error_list`
- `diagnostics.logSources`: sources for `tc_log_read`; supports local Windows Event Log and configured files
- `diagnostics.maxEvents` / `diagnostics.maxLogBytes`: caps for diagnostic output

`tc_diagnose_errors` and `tc_diagnose_runtime` are deliberately small bundles
over these same sources. Prefer the individual tools when you already know the
exact PLC symbol, NC axis, IO point, event source, or log source. Use the combo
tools for first-pass triage when the user asks for "what is wrong right now?"
or a compact TwinCAT-wide runtime health check.

## Safety Model

Writes are blocked unless all three gates allow them:

1. Config gate: `readOnly` must be `false`.
2. Runtime gate: write mode must be switched to `enabled`.
3. Symbol gate: the exact symbol name must be listed in `writeAllowlist`.

The safe default is read-only everywhere. Read tools, state tools, and watches
remain available while writes stay blocked.

## Pi Usage

Install the Pi package after it has been published or packed:

```bash
pi install npm:pi-twincat-ads
```

The Pi package registers `./dist/pi-extension.js` and the bundled
`./skills/twincat-ads` skill directory. It accepts configuration through:

- `--plc-config ./plc.config.json`
- `PI_TWINCAT_ADS_CONFIG=./plc.config.json`
- `PI_TWINCAT_ADS_CONFIG_JSON='{"connectionMode":"router",...}'`

For live local checks without a Pi host, use the built package smoke runner:

```bash
npm run smoke:local -- --config ./local.config.json --symbol MAIN.someValue --watch-symbol MAIN.someValue
```

See `packages/pi/README.md`, `docs/local-dev-test.md`, and
`docs/manual-smoke-test.md` for the full Pi flow.

## MCP Usage

Run the MCP server after build or install:

```bash
twincat-mcp --config ./plc.config.json
```

Config can also be supplied with `TWINCAT_ADS_CONFIG` or environment variables
such as `TWINCAT_ADS_TARGET_AMS_NET_ID`. MCP exposes PLC reads, writes,
symbol description, configured groups, watches, wait-until operations, NC
read-only axis diagnostics, IO read-only data point/group reads, and
TwinCAT-wide runtime diagnostics (`tc_state`, `tc_event_list`,
`tc_runtime_error_list`, `tc_log_read`, `tc_diagnose_errors`,
`tc_diagnose_runtime`) as tools. Watches are modeled as normal tools, not as MCP
resources or subscriptions yet.

See `packages/mcp/README.md` for tool names and configuration details.

## Migration

The former single-package `pi-twincat-ads` layout has been split into Core, Pi,
and MCP packages. Existing Pi users should keep installing `pi-twincat-ads`;
the package now depends on `twincat-mcp-core` internally. New non-Pi consumers
should use `twincat-mcp-core` directly or run `twincat-mcp`.

See `docs/migration.md` for package mapping and behavior notes.

## Release

Release order:

1. `twincat-mcp-core`
2. `pi-twincat-ads`
3. `twincat-mcp`

See `docs/release-flow.md` for publish checks, version policy, and the Pi npm
publish workflow.

## Repository

- Remote: [github.com/Auda29/twincat-mcp-mono](https://github.com/Auda29/twincat-mcp-mono)
- License: [MIT](LICENSE)
