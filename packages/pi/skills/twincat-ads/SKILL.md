---
name: twincat-ads
description: >-
  TwinCAT ADS via pi-twincat-ads (plc_state, plc_list_symbols,
  plc_describe_symbol, plc_read, plc_read_many, plc_list_groups,
  plc_read_group, plc_write, plc_watch, plc_wait_until, nc_state,
  nc_list_axes, nc_read_axis_position, nc_read_axis_status, nc_read_axis,
  nc_read_axis_many, nc_read_error, io_list_groups, io_read, io_read_many,
  io_read_group, tc_state, tc_event_list,
  tc_runtime_error_list, tc_log_read, tc_diagnose_errors,
  tc_diagnose_runtime, tc_list_workbenches, tc_list_projects,
  tc_project_state, tc_build_project, plc_build_project,
  tc_build_and_get_errors, tc_error_list, tc_error_context, tc_output_read,
  tc_resource_read, hmi_state, hmi_list_projects, hmi_preview_info,
  hmi_list_controls, tc_tree_read, tc_tree_search, tc_tree_describe_item,
  io_list_topology, io_describe_device, io_describe_terminal, plc_list_pous,
  plc_read_pou, plc_search_code, plc_describe_pou, plc_list_libraries,
  plc_describe_library). Use when inspecting TwinCAT PLC symbols, NC axis state,
  IO data points, runtime state, runtime diagnostics, configured groups, ADS
  watches, or read-only TwinCAT engineering project context.
---

# TwinCAT ADS Skill

Use this skill when the agent needs to inspect TwinCAT PLC, NC, or IO runtime
values over ADS, safely manipulate explicitly allowed PLC symbols, or inspect
the package's read-only TwinCAT engineering project context.

For offline TwinCAT XAE or Visual Studio project-file edits, reviews, or
user-facing XAE terminology, also use the `twincat-xae-project-guidelines`
skill. Keep runtime ADS reads, watches, waits, and explicitly allowed PLC writes
separate from read-only engineering context and from any project-file editing
work.

## Recommended workflow

1. Start with `plc_state`.
2. Use `plc_list_symbols` if the exact symbol path is not certain.
3. Use `plc_describe_symbol` when type, size, array bounds, or struct members matter.
4. Use `plc_list_groups` and `plc_read_group` when the config defines reusable PLC symbol groups.
5. Use `nc_state`, `nc_list_axes`, `nc_read_axis_position`, `nc_read_axis_status`, `nc_read_axis`, or `nc_read_error` when the task concerns NC axes, motion state, position, velocity, status flags, or NC errors.
6. Use `io_list_groups`, `io_read`, `io_read_many`, or `io_read_group` when the task concerns configured IO process data, sensors, valves, safety inputs, or outputs.
7. Use `tc_state`, `tc_event_list`, `tc_runtime_error_list`, or `tc_log_read` when the task concerns a specific TwinCAT-wide runtime diagnostic surface rather than one PLC symbol, NC axis, or IO data point.
8. Use `tc_diagnose_errors` or `tc_diagnose_runtime` for bounded first-pass triage when the user asks for a compact runtime error or health overview.
9. Use the read-only Engineering tools when the task is about configured XAE projects, project files, build/error context, SysManager/I/O topology, PLC code objects, or HMI project context.
10. Use `plc_read` or `plc_read_many` before making decisions about live PLC state.
11. Use `plc_wait_until` for a specific PLC state transition or condition; use `plc_watch` for ongoing PLC observation.
12. Only use `plc_write` after checking state, symbol path, and write permissions.
13. Use `plc_list_watches` to inspect current subscriptions and avoid duplicates.
14. Pay attention to hook-provided `failedSnapshots` if configured context symbols could not be read.

## Tool guidance

### Discovery and reads

