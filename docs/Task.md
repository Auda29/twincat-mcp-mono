# Task Breakdown fuer `twincat-mcp` Monorepo

Diese Datei verfolgt die verbleibenden und abgeschlossenen Arbeiten im
`twincat-mcp` npm-workspaces-Monorepo mit `core`, `pi` und `mcp`. Die aktive
Planung steht bewusst oben; abgeschlossene Phasen bleiben darunter als
historischer Kontext erhalten.

## Tasks

## Phase 4: Skill-Aktualisierung fuer Engineering-Tools

### 26. Mitgelieferte Skills auf `0.5.0` Engineering-Tooling aktualisieren `[Done]`

- Pi-Skill `packages/pi/skills/twincat-ads/SKILL.md` um die seit `0.5.0`
  ausgelieferten read-only Engineering-Tools ergaenzen.
- MCP-Skill `packages/mcp/skills/twincat-mcp-ads/SKILL.md` analog erweitern,
  inklusive Toolnamen und empfohlenem Workflow fuer MCP-Agenten.
- Agent-neutralen Skill `packages/skills/twincat-xae-project-guidelines`
  auf Konsistenz mit tool-unterstuetztem read-only Projektkontext pruefen.
- Alte Formulierungen entfernen oder praezisieren, die Engineering-Fehlerlisten,
  Build-Ausgaben, POU-/Code-Kontext, I/O-Topologie oder HMI-Kontext noch als
  "spaetere Phase" darstellen.
- Read-only Engineering-Tools klar von ADS-Runtime-Reads und schreibenden oder
  online-wirksamen XAE-Aktionen abgrenzen.
- Folgende Toolgruppen dokumentieren:
  - Workbench-/Projektkontext: `tc_list_workbenches`, `tc_list_projects`,
    `tc_project_state`
  - Engineering-Build und Fehlerkontext: `tc_build_project`,
    `plc_build_project`, `tc_build_and_get_errors`, `tc_error_list`,
    `tc_error_context`, `tc_output_read`
  - Resource-URIs: `tc_resource_read` fuer `plcc://`, `err://`, `io://`,
    `tcfile://`, `tcfolder://`
  - HMI-Kontext: `hmi_state`, `hmi_list_projects`, `hmi_preview_info`,
    `hmi_list_controls`
  - SysManager/I/O: `tc_tree_read`, `tc_tree_search`,
    `tc_tree_describe_item`, `io_list_topology`, `io_describe_device`,
    `io_describe_terminal`
  - PLC-Codekontext: `plc_list_pous`, `plc_read_pou`, `plc_search_code`,
    `plc_describe_pou`, `plc_list_libraries`, `plc_describe_library`
- Packaging-Sync pruefen: shared `twincat-xae-project-guidelines` muss weiterhin
  beim Packen konsistent in Pi- und MCP-Paket erscheinen.

### 27. Automation-Interface-Helper und DTE-Verbindung aufbauen `[Open]`

- `automationInterface` als echtes Live-XAE-Backend ausarbeiten, getrennt vom
  bisherigen `configuredProjectFiles` Backend.
- Windows-only .NET Helper evaluieren, der per JSON ueber stdin/stdout oder
  lokale Pipe vom Node/Core-Prozess angesprochen wird.
- Helper als STA-Prozess mit COM Message Filter auslegen, damit abgewiesene
  Visual-Studio-/TcXaeShell-COM-Aufrufe kontrolliert wiederholt werden koennen.
- DTE-Verbindung unterstuetzen:
  - Attach an laufende Visual-Studio-/TcXaeShell-Instanzen ueber Running Object
    Table und Solution-Pfad.
  - Optionales Starten einer neuen Instanz ueber ProgIDs wie
    `TcXaeShell.DTE.17.0`, `VisualStudio.DTE.17.0`,
    `VisualStudio.DTE.16.0` oder `VisualStudio.DTE.15.0`.
  - Aktive ProgID, Solution-Pfad, UI-Sichtbarkeit und Timeout konfigurierbar
    machen.
