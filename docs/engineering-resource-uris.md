# Engineering Resource URIs

Task 24 introduces versioned, agent-facing URI references for TwinCAT
engineering artifacts. Tool responses keep their existing compact metadata and
add resource references where the configured project-file backend can resolve
them safely.

## Version

Current schema version: `v1`.

The scheme names are intentionally stable. Query parameters may grow over time,
but existing `v1` parameters should remain backward-compatible.

## Schemes

- `plcc://pou?project=<project-id>&name=<qualified-name>`
  - Classic PLC object such as POU, method, action, GVL, DUT, interface, or
    property.
  - Returned as `resourceUri` on PLC object summaries.
- `plcpp://...`
  - Reserved for future PLC++/file-based project backends.
  - `tc_resource_read` reports it as unavailable until a PLC++ backend exists.
- `err://issue?id=<issue-id>`
  - Engineering, compiler, or parser issue.
  - Reserved for real build/error backends; the configured project-file backend
    currently has no live error list.
- `io://item?project=<project-id>&path=<tree-path>`
  - SysManager/I/O tree item such as device, box, terminal, task, or XML item.
  - Returned as `resourceUri` on tree and topology summaries.
- `tcfile://file?path=<absolute-path>`
  - Configured project file or referenced source/XML file.
  - Returned as `resourceUri` for projects and `sourceFileUri` for library
    summaries.
- `tcfolder://folder?path=<absolute-path>`
  - Folder under a configured project directory.
  - Returned as `folderUri` for projects.

All path-backed dereferencing is constrained to configured engineering project
directories. A URI pointing outside those roots returns an unavailable result
instead of reading arbitrary files.

## Dereferencing

Use `tc_resource_read` to dereference a resource URI. It accepts:

- `uri`: required resource URI.
- `limitBytes`: optional byte cap for text resources.
- `contextLines`: optional source context window for error resources.

The result includes:

- `scheme` and `kind`
- `available`
- optional `contentType`, `text`, and structured `data`
- `bytesRead` for text resources
- `truncated`
- optional `reason`

## MCP Resources

The current MCP server exposes this layer through the `tc_resource_read` tool.
Native MCP Resources/Subscriptions were evaluated for this phase but are not
enabled yet because the existing server is tool-only and the file-backed
engineering backend has no live change notifications. A future live XAE or
Automation Interface backend can map the same URI schemes to MCP Resources and
subscriptions without changing the URI contract.
