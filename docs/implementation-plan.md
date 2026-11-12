# Implementierungsplan für `pi-twincat-ads`

> **Historical plan:** This document records the original Pi ADS implementation
> plan. Its statements about the current project state and future work reflect
> that planning period. For the Engineering 0.5.3 release boundary, see
> [engineering backends](engineering-backends.md).

Diese Datei enthält den aktuellen Umsetzungsplan für `pi-twincat-ads`.

## Summary

Ziel ist ein erstes nutzbares Pi-Extension-Package in TypeScript, das TwinCAT-Variablen über ADS lesbar macht, kontrollierte Schreibzugriffe erlaubt und dem Agenten zur Laufzeit nützlichen PLC-Kontext liefert. Die erste Version sollte klar auf Stabilität und sichere Bedienung optimiert sein: robuste Verbindungsverwaltung, saubere Tool-Schemas, konservative Write-Gates und ein kleines, gut testbares Hook-Set.

Die Recherche zu `pyads`, `ads-client` und Beckhoffs offiziellen ADS-APIs zeigt ein konsistentes Muster für robuste ADS-Anbindung: Verbindungen werden langlebig gehalten, Routing/AMS-Adressen sind eine harte Voraussetzung, häufig genutzte Symbole profitieren von Handle-Caching, Mehrfachzugriffe sollten über Sum-Commands gebündelt werden, und Notifications müssen bei Router-/Runtime-Neustarts aktiv neu aufgebaut werden. Der Plan unten übernimmt diese Muster explizit für `pi-twincat-ads`.

## Key Changes

### Paket-Grundgerüst und Laufzeitkern

- TypeScript-Package mit `pi install`-fähigem Entry Point aufbauen und die Basisstruktur aus `brainstorm.md` übernehmen: `src/index.ts`, `src/ads/`, `src/tools/`, `src/hooks/`, `skills/twincat-ads/`.
- Einen zentralen ADS-Service einführen, der Connection-Aufbau, Reconnect, Disconnect, Symbol-Upload und Handle-Caching kapselt.
- Symbol- und Handle-Caches getrennt halten: Symboltabelle für Discovery/Context, Handles für häufige Reads/Writes.
- Konfiguration beim Start validieren und intern als normierte Runtime-Config bereitstellen.
- Die Verbindung als langlebige Session-Ressource behandeln statt pro Tool-Call neu zu verbinden; dieses Muster wird sowohl von `pyads` als auch von `ads-client` empfohlen und reduziert Router-Last.
- Im ADS-Service einen klaren Connection-State führen:
  - `disconnected`
  - `connecting`
  - `connected`
  - `degraded` für Half-Open-/Config-Mode-nahe Fälle
- Reconnect so auslegen, dass nach Verbindungsverlust folgende Dinge in definierter Reihenfolge neu aufgebaut werden:
  - ADS-Session
  - Symbol-/Datentyp-Metadaten
  - Handle-Cache
  - aktive Notifications

### ADS-Anbindung und Routing

- V1 auf `ads-client` als primären Transport aufbauen; es passt am besten zum TypeScript-Stack und unterstützt Symbolzugriffe, Notifications, automatische Typkonvertierung und Reconnect bereits nativ.
- Die Konfiguration explizit auf die von realen ADS-Clients benötigten Zielparameter ausrichten:
  - `targetAmsNetId: string`
  - `targetAdsPort?: number` mit Default `851`
  - `routerAddress?: string`
  - `routerTcpPort?: number` mit Default `48898`, falls ohne lokalen AMS-Router direkt zum PLC-Router verbunden wird
  - `localAmsNetId?: string`
  - `localAdsPort?: number`
- Zwei Verbindungsmodi im Plan fest vorsehen:
  - Router-Modus: Host hat TwinCAT-Router oder kompatiblen ADS-Router; nur `targetAmsNetId` und `targetAdsPort` sind Pflicht.
  - Direkt-Modus: kein lokaler Router vorhanden; dann sind `routerAddress`, `localAmsNetId` und `localAdsPort` Pflicht, passend zum von `ads-client` beschriebenen direkten PLC-Router-Zugriff.
- Den Direkt-Modus als unterstützte, aber bewusst streng validierte Option behandeln, weil dort laut `ads-client` nur eine gleichzeitige Verbindung pro Client möglich sein kann und die PLC-Route sauber vorbereitet sein muss.
- Beim Start eine Preflight-Prüfung einbauen, die Verbindungsfehler auf Konfigurationsursachen zurückführt:
  - fehlende AMS-Route
  - falsche NetID oder falscher Port
  - Router-TCP-Port nicht erreichbar
  - PLC in Config-Mode oder kein PLC-Runtime-Port aktiv
- TwinCAT-2-Kompatibilität nicht als implizites Verhalten annehmen; wenn später unterstützt, dann nur bewusst über konfigurierbaren Port wie `801` und mit dokumentierten Symbolpfad-Unterschieden.

### Öffentliche Tools und Interfaces

- Folgende Tools als öffentliche Surface der Extension bereitstellen:
  - `plc_list_symbols(filter?)`
  - `plc_read(name)`
  - `plc_read_many(names[])`
  - `plc_write(name, value)`
  - `plc_watch(name)`
  - `plc_state()`
  - `plc_log(since?)`