- `ITcSysManager` aus dem TwinCAT-Projekt der DTE-Solution ableiten und als
  Backend-Session kapseln.
- Capability-Antworten so erweitern, dass Agenten klar zwischen
  `configuredProjectFiles`, `automationInterface`, `dte` und nicht verfuegbaren
  Live-Funktionen unterscheiden koennen.
- Fehlerbilder dokumentieren: fehlendes TwinCAT XAE, falsche ProgID, keine
  offene Solution, COM `RPC_E_CALL_REJECTED`, Berechtigungen, Bitness- oder
  Version-Mismatch.
- Helper-Contract-Tests ohne echte XAE-Installation und Core-Tests gegen
  gemockte Helper-Antworten planen.

### 28. Read-only XAE-Projekt-, Tree-, POU- und Library-Kontext ueber Automation Interface anbinden `[Open]`

- Workbench- und Projekt-Tools ueber die Live-XAE-Session anbinden:
  `tc_list_workbenches`, `tc_list_projects`, `tc_project_state`.
- SysManager-Tree read-only ueber `ITcSmTreeItem` anbinden:
  `tc_tree_read`, `tc_tree_search`, `tc_tree_describe_item`.
- PLC-Codekontext ueber Automation-Interface-Schnittstellen anbinden:
  `plc_list_pous`, `plc_read_pou`, `plc_search_code`, `plc_describe_pou`.
- POU-Quelltext ueber `ITcPlcDeclaration`, `ITcPlcImplementation` und passende
  Sub-POU-Schnittstellen lesen, statt nur Projektdateien zu parsen.
- PLC-Libraries und Placeholder ueber `ITcPlcLibraryManager` anbinden:
  `plc_list_libraries`, `plc_describe_library`.
- Resource-URI-Ausgaben so angleichen, dass file-backed und live-backed
  Engineering-Kontext fuer Agenten moeglichst gleich wirken.
- Manuelle Windows-XAE-Checkliste fuer echte Integration pflegen.

### 29. Build-, Error-List- und Output-Tools ueber Automation Interface mit Safety-Grenze anbinden `[Open]`

- `tc_error_list`, `tc_error_context` und `tc_output_read` ueber Visual Studio
  DTE Error List und Output-Fenster anbinden.
- Build-Funktionen erst nach stabilem read-only Backend aktivieren:
  `tc_build_project`, `plc_build_project`, `tc_build_and_get_errors`.
- Build-/Check-All-Objects-Verhalten getrennt modellieren, damit reine
  Validierung nicht versehentlich Online-Aktionen ausloest.
- Safety-Grenze technisch erzwingen: kein `ActivateConfiguration`, Download,
  Login, Start/Stop, Force Values, Safety-Aenderungen oder HMI-Write als
  Nebeneffekt eines Read-, Error- oder Build-Tools.
- Ergebnislimits, Timeouts und strukturierte Fehlerreferenzen fuer Error List,
  Output-Fenster und Build-Ergebnisse definieren.
- Tests fuer unavailable/live-capability-Faelle, gemockte Error-List-Eintraege
  und Safety-Boundary-Ausgaben ergaenzen.

### 30. Beckhoff Information System als optionales Dokumentations-Backend indexieren `[Open]`

- Lokales TwinCAT 3 Information System als optionale Kontextquelle evaluieren,
  getrennt von Skills, ADS-Runtime und XAE-Engineering-Backends.
- Installationsorte und Formate des Microsoft Help Viewer / Beckhoff Information
  System Katalogs fuer TwinCAT 3 pruefen.
- Rechtliche und praktische Grenze festhalten: Beckhoff-Dokumentation nicht im
  npm-Paket mitliefern, sondern lokal installierte oder online erreichbare
  Quellen referenzieren und nur begrenzte Snippets ausgeben.
- Lokalen Suchindex planen, z. B. SQLite FTS oder vergleichbare kompakte
  Volltextsuche im User-Cache.
