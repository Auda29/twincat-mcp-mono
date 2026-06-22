import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  callMcpTool,
  formatCliHelp,
  formatCliVersion,
  isCliEntryPoint,
  createMcpToolDefinitions,
} from "../src/index.js";
import type { TwinCatAdsRuntime } from "twincat-mcp-core";

const packageJson = JSON.parse(
  readFileSync(resolve(process.cwd(), "package.json"), "utf8"),
) as { version: string };

describe("CLI metadata", () => {
  it("prints the package version for version flags", () => {
    expect(formatCliVersion()).toBe(packageJson.version);
  });

  it("prints usage for help flags", () => {
    expect(formatCliHelp()).toContain("Usage:");
    expect(formatCliHelp()).toContain("twincat-mcp [--config <file>]");
  });

  it("detects npm bin symlinks as CLI entry points", () => {
    const target = "/project/packages/mcp/dist/index.js";
    const link = "/project/node_modules/.bin/twincat-mcp";
    const resolveRealPath = (path: string) => (path === link ? target : path);

    expect(isCliEntryPoint(link, target, resolveRealPath)).toBe(true);
  });
});

function createRuntimeStub(
  overrides: Partial<Record<keyof TwinCatAdsRuntime, unknown>> = {},
): TwinCatAdsRuntime {
  const runtime = {
    connect: async () => ({ connected: true }),
    disconnect: async () => undefined,
    listSymbols: async () => [
      {
        name: "MAIN.value",
        type: "INT",
        size: 2,
        comment: "",
        flags: 0,
        indexGroup: 1,
        indexOffset: 2,
      },
    ],
    describeSymbol: async ({ name }: { name: string }) => ({
      name,
      type: "INT",
      size: 2,
      comment: "",
      flags: 0,
      indexGroup: 1,
      indexOffset: 2,
    }),
    readSymbol: async ({ name }: { name: string }) => ({
      name,
      value: 1,
      type: "INT",
      timestamp: "2026-01-01T00:00:00.000Z",
      symbol: { name, type: "INT" },
    }),
    readMany: async ({ names }: { names: readonly string[] }) =>
      names.map((name) => ({
        name,
        value: 1,
        type: "INT",
        timestamp: "2026-01-01T00:00:00.000Z",
        symbol: { name, type: "INT" },
      })),
    listGroups: () => [
      {
        name: "status",
        symbols: ["MAIN.value"],
        count: 1,
      },
    ],
    readGroup: async ({ group }: { group: string }) => ({
      group,
      symbols: ["MAIN.value"],
      results: [
        {
          name: "MAIN.value",
          value: 1,
          type: "INT",
          timestamp: "2026-01-01T00:00:00.000Z",
          symbol: { name: "MAIN.value", type: "INT" },
        },
      ],
      count: 1,
    }),
    ncState: async () => ({
      connection: { connected: true },
      adsState: "connected" as const,
      ncRuntimeState: { adsState: 5, deviceState: 0 },
      ncRuntimeStatus: {
        adsState: 5,
        adsStateName: "Run",
        deviceState: 0,
        isRun: true,
        isStop: false,
      },
      deviceInfo: { deviceName: "Mock NC" },
      axes: [{ name: "X", id: 1, targetAdsPort: 500 }],
    }),
    ncListAxes: () => [{ name: "X", id: 1, targetAdsPort: 500 }],
    ncReadAxisPosition: async ({ axis }: { axis: string | number }) => ({
      axis: { name: String(axis), id: 1, targetAdsPort: 500 },
      timestamp: "2026-01-01T00:00:00.000Z",
      online: {
        errorState: 0,
        actualPosition: 12.5,
        moduloActualPosition: 12.5,
        setPosition: 13.5,
        moduloSetPosition: 13.5,
        actualVelocity: 2.5,
        setVelocity: 3.5,
        velocityOverride: 1000000,
        lagErrorPosition: 0,
        controllerOutputPercent: 0,
        totalOutputPercent: 0,
        stateDWord: 0,
      },
    }),
    ncReadAxisStatus: async ({ axis }: { axis: string | number }) => ({
      axis: { name: String(axis), id: 1, targetAdsPort: 500 },
      timestamp: "2026-01-01T00:00:00.000Z",
      status: {
        ready: true,
        referenced: true,
        protectedMode: false,
        logicalStandstill: false,
        referencing: false,
        inPositionWindow: true,
        atTargetPosition: false,
        constantVelocity: true,
        busy: false,
      },
      warnings: [],
    }),
    ncReadAxis: async ({ axis }: { axis: string | number }) => ({
      axis: { name: String(axis), id: 1, targetAdsPort: 500 },
      timestamp: "2026-01-01T00:00:00.000Z",
      online: {
        errorState: 0,
        actualPosition: 12.5,
        moduloActualPosition: 12.5,
        setPosition: 13.5,
        moduloSetPosition: 13.5,
        actualVelocity: 2.5,
        setVelocity: 3.5,
        velocityOverride: 1000000,
        lagErrorPosition: 0,
        controllerOutputPercent: 0,
        totalOutputPercent: 0,
        stateDWord: 0,
      },
      status: {
        ready: true,
        referenced: true,
        protectedMode: false,
        logicalStandstill: false,
        referencing: false,
        inPositionWindow: true,
        atTargetPosition: false,
        constantVelocity: true,
        busy: false,
      },
      errorCode: 0,
      warnings: [],
    }),
    ncReadAxisMany: async ({ axes }: { axes: Array<string | number> }) => ({
      results: axes.map((axis) => ({
        axis: { name: String(axis), id: 1, targetAdsPort: 500 },
        timestamp: "2026-01-01T00:00:00.000Z",
        online: {
          errorState: 0,
          actualPosition: 12.5,
          moduloActualPosition: 12.5,
          setPosition: 13.5,
          moduloSetPosition: 13.5,
          actualVelocity: 2.5,
          setVelocity: 3.5,
          velocityOverride: 1000000,
          lagErrorPosition: 0,
          controllerOutputPercent: 0,
          totalOutputPercent: 0,
          stateDWord: 0,
        },
        status: {
          ready: true,
          referenced: true,
          protectedMode: false,
          logicalStandstill: false,
          referencing: false,
          inPositionWindow: true,
          atTargetPosition: false,
          constantVelocity: true,
          busy: false,
        },
        errorCode: 0,
        warnings: [],
      })),
      count: axes.length,
    }),
    ncReadError: async ({ axis }: { axis: string | number }) => ({
      axis: { name: String(axis), id: 1, targetAdsPort: 500 },
      timestamp: "2026-01-01T00:00:00.000Z",
      errorCode: 0,
      hasError: false,
      warnings: [],
    }),
    ioListGroups: () => ({
      groups: [{ name: "inputs", dataPoints: ["Input1"], count: 1 }],
      dataPoints: [
        {
          name: "Input1",
          indexGroup: 0xf020,
          indexOffset: 0x1f400,
          type: "BOOL",
          size: 1,
        },
      ],
      count: 1,
    }),
    ioRead: async ({ name }: { name: string }) => ({
      dataPoint: {
        name,
        indexGroup: 0xf020,
        indexOffset: 0x1f400,
        type: "BOOL",
        size: 1,
      },
      value: true,
      rawHex: "01",
      timestamp: "2026-01-01T00:00:00.000Z",
    }),
    ioReadMany: async ({ names }: { names: string[] }) => ({
      results: names.map((name) => ({
        dataPoint: {
          name,
          indexGroup: 0xf020,
          indexOffset: 0x1f400,
          type: "BOOL",
          size: 1,
        },
        value: true,
        rawHex: "01",
        timestamp: "2026-01-01T00:00:00.000Z",
      })),
      count: names.length,
    }),
    ioReadGroup: async ({ group }: { group: string }) => ({
      group,
      dataPoints: ["Input1"],
      results: [
        {
          dataPoint: {
            name: "Input1",
            indexGroup: 0xf020,
            indexOffset: 0x1f400,
            type: "BOOL",
            size: 1,
          },
          value: true,
          rawHex: "01",
          timestamp: "2026-01-01T00:00:00.000Z",
        },
      ],
      count: 1,
    }),
    tcState: async () => ({
      timestamp: "2026-01-01T00:00:00.000Z",
      adsState: "connected" as const,
      services: [],
      plc: {
        available: true,
        data: await runtime.readState(),
      },
      nc: {
        available: true,
        data: await runtime.ncState(),
      },
      diagnostics: {
        eventSources: [
          {
            id: "events",
            kind: "windowsEventLog",
            available: true,
          },
        ],
        logSources: [
          {
            id: "logs",
            kind: "file",
            available: true,
          },
        ],
      },
    }),
    tcEventList: async () => ({
      source: "events",
      available: true,
      capability: {
        id: "events",
        kind: "windowsEventLog",
        available: true,
      },
      events: [
        {
          timestamp: "2026-01-01T00:00:00.000Z",
          source: "TcSysSrv",
          severity: "warning" as const,
          id: 100,
          message: "Runtime warning",
        },
      ],
      count: 1,
      truncated: false,
      query: { limit: 50 },
    }),
    tcRuntimeErrorList: async () => ({
      source: "events",
      available: true,
      capability: {
        id: "events",
        kind: "windowsEventLog",
        available: true,
      },
      events: [
        {
          timestamp: "2026-01-01T00:00:00.000Z",
          source: "TcSysSrv",
          severity: "error" as const,
          id: 101,
          message: "Runtime error",
        },
      ],
      errors: [
        {
          timestamp: "2026-01-01T00:00:00.000Z",
          source: "TcSysSrv",
          severity: "error" as const,
          id: 101,
          message: "Runtime error",
        },
      ],
      count: 1,
      truncated: false,
      query: { limit: 50, severity: ["critical", "error"] },
    }),
    tcLogRead: async () => ({
      source: "logs",
      available: true,
      capability: {
        id: "logs",
        kind: "file",
        available: true,
      },
      text: "Runtime log",
      bytesRead: 11,
      truncated: false,
      query: { limitBytes: 1024 },
    }),
    tcDiagnoseErrors: async () => ({
      timestamp: "2026-01-01T00:00:00.000Z",
      summary: {
        runtimeErrorCount: 1,
        recentEventCount: 1,
        logBytesRead: 11,
        runtimeErrorsAvailable: true,
        recentEventsAvailable: true,
        runtimeLogAvailable: true,
        truncated: {
          runtimeErrors: false,
          recentEvents: false,
          runtimeLog: false,
        },
      },
      runtimeErrors: await runtime.tcRuntimeErrorList(),
      recentEvents: await runtime.tcEventList(),
      runtimeLog: await runtime.tcLogRead(),
    }),
    tcDiagnoseRuntime: async () => {
      const tcState = await runtime.tcState();
      return {
        timestamp: "2026-01-01T00:00:00.000Z",
        summary: {
          adsState: "connected" as const,
          plcAvailable: true,
          ncAvailable: true,
          ioAvailable: true,
          configuredIoDataPoints: 1,
          configuredIoGroups: 1,
          runtimeErrorCount: 1,
          runtimeErrorsAvailable: true,
        },
        tcState,
        plc: tcState.plc,
        nc: tcState.nc,
        io: {
          available: true,
          data: {
            connection: { connected: true },
            service: {
              name: "io" as const,
              targetAdsPort: 300,
              connected: false,
              state: "disconnected" as const,
            },
            groups: runtime.ioListGroups(),
          },
        },
        runtimeErrors: await runtime.tcRuntimeErrorList(),
      };
    },
    tcListWorkbenches: () => ({
      backendCapabilities: [
        {
          backend: "configuredProjectFiles" as const,
          available: true,
          capabilities: {
            runtimeOnly: false,
            engineeringRead: true,
            engineeringWrite: false,
          },
        },
      ],
      workbenches: [
        {
          id: "configured-project-files",
          name: "Machine",
          backend: "configuredProjectFiles" as const,
          available: true,
          capabilities: {
            runtimeOnly: false,
            engineeringRead: true,
            engineeringWrite: false,
          },
          projectCount: 1,
        },
      ],
      count: 1,
    }),
    tcListProjects: () => ({
      backendCapabilities: [],
      projects: [
        {
          id: "configuredProjectFiles:c:/machine/machine.tsproj",
          name: "Machine",
          path: "C:/Machine/Machine.tsproj",
          type: "sysManager" as const,
          exists: true,
          source: "configuredProjectFiles" as const,
          workbenchId: "configured-project-files",
        },
      ],
      count: 1,
    }),
    tcProjectState: () => ({
      backendCapabilities: [],
      projects: [
        {
          project: {
            id: "configuredProjectFiles:c:/machine/machine.tsproj",
            name: "Machine",
            path: "C:/Machine/Machine.tsproj",
            type: "sysManager" as const,
            exists: true,
            source: "configuredProjectFiles" as const,
            workbenchId: "configured-project-files",
          },
          backend: "configuredProjectFiles" as const,
          capabilities: {
            runtimeOnly: false,
            engineeringRead: true,
            engineeringWrite: false,
          },
          activeConnection: {
            available: false,
            source: "none" as const,
          },
        },
      ],
      count: 1,
    }),
    tcTreeRead: async () => ({
      item: {
        id: "tree:terminal",
        path: "/Machine/Machine.xti/TcSmProject:Machine/IoTree:I/O/Device:Device 1/Terminal:EL1008",
        name: "EL1008",
        type: "terminal" as const,
        xmlElement: "Terminal",
        sourceFile: "C:/Machine/Machine.xti",
        project: {
          id: "configuredProjectFiles:c:/machine/machine.tsproj",
          name: "Machine",
          path: "C:/Machine/Machine.tsproj",
          type: "sysManager" as const,
          exists: true,
          source: "configuredProjectFiles" as const,
          workbenchId: "configured-project-files",
        },
        comment: "Digital inputs",
        childCount: 0,
        settings: { Name: "EL1008", Type: "Terminal" },
        children: [],
      },
    }),
    tcTreeSearch: async () => ({
      items: [
        {
          id: "tree:terminal",
          path: "/Machine/Machine.xti/TcSmProject:Machine/IoTree:I/O/Device:Device 1/Terminal:EL1008",
          name: "EL1008",
          type: "terminal" as const,
          xmlElement: "Terminal",
          sourceFile: "C:/Machine/Machine.xti",
          project: {
            id: "configuredProjectFiles:c:/machine/machine.tsproj",
            name: "Machine",
            path: "C:/Machine/Machine.tsproj",
            type: "sysManager" as const,
            exists: true,
            source: "configuredProjectFiles" as const,
            workbenchId: "configured-project-files",
          },
          comment: "Digital inputs",
          childCount: 0,
        },
      ],
      count: 1,
      truncated: false,
    }),
    tcTreeDescribeItem: async () => ({
      item: {
        id: "tree:device",
        path: "/Machine/Machine.xti/TcSmProject:Machine/IoTree:I/O/Device:Device 1",
        name: "Device 1",
        type: "device" as const,
        xmlElement: "Device",
        sourceFile: "C:/Machine/Machine.xti",
        project: {
          id: "configuredProjectFiles:c:/machine/machine.tsproj",
          name: "Machine",
          path: "C:/Machine/Machine.tsproj",
          type: "sysManager" as const,
          exists: true,
          source: "configuredProjectFiles" as const,
          workbenchId: "configured-project-files",
        },
        childCount: 1,
        settings: { Name: "Device 1", Type: "EtherCAT Master" },
        children: [],
      },
    }),
    ioListTopology: async () => ({
      devices: [
        {
          id: "tree:device",
          path: "/Machine/Machine.xti/TcSmProject:Machine/IoTree:I/O/Device:Device 1",
          name: "Device 1",
          type: "device" as const,
          xmlElement: "Device",
          sourceFile: "C:/Machine/Machine.xti",
          project: {
            id: "configuredProjectFiles:c:/machine/machine.tsproj",
            name: "Machine",
            path: "C:/Machine/Machine.tsproj",
            type: "sysManager" as const,
            exists: true,
            source: "configuredProjectFiles" as const,
            workbenchId: "configured-project-files",
          },
          childCount: 1,
          boxes: [],
          terminals: [],
          boxCount: 0,
          terminalCount: 1,
        },
      ],
      count: 1,
    }),
    ioDescribeDevice: async () => {
      const topology = await runtime.ioListTopology();
      return { device: topology.devices[0]! };
    },
    ioDescribeTerminal: async () => {
      const treeRead = await runtime.tcTreeRead({ path: "EL1008" });
      return { terminal: treeRead.item };
    },
    writeSymbol: async ({ name, value }: { name: string; value: unknown }) => ({
      name,
      value,
      type: "INT",
      timestamp: "2026-01-01T00:00:00.000Z",
    }),
    watchSymbol: async ({ name }: { name: string }) => ({
      name,
      notificationHandle: 123,
      cycleTimeMs: 250,
      mode: "on-change" as const,
      active: true,
      unsubscribe: async () => undefined,
    }),
    waitUntil: async ({ timeoutMs }: { timeoutMs: number }) => ({
      status: "fulfilled" as const,
      conditionMatched: true,
      startedAt: "2026-01-01T00:00:00.000Z",
      completedAt: "2026-01-01T00:00:00.010Z",
      durationMs: 10,
      timeoutMs,
      stableForMs: 0,
      values: [],
    }),
    unwatchSymbol: async ({ name }: { name: string }) => ({
      name,
      notificationHandle: 123,
      cycleTimeMs: 250,
      mode: "on-change" as const,
      active: false,
    }),
    listWatches: () => [],
    readState: async () => ({
      connection: { connected: true },
      adsState: "connected" as const,
      writeMode: "read-only" as const,
      watchCount: 0,
      writePolicy: {
        configReadOnly: true,
        runtimeWriteEnabled: false,
        allowlistCount: 0,
      },
      plcRuntimeState: { adsState: 5, deviceState: 0 },
      plcRuntimeStatus: {
        adsState: 5,
        adsStateName: "Run",
        deviceState: 0,
        isRun: true,
        isStop: false,
      },
      tcSystemState: { adsState: 5, deviceState: 0 },
      tcSystemStatus: {
        adsState: 5,
        adsStateName: "Run",
        deviceState: 0,
        isRun: true,
        isStop: false,
      },
      tcSystemExtendedState: {
        adsState: 5,
        deviceState: 0,
        restartIndex: 1,
        version: 3,
        revision: 1,
        build: 4026,
        platform: 1,
        osType: 1,
      },
      deviceInfo: {
        majorVersion: 1,
        minorVersion: 0,
        versionBuild: 1,
        deviceName: "Mock PLC",
      },
    }),
    setWriteMode: async ({ mode }: { mode: "read-only" | "enabled" }) => ({
      writeMode: mode,
      runtimeWriteEnabled: mode === "enabled",
      configReadOnly: false,
      writesAllowed: mode === "enabled",
      message: "ok",
    }),
    getWriteModeState: () => ({
      writeMode: "read-only" as const,
      runtimeWriteEnabled: false,
      configReadOnly: false,
      writesAllowed: false,
      message: "blocked",
    }),
    evaluateWriteAccess: (symbolName: string) => ({
      allow: symbolName === "MAIN.value",
    }),
  };

  return { ...runtime, ...overrides } as unknown as TwinCatAdsRuntime;
}

