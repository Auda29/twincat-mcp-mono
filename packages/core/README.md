# twincat-mcp-core

Transport-agnostic TwinCAT ADS runtime for Node.js.

The core package owns the ADS domain logic used by both `pi-twincat-ads` and
`twincat-mcp`: configuration validation, `AdsService`, runtime operations,
symbol/data-type caching, watches, reconnect handling, and the write-safety
model.

The published [Engineering 0.5.3 GitHub release](https://github.com/Auda29/twincat-mcp-mono/releases/tag/engineering-v0.5.3)
pins commit `99de69b8cedec780a68a89a631132ea6eb76cf0b`; it did not publish
new npm versions. [Release Flow](../../docs/release-flow.md) describes the
runtime/source archives, receipt verification and residual dependency advisories.
The npm install command below selects registry packages, not that artifact pin.

Configured-file engineering reads in Core inspect saved files and report unknown
editor state. The reusable C# engineering helper is in `native/Engineering.Host`,
not a second ADS compiler in Core. Assistant can host it through an authenticated
exact-bound child for approved selective PLC builds and build-owned diagnostics.
All new source-editor features remain dormant in the release configuration;
the ordinary file-backed read path remains available. See
[Engineering Backends](../../docs/engineering-backends.md) for the two paths.

## Install

```bash
npm install twincat-mcp-core
```

Node.js 20 or newer is required.

## Runtime API

```ts
import {
  AdsService,
  createTwinCatAdsRuntime,
  normalizeTwinCatAdsConfig,
} from "twincat-mcp-core";

const config = normalizeTwinCatAdsConfig({
  connectionMode: "router",
  targetAmsNetId: "localhost",
  readOnly: true,
  services: {
    plc: {
      targetAdsPort: 851,
      symbolGroups: {
        machine: ["MAIN.State", "MAIN.Mode"],
      },
    },
  },
});

const service = new AdsService(config);
const runtime = createTwinCatAdsRuntime(service, { config });

await runtime.connect();
const state = await runtime.readState();
const value = await runtime.readSymbol({ name: "MAIN.someValue" });
await runtime.disconnect();
```

## Operations

The runtime exposes transport-free PLC operations:

- `connect`
- `disconnect`
- `listSymbols`
- `describeSymbol`
- `readSymbol`
- `readMany`
- `listGroups`
- `readGroup`
- `ncState`
- `ncListAxes`
- `ncReadAxis`
- `ncReadAxisMany`
- `ncReadError`
- `ioListGroups`
- `ioRead`
- `ioReadMany`
- `ioReadGroup`
- `tcState`
- `tcEventList`
- `tcRuntimeErrorList`
- `tcLogRead`
- `writeSymbol`
- `watchSymbol`
- `waitUntil`
- `unwatchSymbol`
- `listWatches`
- `readState`
- `setWriteMode`
- `getWriteModeState`
- `evaluateWriteAccess`

Adapters should call these runtime operations instead of reaching through to
low-level ADS client APIs.

## Configuration

Config is validated with Zod and normalized by `normalizeTwinCatAdsConfig`.

Router mode:

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

Direct mode:

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

`services.plc.targetAdsPort` is the effective PLC ADS port when present. The
top-level `targetAdsPort` remains accepted for compatibility. Configured PLC
`symbolGroups` can be listed with `listGroups` and read with `readGroup`.

`services.nc.axes` defines read-only NC axes by name and axis ID. The NC runtime
uses ADS port `500` by default and reads axis state from the NC ADS axis state
index group.

`services.io.dataPoints` defines read-only IO ADS raw addresses. Each data point
has `name`, `indexGroup`, `indexOffset`, `type`, and optional `size` and
`description`. `services.io.groups` maps group names to configured data point
names.

`diagnostics.eventSources` and `diagnostics.logSources` configure bounded
TwinCAT-wide runtime diagnostics. By default the runtime registers local
Windows `Application` Event Log sources filtered for TwinCAT/Beckhoff provider
names. On non-Windows hosts, missing PowerShell/Event Log APIs, or insufficient
permissions, diagnostic tools return an unavailable capability result instead
of failing startup.

Use `tcEventList`, `tcRuntimeErrorList`, `tcLogRead`, `tcState`, and the
PLC/NC/IO read APIs when you know which surface to inspect. Use
`tcDiagnoseErrors` for a bounded bundle of runtime errors, recent events, and
runtime log tail. Use `tcDiagnoseRuntime` for a compact runtime health bundle
covering TC state, PLC state, NC state, IO config state, and active runtime
errors. Both combo calls keep their own small defaults and still respect the
configured diagnostic caps.

`readState` returns ADS connection state, write policy, watch count, raw ADS
state objects, and readable PLC/TwinCAT state summaries such as `Run` or
`Stop` in `plcRuntimeStatus` and `tcSystemStatus`.

## Safety Model

Writes are blocked unless:

1. `readOnly` is `false`.
2. Runtime write mode is `enabled`.
3. The exact symbol name is present in `writeAllowlist`.

`writeSymbol` throws `WriteDeniedError` when the gates reject a write.

## Package Boundary

Core intentionally does not own:

- Pi extension registration
- Pi hooks or context injection
- Pi skills
- MCP stdio transport
- MCP JSON-RPC handling
- MCP tool registration

Those live in the adapter packages.

## Development

```bash
npm run check -w twincat-mcp-core
npm run test -w twincat-mcp-core
npm run build -w twincat-mcp-core
```
