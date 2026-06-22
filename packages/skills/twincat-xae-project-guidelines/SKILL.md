---
name: twincat-xae-project-guidelines
description: >-
  Agent-neutral guidelines for editing and reviewing TwinCAT 3 XAE/Visual Studio
  project files, PLC project XML, .tsproj/.plcproj artifacts, POUs, GVLs, DUTs,
  tasks, I/O tree items, devices, boxes, terminals, and HMI project artifacts.
  Use when an agent works on TwinCAT XAE project structure, maps files/XML/paths
  to the XAE project tree, uses read-only engineering context tools, or
  communicates project-file changes in XAE terms while avoiding unsafe online
  actions.
---

# TwinCAT XAE Project Guidelines

Use this skill for TwinCAT 3 XAE project-file work: read-only engineering
context, offline edits, reviews, project-tree reasoning, and user-facing
explanations. Do not use it as runtime ADS guidance; if live runtime values or
diagnostics are needed, use a TwinCAT ADS skill or tool separately.

## Workflow

1. Identify the XAE surface behind each artifact before editing. Load
   [xae-file-to-ui-map.md](references/xae-file-to-ui-map.md) when translating
   files, XML, or paths into XAE project-tree terms.
2. Use available read-only Engineering tools before manual XML spelunking when
   an agent surface exposes them: `tc_list_projects`, `tc_project_state`,
   `tc_tree_search`, `plc_list_pous`, `plc_search_code`, `tc_error_list`,
   `tc_resource_read`, `hmi_state`, and `hmi_list_controls` can provide bounded
   project context without editing files or touching a target.
3. Classify PLC objects before changing them. Load
   [plc-object-model.md](references/plc-object-model.md) when POUs, programs,
   FBs, functions, methods, actions, properties, GVLs, DUTs, interfaces,
   libraries, or tasks are involved.
4. Preserve TwinCAT identity and ordering. Do not change GUIDs, IDs, object
   names, TreeItem paths, task bindings, device identities, or project include
   order unless the user explicitly asked for that specific change.
5. Copy nearby project patterns instead of inventing structure. Match existing
   file locations, XML shape, casing, language markers, namespace style,
   comments, and declaration/implementation split.
6. Avoid generated or target-derived artifacts. Keep edits in source project
   files and keep XML well formed; do not mass-format TwinCAT XML unless the
   repository already does that.
7. Enforce the online safety boundary. Load
   [project-safety-rules.md](references/project-safety-rules.md) before any
   action that could affect a live target, runtime state, safety configuration,
   debugging session, or deployed configuration.
8. Explain results in XAE/user terms first. Mention file paths, XML elements,
   or line numbers only as technical references after saying which POU, FB,
   method, GVL, DUT, task, I/O device, box, terminal, or HMI artifact changed.

## References

- [xae-file-to-ui-map.md](references/xae-file-to-ui-map.md): Load when mapping
  project files, XML nodes, TreeItem paths, or folder paths to XAE UI concepts.
- [plc-object-model.md](references/plc-object-model.md): Load when creating,
  moving, or reviewing PLC objects and compile/project references.
- [project-safety-rules.md](references/project-safety-rules.md): Load before
  build/online/debug/deploy/safety-adjacent work or when user intent is unclear.
- [common-twincat-workflows.md](references/common-twincat-workflows.md): Load
  for common read-only context and offline edits such as finding objects,
  reading POUs, reviewing build/errors, editing a POU, adding PLC objects, or
  reviewing I/O tree and HMI context.

## Core Rules

- Treat the XAE project tree and the XML/file graph as two views of the same
  project. Keep them consistent.
- Prefer the smallest edit that matches the existing project style.
- Verify XML syntax after edits when a parser or project build is available.
- Never silently convert TwinCAT concepts into generic code terms in user
  communication. Say "FB method", "GVL", "DUT", "Task", "I/O Device", "Box",
  "Terminal", or "HMI View" when those are the user's XAE objects.
- Treat read-only Engineering tools as orientation aids, not write permission.
  They can summarize projects, POUs, I/O topology, build/error context,
  resources, and HMI artifacts, but they do not justify online actions or
  project-file edits beyond the user's request.
