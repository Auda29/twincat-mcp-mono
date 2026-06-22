# Common TwinCAT Workflows

Use these workflows for offline XAE project work. Keep each step scoped to the
workspace unless the user explicitly asks for an online XAE action.

## Orient With Read-Only Engineering Tools

1. Use `tc_list_workbenches`, `tc_list_projects`, and `tc_project_state` to
   identify the configured XAE context.
2. Use `tc_tree_search`, `tc_tree_read`, `tc_tree_describe_item`,
   `io_list_topology`, `io_describe_device`, and `io_describe_terminal` for
   SysManager and I/O topology questions.
3. Use `plc_list_pous`, `plc_read_pou`, `plc_search_code`,
   `plc_describe_pou`, `plc_list_libraries`, and `plc_describe_library` for PLC
   code and library context.
4. Use `tc_build_project`, `plc_build_project`, `tc_build_and_get_errors`,
   `tc_error_list`, `tc_error_context`, and `tc_output_read` for Engineering
   build/error context. If a backend reports unavailable, explain the capability
   boundary.
5. Use `tc_resource_read` for returned `plcc://`, `err://`, `io://`,
   `tcfile://`, and `tcfolder://` references instead of expanding large dumps.
6. Use `hmi_state`, `hmi_list_projects`, `hmi_preview_info`, and
   `hmi_list_controls` for exploratory HMI context. Keep HMI creation, editing,
   publishing, and preview control out of scope unless a future safety model
   explicitly supports them.

## Find An Object From User Language

1. Extract the strongest XAE terms from the request: FB, POU, method, GVL, DUT,
   task, I/O device, box, terminal, HMI view/control, or Klemme.
2. Prefer the read-only Engineering tools above when they are available; search
   by exact object name first, then by distinctive variable or method names.
3. Inspect the owning project file before editing, especially `.plcproj` and the
   owner POU file.
4. Translate the result back to XAE terms before acting.

## Edit A POU, FB, Method, Or Action

1. Read the owner POU and nearby similar objects.
2. Preserve declaration/implementation language and XML shape.
3. Change the smallest relevant declaration or implementation section.
4. Do not reorder unrelated methods, actions, properties, variables, or XML
   nodes.
5. Validate XML well-formedness when possible.
6. Summarize the changed XAE object and include file paths only as references.

## Add A PLC Object

1. Find an existing object of the same type in the same PLC project.
2. Copy the local file naming, folder placement, XML structure, project include
   entry style, and compile order pattern.
3. Create only the required source file and project reference.
4. Do not invent GUID or ID formats if the project has a generated pattern that
   should come from XAE. Prefer asking for confirmation or documenting the
   limitation.
5. Check for task assignment only if adding a runnable program. Do not assign it
   to a task unless requested.

## Review Or Adjust I/O Tree Files

1. Treat I/O tree edits as higher risk than ordinary PLC code edits.
2. Use read-only topology tools first when available, then identify the XAE node
   type: I/O Device, Box, Terminal, channel, mapping, or process image link.
3. Preserve addresses, revisions, IDs, and mapping references unless the user
   requested the exact change.
4. Avoid scans or online hardware discovery unless explicitly requested.
5. Explain changes in I/O tree terms, not as generic XML edits.

## Review HMI Project Context

1. Use `hmi_state` and `hmi_list_projects` to confirm the configured HMI project.
2. Use `hmi_list_controls` for referenced views, controls, user controls, and
   content files.
3. Use `hmi_preview_info` only as capability metadata; the configured
   project-file backend does not manage a live preview endpoint.
4. Do not create or edit HMI artifacts unless the user explicitly asks for an
   offline file edit and the repository pattern is clear.

## Validation Checklist

- XML is well formed for edited project files.
- The `.plcproj` references every new PLC source file and no removed file remains
  referenced.
- Names, casing, folder paths, and include order match nearby objects.
- No generated, build-output, or target-derived artifacts were edited.
- No online action was performed unless explicitly requested.
- Final explanation names XAE objects first and file/XML references second.
