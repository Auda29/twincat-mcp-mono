# Project Safety Rules

TwinCAT project-file work can be offline, but XAE also exposes actions that
affect live machines and deployed runtime configuration. Keep those boundaries
explicit.

## Allowed Without Extra User Confirmation

These are acceptable when they are clearly part of the requested project-file
task:

- Read project files, XML, and source code from the workspace.
- Use read-only Engineering context tools such as project lists, tree reads,
  PLC code reads/searches, resource reads, HMI context, and Engineering
  error/output reads.
- Edit offline source project files in the workspace.
- Run local static checks that do not connect to or change a target.
- Run a local build or compile only when the user's request calls for validation
  and the build command is known not to activate, download, login, start, stop,
  or force values.

## Require Explicit User Request

Do not perform these actions unless the user specifically asks for that action
in this turn or an active approved plan:

- Activate Configuration.
- Download, Online Change, Login, Logout, or create boot project on a target.
- Run, Stop, Reset, Restart, or change TwinCAT runtime mode.
- Write, set, or force PLC/NC/I/O values.
- Add, remove, enable, disable, or modify breakpoints.
- Start debug stepping, single-cycle execution, or trace capture that affects a
  running controller.
- Change routes, AMS Net IDs, target selection, or online connection settings.
- Scan, rescan, reload, or reconfigure fieldbus/I/O devices against live
  hardware.
- Modify safety projects, TwinSAFE logic, FSoE addresses, safety aliases, safety
  mappings, or safety terminal configuration.

## Safety-Adjacent Change Detection

Pause and call out the safety boundary when a change touches:

- TwinSAFE, FSoE, EL69xx, safety alias devices, safety terminals, or safety I/O.
- NC axes, drives, motion commands, homing, limits, or enable chains.
- PLC code that writes outputs, controls actuators, bypasses interlocks, or
  changes error handling.
- Retain/persistent variables, recipe data, calibration constants, or process
  limits.
- Task cycle times, task priority, core assignment, watchdogs, or startup code.

## Communication Pattern

When a requested action crosses the boundary, state the exact XAE action and the
risk in plain terms. Example:

"This requires `Activate Configuration`, which can change the running target
configuration. I will not do that unless you explicitly ask for activation."

When an action is safe because it is offline, say so briefly:

"I only changed the offline PLC project files; I did not login, download, or
activate the configuration."