- Alle Tool-Parameter und Rückgaben mit Zod oder TypeBox eindeutig schema-basiert beschreiben; bevorzugt Zod, weil es für Tool-Validierung und klare Fehlermeldungen am direktesten ist.
- Für `plc_read_many(names[])` und ähnliche Mehrfachoperationen intern Sum-Commands oder die entsprechende Mehrfach-Read-Funktion des Clients bevorzugen, statt N Einzelreads zu sequenzieren; das entspricht sowohl `pyads.read_list_by_name()` als auch Beckhoffs ADS-Sum-Command-Muster.
- Rückgaben konsistent halten:
  - Reads liefern immer Symbolname, gelesenen Wert, Typ und Zeitstempel.
  - `plc_list_symbols` liefert mindestens Name, Typ, Scope und Kommentar.
  - `plc_write` liefert alten Wert optional nur dann, wenn er ohne Zusatzkosten verfügbar ist; Pflicht ist Schreibstatus plus Zielsymbol und neuer Wert.
  - `plc_watch` liefert ein Subscription-Ergebnis mit Handle/Status; kein dauerhaft streamendes Interface in v1 planen, sondern eine klar definierte Notification-Registrierung.
  - `plc_state` liefert ADS/TwinCAT-State plus verfügbare Runtime-Infos.
  - `plc_log` bleibt in v1 optional-fallbackfähig: wenn TcEventLogger nicht verlässlich verfügbar ist, soll das Tool eine klare “nicht unterstützt/noch nicht konfiguriert”-Antwort geben statt halbgare Daten.
- Öffentliche Config-Schnittstelle festlegen:
  - `targetAmsNetId: string`
  - `targetAdsPort?: number` mit Default `851`
  - `routerAddress?: string`
  - `routerTcpPort?: number`
  - `localAmsNetId?: string`
  - `localAdsPort?: number`
  - `readOnly?: boolean`
  - `writeAllowlist?: string[]`
  - `contextSnapshotSymbols?: string[]`
  - `notificationCycleTimeMs?: number`

### Symbolzugriff, Handles und Typen

- Standardzugriffe auf Symbolnamen basieren, weil das für Agenten ergonomisch ist und von `pyads`, `ads-client` und Beckhoff-APIs direkt unterstützt wird.
- Für Hot-Path-Symbole einen internen Handle-Cache verwenden; `pyads` dokumentiert dafür einen deutlichen Vorteil, weil Read/Write-by-name sonst mehrere ADS-Aufrufe für Handle holen, Zugriff und Release auslösen kann.
- Handles nicht global unbegrenzt sammeln, sondern mit kontrollierter Lebensdauer:
  - für häufig genutzte Snapshot-Symbole
  - für aktive Watches
  - optional für wiederholte Read/Write-Ziele innerhalb einer Session
- Beim Reconnect oder Session-Ende alle gehaltenen Handles explizit freigeben, um Router- und PLC-Ressourcen nicht zu leaken.
- Typstrategie für v1:
  - primitive PLC-Typen direkt unterstützen
  - Strings, Arrays und Structs über die Typinformationen des Clients lesen, soweit `ads-client` diese dekodieren kann
  - Pointer/Reference-Sonderfälle nicht als voll unterstützte v1-Funktion versprechen
- `plc_list_symbols` soll neben Namen und Kommentar auch genug Typmetadaten liefern, damit der Agent Schreibwerte plausibel formulieren kann, ohne rohe ADS-Indexzugriffe zu kennen.

### Hooks und Sicherheitsmodell

- `session_start`: ADS verbinden, Symboltabelle laden, Basiscaches vorbereiten.
- `before_agent_start`: kompakten Startkontext erzeugen, z. B. PLC-State und relevante Snapshot-Symbole.
- `context`: optionalen kompakten Live-Snapshot injizieren; nur konfigurierte Snapshot-Symbole, damit der Prompt klein bleibt.
- `tool_call`: alle Writes zentral prüfen.
  - Wenn `readOnly=true`, jeden Write blockieren.
  - Wenn `writeAllowlist` gesetzt ist, nur exakte oder bewusst definierte Pattern-Matches erlauben; Default ist exakter Match, um Fehlfreigaben zu vermeiden.
  - Schreibende Tool-Calls markieren, damit Bestätigungslogik sauber anschließbar bleibt.
- `session_end`: Notifications deregistrieren, Handles freigeben, ADS sauber trennen.
- Notification-Lifecycle explizit nach Beckhoff-Muster behandeln:
  - jede Watch erzeugt eine registrierte ADS-Notification mit eindeutiger lokaler Zuordnung
  - bei Router-/Runtime-Restart werden bestehende Notification-Handles als ungültig behandelt
  - aktive Watches werden nach erfolgreichem Reconnect neu registriert
- Für `plc_watch(name)` standardmäßig eine zyklische oder `on change`-Notification mit konfigurierter Cycle-Time verwenden; die konkrete TransMode-Wahl sollte im Plan als Implementierungsdefault festgelegt werden:
  - Default: `on change`, wenn vom Client/Target stabil unterstützt
  - Fallback: zyklisch mit `notificationCycleTimeMs`