describe("mcp tool definitions", () => {
  it("exposes core operations as MCP tools with JSON object schemas", () => {
    const tools = createMcpToolDefinitions(createRuntimeStub());
    const names = tools.map((tool) => tool.name);

    expect(names).toEqual([
      "ads_connect",
      "ads_disconnect",
      "plc_list_symbols",
      "plc_describe_symbol",
      "plc_read",
      "plc_read_many",
      "plc_list_groups",
      "plc_read_group",
      "nc_state",
      "nc_list_axes",
      "nc_read_axis",
      "nc_read_axis_position",
      "nc_read_axis_status",
      "nc_read_axis_many",
      "nc_read_error",
      "io_list_groups",
      "io_read",
      "io_read_many",
      "io_read_group",
      "tc_state",
      "tc_event_list",
      "tc_runtime_error_list",
      "tc_log_read",
      "tc_diagnose_errors",
      "tc_diagnose_runtime",
      "tc_list_workbenches",
      "tc_list_projects",
      "tc_project_state",
      "tc_tree_read",
      "tc_tree_search",
      "tc_tree_describe_item",
      "io_list_topology",
      "io_describe_device",
      "io_describe_terminal",
      "plc_write",
      "plc_watch",
      "plc_wait_until",
      "plc_unwatch",
      "plc_list_watches",
      "plc_state",
      "plc_set_write_mode",
      "plc_get_write_mode",
      "plc_evaluate_write_access",
    ]);
  });

  it("dispatches tool calls through the runtime and returns structured JSON", async () => {
    const tools = createMcpToolDefinitions(createRuntimeStub());
    const result = await callMcpTool(tools, "plc_read", {
      name: "MAIN.value",
    });

    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toEqual({
      result: {
        name: "MAIN.value",
        value: 1,
        type: "INT",
        timestamp: "2026-01-01T00:00:00.000Z",
        symbol: { name: "MAIN.value", type: "INT" },
      },
    });
  });

  it("serializes PLC bigint values as strings in MCP results", async () => {
    const tools = createMcpToolDefinitions(
      createRuntimeStub({
        readSymbol: async ({ name }: { name: string }) => ({
          name,
          value: 9_223_372_036_854_775_807n,
          type: "LINT",
          timestamp: "2026-01-01T00:00:00.000Z",
          symbol: { name, type: "LINT" },
        }),
      }),
    );
    const result = await callMcpTool(tools, "plc_read", {
      name: "MAIN.large",
    });

    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toEqual({
      result: {
        name: "MAIN.large",
        value: "9223372036854775807",
        type: "LINT",
        timestamp: "2026-01-01T00:00:00.000Z",
        symbol: { name: "MAIN.large", type: "LINT" },
      },
    });
    expect(result.content[0]).toMatchObject({
      type: "text",
      text: expect.stringContaining('"9223372036854775807"'),
    });
  });

  it("returns MCP tool errors for invalid input", async () => {
    const tools = createMcpToolDefinitions(createRuntimeStub());
    const result = await callMcpTool(tools, "plc_read_many", { names: [] });

    expect(result.isError).toBe(true);
    expect(result.structuredContent).toMatchObject({
      error: { code: "TOOL_INPUT_INVALID" },
    });
  });

  it("serializes watch snapshots without function values", async () => {
    const tools = createMcpToolDefinitions(createRuntimeStub());
    const result = await callMcpTool(tools, "plc_watch", {
      name: "MAIN.watch",
    });

    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toMatchObject({
      watch: {
        name: "MAIN.watch",
        notificationHandle: 123,
        active: true,
      },
    });
    expect(
      "unsubscribe" in
        (result.structuredContent as { watch: Record<string, unknown> }).watch,
    ).toBe(false);
  });

  it("dispatches NC and IO read-only tools", async () => {
    const tools = createMcpToolDefinitions(createRuntimeStub());

    const ncResult = await callMcpTool(tools, "nc_read_axis", { axis: "X" });
    expect(ncResult.isError).toBeUndefined();
    expect(ncResult.structuredContent).toMatchObject({
      result: {
        axis: { name: "X" },
        online: { actualPosition: 12.5 },
        warnings: [],
      },
    });

    const ncPosition = await callMcpTool(tools, "nc_read_axis_position", {
      axis: "X",
    });
    expect(ncPosition.isError).toBeUndefined();
    expect(ncPosition.structuredContent).toMatchObject({
      position: {
        axis: { name: "X" },
        online: { actualPosition: 12.5 },
      },
    });

    const ncStatus = await callMcpTool(tools, "nc_read_axis_status", {
      axis: "X",
    });
    expect(ncStatus.isError).toBeUndefined();
    expect(ncStatus.structuredContent).toMatchObject({
      status: {
        axis: { name: "X" },
        status: { ready: true, referenced: true },
        warnings: [],
      },
    });

    const ioResult = await callMcpTool(tools, "io_read_group", {
      group: "inputs",
    });
    expect(ioResult.isError).toBeUndefined();
    expect(ioResult.structuredContent).toMatchObject({
      group: {
        results: [{ value: true }],
      },
    });
  });

  it("dispatches TwinCAT-wide diagnostic tools", async () => {
    const tools = createMcpToolDefinitions(createRuntimeStub());

    const state = await callMcpTool(tools, "tc_state", {});
    expect(state.isError).toBeUndefined();
    expect(state.structuredContent).toMatchObject({
      adsState: "connected",
      diagnostics: {
        eventSources: [{ id: "events" }],
      },
    });

    const events = await callMcpTool(tools, "tc_event_list", {
      severity: "warning",
    });
    expect(events.isError).toBeUndefined();
    expect(events.structuredContent).toMatchObject({
      events: [{ source: "TcSysSrv", severity: "warning" }],
      count: 1,
    });

    const errors = await callMcpTool(tools, "tc_runtime_error_list", {});
    expect(errors.isError).toBeUndefined();
    expect(errors.structuredContent).toMatchObject({
      errors: [{ severity: "error" }],
      count: 1,
    });

    const log = await callMcpTool(tools, "tc_log_read", {
      limitBytes: 1024,
    });
    expect(log.isError).toBeUndefined();
    expect(log.structuredContent).toMatchObject({
      text: "Runtime log",
      bytesRead: 11,
    });

    const diagnoseErrors = await callMcpTool(tools, "tc_diagnose_errors", {
      limit: 5,
      logLimitBytes: 1024,
    });
    expect(diagnoseErrors.isError).toBeUndefined();
    expect(diagnoseErrors.structuredContent).toMatchObject({
      summary: {
        runtimeErrorCount: 1,
        recentEventCount: 1,
        logBytesRead: 11,
      },
    });

    const diagnoseRuntime = await callMcpTool(tools, "tc_diagnose_runtime", {
      limit: 5,
    });
    expect(diagnoseRuntime.isError).toBeUndefined();
    expect(diagnoseRuntime.structuredContent).toMatchObject({
      summary: {
        plcAvailable: true,
        ncAvailable: true,
        configuredIoDataPoints: 1,
        runtimeErrorCount: 1,
      },
    });

    const workbenches = await callMcpTool(tools, "tc_list_workbenches", {});
    expect(workbenches.isError).toBeUndefined();
    expect(workbenches.structuredContent).toMatchObject({
      workbenches: [{ name: "Machine" }],
      count: 1,
    });

    const projects = await callMcpTool(tools, "tc_list_projects", {
      type: "sysManager",
    });
    expect(projects.isError).toBeUndefined();
    expect(projects.structuredContent).toMatchObject({
      projects: [{ name: "Machine", type: "sysManager" }],
      count: 1,
    });

    const projectState = await callMcpTool(tools, "tc_project_state", {
      project: "Machine",
    });
    expect(projectState.isError).toBeUndefined();
    expect(projectState.structuredContent).toMatchObject({
      projects: [
        {
          project: { name: "Machine" },
          activeConnection: { available: false },
        },
      ],
    });

    const treeSearch = await callMcpTool(tools, "tc_tree_search", {
      type: "terminal",
    });
    expect(treeSearch.isError).toBeUndefined();
    expect(treeSearch.structuredContent).toMatchObject({
      items: [{ name: "EL1008", type: "terminal" }],
      count: 1,
    });

    const treeRead = await callMcpTool(tools, "tc_tree_read", {
      path: "EL1008",
    });
    expect(treeRead.isError).toBeUndefined();
    expect(treeRead.structuredContent).toMatchObject({
      item: { name: "EL1008", settings: { Type: "Terminal" } },
    });

    const topology = await callMcpTool(tools, "io_list_topology", {});
    expect(topology.isError).toBeUndefined();
    expect(topology.structuredContent).toMatchObject({
      devices: [{ name: "Device 1", terminalCount: 1 }],
      count: 1,
    });
  });
});