- Docs-Tools entwerfen:
  - `tc_docs_status` fuer Verfuegbarkeit, Sprache, Quelle und Indexstand.
  - `tc_docs_search` fuer begrenzte Treffer mit Titel, Snippet und Quelle.
  - `tc_docs_read` fuer gezieltes, limitiertes Lesen eines Artikels.
  - `tc_docs_lookup_symbol` fuer PLC-/Library-/Funktionsbaustein-Kontext.
  - `tc_docs_lookup_error` fuer Fehlercodes, Compiler- oder Runtime-Meldungen.
- Quellenangaben stabil halten: lokale Help-Viewer-ID, Infosys-URL,
  Produktbereich, Sprache und Aktualisierungsstand.
- Agenten-Workflow dokumentieren: Skill gibt Arbeitsweise vor, Docs-Backend
  liefert offiziellen Beckhoff-Kontext zu Symbolen, Libraries, Klemmen,
  Fehlercodes, Automation-Interface-APIs und TwinCAT-Konzepten.
- Online-Fallback auf `infosys.beckhoff.com` nur optional und konfigurierbar
  vorsehen, damit Offline- oder abgeschottete Engineering-Systeme sauber
  funktionieren.
- Tests mit kleinem synthetischem Doku-Korpus planen, damit Indexierung,
  Ranking, Snippet-Limits und Quellenangaben ohne Beckhoff-Installation
  pruefbar bleiben.

## Phase 3: XAE-Engineering-, Projekt- und Code-Kontext

Diese Phase orientiert sich an den CoAgent-Rechercheergebnissen, bleibt aber
produktunabhaengig entworfen. Ziel ist ein optionales Engineering-Backend fuer
offene TwinCAT-XAE-/Visual-Studio-Projekte. Die Tool-Oberflaeche soll klar von
den ADS-Runtime-Tools getrennt bleiben, weil Verfuegbarkeit, Berechtigungen und
Fehlerbilder andere sind.

### 17. Agent-neutrale TwinCAT-XAE-Projekt-Guidelines als Skill erstellen `[Done]`

- Einen agent-neutralen Skill fuer TwinCAT-3-Projektarbeit entwerfen, z. B. `twincat-xae-project-guidelines`.
- Der Skill soll die Uebersetzung zwischen Agentensicht und Usersicht beschreiben: Datei/XML/Pfad -> XAE-Projektbaum, POU, FB, Methode, Aktion, GVL, DUT, Task, I/O-Device, Box, Klemme.
- TwinCAT-spezifische Arbeitsregeln dokumentieren: GUIDs/IDs/TreeItem-Pfade nicht unnoetig aendern, bestehende Projektmuster kopieren, generierte Artefakte meiden, XML wohlgeformt halten.
- Sicherheitsregeln festhalten: kein Activate Configuration, Download, Login, Run/Stop, Force Values, Safety-Aenderungen oder Breakpoints ohne explizite User-Anforderung.
- User-facing Kommunikationsregeln festlegen: Aenderungen in XAE-Begriffen erklaeren und XML-Zeilen/Pfade nur als technische Zusatzreferenz nennen.
- Skill-Struktur mit schlankem `SKILL.md` und References planen, z. B. `xae-file-to-ui-map.md`, `plc-object-model.md`, `project-safety-rules.md`, `common-twincat-workflows.md`.
- Skill-Quelle zentral halten, z. B. unter `packages/skills`, damit der Skill nicht Pi- oder MCP-spezifisch ist.

### 18. Skills mit dem Pi-Package ausliefern `[Done]`

- Bestehenden Pi-spezifischen ADS-Skill weiter mit `pi-twincat-ads` ausliefern.
- Den agent-neutralen `twincat-xae-project-guidelines` Skill zusaetzlich mit dem Pi-Package ausliefern.
- Pi-ADS-Skill auf logische Konsistenz mit `twincat-xae-project-guidelines` pruefen, insbesondere Begriffe, Safety-Regeln und Abgrenzung von Runtime-Zugriff zu Projektdatei-Arbeit.
- Packaging so gestalten, dass die zentrale Skill-Quelle nicht manuell dupliziert werden muss oder ein klarer Sync-/Pack-Schritt existiert.
- Pi-Dokumentation ergaenzen: `twincat-ads` beschreibt Runtime-/ADS-Toolnutzung, `twincat-xae-project-guidelines` beschreibt Projektdatei-/XAE-Arbeitsweise.

