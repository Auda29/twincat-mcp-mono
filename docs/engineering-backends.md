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

### Automation Interface

- Status: planned, not implemented.
- Reason: requires a Windows/XAE automation helper and explicit safety gating.
- Expected use: richer SysManager tree, build, error list, and later controlled
  engineering write operations.

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
