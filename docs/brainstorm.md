# pi-twincat-ads — Kurzfassung

> **Historical brainstorm:** This document records early Pi ADS ideas, not the
> current tool or release specification. For the Engineering 0.5.3 release
> boundary, see [engineering backends](engineering-backends.md).

**Zweck:** Pi-Agent bekommt Lese-/Schreibzugriff auf TwinCAT-Runtime-Werte via ADS.

## Stack

- TypeScript-Package, installierbar via `pi install`
- **ads-client** (Jussi Isotalo) als ADS-Lib — pure JS, keine native Dep
- Pi Extension-API für Tool-Registration und Hooks

## Tools

| Tool | Beschreibung |
|------|----------------|
| `plc_list_symbols(filter?)` | Symbole mit Typ/Scope/Kommentar |
| `plc_read(name)` / `plc_read_many(names[])` | Einzel- und Sum-Read |
| `plc_write(name, value)` | hinter Allowlist-Gate |
| `plc_watch(name)` | Notification-Subscription |
| `plc_state()` | Run/Config/Stop + RTime-Info |
| `plc_log(since?)` | ADS-Log / TcEventLogger |

## Pi-Hooks

- **session_start** — ADS-Connection auf, Symbol-Upload cachen
- **before_agent_start** — Symboltabelle/Achsen-Übersicht initial mitgeben
- **context** — optional kompakten Live-Snapshot (State, Fehler, aktive NCI-Kanäle) pro Turn injizieren
- **tool_call** — Write-Allowlist enforcen, Confirmations
- **session_end** — Handles freigeben, disconnect

## Config

- AMS NetID + Port (default 851)
- Read-only / Write-allowlist
- Snapshot-Variablen für den `context`-Hook
- Notification-Cycle-Time

## Skill-Layer

`SKILL.md` nach Agent-Skills-Standard — wann welches Tool, wie Symbolpfade aussehen, dass Writes Bestätigung brauchen.

## Interne Basics

- Symbol-Handle-Cache (nicht bei jedem Read neu auflösen)
- Typ-Decoder aus TMC-Upload (macht ads-client größtenteils selbst)
- Reconnect-Logik
- Zod/TypeBox-Schemas für Tool-Params

## Repo-Struktur

```
src/index.ts            # Extension entry
src/ads/                # Client-Wrapper, Connection-Mgmt
src/tools/              # ein File pro Tool
src/hooks/              # context-Injection, tool_call-Gate
skills/twincat-ads/     # SKILL.md
package.json            # keyword "pi-package"
```