### 19. Skills mit dem MCP-Package ausliefern `[Done]`

- Einen MCP-spezifischen Tool-Usage-Skill ergaenzen, analog zum Pi-ADS-Skill, aber fuer die MCP-Tool-Oberflaeche.
- Den agent-neutralen `twincat-xae-project-guidelines` Skill zusaetzlich mit dem MCP-Package ausliefern.
- MCP-Tool-Usage-Skill auf logische Konsistenz mit `twincat-xae-project-guidelines` und dem Pi-ADS-Skill pruefen, damit Toolnamen, Begriffe, Safety-Regeln und empfohlene Workflows nicht widerspruechlich sind.
- Dokumentieren, dass der MCP-Server Tools bereitstellt, waehrend Skills agentenseitig Arbeitsweise, Sprache und Sicherheitsregeln steuern.
- Packaging so gestalten, dass shared Skills zwischen Pi und MCP konsistent bleiben.

### 20. Engineering-Backend und Projektkontext evaluieren `[Done]`

- Verfuegbare Backends fuer XAE-/Visual-Studio-Projektzugriff evaluieren:
  Automation Interface, DTE/VS-Integration, TcXaeShell-Kontext, GAS/WebSocket
  oder explizit konfigurierte Projektdateien. `[Done: docs/engineering-backends.md]`
- Read-only-Prototyp fuer Workbench-/Projekt-Erkennung bauen. `[Done: configured project-file backend]`
- `tc_list_workbenches` pruefen, falls ein Live-XAE-Kontext verfuegbar ist. `[Done: live backends werden als unavailable capabilities gemeldet]`
- `tc_list_projects` implementieren oder prototypisieren, um SysManager-, PLC- und HMI-Projekte sichtbar zu machen. `[Done]`
- `tc_project_state` definieren, um Projektdatei, Projekttyp, aktive Verbindung und Backend-Quelle kompakt auszugeben. `[Done]`
- Backend-Faehigkeiten explizit melden, z. B. `runtimeOnly`, `engineeringRead`, `engineeringWrite`. `[Done]`

### 21. SysManager-Tree und I/O-Topologie als Engineering-Kontext lesen `[Done]`

- Read-only-Zugriff auf den SysManager-Baum evaluieren. `[Done: docs/sysmanager-tree-topology.md]`
- `tc_tree_read` implementieren, um einen konfigurierten oder angegebenen Tree-Pfad gezielt zu lesen. `[Done]`
- `tc_tree_search` implementieren, um TreeItems nach Name, Typ oder Kommentar zu finden. `[Done]`
- `tc_tree_describe_item` implementieren, um Typ, Pfad, Kommentar, Settings und Kinder kompakt zu beschreiben. `[Done]`
- `io_list_topology` als Engineering-Ergaenzung zu den ADS-IO-Reads aus Phase 2 entwerfen. `[Done]`
- `io_describe_device` und `io_describe_terminal` fuer Geraete/Klemmen pruefen. `[Done]`
- Schreibende Tree-Operationen wie Create/Rename/Delete nur als spaetere, separat gegatete Phase vormerken. `[Done: weiterhin out of scope]`

### 22. PLC-Code-, POU- und Library-Kontext read-only einfuehren `[Done]`

