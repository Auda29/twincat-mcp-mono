# SysManager Tree And I/O Topology

Task 21 extends the read-only engineering context with a project-file based
System Manager tree prototype.

## Scope

- Reads configured TwinCAT/System Manager project files from
  `engineering.projectFiles`.
- Parses `.tsproj` XML and referenced local XML/XTI-style files.
- Builds a compact tree index from XML elements, attributes, child scalar
  values, comments, and source files.
- Classifies common System Manager concepts such as I/O nodes, devices, boxes,
  terminals, and tasks with conservative heuristics.
- Does not connect to XAE, scan hardware, activate configuration, or write
  project files.

## Tools

- `tc_tree_read`: read one tree item by full tree path, id, or name.
- `tc_tree_search`: search tree items by query, name, type, comment, project,
  and bounded result limit.
- `tc_tree_describe_item`: describe one tree item with compact settings and
  direct children.
- `io_list_topology`: list detected I/O devices with boxes and terminals.
- `io_describe_device`: describe one detected I/O device and its descendants.
- `io_describe_terminal`: describe one detected terminal.

## Notes

The file-backed backend is intentionally a read-only prototype. Live XAE
Automation Interface, Visual Studio DTE, and TcXaeShell backends can later
provide richer type information and exact TwinCAT TreeItem paths, but they need
separate Windows/XAE helpers and explicit safety gating.

Schreibende Tree-Operationen such as create, rename, delete, scan, rescan, or
hardware reload remain out of scope for this phase.
