# TwinCAT Engineering Backends

The ordinary configured-file backend reads saved project files. It does not
inspect live editor buffers or provide build, error-list, or output access.
Engineering 0.5.3 also includes a dedicated native host provider for an
Assistant-owned child, with the narrower scope described below.

## Dedicated native host provider

The Assistant-owned child can opt into protocol 1 through its bounded stdin
bootstrap and authenticated local pipe. The ordinary configured-file MCP path
does not acquire editor or build access. The helper receives the host's exact
already-bound DTE. The published factory supplies no text-buffer accessor. See
[the native provider contract](native-engineering-provider-v1.md).

The Assistant-owned authenticated child exposes nine session, build and
diagnostic tools by default. It supports selective PLC-only `.plcproj` builds
with explicit native approval and immutable configuration and platform inputs.
It refuses unknown dirty state, platform mismatch, ambiguous association, unsafe
project hooks and nonempty or unverifiable build dependencies. Builds are
nonblocking. Diagnostics and output are retained for an explicit build operation,
and compiler navigation requires a retained source baseline, an explicit
native click and an exact current ErrorItem match.

In the published 0.5.3 release, all new `source.*` discovery, read, preview,
apply, rollback and journal operations are inactive. The release factory uses
`CreateWithHostAccess` with a null text-buffer accessor, the host rejects
`source.*`, and there is no section callback or UI. Development factories and
the fifteen-tool development catalog remain behind trusted host APIs and an
in-code-only catalog option. Those development paths include raw XML buffer
changes and read-only custom ST editor
access; they are not release capabilities. See
[the native provider contract](native-engineering-provider-v1.md) for details.

The child exposes no ADS runtime writes and no activation, download, login,
run/stop or force actions. The provider requires host integration acceptance
and has not been validated in a real host.

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

- Status: the dedicated native host helper exists for the Assistant-owned
  child. Its released build path is selective PLC-only compilation with native
  approval; broader live tree and source operations are not established release
  capabilities. The configured-file backend remains separate.

### DTE / Visual Studio integration

- Status: the dedicated helper uses the host's already-bound DTE for its
  released session, build and diagnostic operations. Ordinary configured-file
  tools do not acquire active document context.

### TcXaeShell context

- Status: the dedicated helper depends on an existing host integration. It
  does not imply general discovery or attachment to open XAE workbenches.

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

The ordinary configured-file catalog has the following build/error tool names.
Its availability and inputs differ from the dedicated nine-tool child described
in [the MCP README](../packages/mcp/README.md#assistant-owned-bound-engineering-child):

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

## HMI Engineering Context

Task 25 adds read-only HMI orientation tools on top of configured `.hmiproj` and
`.hmi` files:

- `hmi_state`: compact HMI project state, inferred ports, and active-connection
  availability.
- `hmi_list_projects`: configured HMI project summaries.
- `hmi_preview_info`: preview availability and metadata. The configured
  project-file backend reports preview as unavailable because it has no live HMI
  server control or verification path.
- `hmi_list_controls`: referenced HMI view/control/user-control/content
  artifacts with `tcfile://` resource URIs.

This layer is intentionally exploratory and read-only. See
`docs/hmi-engineering-context.md` for the detailed scope.
