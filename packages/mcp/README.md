# twincat-mcp

MCP stdio server for TwinCAT ADS PLC operations.

This package exposes `twincat-mcp-core` runtime operations as Model Context
Protocol tools. MCP-specific protocol handling lives here; ADS domain behavior,
configuration validation, watches, and write gates live in `twincat-mcp-core`.

Engineering 0.5.3 is published as
[GitHub release assets](https://github.com/Auda29/twincat-mcp-mono/releases/tag/engineering-v0.5.3)
at commit `99de69b8cedec780a68a89a631132ea6eb76cf0b`, not as a new npm
publication. See [asset verification and release limits](../../docs/release-flow.md).

## Install

```bash
npm install -g twincat-mcp
```

Node.js 20 or newer is required.
The registry command above does not pin the GitHub-only 0.5.3 release. For those
exact bytes, verify and extract the released runtime archive, supply Node
separately and use `packages/mcp/dist/index.js` as its entry point. Do not enable
the host bootstrap manually with credentials from a configuration file.

## Bundled Skills

The package ships skills for agents that support npm-bundled skill discovery:

- `twincat-mcp-ads`: MCP-specific runtime/ADS tool guidance for PLC, NC, IO,
  watches, write gates, connection tools, and TwinCAT runtime diagnostics.
- `twincat-xae-project-guidelines`: agent-neutral guidance for offline TwinCAT
  XAE/Visual Studio project-file work, including PLC project XML, POUs, GVLs,
  DUTs, tasks, I/O devices, boxes, and terminals.

The MCP server provides tools. Skills are agent-side guidance for choosing those
tools, explaining results, and respecting the runtime/project-file safety
boundary.

The XAE skill source lives centrally under
`packages/skills/twincat-xae-project-guidelines`. It is copied into this package
by the MCP `prepack` lifecycle and removed again by `postpack`, so npm artifacts
contain the skill without maintaining a second manual copy.

## Run

```bash
twincat-mcp --config ./plc.config.json
```

Config can also be supplied with environment variables:

- `TWINCAT_ADS_CONFIG='{"connectionMode":"router",...}'`
- `TWINCAT_ADS_TARGET_AMS_NET_ID=192.168.1.120.1.1`
- `TWINCAT_ADS_TARGET_ADS_PORT=851`
- `TWINCAT_ADS_CONNECTION_MODE=router`
- `TWINCAT_ADS_READ_ONLY=true`
- `TWINCAT_ADS_WRITE_ALLOWLIST=MAIN.safeValue,MAIN.otherSafeValue`
- `TWINCAT_ADS_CONTEXT_SNAPSHOT_SYMBOLS=MAIN.someValue`
- `TWINCAT_ADS_NOTIFICATION_CYCLE_TIME_MS=250`
- `TWINCAT_ADS_MAX_NOTIFICATIONS=128`
- `TWINCAT_ADS_MAX_WAIT_UNTIL_MS=600000`

Direct mode additionally uses:

- `TWINCAT_ADS_ROUTER_ADDRESS`
- `TWINCAT_ADS_ROUTER_TCP_PORT`
- `TWINCAT_ADS_LOCAL_AMS_NET_ID`
- `TWINCAT_ADS_LOCAL_ADS_PORT`

## Example Config

```json
{
  "connectionMode": "router",
  "targetAmsNetId": "192.168.1.120.1.1",
  "targetAdsPort": 851,
  "readOnly": true,
  "writeAllowlist": [],
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

## Ordinary ADS and configured-file tools

The ordinary server uses the ADS configuration above. Its configured-file
engineering tools read saved files, not live editor buffers: `tc_list_workbenches`,
`tc_list_projects`, `tc_project_state`, `plc_list_pous`, `plc_read_pou`,
`plc_search_code`, `plc_describe_pou`, `plc_list_libraries` and
`plc_describe_library`. File-backed build calls and compiler-owned error/output
lists report unavailable; `tc_error_context` can return bounded saved-file text.
Editor state remains unknown. See [Engineering Backends](../../docs/engineering-backends.md)
for the complete distinction from the bound child.

Connection:

- `ads_connect`
- `ads_disconnect`

PLC reads and state:

- `plc_list_symbols`
- `plc_describe_symbol`
- `plc_read`
- `plc_read_many`
- `plc_list_groups`
- `plc_read_group`
- `plc_state`

`plc_state` includes ADS connection state, write gates, watch count, and a
readable PLC runtime status summary such as `Run` or `Stop`.

NC read-only:

- `nc_state`
- `nc_list_axes`
- `nc_read_axis_position`
- `nc_read_axis_status`
- `nc_read_axis`
- `nc_read_axis_many`
- `nc_read_error`

IO read-only:

- `io_list_groups`
- `io_read`
- `io_read_many`
- `io_read_group`

TwinCAT runtime diagnostics:

- `tc_state`
- `tc_event_list`
- `tc_runtime_error_list`
- `tc_log_read`
- `tc_diagnose_errors`
- `tc_diagnose_runtime`

Diagnostic tools use configured sources under `diagnostics`. The defaults target
the local Windows `Application` Event Log filtered for TwinCAT/Beckhoff entries;
when that API is unavailable, the result reports unavailable capability metadata
instead of failing server startup.

Prefer the individual tools for targeted investigation. Use
`tc_diagnose_errors` for a bounded first look at runtime errors, nearby events,
and log tail; use `tc_diagnose_runtime` for a compact TC/PLC/NC/IO runtime health
summary plus active runtime errors.

Writes and write gates:

- `plc_set_write_mode`
- `plc_get_write_mode`
- `plc_evaluate_write_access`
- `plc_write`

Watches:

- `plc_watch`
- `plc_wait_until`
- `plc_unwatch`
- `plc_list_watches`

Watches are modeled only as tools. They are not MCP resources or
subscriptions yet.

## Assistant-owned bound engineering child

This separate, engineering-only child is started by Assistant with
`--host-bootstrap-stdin`. The host supplies a frozen session/IDE/project binding
and authenticates the local pipe. Capability material arrives only through the
owned child's stdin, never command-line arguments, environment or saved config.
There is no independent ROT attachment or model-selected IDE/project.

The published release's default catalog has exactly nine tools:

| Tool | Operation and input |
| --- | --- |
| `tc_session_describe` | Read current binding/capabilities; `{}` |
| `tc_project_association` | Read the bound PLC-to-TwinCAT association; `{}` |
| `tc_build_project` | Selective bound PLC build; `{configuration, platform}` |
| `plc_build_project` | The same selective PLC build contract |
| `tc_build_and_get_errors` | Submit the same nonblocking build; query its operation afterward |
| `tc_error_list` | Build-owned diagnostics; `{targetOperationId}` |
| `tc_output_read` | Build-owned output; `{targetOperationId}` |
| `tc_operation_get` | Query the explicit build operation; `{targetOperationId}` |
| `tc_operation_cancel` | Record best-effort cancellation; `{targetOperationId}` |

Use the exact configuration/platform returned by `tc_session_describe`; the
provider rechecks them around explicit native approval and never switches them.
All three build aliases address the exact `.plcproj`, never silently widen to
the owning `.tsproj`. A submission returns an operation ID, not completed build
acceptance. Unknown dirty state, ambiguous binding, unsafe project policy or
nonempty/unverifiable dependencies refuse. Cancellation does not invoke global
IDE cancellation or prove that a submitted build stopped.

Diagnostics/output belong to the explicit build ID. Navigation is a native-click
operation with source-baseline leases and an exact current ErrorItem match;
`diagnostics.navigate` is not a model tool. No unrelated Error List row is
labelled fresh. The host eligibility gate is exact TcXaeShell/Shell15 x86,
executable 15.0.0.0 and TwinCAT 3.1.4024.78; other versions/x64 hosts are not
implicitly supported. Implementation and package checks do not establish live
host acceptance.

The release host selects `CreateWithHostAccess` with a null text-buffer callback
and no section accessor, denies `source.*` before dispatch and hides source UI.
The provider advertises source capabilities unsupported and rejects all such
operations. None of the six `plc_source_*` tools is registered. All fifteen
development definitions, editor factories and implementation are retained via
trusted in-code `enableDevelopmentSourceTools:true`, not CLI/bootstrap/model
arguments. Even in development, normal-ST writes lack a safe transaction contract.
This child has no ADS connection or runtime-write/activation/download/login/
run/stop/force tools. Ordinary read-only saved-file attachment remains separate.

The exact nine schemas are published as `engineering-catalog.json`, pinned by
the release receipt. Review the [dependency advisories](../../docs/release-flow.md)
before adopting the artifacts; the audit is not clean.

## Safety Model

MCP writes use the same three gates as the core and Pi package:

1. `readOnly=false` in config.
2. `plc_set_write_mode` sets runtime write mode to `enabled`.
3. The exact symbol name is present in `writeAllowlist`.

The default behavior is read-only.

## Development

```bash
npm run sync:skills -w twincat-mcp
npm run test:mcp
npm run build
npm run pack:mcp
```

`npm run pack:mcp` runs the MCP package `prepack`/`postpack` hooks and verifies
that shared skills are present in the package tarball while keeping the
repository source of truth under `packages/skills`.

For package-level checks:

```bash
npm run check -w twincat-mcp
npm run test -w twincat-mcp
```