- Classic PLC und PLC++/dateibasierte Projekte getrennt modellieren. `[Done: file-backed Classic/TcPlcObject prototype; PLC++ bleibt spaeteres Backend-Thema]`
- `plc_list_pous` implementieren, um Programme, FBs, Funktionen, GVLs, Interfaces und Methoden sichtbar zu machen. `[Done]`
- `plc_read_pou` implementieren, um Interface und Implementation eines POU gezielt zu lesen. `[Done]`
- `plc_search_code` implementieren, um Code und Deklarationen mit Limits zu durchsuchen. `[Done]`
- `plc_describe_pou` implementieren, um Art, Pfad/FQN, Deklarationen, Aufrufpunkte und Quellort zusammenzufassen. `[Done: kompakte Previews und Quellort]`
- `plc_list_libraries` und `plc_describe_library` pruefen, um installierte/referenzierte PLC-Bibliotheken sichtbar zu machen. `[Done]`
- Schreibende Code-Tools wie `plc_update_pou`, `plc_create_pou`, `plc_delete_pou` erst nach stabilem Read-only-Design planen. `[Done: weiterhin out of scope]`

### 23. Engineering-Build und Fehlerkontext ergaenzen `[Done]`

- `tc_build_project` als ersten Build-Toolcall vorsehen, um ein explizit konfiguriertes TwinCAT-/XAE-Projekt zu bauen.
- `plc_build_project` als PLC-spezifische Variante pruefen, wenn PLC-Projekte eindeutig getrennt vom TwinCAT-Gesamtprojekt adressiert werden koennen.
- `tc_build_and_get_errors` als begrenztes Kombi-Tool pruefen, das Build ausfuehrt und direkt strukturierte Fehler/Warnings zurueckgibt.
- Windows-only Engineering-Backend ueber XAE/Visual-Studio Automation Interface und optionalen .NET Helper evaluieren.
- CoAgent/GAS-`sm.build` nur als Inspiration oder experimentelles Backend vormerken, nicht als erste stabile API annehmen.
- `tc_error_list` fuer Engineering-/Compiler-/Parserfehler implementieren.
- `tc_error_context` implementieren, um Fehler mit POU, Buffer, Datei, Zeile und Quelltextausschnitt zu verbinden.
- `tc_output_read` implementieren, um Build-, Output- oder Engineering-Logs mit Filtern zu lesen.
- Safety-Grenze dokumentieren: Build/Compile darf nicht automatisch Activate Configuration, Download, Login, Start oder Stop ausloesen.
- Ausgabe immer begrenzen und auf konkrete Fehlerreferenzen statt grosse Dumps optimieren.

### 24. Resource-URI-Schicht fuer Projektartefakte entwerfen `[Done]`

- Stabile Resource-URI-Schemata fuer Engineering-Artefakte definieren, inspiriert von CoAgent:
  `plcc://`, `plcpp://`, `err://`, `io://`, `tcfile://`, `tcfolder://`.
- Tools sollen nach Moeglichkeit Referenzen zurueckgeben, statt grosse Code- oder Tree-Dumps direkt auszugeben.
- Dereferenzierung fuer einzelne POU-, Fehler-, I/O- und Datei-Referenzen implementieren.
- MCP Resources/Subscriptions fuer geeignete Artefakte pruefen, insbesondere Watches und Fehlerlisten.
- URI-Schemata dokumentieren und versionieren, damit spaetere Tool-Erweiterungen kompatibel bleiben.

### 25. HMI-Engineering-Kontext vorsichtig explorieren `[Done]`

- HMI-Unterstuetzung zunaechst nur explorativ und read-only behandeln.
- `hmi_state` pruefen, um aktive HMI-Projekte, Router-Port und Server-Port sichtbar zu machen.
- `hmi_list_projects` und `hmi_preview_info` pruefen, falls ein stabiler HMI-Backend-Zugriff verfuegbar ist.
- `hmi_list_controls` nur einfuehren, wenn Controls/Views verlaesslich aus Projektdateien oder Automation APIs gelesen werden koennen.
- Keine HMI-Erzeugungs- oder Editier-Tools planen, bevor Sicherheitsmodell und Backend-Stabilitaet geklaert sind.

## Phase 1: Monorepo, Core, Pi und MCP

### 1. Neues Monorepo-Skelett aufsetzen `[Done]`