- Prefer `plc_list_symbols` for discovery.
- Use `plc_describe_symbol` after discovery when a symbol's shape matters:
  - array dimensions or indexing
  - struct fields or nested members
  - PLC type names, byte size, or metadata
  - validating that a symbol is the intended target before a write
- Prefer `plc_read_many` when several related values are needed together.
- Use `plc_state` to understand runtime mode, watch count, and current write availability.
- If hooks return `failedSnapshots`, treat that as a configuration or PLC-symbol drift hint and verify the symbol names.

### Symbol groups

- Use `plc_list_groups` to inspect configured PLC symbol groups.
- Use `plc_read_group` when a group captures a meaningful machine snapshot, such as state, mode, active step, alarms, or axis status.
- Symbol groups are not created by `plc_list_groups` or `plc_read_group`.
- Symbol groups are created in the Pi/TwinCAT ADS config under `services.plc.symbolGroups`.
- If the user asks to create or change a group, propose the config edit and explain that the Pi extension must load that updated config before the tools can list or read the group.
- A group is a named list of exact PLC symbol paths, for example:

```json
{
  "services": {
    "plc": {
      "symbolGroups": {
        "machine": ["MAIN.State", "MAIN.Mode", "MAIN.ActiveStep"],
        "axisX": ["MAIN.AxisX.Status", "MAIN.AxisX.Position"]
      }
    }
  }
}
```

- Do not invent group names. Call `plc_list_groups` first unless the user or config context already gives an exact group name.
- If a group read fails for one symbol, treat that as useful drift information and verify symbol names with `plc_list_symbols` or `plc_describe_symbol`.
- A good group name is short and task-oriented, for example `machine`, `axisX`, `alarms`, `cycle`, or `safetyInputs`.
- Build groups from symbols you have verified through `plc_list_symbols`, `plc_describe_symbol`, or successful reads.

### NC axes

- NC access is read-only in this package.
- Use `nc_state` to verify the configured NC ADS service state before relying on axis reads.
- Use `nc_list_axes` to inspect configured axes. Do this before `nc_read_axis` unless the user or config context already gives an exact axis name or ID.
- Use `nc_read_axis_position` for one configured axis when you only need position, velocity, state double word, or online-state values.
- Use `nc_read_axis_status` for one configured axis when you only need flags such as ready, referenced, in-position, or busy.
- Use `nc_read_axis` as a best-effort aggregate when you need position, velocity, status flags, state double word, and error code together. If optional status or error fields cannot be read, inspect its `warnings` and still use available online-state values.
- Use `nc_read_axis_many` when comparing several configured axes.
- Use `nc_read_error` when the task is focused on an NC or axis error.
- NC axes must be configured under `services.nc.axes` with at least `name` and `id`. Optional fields are `targetAdsPort` and `description`.
- A minimal NC config looks like:

```json
{
  "services": {
    "nc": {
      "targetAdsPort": 500,
      "axes": [
        { "name": "X", "id": 1 },
        { "name": "Y", "id": 2 }
      ]
    }
  }
}
```

- Do not invent axis IDs. Ask for the configured axis name/ID or use `nc_list_axes`.
- Treat NC status and error reads as diagnostics. Follow-up actions such as PLC reads or writes must be separate, deliberate tool calls.

### IO data points

- IO access is read-only in this package.
- Use `io_list_groups` to inspect configured IO groups and data points.
- Use `io_read` for one configured IO data point.
- Use `io_read_many` when several IO values are needed together.
- Use `io_read_group` when the config defines a meaningful IO snapshot such as `inputs`, `outputs`, `safety`, `valves`, or `sensors`.
- IO data points must be configured under `services.io.dataPoints` with `name`, `indexGroup`, `indexOffset`, and `type`. Optional fields are `size` and `description`.
- IO groups are configured under `services.io.groups` as lists of configured data point names.
- A minimal IO config looks like:

```json
{
  "services": {
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

- Do not invent raw IO addresses. If a needed data point is missing, explain the config entry that would be required.
- IO reads return decoded values plus raw hex. Use raw hex when type decoding looks suspicious or when checking bit-level process data.

### TwinCAT runtime diagnostics

- Use `tc_state` for a compact TwinCAT-wide view across ADS services, PLC state, NC state, and diagnostic source capabilities.
- Use `tc_event_list` for recent TwinCAT/Event Log messages with filters such as `limit`, `since`, `severity`, `contains`, and `source`.
- Use `tc_runtime_error_list` when the task is specifically about runtime/system errors. It defaults to critical/error severities unless the caller provides another severity filter.
- Use `tc_log_read` for bounded runtime log text from configured log sources.
- Use `tc_diagnose_errors` when the user asks for a compact error triage. It combines runtime errors, recent events, and a small runtime log tail with explicit limits and filters.
- Use `tc_diagnose_runtime` when the user asks for a compact runtime health overview. It combines TC state, PLC state, NC state, IO config state, and active runtime errors.
- Prefer the individual commands when the user already names the exact state, event, log, NC axis, IO data point, or PLC symbol to inspect.
- Do not treat the combo commands as global dump tools. Keep `limit`, `logLimitBytes`, `logTailLines`, `since`, `severity`, and `contains` narrow when using them.
- Diagnostic sources are configured under `diagnostics.eventSources` and `diagnostics.logSources`.
- The default local source uses the Windows `Application` Event Log filtered for TwinCAT/Beckhoff provider names when available.
- If a diagnostic result has `available=false`, report the capability reason instead of treating it as a PLC failure.
- Do not use these runtime diagnostic tools for XAE build output, Engineering
  error lists, or Visual Studio output windows; use the read-only Engineering
  tools below for that context.

### TwinCAT Engineering context

- Engineering tools are read-only project-context tools. They do not activate
  configuration, download, login, start, stop, force values, scan hardware, or
  edit project files.
- Use `tc_list_workbenches`, `tc_list_projects`, and `tc_project_state` to orient
  around configured TwinCAT workbenches and project files before reading deeper
  project context.
- Use `tc_build_project`, `plc_build_project`, and `tc_build_and_get_errors` for
  bounded build requests. The configured project-file backend reports build
  calls as unavailable when no live XAE/Visual Studio backend exists; report that
  capability reason instead of treating it as a failed controller build.
- Use `tc_error_list`, `tc_error_context`, and `tc_output_read` for Engineering
  compiler/parser issues, source context, and bounded build or Engineering
  output. Keep limits narrow.
- Use `tc_resource_read` to dereference returned resource URIs such as `plcc://`,
  `err://`, `io://`, `tcfile://`, and `tcfolder://` instead of asking tools for
  large dumps.
- Use `tc_tree_read`, `tc_tree_search`, `tc_tree_describe_item`,
  `io_list_topology`, `io_describe_device`, and `io_describe_terminal` for
  SysManager and I/O topology. These tools describe configured project files;
  they do not scan or reconfigure live hardware.
- Use `plc_list_pous`, `plc_read_pou`, `plc_search_code`,
  `plc_describe_pou`, `plc_list_libraries`, and `plc_describe_library` for PLC
  code, POU/GVL/DUT/interface summaries, source snippets, and referenced
  libraries.
- Use `hmi_state`, `hmi_list_projects`, `hmi_preview_info`, and
  `hmi_list_controls` for exploratory read-only HMI project context. Do not
  create, edit, publish, or preview-control HMI artifacts through this layer.
- When the user asks to edit or review TwinCAT project files, POUs, GVLs, DUTs,
  tasks, I/O devices, boxes, terminals, or HMI files, also use
  `twincat-xae-project-guidelines` for the project-file workflow and use ADS
  runtime tools only for separate runtime observations.

### Finding symbol paths

