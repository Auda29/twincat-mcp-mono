# Runtime Events and Logs Backend Evaluation

> Historical Task 15 design evaluation. The phase/future labels below preserve
> that research context; they are not the current Engineering 0.5.3 capability
> matrix or live acceptance evidence. See [Engineering Backends](engineering-backends.md)
> and [Release Flow](release-flow.md) for the published release boundary.

This note evaluates possible backends for Task 15 before the public tool API is
fixed. The scope is Phase 2 runtime diagnostics only. Engineering build output,
XAE error lists, Visual Studio output windows, and project-source diagnostics stay
in Phase 3.

## Recommended Phase 2 Direction

Use separate backend families for events and logs:

- Runtime events: prefer structured TwinCAT event sources.
- Runtime logs: use explicitly configured log sources with tight filters and
  limits.

Do not design `tc_event_list` and `tc_log_read` as one generic dump command.
They have different reliability, permissions, structure, and platform behavior.

## Backend Candidates

### 1. TwinCAT 3 EventLogger user mode API

The TwinCAT 3 EventLogger is the most semantically correct event backend. It is
meant for exchanging messages and alarms between TwinCAT components and external
programs. Beckhoff documents that the EventLogger components are part of the
basic TwinCAT installation and that user mode programs can send and receive
events through the API.

Relevant source:

- https://infosys.beckhoff.com/content/1033/tc3_eventlogger/4278559115.html
- https://infosys.beckhoff.com/content/1033/tc3_eventlogger/6107616011.html
- https://infosys.beckhoff.com/content/1033/tc3_eventlogger/4278578443.html

Pros:

- Structured event model: messages, alarms, severity, source information,
  event class and event ID.
- Best match for `tc_event_list` and future alarm-aware tools.
- Supports modern TwinCAT 3 EventLogger concepts instead of legacy COM-only
  access.
- Can represent PLC-generated events from `Tc3_EventLogger` cleanly.

Cons:

- Official user mode API is .NET/NuGet based, while this repo is TypeScript.
- Needs either a small optional .NET helper process or a separate integration
  package.
- Requires live validation against TwinCAT versions and runtime targets.

Recommendation:

- Treat as the preferred long-term structured backend for `tc_event_list`.
- In Phase 2, design the internal provider interface so this backend can be
  added without changing the tool schema.
- Do not block early Phase 2 on the .NET helper unless structured alarms become
  the immediate priority.

### 2. Windows Event Log / Beckhoff `Get-TcEvent`

Beckhoff's ADS PowerShell documentation describes `Get-TcEvent`, which reads
TwinCAT entries from Windows event logs locally or remotely. It explicitly says
TwinCAT writes log entries into the Windows Application log and calls out
important diagnostic sources such as `TcSysUi` and `TcSysSrv`.

Relevant source:

- https://infosys.beckhoff.com/content/1031/tc3_ads_ps_tcxaemgmt/11224171275.html

Pros:

- Good practical first backend on Windows systems.
- Covers TwinCAT System Service and driver-related system messages.
- Supports filters that map well to tool inputs: max events, level, source,
  start/end time and event ID.
- Can be prototyped outside the ADS runtime service without changing PLC tools.

Cons:

- Windows-specific.
- May require administrator privileges for some logs.
- `Get-TcEvent` depends on Beckhoff's PowerShell module availability.
- It is log-entry oriented, not a full alarm-state API.

Recommendation:

- Use as the first pragmatic backend for Windows runtime diagnostics if the
  module is installed.
- Provide a fallback provider based on native Windows Event Log access
  (`Get-WinEvent` or equivalent) for `Application` log entries from known
  TwinCAT providers.
- Keep it optional and capability-reported, because not every MCP/Pi runtime
  host will have Windows event log access.

### 3. Legacy TwinCAT EventLogger / OS event routing

Older Beckhoff documentation describes routing TwinCAT system messages to the
operating system event viewer, the TwinCAT EventLogger, or both via
`LogMessageType`. It also notes that NC and I/O messages can be logged, with
limitations to reduce system load.

Relevant source:

- https://infosys.beckhoff.com/content/1033/tceventlogger/12332566027.html

Pros:

- Explains why the same runtime issue may appear in EventLogger, Windows Event
  Log, or both.
- Useful for compatibility analysis on older systems.

Cons:

- Legacy-oriented and partly superseded by TwinCAT 3 EventLogger.
- Registry-dependent behavior makes it a poor primary API.