- Neues Repo `twincat-mcp` anlegen.
- npm-Workspaces konfigurieren.
- TypeScript Project References fuer Root und Unterpakete aufsetzen.
- Basisstruktur `packages/core`, `packages/pi`, `packages/mcp` anlegen.

### 2. `packages/pi` als lauffaehige Ausgangsbasis uebernehmen `[Done]`

- Den aktuellen Stand von `pi-twincat-ads` zunaechst nahezu 1:1 nach `packages/pi` uebernehmen.
- Build, Tests, Skill-Datei und Pi-Manifest dort wieder gruen bekommen.
- Sicherstellen, dass sich das Pi-Paket vor der Core-Extraktion weiterhin wie `pi-twincat-ads` verhaelt.

### 3. `twincat-mcp-core` API und Paketgrenzen definieren `[Done]`

- Festlegen, welche Teile transportagnostisch in den Core gehoeren.
- Core-Exports definieren:
  - Config und Validierung
  - ADS-Service
  - Runtime-/Controller-Schicht
  - transportfreie Operationen wie `readSymbol`, `readMany`, `writeSymbol`, `watchSymbol`, `unwatchSymbol`, `listWatches`, `readState`, `setWriteMode`
- Pi- und MCP-spezifische Verantwortung explizit ausserhalb des Core halten.

### 4. Domänenlogik in `packages/core` extrahieren `[Done]`

- ADS-, Cache-, Watch-, Reconnect- und Write-Safety-Logik aus dem bisherigen Paket in `packages/core` verschieben.
- Das 3-Layer-Safety-Modell im Core verankern:
  - `readOnly`
  - Runtime-Write-Mode
  - `writeAllowlist`
- Sicherstellen, dass der Core keinerlei Pi-Hook-, Prompt- oder MCP-Protokolllogik enthaelt.

### 5. `packages/pi` auf den Core umstellen `[Done]`

- Pi-Adapter so umbauen, dass er nur noch den Core verwendet.
- Tool-Wrapper und Hook-Binding auf die Core-Operationen mappen.
- Kontext-Injection, `session_start`, `context`, `tool_call` und `session_shutdown` im Pi-Paket halten.
- Regressionen gegen den bisherigen `pi-twincat-ads`-Stand vermeiden.

### 6. `twincat-mcp` als v0.1-Server aufbauen `[Done]`

- MCP-Paket mit `@modelcontextprotocol/sdk` als stdio-Server anlegen.
- Core-Operationen als MCP-Tools exponieren.
- Zod-/Core-Inputs sauber in JSON-Schema fuer MCP ueberfuehren.
- Watches in v0.1 zunaechst nur als Tools, noch nicht als Resources/Subscriptions modellieren.

### 7. Monorepo-Build, Tests und Paketintegration vervollstaendigen `[Done]`

- Root-Build ueber `tsc -b` fuer alle Pakete herstellen.
- Tests fuer Core, Pi und MCP sauber trennen.
- Sicherstellen, dass `packages/pi` und `packages/mcp` nur ueber die versionierte Core-Paketdependency auf den Core zugreifen.
- Pack-/Publish-Checks fuer alle drei Pakete ergaenzen.

### 8. Versionierung und Release-Flows vorbereiten `[Done]`

- Zunaechst lockstepped Versionierung fuer alle drei Pakete einrichten.
- Release-Reihenfolge dokumentieren:
  - `twincat-mcp-core`
  - `pi-twincat-ads@next`
  - `twincat-mcp@0.1.0`
- Spaetere Umstellung auf Changesets nur vorbereiten, aber noch nicht erzwingen.

### 9. Dokumentation und Migration fertigziehen `[Done]`

- Root-README fuer das Monorepo schreiben.
- Paket-spezifische READMEs fuer `core`, `pi` und `mcp` anlegen.
- Migrationshinweise vom bisherigen `pi-twincat-ads`-Repo dokumentieren.
- Konfiguration, Safety-Modell und typische Deploy-/Testpfade fuer Pi und MCP beschreiben.

## Phase 2: ADS-Runtime-Erweiterungen fuer PLC, NC, IO und TwinCAT-Diagnose

