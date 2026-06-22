# TwinCAT Engineering Backends

Task 20 introduces the first read-only engineering-context layer. The stable
backend for now is explicit project-file configuration; live XAE and Visual
Studio integrations are reported as unavailable capabilities instead of being
silently assumed.

## Backend Evaluation

### Configured project files

- Status: implemented read-only prototype.
- Input: `engineering.projectFiles` in the normal TwinCAT config.
- Reads: configured `.sln`, `.tsproj`, `.plcproj`, `.hmiproj`, and `.hmi` paths.
- Solution handling: `.sln` files are scanned for referenced TwinCAT PLC and HMI
  project files when the solution file exists locally.
- Capabilities: `engineeringRead: true`, `engineeringWrite: false`.
- Live connection: none. `tc_project_state` reports that no active XAE
  connection is available for this backend.
- Build/error context: the stable tool surface is present, but this backend
  reports build and compiler-error collection as unavailable because project
  files alone cannot invoke XAE/Visual Studio compilation.

### Automation Interface

- Status: planned, not implemented.
- Reason: requires a Windows/XAE automation helper and explicit safety gating.
- Expected use: richer SysManager tree, `tc_build_project`,
  `plc_build_project`, `tc_build_and_get_errors`, `tc_error_list`,
  `tc_error_context`, `tc_output_read`, and later controlled engineering write
  operations.

### DTE / Visual Studio integration

- Status: planned, not implemented.
- Reason: depends on a live Visual Studio/TcXaeShell process and COM automation
  availability.
- Expected use: open solution/workbench discovery and active document context.

### TcXaeShell context

- Status: planned, not implemented.
- Reason: needs a live XAE host integration boundary.
- Expected use: list currently open XAE workbenches and projects.

### GAS / WebSocket

- Status: experimental reference only, not implemented.
- Reason: product/version availability and API stability need more validation.

## Tools

- `tc_list_workbenches`: returns configured workbench summaries and backend
  capabilities.
- `tc_list_projects`: returns configured and solution-referenced engineering
  projects, optionally filtered by workbench or project type.
- `tc_project_state`: returns compact project state with project file, type,
  backend source, capabilities, and active-connection availability.

All three tools are read-only and separate from ADS runtime operations.

## Build and Error Context Tools

Task 23 adds a stable, bounded engineering-build surface without assuming a
live backend:

- `tc_build_project`: build a configured TwinCAT/XAE project when a live build
  backend exists.
- `plc_build_project`: build a PLC project separately when the backend can
  address PLC projects distinctly.
- `tc_build_and_get_errors`: bounded combination of build plus structured
  errors and warnings.
- `tc_error_list`: list engineering, compiler, or parser issues with severity
  and limit filters.
- `tc_error_context`: resolve one issue, file, and line to bounded source text.
- `tc_output_read`: read bounded build or engineering output.

The configured project-file backend returns `status: "unavailable"` for build
calls and an unavailable reason for backend-owned error/output lists. It still
keeps output bounded and can return source context for explicit files that live
inside configured project directories.

Safety boundary: build/compile tools must not automatically activate
configuration, download, login, start, stop, force values, or touch Safety
configuration. Those actions remain separate and require explicit user intent.

## Resource URIs

Task 24 adds resource references for engineering artifacts plus
`tc_resource_read` for bounded dereferencing. See
`docs/engineering-resource-uris.md` for the versioned URI schemes and MCP
Resources/Subscriptions decision.
