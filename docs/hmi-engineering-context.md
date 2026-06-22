# HMI Engineering Context

Task 25 adds a cautious, read-only HMI engineering context for configured
TwinCAT HMI project files. The first implementation only uses local project-file
metadata and referenced artifacts; it does not assume a live XAE, Visual Studio,
or HMI server connection.

## Scope

- Supported inputs: configured `.hmiproj` and `.hmi` project files, including
  projects discovered from configured solution files.
- Supported artifact references: `.view`, `.control`, `.usercontrol`,
  `.content`, and `.html` paths found in project-file attributes.
- Supported metadata: project identity, referenced artifact count, and
  best-effort numeric router/server ports when those values exist in the project
  XML.
- Write behavior: none. No HMI creation, edit, publish, or preview-control tools
  are exposed by this layer.

## Tools

- `hmi_state`: returns configured HMI projects, inferred ports, artifact counts,
  backend capabilities, and explicit active-connection availability.
- `hmi_list_projects`: lists configured HMI project summaries.
- `hmi_preview_info`: reports preview availability. The configured project-file
  backend returns `available: false` even when a server port is found, because it
  does not manage or verify a live HMI server endpoint.
- `hmi_list_controls`: lists referenced HMI views, controls, user controls, and
  content files with `tcfile://` resource URIs for bounded dereferencing through
  `tc_resource_read`.

## Backend Notes

The configured project-file backend is useful for orientation inside an existing
HMI project, but it cannot prove that an HMI is currently running. A future live
backend may add preview URLs or richer active project state, but should keep HMI
write operations separate until a safety model and backend stability are clear.