- Eine interne Obergrenze für gleichzeitige Notifications vorsehen, weil Beckhoff pro ADS-Port dokumentierte Limits für Notifications nennt; bei Überschreitung soll das Tool sauber ablehnen statt Ressourcen unkontrolliert zu binden.

### Skill- und Bedienebene

- `skills/twincat-ads/SKILL.md` als Nutzungsleitfaden anlegen.
- Skill dokumentiert:
  - wann welches Tool zu verwenden ist
  - wie TwinCAT-Symbolpfade typischerweise aussehen
  - dass Writes potenziell Anlagenzustand ändern und nur mit Freigabe erfolgen sollen
  - dass zuerst Read/State geprüft werden soll, bevor geschrieben wird
- README nach Scaffold-Stand erweitern: Installation, Konfiguration, verfügbare Tools, Sicherheitsmodell, grober Entwicklungsworkflow.
- README und Skill sollen zusätzlich die betrieblichen ADS-Voraussetzungen klar benennen:
  - AMS-Route muss vorhanden sein
  - ohne lokalen Router ist ein Direkt-Modus mit `routerAddress` und lokaler AMS-ID nötig
  - lokaler Betrieb gegen `localhost`/`127.0.0.1.1.1` ist ein eigener Sonderfall und hängt von Router-Loopback bzw. TwinCAT-Version ab

## Test Plan

- Konfigurationsvalidierung:
  - gültige Minimal-Config im Router-Modus
  - gültige Minimal-Config im Direkt-Modus
  - ungültige `targetAmsNetId`
  - fehlende Pflichtfelder im Direkt-Modus
  - `readOnly` plus `writeAllowlist`
  - Defaults für ADS-Port, Router-Port und Notification-Zyklus
- ADS-Service:
  - erfolgreicher Connect/Disconnect
  - Preflight-Fehler bei fehlender Route oder nicht erreichbarem Router-Port
  - Reconnect nach Verbindungsabbruch
  - Symbol-Cache wird einmal geladen und wiederverwendet
  - Handle-Cache invalidiert sich sauber bei Reconnect
  - aktive Notifications werden nach Reconnect neu aufgebaut
  - Half-Open-/Config-Mode-nahe Zielzustände liefern brauchbare Fehler statt generischer Exceptions
- Tool-Verhalten:
  - `plc_read` für gültiges und ungültiges Symbol
  - `plc_read_many` mit gemischten Treffern
  - `plc_read_many` nutzt gebündelte Mehrfachzugriffe statt sequenzieller Einzelreads
  - `plc_list_symbols` mit und ohne Filter
  - `plc_write` erlaubt, blockiert durch `readOnly`, blockiert durch fehlende Allowlist
  - `plc_state` bei verbundener und nicht verbundener Runtime
  - `plc_watch` registriert und räumt Subscription wieder auf
  - `plc_watch` lehnt weitere Registrierungen sauber ab, wenn das lokale Notification-Limit erreicht ist
  - `plc_log` liefert klare Fallback-Antwort, wenn kein Logger angebunden ist
- Hook-Verhalten:
  - `session_start` baut Verbindung auf
  - `before_agent_start` erzeugt kompakten Initialkontext
  - `context` respektiert Snapshot-Konfiguration
  - `session_end` räumt Ressourcen vollständig auf
- Integration:
  - End-to-End-Test mit gemocktem `ads-client`
  - manueller Smoke-Test im Router-Modus gegen TwinCAT auf Port `851`
  - optional manueller Smoke-Test im Direkt-Modus über `routerAddress:48898`

## Assumptions

- Das Repo ist noch in der Design-/Scaffold-Phase; der Plan zielt daher auf eine erste implementierbare v1-Struktur, nicht auf Refactoring bestehender Produktionslogik.
- `ads-client` übernimmt den Großteil der TwinCAT-Typdekodierung; wir bauen darum keinen eigenen Low-Level-Decoder für v1.
- `plc_log` ist funktional nachrangig und darf in v1 mit klarer Einschränkung ausgeliefert werden, falls die ADS-/TcEventLogger-Anbindung aufwendiger ist als die Kern-Tools.
- Die sichere Default-Politik ist: lesen erlaubt, schreiben nur mit expliziter Freigabe über `writeAllowlist`, und `readOnly` hat immer Vorrang.
- Für v1 werden Symbolfreigaben standardmäßig als exakte Symbolnamen behandelt; Wildcards oder Präfixregeln werden nur aufgenommen, wenn sie später bewusst spezifiziert werden.
- V1 ist primär auf TwinCAT 3 und PLC-Runtime-Port `851` zugeschnitten; TwinCAT 2 oder Nicht-PLC-ADS-Ziele werden erst dann eingeplant, wenn sie als echtes Ziel bestätigt sind.
- Der bevorzugte Betriebsmodus ist ein vorhandener lokaler ADS-Router; der Direkt-Modus ohne Router wird unterstützt, aber strenger validiert und klarer dokumentiert.