Ziel dieser Phase ist eine stabile, read-lastige Runtime-Erweiterung auf Basis
von ADS. Sie soll bewusst unabhaengig von XAE-/Visual-Studio-
Engineering-Backends bleiben. Projektbaum-, POU-Code-, Build- und
Engineering-Fehlerlisten werden fuer Phase 3 vorgemerkt, damit Phase 2
lieferbar und auch ohne offene XAE-Instanz nutzbar bleibt.

### 10. Multi-Service-ADS-Basis fuer PLC, NC und IO vorbereiten `[Done]`

- Interne ADS-Service-Schicht so erweitern, dass mehrere TwinCAT-Services/Ports verwaltet werden koennen.
- Config-Modell um klar benannte Services erweitern, z. B. `plc`, `nc` und `io`.
- Default-Ports als Vorschlaege dokumentieren und immer konfigurierbar halten:
  - TC3 PLC Runtime 1: `851`
  - Weitere TC3 PLC Runtimes: `852+`
  - NC: `500`
  - IO: `300`
- Bestehende PLC-Tools kompatibel halten und intern auf die neue Service-Schicht migrieren.
- Gemeinsames Connection-, Reconnect-, Timeout- und State-Handling fuer alle Services wiederverwenden.

### 11. PLC-Tools um Symbolbeschreibung und Gruppen erweitern `[Done]`

- Bestehende `plc_*` Tools unveraendert weiterfuehren.
- `plc_describe_symbol` ergaenzen, um Typ, Groesse, Metadaten und Struct-/Array-Informationen zu einem Symbol zu liefern.
- Config-basierte PLC-Symbolgruppen einfuehren, z. B. `status`, `alarms`, `recipe` oder `diagnostics`.
- `plc_read_group` implementieren, um eine konfigurierte Symbolgruppe gezielt zu lesen.
- `plc_list_groups` implementieren, um konfigurierte Gruppen sichtbar zu machen.
- Watch-Snapshots fuer konfigurierte Gruppen pruefen, aber erst einfuehren, wenn die Ausgabe weiterhin kompakt bleibt.
- Tests fuer Symbolbeschreibung, unbekannte Symbole und Gruppen-Reads ergaenzen.

### 12. Reaktive PLC-Wait-/Trigger-Tools einfuehren `[Done]`

- `plc_wait_until` implementieren, um eine oder mehrere PLC-Variablen zu beobachten, bis eine definierte Bedingung erfuellt ist.
- Intern ADS-Notifications bevorzugen und nur bei Bedarf auf zyklisches Lesen zurueckfallen.
- Bedingungsmodell bewusst klein halten, z. B. `equals`, `notEquals`, Vergleichsoperatoren fuer Zahlen, `allOf` und `anyOf`.
- Optional `stableForMs` unterstuetzen, damit ein Zustand fuer eine Mindestdauer stabil sein muss, bevor das Tool zurueckkehrt.
- Optional `cycleTimeMs` und `maxDelayMs` an die bestehende Watch-/Notification-Konfiguration anbinden.
- Harte Laufzeitgrenzen vorsehen: `timeoutMs` im Tool-Input, konfigurierbares Maximum und saubere Cancel-/Abort-Behandlung.
- Ergebnis kompakt strukturieren: ausgeloeste Bedingung, letzte Werte, Timestamps, Dauer und Timeout-/Cancel-Status.
- Dokumentieren, dass das Tool nur auf das Ereignis wartet; Folgeaktionen wie `tc_diagnose_errors`, `plc_read_group` oder `tc_diagnose_runtime` fuehrt der Agent danach als separate Toolcalls aus.
- Tests fuer Erfolg, Timeout, Cancel, Mehrsymbol-Bedingungen und stabile Zustandsdauer ergaenzen.

### 13. NC-Read-Only-Tools einfuehren `[Done]`