- Users often describe a variable by meaning, not by its full ADS symbol path.
- If the user says something like "check variable `xEnable` in block `FB_Axis`", do not guess the final path immediately.
- First search with `plc_list_symbols` using narrow filters based on the most specific pieces you have:
  - variable name such as `xEnable`
  - block or DUT name such as `FB_Axis`
  - program or GVL name if mentioned, such as `MAIN` or `GVL`
- Prefer refining in small steps instead of using a very broad filter once.
- Once matching symbols are listed, use the exact returned symbol path for `plc_read`, `plc_read_many`, `plc_watch`, or `plc_write`.

Example workflow:

- User says: "Check the value of variable `xResetLog` in the block `PRG_SPS_Ablauf_Anl1`."
- First try `plc_list_symbols` with a filter like `xResetLog`.
- If there are many matches, refine with `PRG_SPS_Ablauf_Anl1`.
- A returned symbol might be `PRG_SPS_Ablauf_Anl1.L_xResetLog` or `PRG_SPS_Ablauf_Anl1.fbLogger.xResetLog`.
- Then use that exact full path in `plc_read`.

Heuristics for common TwinCAT naming:

- Top-level program variables often look like `MAIN.someValue` or `PRG_Name.someValue`.
- Global variables often start with a GVL name such as `GVL_System.someValue`.
- Nested function block members often look like `MAIN.fbAxis.xEnable` or `PRG_Name.fbUnit.stStatus.xReady`.
- Array elements can appear as `GVL.Axis[1].Cmd`.
- Exact casing matters, especially for writes and allowlists.

### Writes

- Treat every write as safety-sensitive.
- Writes are blocked unless all of the following are true:
  - config `readOnly` is `false`
  - runtime write mode was explicitly enabled with `plc_set_write_mode`
  - the symbol is in `writeAllowlist`
- If a write is denied, inspect `plc_state` and the symbol name before retrying.

### Watches

- Use `plc_watch` when repeated polling would be wasteful.
- Default watch behavior is `on-change`.
- A fresh watch can already expose an initial `lastValue` and `lastTimestamp` when ADS provides `latestData`.
- Use `plc_unwatch` when the observation is no longer needed.
- Use `plc_list_watches` before creating duplicate observation plans.

### Waiting for conditions

- Use `plc_wait_until` when the user asks to wait for a specific PLC condition, transition, or readiness state.
- Prefer `plc_wait_until` over manual polling loops when there is a clear condition and timeout.
- Prefer `plc_wait_until` over `plc_watch` when you only need to know when a condition becomes true once.
- Prefer `plc_watch` when the user wants ongoing monitoring, repeated updates, or a reusable subscription.
- Use `stableForMs` when transient values should not count, for example waiting until a ready bit has stayed true for 500 ms.
- Use `anyOf` for alternatives and `allOf` for combined readiness checks.
- Keep timeouts bounded and operationally reasonable. If the wait times out, report the last observed values and suggest the next read or diagnostic step.
- `plc_wait_until` waits only. Follow-up actions such as reads, diagnostics, or writes must be separate tool calls after the wait result is known.

Example condition:

```json
{
  "condition": {
    "allOf": [
      { "name": "MAIN.AxisReady", "operator": "equals", "value": true },
      { "name": "MAIN.ActiveError", "operator": "equals", "value": false }
    ]
  },
  "timeoutMs": 30000,
  "stableForMs": 500
}
```

## Symbol naming

- Expect TwinCAT PLC symbols in forms like `MAIN.varName`, `GVL.Axis[1].Cmd`, or nested DUT paths.
- Prefer exact symbol names returned by discovery instead of guessing.
- Write allowlist matching is exact and case-sensitive.

## Safety rules

- Do not assume write access just because `plc_write` exists.
- Do not enable runtime writes unless there is a clear operational reason.
- Read machine-relevant state before changing motion, process, or safety-adjacent values.
- If PLC state looks unexpected, stop and inspect rather than retrying writes aggressively.
