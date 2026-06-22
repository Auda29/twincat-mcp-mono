import { describe, expect, it } from "vitest";

import { WriteDeniedError } from "../src/ads/index.js";
import { createToolDefinitions } from "../src/tools/index.js";

function createRuntimeStub() {
  return {
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
    readMany: async ({ names }: { names: string[] }) =>
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
        data: {
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
        },
      },
      nc: {
        available: true,
        data: {
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
        },
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
      runtimeErrors: await createRuntimeStub().tcRuntimeErrorList(),
      recentEvents: await createRuntimeStub().tcEventList(),
      runtimeLog: await createRuntimeStub().tcLogRead(),
    }),
    tcDiagnoseRuntime: async () => {
      const runtime = createRuntimeStub();
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
    tcBuildProject: () => ({
      scope: "twinCatProject" as const,
      status: "unavailable" as const,
      available: false,
      backend: "configuredProjectFiles" as const,
      startedAt: "2026-01-01T00:00:00.000Z",
      completedAt: "2026-01-01T00:00:00.000Z",
      durationMs: 0,
      safetyBoundary: {
        activateConfiguration: false,
        download: false,
        login: false,
        run: false,
        stop: false,
      },
      reason: "No live XAE backend.",
      errors: [],
      warnings: [],
      output: {
        channel: "build" as const,
        text: "Build unavailable",
        truncated: false,
      },
    }),
    plcBuildProject: () => ({
      scope: "plcProject" as const,
      status: "unavailable" as const,
      available: false,
      backend: "configuredProjectFiles" as const,
      startedAt: "2026-01-01T00:00:00.000Z",
      completedAt: "2026-01-01T00:00:00.000Z",
      durationMs: 0,
      safetyBoundary: {
        activateConfiguration: false,
        download: false,
        login: false,
        run: false,
        stop: false,
      },
      reason: "No live XAE backend.",
      errors: [],
      warnings: [],
      output: {
        channel: "build" as const,
        text: "Build unavailable",
        truncated: false,
      },
    }),
    tcBuildAndGetErrors: async () => ({
      build: createRuntimeStub().tcBuildProject(),
      errors: [],
      warnings: [],
      count: 0,
      truncated: false,
    }),
    tcErrorList: () => ({
      available: false,
      backend: "configuredProjectFiles" as const,
      errors: [],
      warnings: [],
      issues: [],
      count: 0,
      truncated: false,
      reason: "No live XAE backend.",
    }),
    tcErrorContext: () => ({
      available: false,
      backend: "configuredProjectFiles" as const,
      reason: "No error context.",
    }),
    tcOutputRead: () => ({
      available: false,
      backend: "configuredProjectFiles" as const,
      channel: "build" as const,
      text: "",
      bytesRead: 0,
      truncated: false,
      reason: "No live XAE backend.",
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
      const runtime = createRuntimeStub();
      const topology = await runtime.ioListTopology();
      return { device: topology.devices[0]! };
    },
    ioDescribeTerminal: async () => {
      const runtime = createRuntimeStub();
      const treeRead = await runtime.tcTreeRead({ path: "EL1008" });
      return { terminal: treeRead.item };
    },
    plcListPous: async () => ({
      pous: [
        {
          id: "pou:main",
          name: "MAIN",
          qualifiedName: "MAIN",
          kind: "program" as const,
          path: "/PlcProject/MAIN",
          sourceFile: "C:/Machine/POUs/MAIN.TcPOU",
          project: {
            id: "configuredProjectFiles:c:/machine/plcproject.plcproj",
            name: "PlcProject",
            path: "C:/Machine/PlcProject.plcproj",
            type: "plc" as const,
            exists: true,
            source: "configuredProjectFiles" as const,
            workbenchId: "configured-project-files",
          },
        },
      ],
      count: 1,
    }),
    plcReadPou: async () => ({
      pou: {
        id: "pou:main",
        name: "MAIN",
        qualifiedName: "MAIN",
        kind: "program" as const,
        path: "/PlcProject/MAIN",
        sourceFile: "C:/Machine/POUs/MAIN.TcPOU",
        project: {
          id: "configuredProjectFiles:c:/machine/plcproject.plcproj",
          name: "PlcProject",
          path: "C:/Machine/PlcProject.plcproj",
          type: "plc" as const,
          exists: true,
          source: "configuredProjectFiles" as const,
          workbenchId: "configured-project-files",
        },
        declaration: "PROGRAM MAIN",
        implementation: "fbValve.Open();",
        rawText: "PROGRAM MAIN\nfbValve.Open();",
      },
    }),
    plcSearchCode: async () => {
      const runtime = createRuntimeStub();
      return {
        matches: [
          {
            pou: (await runtime.plcListPous()).pous[0]!,
            section: "implementation" as const,
            line: 1,
            snippet: "fbValve.Open();",
          },
        ],
        count: 1,
        truncated: false,
      };
    },
    plcDescribePou: async () => {
      const runtime = createRuntimeStub();
      return {
        pou: (await runtime.plcListPous()).pous[0]!,
        declarationLineCount: 1,
        implementationLineCount: 1,
        declarationPreview: "PROGRAM MAIN",
        implementationPreview: "fbValve.Open();",
      };
    },
    plcListLibraries: async () => ({
      libraries: [
        {
          id: "library:tc2_standard",
          name: "Tc2_Standard",
          version: "3.3.3.0",
          namespace: "Tc2_Standard",
          sourceFile: "C:/Machine/PlcProject.plcproj",
          project: {
            id: "configuredProjectFiles:c:/machine/plcproject.plcproj",
            name: "PlcProject",
            path: "C:/Machine/PlcProject.plcproj",
            type: "plc" as const,
            exists: true,
            source: "configuredProjectFiles" as const,
            workbenchId: "configured-project-files",
          },
        },
      ],
      count: 1,
    }),
    plcDescribeLibrary: async () => {
      const runtime = createRuntimeStub();
      return { library: (await runtime.plcListLibraries()).libraries[0]! };
    },
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
    writeSymbol: async ({ name, value }: { name: string; value: unknown }) => ({
      value,
      dataType: { name: "INT" },
      symbol: { name },
    }),
    watchSymbol: async ({ name }: { name: string }) => ({
      name,
      notificationHandle: 123,
      cycleTimeMs: 250,
      mode: "on-change" as const,
      active: true,
    }),
    unwatchSymbol: async ({ name }: { name: string }) => ({
      name,
      notificationHandle: 123,
      cycleTimeMs: 250,
      mode: "on-change" as const,
      active: false,
    }),
    listWatches: () => [],
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
  };
}

