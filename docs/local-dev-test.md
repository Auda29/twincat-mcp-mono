# Local Dev Test

This ADS/Pi procedure is separate from the published 0.5.3 bound engineering
child and is not release acceptance evidence. Real PLC access requires its own
authorization. For current GitHub artifacts and dormant editor scope, see
[Release Flow](release-flow.md).

Use this when you want to exercise the built package directly against a real PLC before wiring it into a Pi host instance.

If you want to test the real Pi packaging layer instead, use the same JSON config file and start Pi with `--plc-config ./local.config.json`.

## 1. Build the package

```bash
npm ci
npm run build
```

## 2. Create a local config file

Example `local.config.json`:

```json
{
  "connectionMode": "router",
  "targetAmsNetId": "192.168.1.120.1.1",
  "targetAdsPort": 851,
  "readOnly": true,
  "contextSnapshotSymbols": [
    "MAIN.someValue"
  ]
}
```

For direct mode, also include `routerAddress`, `routerTcpPort`, `localAmsNetId`, and `localAdsPort`.

## 3. Run the local smoke test

Read-only example:

```bash
npm run smoke:local -- --config ./local.config.json --symbol MAIN.someValue --watch-symbol MAIN.someValue
```

Optional write test:

```bash
npm run smoke:local -- --config ./local.config.json --symbol MAIN.someValue --watch-symbol MAIN.someValue --enable-write --write-symbol MAIN.safeWriteValue --write-value 1
```

Only use the write path when all of the following are true:

- `readOnly` is set to `false` in the config
- the symbol is listed in `writeAllowlist`
- the target symbol is operationally safe to change

## 4. Run through Pi itself

Once the package is built and installed in Pi, start it with the same config:

```bash
pi --plc-config ./local.config.json
```

The packaged adapter reads the PLC config from:

- `--plc-config`
- `PI_TWINCAT_ADS_CONFIG`
- `PI_TWINCAT_ADS_CONFIG_JSON`

## 5. What the script does

The runner uses the built package from `dist/` and executes this sequence:

1. `register()`
2. `session_start`
3. `before_agent_start`
4. `context`
5. `plc_state`
6. `plc_list_symbols`
7. `plc_read`
8. `plc_read_many`
9. `plc_watch`
10. `plc_list_watches`
11. optional `plc_set_write_mode` and `plc_write`
12. `plc_unwatch`
13. `session_end`

All results are printed as formatted JSON.

## 6. Failure clues

- Connection failures usually point to route, AMS Net ID, router, or port issues.
- `failedSnapshots` usually means one or more `contextSnapshotSymbols` are wrong or stale.
- Write rejections usually mean `readOnly`, runtime write mode, or `writeAllowlist` is blocking the operation.
- Missing watch updates usually mean the symbol path is wrong or the PLC is not producing notification changes.
