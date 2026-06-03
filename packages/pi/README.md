![Pi TwinCAT ADS Extension](./logo.png)

# pi-twincat-ads

Pi extension for reading, watching, and safely writing TwinCAT PLC values over
ADS.

This package is the Pi adapter for the monorepo. ADS logic is provided by
`twincat-mcp-core`; this package owns Pi extension registration, tool wrappers,
lifecycle hooks, context injection, and the bundled skill.

## Install

```bash
pi install npm:pi-twincat-ads
```

The package manifest registers:

- extension entry: `./dist/pi-extension.js`
- skill directory: `./skills`

## Bundled Skills

The package ships two Pi skills:

- `twincat-ads`: Pi-specific Runtime/ADS tool guidance for PLC, NC, IO, watches,
  write gates, and TwinCAT runtime diagnostics.
- `twincat-xae-project-guidelines`: agent-neutral guidance for offline TwinCAT
  XAE/Visual Studio project-file work, including PLC project XML, POUs, GVLs,
  DUTs, tasks, I/O devices, boxes, and terminals.

The XAE skill source lives centrally under
`packages/skills/twincat-xae-project-guidelines`. It is copied into this
package by the Pi `prepack` lifecycle and removed again by `postpack`, so npm
artifacts contain the skill without maintaining a second manual copy.

## Configuration

The Pi adapter accepts configuration through:

- `--plc-config ./plc.config.json`
- `PI_TWINCAT_ADS_CONFIG=./plc.config.json`
- `PI_TWINCAT_ADS_CONFIG_JSON='{"connectionMode":"router",...}'`

Default local config:

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

For direct mode, include `routerAddress`, `routerTcpPort`, `localAmsNetId`, and
`localAdsPort`.

## Tools

Read and discovery:

- `plc_list_symbols`
- `plc_describe_symbol`
- `plc_read`
- `plc_read_many`
- `plc_list_groups`
- `plc_read_group`
- `plc_state`

`plc_state` includes ADS connection state, write gates, watch count, and a
readable PLC runtime status summary such as `Run` or `Stop`.

Configured groups are created in config under `services.plc.symbolGroups`.
`plc_list_groups` lists those group names and `plc_read_group` reads all
symbols in one group.

NC read-only:

- `nc_state`
- `nc_list_axes`
- `nc_read_axis_position`
- `nc_read_axis_status`
- `nc_read_axis`
- `nc_read_axis_many`
- `nc_read_error`

Configure NC axes under `services.nc.axes` with `name` and `id`.

IO read-only:

- `io_list_groups`
- `io_read`
- `io_read_many`
- `io_read_group`

Configure IO data points under `services.io.dataPoints` and group them under
`services.io.groups`.

TwinCAT runtime diagnostics:

- `tc_state`
- `tc_event_list`
- `tc_runtime_error_list`
- `tc_log_read`
- `tc_diagnose_errors`
- `tc_diagnose_runtime`

Configure diagnostic sources under `diagnostics`. The default local source reads
the Windows `Application` Event Log for TwinCAT/Beckhoff entries when available;
otherwise tools return unavailable capability details.

Prefer individual commands when the target is already clear. Use
`tc_diagnose_errors` for a small bundle of runtime errors, recent events, and log
tail; use `tc_diagnose_runtime` for TC/PLC/NC/IO runtime health plus active
runtime errors. These are triage helpers, not global dump tools.

Write control:

- `plc_set_write_mode`
- `plc_write`

Watches:

- `plc_watch`
- `plc_wait_until`
- `plc_unwatch`
- `plc_list_watches`

All tool operations delegate to `twincat-mcp-core`.

## Hooks

- `session_start`: connects and reads configured snapshot symbols
- `before_agent_start`: returns startup state, snapshots, failed snapshots, and watches
- `context`: injects live snapshots, failed snapshot names, watch count, and write mode
- `tool_call`: pre-evaluates write access for write-related tools
- `session_end`: disconnects and releases ADS resources

In packaged Pi usage, `session_shutdown` maps to the internal `session_end`
cleanup.

## Safety Model

Writes require all gates to pass:

1. `readOnly=false` in config.
2. `plc_set_write_mode` has switched runtime write mode to `enabled`.
3. The exact symbol name is present in `writeAllowlist`.

The default behavior is read-only.

## Local Smoke Test

Build the workspace and run the root smoke script against a reachable PLC:

```bash
npm run build
npm run smoke:local -- --config ./local.config.json --symbol MAIN.someValue --watch-symbol MAIN.someValue
```

Optional write smoke:

```bash
npm run smoke:local -- --config ./local.config.json --symbol MAIN.someValue --watch-symbol MAIN.someValue --enable-write --write-symbol MAIN.safeWriteValue --write-value 1
```

Only run the write path against a safe symbol with `readOnly=false` and a matching
`writeAllowlist` entry.

## Migration Notes

Existing `pi-twincat-ads` users keep installing the same package name. The main
behavioral change is package structure: ADS service and config logic now live in
`twincat-mcp-core`, while Pi-specific hooks and tools remain here.

The old single-package `src/ads` and `src/config` imports are preserved as
compatibility re-exports for now, but new code should import core primitives
from `twincat-mcp-core`.

## Development

```bash
npm run sync:skills -w pi-twincat-ads
npm run test:pi
npm run build
npm run pack:pi
```

`npm run pack:pi` runs the Pi package `prepack`/`postpack` hooks and verifies
that shared skills are present in the package tarball while keeping the
repository source of truth under `packages/skills`.

Live PLC smoke-test details are documented in the repository under
`docs/local-dev-test.md` and `docs/manual-smoke-test.md`.