describe("tools", () => {
  it("validates read_many input", async () => {
    const tools = createToolDefinitions();
    const tool = tools.find((entry) => entry.name === "plc_read_many");
    expect(tool).toBeDefined();

    const result = await tool!.execute(
      { names: [] },
      { runtime: createRuntimeStub() as never },
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("TOOL_INPUT_INVALID");
    }
  });

  it("returns WRITE_DENIED when plc_write is blocked", async () => {
    const tools = createToolDefinitions();
    const tool = tools.find((entry) => entry.name === "plc_write");
    expect(tool).toBeDefined();

    const runtime = {
      ...createRuntimeStub(),
      writeSymbol: async () => {
        throw new WriteDeniedError(
          "PLC writes are blocked by the runtime write gate. Enable writes explicitly before calling plc_write.",
        );
      },
    };

    const result = await tool!.execute(
      { name: "MAIN.value", value: 7 },
      { runtime: runtime as never },
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("WRITE_DENIED");
    }
  });

  it("returns watch snapshots without function values", async () => {
    const tools = createToolDefinitions();
    const tool = tools.find((entry) => entry.name === "plc_watch");
    expect(tool).toBeDefined();

    const result = await tool!.execute(
      { name: "MAIN.watch" },
      { runtime: createRuntimeStub() as never },
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect("unsubscribe" in result.data.watch).toBe(false);
      expect(result.data.watch.notificationHandle).toBe(123);
    }
  });

  it("returns configured PLC groups", async () => {
    const tools = createToolDefinitions();
    const tool = tools.find((entry) => entry.name === "plc_list_groups");
    expect(tool).toBeDefined();

    const result = await tool!.execute({}, { runtime: createRuntimeStub() as never });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.count).toBe(1);
      expect(result.data.groups[0]?.name).toBe("status");
    }
  });

  it("returns configured NC axes and axis reads", async () => {
    const tools = createToolDefinitions();
    const listTool = tools.find((entry) => entry.name === "nc_list_axes");
    const readTool = tools.find((entry) => entry.name === "nc_read_axis");
    const positionTool = tools.find(
      (entry) => entry.name === "nc_read_axis_position",
    );
    const statusTool = tools.find((entry) => entry.name === "nc_read_axis_status");
    expect(listTool).toBeDefined();
    expect(readTool).toBeDefined();
    expect(positionTool).toBeDefined();
    expect(statusTool).toBeDefined();

    const listResult = await listTool!.execute(
      {},
      { runtime: createRuntimeStub() as never },
    );
    expect(listResult.ok).toBe(true);
    if (listResult.ok) {
      expect(listResult.data.axes[0]?.name).toBe("X");
    }

    const readResult = await readTool!.execute(
      { axis: "X" },
      { runtime: createRuntimeStub() as never },
    );
    expect(readResult.ok).toBe(true);
    if (readResult.ok) {
      expect(readResult.data.result.online.actualPosition).toBe(12.5);
      expect(readResult.data.result.warnings).toEqual([]);
    }

    const positionResult = await positionTool!.execute(
      { axis: "X" },
      { runtime: createRuntimeStub() as never },
    );
    expect(positionResult.ok).toBe(true);
    if (positionResult.ok) {
      expect(positionResult.data.position.online.actualPosition).toBe(12.5);
    }

    const statusResult = await statusTool!.execute(
      { axis: "X" },
      { runtime: createRuntimeStub() as never },
    );
    expect(statusResult.ok).toBe(true);
    if (statusResult.ok) {
      expect(statusResult.data.status.status.ready).toBe(true);
    }
  });

  it("reads configured IO groups", async () => {
    const tools = createToolDefinitions();
    const tool = tools.find((entry) => entry.name === "io_read_group");
    expect(tool).toBeDefined();

    const result = await tool!.execute(
      { group: "inputs" },
      { runtime: createRuntimeStub() as never },
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.group.results[0]?.value).toBe(true);
    }
  });

  it("dispatches TwinCAT-wide diagnostic tools", async () => {
    const tools = createToolDefinitions();
    const stateTool = tools.find((entry) => entry.name === "tc_state");
    const eventsTool = tools.find((entry) => entry.name === "tc_event_list");
    const errorsTool = tools.find(
      (entry) => entry.name === "tc_runtime_error_list",
    );
    const logTool = tools.find((entry) => entry.name === "tc_log_read");
    const diagnoseErrorsTool = tools.find(
      (entry) => entry.name === "tc_diagnose_errors",
    );
    const diagnoseRuntimeTool = tools.find(
      (entry) => entry.name === "tc_diagnose_runtime",
    );
    const workbenchesTool = tools.find(
      (entry) => entry.name === "tc_list_workbenches",
    );
    const projectsTool = tools.find((entry) => entry.name === "tc_list_projects");
    const projectStateTool = tools.find(
      (entry) => entry.name === "tc_project_state",
    );
    const buildTool = tools.find((entry) => entry.name === "tc_build_project");
    const plcBuildTool = tools.find(
      (entry) => entry.name === "plc_build_project",
    );
    const buildErrorsTool = tools.find(
      (entry) => entry.name === "tc_build_and_get_errors",
    );
    const errorListTool = tools.find((entry) => entry.name === "tc_error_list");
    const errorContextTool = tools.find(
      (entry) => entry.name === "tc_error_context",
    );
    const outputReadTool = tools.find(
      (entry) => entry.name === "tc_output_read",
    );
    const treeReadTool = tools.find((entry) => entry.name === "tc_tree_read");
    const treeSearchTool = tools.find((entry) => entry.name === "tc_tree_search");
    const treeDescribeTool = tools.find(
      (entry) => entry.name === "tc_tree_describe_item",
    );
    const topologyTool = tools.find((entry) => entry.name === "io_list_topology");
    const listPousTool = tools.find((entry) => entry.name === "plc_list_pous");
    const readPouTool = tools.find((entry) => entry.name === "plc_read_pou");
    const searchCodeTool = tools.find((entry) => entry.name === "plc_search_code");
    const describePouTool = tools.find(
      (entry) => entry.name === "plc_describe_pou",
    );
    const librariesTool = tools.find(
      (entry) => entry.name === "plc_list_libraries",
    );
    expect(stateTool).toBeDefined();
    expect(eventsTool).toBeDefined();
    expect(errorsTool).toBeDefined();
    expect(logTool).toBeDefined();
    expect(diagnoseErrorsTool).toBeDefined();
    expect(diagnoseRuntimeTool).toBeDefined();
    expect(workbenchesTool).toBeDefined();
    expect(projectsTool).toBeDefined();
    expect(projectStateTool).toBeDefined();
    expect(buildTool).toBeDefined();
    expect(plcBuildTool).toBeDefined();
    expect(buildErrorsTool).toBeDefined();
    expect(errorListTool).toBeDefined();
    expect(errorContextTool).toBeDefined();
    expect(outputReadTool).toBeDefined();
    expect(treeReadTool).toBeDefined();
    expect(treeSearchTool).toBeDefined();
    expect(treeDescribeTool).toBeDefined();
    expect(topologyTool).toBeDefined();
    expect(listPousTool).toBeDefined();
    expect(readPouTool).toBeDefined();
    expect(searchCodeTool).toBeDefined();
    expect(describePouTool).toBeDefined();
    expect(librariesTool).toBeDefined();

    const state = await stateTool!.execute(
      {},
      { runtime: createRuntimeStub() as never },
    );
    expect(state.ok).toBe(true);
    if (state.ok) {
      expect(state.data.diagnostics.eventSources[0]?.id).toBe("events");
    }

    const events = await eventsTool!.execute(
      { severity: "warning" },
      { runtime: createRuntimeStub() as never },
    );
    expect(events.ok).toBe(true);
    if (events.ok) {
      expect(events.data.events[0]?.severity).toBe("warning");
    }

    const errors = await errorsTool!.execute(
      {},
      { runtime: createRuntimeStub() as never },
    );
    expect(errors.ok).toBe(true);
    if (errors.ok) {
      expect(errors.data.errors[0]?.severity).toBe("error");
    }

    const log = await logTool!.execute(
      { limitBytes: 1024 },
      { runtime: createRuntimeStub() as never },
    );
    expect(log.ok).toBe(true);
    if (log.ok) {
      expect(log.data.text).toBe("Runtime log");
    }

    const diagnoseErrors = await diagnoseErrorsTool!.execute(
      { limit: 5, logLimitBytes: 1024 },
      { runtime: createRuntimeStub() as never },
    );
    expect(diagnoseErrors.ok).toBe(true);
    if (diagnoseErrors.ok) {
      expect(diagnoseErrors.data.summary.runtimeErrorCount).toBe(1);
      expect(diagnoseErrors.data.runtimeLog.text).toBe("Runtime log");
    }

    const diagnoseRuntime = await diagnoseRuntimeTool!.execute(
      { limit: 5 },
      { runtime: createRuntimeStub() as never },
    );
    expect(diagnoseRuntime.ok).toBe(true);
    if (diagnoseRuntime.ok) {
      expect(diagnoseRuntime.data.summary.configuredIoDataPoints).toBe(1);
      expect(diagnoseRuntime.data.summary.runtimeErrorCount).toBe(1);
    }

    const workbenches = await workbenchesTool!.execute(
      {},
      { runtime: createRuntimeStub() as never },
    );
    expect(workbenches.ok).toBe(true);
    if (workbenches.ok) {
      expect(workbenches.data.workbenches[0]?.name).toBe("Machine");
    }

    const projects = await projectsTool!.execute(
      { type: "sysManager" },
      { runtime: createRuntimeStub() as never },
    );
    expect(projects.ok).toBe(true);
    if (projects.ok) {
      expect(projects.data.projects[0]?.type).toBe("sysManager");
    }

    const projectState = await projectStateTool!.execute(
      { project: "Machine" },
      { runtime: createRuntimeStub() as never },
    );
    expect(projectState.ok).toBe(true);
    if (projectState.ok) {
      expect(projectState.data.projects[0]?.activeConnection.available).toBe(
        false,
      );
    }

    const build = await buildTool!.execute(
      { project: "Machine" },
      { runtime: createRuntimeStub() as never },
    );
    expect(build.ok).toBe(true);
    if (build.ok) {
      expect(build.data.status).toBe("unavailable");
      expect(build.data.safetyBoundary.activateConfiguration).toBe(false);
    }

    const plcBuild = await plcBuildTool!.execute(
      {},
      { runtime: createRuntimeStub() as never },
    );
    expect(plcBuild.ok).toBe(true);
    if (plcBuild.ok) {
      expect(plcBuild.data.scope).toBe("plcProject");
    }

    const buildErrors = await buildErrorsTool!.execute(
      { limit: 5 },
      { runtime: createRuntimeStub() as never },
    );
    expect(buildErrors.ok).toBe(true);
    if (buildErrors.ok) {
      expect(buildErrors.data.count).toBe(0);
      expect(buildErrors.data.build.status).toBe("unavailable");
    }

    const errorList = await errorListTool!.execute(
      { severity: ["error", "warning"] },
      { runtime: createRuntimeStub() as never },
    );
    expect(errorList.ok).toBe(true);
    if (errorList.ok) {
      expect(errorList.data.available).toBe(false);
    }

    const errorContext = await errorContextTool!.execute(
      { error: "err://missing" },
      { runtime: createRuntimeStub() as never },
    );
    expect(errorContext.ok).toBe(true);
    if (errorContext.ok) {
      expect(errorContext.data.available).toBe(false);
    }

    const outputRead = await outputReadTool!.execute(
      { channel: "build" },
      { runtime: createRuntimeStub() as never },
    );
    expect(outputRead.ok).toBe(true);
    if (outputRead.ok) {
      expect(outputRead.data.channel).toBe("build");
    }

    const treeSearch = await treeSearchTool!.execute(
      { type: "terminal" },
      { runtime: createRuntimeStub() as never },
    );
    expect(treeSearch.ok).toBe(true);
    if (treeSearch.ok) {
      expect(treeSearch.data.items[0]?.name).toBe("EL1008");
    }

    const treeRead = await treeReadTool!.execute(
      { path: "EL1008" },
      { runtime: createRuntimeStub() as never },
    );
    expect(treeRead.ok).toBe(true);
    if (treeRead.ok) {
      expect(treeRead.data.item.settings.Type).toBe("Terminal");
    }

    const topology = await topologyTool!.execute(
      {},
      { runtime: createRuntimeStub() as never },
    );
    expect(topology.ok).toBe(true);
    if (topology.ok) {
      expect(topology.data.devices[0]?.terminalCount).toBe(1);
    }

    const pous = await listPousTool!.execute(
      {},
      { runtime: createRuntimeStub() as never },
    );
    expect(pous.ok).toBe(true);
    if (pous.ok) {
      expect(pous.data.pous[0]?.kind).toBe("program");
    }

    const pou = await readPouTool!.execute(
      { pou: "MAIN" },
      { runtime: createRuntimeStub() as never },
    );
    expect(pou.ok).toBe(true);
    if (pou.ok) {
      expect(pou.data.pou.declaration).toBe("PROGRAM MAIN");
    }

    const libraries = await librariesTool!.execute(
      {},
      { runtime: createRuntimeStub() as never },
    );
    expect(libraries.ok).toBe(true);
    if (libraries.ok) {
      expect(libraries.data.libraries[0]?.name).toBe("Tc2_Standard");
    }
  });

  it("passes AbortSignal through plc_wait_until", async () => {
    const tools = createToolDefinitions();
    const tool = tools.find((entry) => entry.name === "plc_wait_until");
    expect(tool).toBeDefined();

    const controller = new AbortController();
    let receivedSignal: AbortSignal | undefined;
    const runtime = {
      ...createRuntimeStub(),
      waitUntil: async ({ signal }: { signal?: AbortSignal }) => {
        receivedSignal = signal;
        return {
          status: "cancelled" as const,
          conditionMatched: false,
          startedAt: "2026-01-01T00:00:00.000Z",
          completedAt: "2026-01-01T00:00:00.001Z",
          durationMs: 1,
          timeoutMs: 100,
          stableForMs: 0,
          values: [],
        };
      },
    };

    const result = await tool!.execute(
      {
        condition: { name: "MAIN.watch", operator: "equals", value: true },
        timeoutMs: 100,
      },
      {
        runtime: runtime as never,
        signal: controller.signal,
      },
    );

    expect(result.ok).toBe(true);
    expect(receivedSignal).toBe(controller.signal);
  });
});