Recommendation:

- Document as compatibility context only.
- Do not make legacy EventLogger/registry behavior the primary Phase 2 backend.

### 4. ADS System Service file access

Beckhoff documents ADS file operations through the TwinCAT System Service:
open/read/write/close files via ADS index groups and offsets.

Relevant source:

- https://infosys.beckhoff.com/content/1033/tcadscommon/12555463307.html

Pros:

- ADS-native way to read configured target-side text files.
- Potentially useful for `tc_log_read` when a runtime product writes plain log
  files and the path is known.
- Fits direct/router ADS connection modes conceptually.

Cons:

- Low-level file access, not an event API.
- Requires known paths, encoding handling, size limits and tail/range logic.
- Read/write-capable system service must be treated carefully, even if this repo
  only exposes read operations.
- The cited page is from TwinCAT 2 ADS docs, so live validation against TwinCAT 3
  targets is required.

Recommendation:

- Consider as an optional `configuredFile` backend for `tc_log_read`.
- Keep it read-only, path-allowlisted, byte-limited and disabled by default.
- Do not use it for `tc_event_list`.

### 5. TwinCAT/BSD or Linux-host logs

Beckhoff documents TwinCAT/BSD logs under `/var/log/messages` and
`/var/log/security`, with filtering for TwinCAT-relevant entries.

Relevant source:

- https://infosys.beckhoff.com/content/1033/twincat_bsd/5684357259.html

Pros:

- Necessary for future non-Windows targets.
- Good fit for explicit, configured `tc_log_read` sources.

Cons:

- Requires local filesystem access, SSH, a deployed helper, or another remote
  log transport.
- Not currently covered by the ADS-only core design.
- Less structured than EventLogger APIs.

Recommendation:

- Record as future/provider design input.
- Do not implement in the first Phase 2 cut unless a target deployment model is
  chosen.

### 6. Product-specific log files

Many TwinCAT functions and add-ons have their own log files. These are useful
for support diagnostics but differ by product and installation.

Pros:

- Very useful when a specific function is in scope.
- Can be represented by the same `configuredFile` provider as ADS/local file
  logs.

Cons:

- Not TwinCAT-wide.
- Paths, formats and severity semantics vary.

Recommendation:

- Support only through configured log sources.
- Avoid hardcoding product-specific paths in core Phase 2.

## Proposed Internal Provider Model

Introduce a provider abstraction before fixing tool schemas:

```ts
interface RuntimeEventProvider {
  readonly id: string;
  readonly kind: "eventlogger" | "windowsEventLog";
  listEvents(input: RuntimeEventQuery): Promise<RuntimeEvent[]>;
}

interface RuntimeLogProvider {
  readonly id: string;
  readonly kind: "configuredFile" | "windowsEventLog" | "command";
  readLog(input: RuntimeLogQuery): Promise<RuntimeLogChunk>;
}
```

Suggested normalized event fields:

- `timestamp`
- `source`
- `severity`
- `id`
- `message`
- `eventClass`
- `eventType`
- `state`
- `raw`

Suggested normalized log fields:

- `source`
- `path`
- `encoding`
- `entries` or `text`
- `truncated`
- `cursor` or `nextOffset`

## Tool API Implications

Recommended first tool shapes:

- `tc_event_list`
  - Inputs: `limit`, `since`, `until`, `severity`, `source`, `id`, `provider`
  - Output: normalized event list plus provider/capability metadata.

- `tc_runtime_error_list`
  - Inputs: same as `tc_event_list`, default severity narrowed to errors and
    critical events.
  - Output: normalized error/event list.

- `tc_log_read`
  - Inputs: `source`, `limitBytes`, `tailLines`, `since`, `contains`,
    `severity`, `cursor`
  - Output: bounded text or parsed entries, `truncated`, and optional cursor.

Keep all outputs bounded by config defaults. The tools should fail with a clear
capability error when no event/log backend is configured or available.

## Decision

For Phase 2:

1. Implement provider interfaces and capability reporting first.
2. Make Windows Event Log / `Get-TcEvent` the pragmatic first Windows backend.
3. Keep TwinCAT 3 EventLogger user mode API as the preferred structured backend,
   likely via an optional helper once the .NET integration is validated.
4. Implement `tc_log_read` for configured log sources, with a bounded local
   Windows Event Log default that reports unavailable capability metadata when
   the local API is missing.
5. Keep Engineering build output and XAE output window access in Phase 3.