- NC-Zugriff zunaechst strikt read-only halten.
- Config fuer NC-Achsen definieren, z. B. Name, Achs-ID und optional Service-Port.
- `nc_state` implementieren, um ADS-/NC-Zustand zu pruefen.
- `nc_list_axes` implementieren, um konfigurierte oder erkannte Achsen anzuzeigen.
- `nc_read_axis` und `nc_read_axis_many` implementieren, um Achszustand, Position, Geschwindigkeit, Status und Fehler gezielt zu lesen.
- `nc_read_error` implementieren, um NC- oder Achsenfehler fokussiert auszulesen.

### 14. IO-Read-Only-Tools und IO-Gruppen einfuehren `[Done]`

- IO-Zugriff zunaechst strikt read-only halten.
- Config fuer einzelne IO-Datenpunkte definieren: Name, `indexGroup`, `indexOffset`, Typ und optional Beschreibung.
- Config-basierte IO-Gruppen einfuehren, z. B. `inputs`, `outputs`, `safety`, `valves` oder `sensors`.
- `io_read` und `io_read_many` fuer gezielte IO-Reads implementieren.
- `io_read_group` implementieren, um eine konfigurierte IO-Gruppe zu lesen.
- `io_list_groups` implementieren, um verfuegbare IO-Gruppen und Datenpunkte sichtbar zu machen.

### 15. TwinCAT-weite Diagnose-Tools fuer Fehler, Events und Output ergaenzen `[Done]`

- Backends fuer Runtime-Events und Runtime-Logs evaluieren, bevor die Tool-API festgezurrt wird. `[Done: docs/runtime-events-logs-backends.md]`
- Engineering-Fehlerlisten, Build-Ausgaben und XAE-Output-Fenster nicht in Phase 2 implementieren; diese gehoeren in Phase 3.
- `tc_state` implementieren, um TwinCAT-/ADS-/PLC-/NC-Grundzustand kompakt zu pruefen.
- `tc_event_list` implementieren, um letzte TwinCAT/EventLogger-Meldungen zu lesen.
- `tc_runtime_error_list` implementieren, um aktive Runtime-/Systemfehler zu lesen, sofern eine Quelle konfiguriert ist.
- `tc_log_read` implementieren, um relevante Runtime- oder Event-Logtexte gezielt zu lesen.
- Quellen fuer Events und Runtime-Logs konfigurierbar halten.
- Fuer Event- und Log-Quellen eine Default-Config vorsehen, die auf einem lokalen
  Windows-/TwinCAT-System ohne Zusatzkonfiguration nutzbar ist, soweit die
  benoetigten lokalen APIs verfuegbar sind.
- Lokale Default-Quellen analog zu ADS-Defaults behandeln: sinnvolle
  Startwerte automatisch setzen, z. B. Windows `Application` Event Log mit
  TwinCAT-/Beckhoff-Quellen ueber `Get-TcEvent` oder `Get-WinEvent`, und diese
  Defaults in der Config explizit ueberschreibbar machen.
- Wenn lokale Default-Quellen nicht verfuegbar sind, z. B. kein Windows, kein
  Beckhoff-PowerShell-Modul oder keine Berechtigung, soll die Runtime eine klare
  Capability-/Unavailable-Antwort liefern statt beim Start hart zu scheitern.
- Filter wie `limit`, `since`, `severity` und Textsuche vorsehen, damit die Tools keine grossen unkontrollierten Dumps erzeugen.

### 16. Kleine Kombi-Diagnose-Commands bewusst begrenzen `[Done]`

- Kein globales "alles auslesen"-Tool einfuehren.
- `tc_diagnose_errors` als kleine Kombination aus Runtime-Fehlern, Runtime-Logs und letzten Events implementieren.
- `tc_diagnose_runtime` als kleine Kombination aus TC-State, PLC-State, NC-State, IO-State und aktiven Runtime-Fehlern implementieren.
- Beide Diagnose-Commands mit Limits, Filtern und klarer Ausgabe strukturieren.
- Dokumentieren, wann einzelne Commands bevorzugt werden und wann die Kombi-Commands sinnvoll sind.
