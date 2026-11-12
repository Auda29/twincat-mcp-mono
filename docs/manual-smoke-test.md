# Manual Smoke Test

This is an optional ADS/Pi live-test procedure, not a record that it was run or
real-host acceptance for Engineering 0.5.3. The Assistant-owned engineering
child is separate and exposes no ADS writes. See [current release scope](release-flow.md).
The procedure below requires separately authorized access to the intended PLC.

This smoke test is intended for a TwinCAT 3 PLC reachable on ADS port `851`.

## Preconditions

- The PLC is reachable over ADS.
- The configured AMS route is valid.
- The extension is configured with the intended `targetAmsNetId` and port.
- If direct mode is used, `routerAddress`, `localAmsNetId`, and `localAdsPort` are correct.
- A safe non-critical symbol exists for read/write checks.
- For packaged Pi testing, Pi is started with `--plc-config ./plc.config.json` or matching environment variables.

## Smoke Test Steps

1. Run `npm run check`.
2. Create the extension with the target configuration.
3. Call `session_start`.
   Expect ADS connects successfully, configured snapshots are readable, and `failedSnapshots` is empty for a healthy configuration.
4. Call `plc_state`.
   Expect connected state, PLC runtime state, write mode, write policy, and watch count.
5. Call `plc_list_symbols` with a narrow filter.
   Expect known PLC symbols with type metadata.
6. Call `plc_read` on a known symbol.
   Expect a typed value and timestamp.
7. Call `plc_read_many` on two or more known symbols.
   Expect all values returned in one tool response.
8. Call `plc_watch` on a stable symbol.
   Expect a notification handle, an active watch entry, and ideally an immediate `lastValue`/`lastTimestamp` if ADS returns initial watch data.
9. Call `plc_list_watches`.
   Expect the watch to be visible with matching mode and latest snapshot metadata.
10. If writes are intentionally allowed:
    First ensure `readOnly=false` in config and the symbol is in `writeAllowlist`.
    Then call `plc_set_write_mode` with `enabled`.
    Call `plc_write` on a safe symbol and verify the PLC value changes as expected.
11. Call `plc_unwatch`.
    Expect the watch to become inactive.
12. Call `session_end`.
    Expect notifications, handles, and ADS connection to be released.

## Hook-Specific Checks

- Call `before_agent_start`.
  Expect a compact summary with `state`, `snapshots`, `failedSnapshots`, and `watches`.
- Call `context`.
  Expect live snapshot data plus `failedSnapshots`, `watchCount`, and `writeMode`.
- If `failedSnapshots` is non-empty, verify the configured `contextSnapshotSymbols` against the current PLC symbol table before trusting the injected context.
- In packaged Pi usage, confirm `session_shutdown` releases ADS resources cleanly because it is mapped to the internal `session_end` hook.

## Failure Clues

- Connection failures usually indicate route, AMS Net ID, router, or target port problems.
- Rejected writes usually indicate `readOnly`, runtime write mode, or allowlist restrictions.
- Non-empty `failedSnapshots` usually indicate wrong or stale `contextSnapshotSymbols`.
- Missing watch updates usually indicate PLC notification limits, reconnect issues, or wrong symbol paths.
