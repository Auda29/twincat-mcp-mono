import { EventEmitter } from "node:events";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockState = vi.hoisted(() => ({
  connectCalls: 0,
  createHandleCalls: 0,
  deleteHandleCalls: 0,
  subscribeCalls: 0,
  unsubscribeCalls: 0,
  symbols: {
    "MAIN.value": {
      name: "MAIN.value",
      type: "INT",
      comment: "Test value",
      size: 2,
      flags: 0,
      indexGroup: 1,
      indexOffset: 2,
    },
    "MAIN.watch": {
      name: "MAIN.watch",
      type: "BOOL",
      comment: "Watch value",
      size: 1,
      flags: 0,
      indexGroup: 3,
      indexOffset: 4,
    },
  } as Record<string, any>,
  values: {
    "MAIN.value": 42,
    "MAIN.watch": true,
  } as Record<string, unknown>,
  rawValues: new Map<string, Buffer>(),
  rawReadCalls: [] as Array<{
    port: number;
    indexGroup: number;
    indexOffset: number;
    size: number;
  }>,
  failRawReads: new Set<string>(),
  clientInstances: [] as MockClient[],
  failConnectPorts: new Set<number>(),
  nextNotificationHandle: 100,
}));

class MockClient extends EventEmitter {
  settings: Record<string, unknown>;
  connection = {
    connected: false,
    localAmsNetId: "1.1.1.1.1.1",
    localAdsPort: 30000,
    targetAmsNetId: "192.168.1.120.1.1",
    targetAdsPort: 851,
  };
  activeSubscriptions: Record<string, Record<number, any>> = {};

  constructor(settings: Record<string, unknown>) {
    super();
    this.settings = settings;
    this.connection.targetAdsPort = settings.targetAdsPort as number;
    mockState.clientInstances.push(this);
  }

  async connect() {
    mockState.connectCalls += 1;
    if (mockState.failConnectPorts.has(this.connection.targetAdsPort)) {
      throw new Error(`Port ${this.connection.targetAdsPort} unavailable`);
    }

    this.connection.connected = true;
    return this.connection;
  }

  async disconnect() {
    this.connection.connected = false;
  }

  async cacheSymbols() {}

  async cacheDataTypes() {}

  async getSymbols() {
    return mockState.symbols;
  }

  async getDataType(name: string) {
    return {
      version: 1,
      hashValue: 1,
      typeHashValue: 1,
      size: name === "ST_Status" ? 4 : 2,
      offset: 0,
      adsDataType: 0,
      adsDataTypeStr: "ADST_BIGTYPE",
      flags: 0,
      flagsStr: [],
      arrayDimension: 0,
      name,
      type: "",
      comment: `${name} type`,
      arrayInfos: [],
      subItems:
        name === "ST_Status"
          ? [
              {
                version: 1,
                hashValue: 1,
                typeHashValue: 1,
                size: 1,
                offset: 0,
                adsDataType: 33,
                adsDataTypeStr: "ADST_BIT",
                flags: 0,
                flagsStr: [],
                arrayDimension: 0,
                name: "ready",
                type: "BOOL",
                comment: "Ready flag",
                arrayInfos: [],
                subItems: [],
                typeGuid: "",
                rpcMethods: [],
                attributes: [],
                enumInfos: [],
                extendedFlags: 0,
                reserved: Buffer.alloc(0),
              },
            ]
          : [],
      typeGuid: "",
      rpcMethods: [],
      attributes: [],
      enumInfos: [],
      extendedFlags: 0,
      reserved: Buffer.alloc(0),
    };
  }

  async readValue(name: string) {
    const symbol =
      mockState.symbols[name] ??
      (name in mockState.values
        ? {
            name,
            type: "INT",
            comment: "",
            size: 2,
            flags: 0,
            indexGroup: 100,
            indexOffset: 200,
          }
        : undefined);

    if (!symbol) {
      throw new Error(`Unknown symbol ${name}`);
    }

    return {
      value: mockState.values[name],
      rawValue: Buffer.from(String(mockState.values[name])),
      dataType: { name: symbol.type },
      symbol,
    };
  }

  async readRawMulti(
    commands: Array<{ indexGroup: number; indexOffset: number; size?: number }>,
  ) {
    return commands.map((command) => {
      const size = "size" in command && typeof command.size === "number" ? command.size : 0;
      if (
        mockState.failRawReads.has(
          `${this.connection.targetAdsPort}:${command.indexGroup}:${command.indexOffset}:${size}`,
        )
      ) {
        return {
          success: false,
          command,
        };
      }

      const rawValue = mockState.rawValues.get(
        `${this.connection.targetAdsPort}:${command.indexGroup}:${command.indexOffset}`,
      );
      if (rawValue !== undefined) {
        return {
          success: true,
          command,
          value: rawValue,
        };
      }

      const symbol = Object.values(mockState.symbols).find(
        (entry) =>
          entry.indexGroup === command.indexGroup &&
          entry.indexOffset === command.indexOffset,
      );

      return {
        success: true,
        command,
        value: Buffer.from(String(mockState.values[symbol?.name ?? ""] ?? "")),
      };
    });
  }

  async readRaw(indexGroup: number, indexOffset: number, size: number) {
    mockState.rawReadCalls.push({
      port: this.connection.targetAdsPort,
      indexGroup,
      indexOffset,
      size,
    });
    if (
      mockState.failRawReads.has(
        `${this.connection.targetAdsPort}:${indexGroup}:${indexOffset}:${size}`,
      )
    ) {
      throw new Error(
        `readRaw failed for ${this.connection.targetAdsPort}:${indexGroup}:${indexOffset}:${size}`,
      );
    }

    const rawValue = mockState.rawValues.get(
      `${this.connection.targetAdsPort}:${indexGroup}:${indexOffset}`,
    );
    if (rawValue !== undefined) {
      return rawValue;
    }

    return Buffer.alloc(size);
  }

  async convertFromRaw(buffer: Buffer) {
    const value = buffer.toString();
    return Number.isNaN(Number(value)) ? value : Number(value);
  }

  async writeValue(name: string, value: unknown) {
    const symbol = mockState.symbols[name];
    mockState.values[name] = value;
    return {
      value,
      rawValue: Buffer.from(String(value)),
      dataType: { name: symbol.type },
      symbol,
    };
  }

  async readPlcRuntimeState() {
    return { adsState: 5, adsStateStr: "Run", deviceState: 0 };
  }

  async readTcSystemState() {
    return { adsState: 5, adsStateStr: "Run", deviceState: 0 };
  }

  async readTcSystemExtendedState() {
    return {
      adsState: 5,
      adsStateStr: "Run",
      deviceState: 0,
      restartIndex: 1,
      version: 3,
      revision: 1,
      build: 4026,
      platform: 1,
      osType: 1,
    };
  }

  async readDeviceInfo() {
    return {
      majorVersion: 1,
      minorVersion: 2,
      versionBuild: 3,
      deviceName: "Mock PLC",
    };
  }

  async subscribeValue(
    path: string,
    callback: (data: { timestamp: Date; value: unknown }, subscription: any) => void,
    cycleTime?: number,
    sendOnChange?: boolean,
    maxDelay?: number,
  ) {
    mockState.subscribeCalls += 1;
    const remoteAddress = {
      amsNetId: this.connection.targetAmsNetId,
      adsPort: this.connection.targetAdsPort,
    };
    const notificationHandle = mockState.nextNotificationHandle++;
    const latestData = {
      timestamp: new Date("2026-01-01T00:00:00.000Z"),
      value: mockState.values[path],
    };
    const subscription = {
      settings: {
        target: path,
        callback,
        cycleTime,
        sendOnChange,
        maxDelay,
      },
      internal: false,
      remoteAddress,
      notificationHandle,
      symbol: mockState.symbols[path],
      latestData,
      unsubscribe: async () => {
        mockState.unsubscribeCalls += 1;
        delete this.activeSubscriptions[`${remoteAddress.amsNetId}:${remoteAddress.adsPort}`]?.[
          notificationHandle
        ];
      },
    };
    const key = `${remoteAddress.amsNetId}:${remoteAddress.adsPort}`;
    this.activeSubscriptions[key] ??= {};
    this.activeSubscriptions[key][notificationHandle] = subscription;
    return subscription;
  }

  async unsubscribe(subscription: { unsubscribe: () => Promise<void> }) {
    await subscription.unsubscribe();
  }

  async createVariableHandle() {
    mockState.createHandleCalls += 1;
    return {
      handle: 777,
      size: 2,
      typeDecoration: 0,
      dataType: "INT",
    };
  }

  async deleteVariableHandle() {
    mockState.deleteHandleCalls += 1;
  }
}

function getMockClientByPort(targetAdsPort: number): MockClient | undefined {
  return mockState.clientInstances.find(
    (client) => client.settings.targetAdsPort === targetAdsPort,
  );
}

function createNcOnlineStateBuffer(size = 256) {
  const buffer = Buffer.alloc(size);
  buffer.writeInt32LE(0, 0);
  buffer.writeDoubleLE(12.5, 8);
  buffer.writeDoubleLE(12.5, 16);
  buffer.writeDoubleLE(13.5, 24);
  buffer.writeDoubleLE(13.5, 32);
  buffer.writeDoubleLE(2.5, 40);
  buffer.writeDoubleLE(3.5, 48);
  buffer.writeUInt32LE(1_000_000, 56);
  buffer.writeDoubleLE(0.1, 64);
  buffer.writeDoubleLE(25, 88);
  buffer.writeDoubleLE(30, 96);
  buffer.writeUInt32LE(0x1234, 104);
  return buffer;
}

vi.mock("ads-client", () => ({
  ADS: {},
  Client: MockClient,
}));

describe("AdsService", () => {
  beforeEach(() => {
    mockState.connectCalls = 0;
    mockState.createHandleCalls = 0;
    mockState.deleteHandleCalls = 0;
    mockState.subscribeCalls = 0;
    mockState.unsubscribeCalls = 0;
    mockState.nextNotificationHandle = 100;
    mockState.clientInstances.length = 0;
    mockState.failConnectPorts.clear();
    mockState.rawValues.clear();
    mockState.rawReadCalls.length = 0;
    mockState.failRawReads.clear();
    mockState.symbols = {
      "MAIN.value": {
        name: "MAIN.value",
        type: "INT",
        comment: "Test value",
        size: 2,
        flags: 0,
        indexGroup: 1,
        indexOffset: 2,
      },
      "MAIN.watch": {
        name: "MAIN.watch",
        type: "BOOL",
        comment: "Watch value",
        size: 1,
        flags: 0,
        indexGroup: 3,
        indexOffset: 4,
      },
    };
    mockState.values["MAIN.value"] = 42;
    mockState.values["MAIN.watch"] = true;
  });

  afterEach(() => {
    vi.resetModules();
  });

  it("deduplicates concurrent connect calls", async () => {
    const { AdsService } = await import("../src/ads-service.js");

    const service = new AdsService({
      connectionMode: "router",
      targetAmsNetId: "192.168.1.120.1.1",
      targetAdsPort: 851,
      readOnly: true,
      writeAllowlist: [],
      contextSnapshotSymbols: [],
      notificationCycleTimeMs: 250,
      maxNotifications: 128,
    });

    await Promise.all([service.connect(), service.connect()]);

    expect(mockState.connectCalls).toBe(1);
  });

  it("creates a reusable ADS client registry for PLC, NC, and IO services", async () => {
    const { AdsService } = await import("../src/ads-service.js");

    const service = new AdsService({
      connectionMode: "router",
      targetAmsNetId: "192.168.1.120.1.1",
      targetAdsPort: 851,
      readOnly: true,
      writeAllowlist: [],
      contextSnapshotSymbols: [],
      notificationCycleTimeMs: 250,
      maxNotifications: 128,
      services: {
        plc: {
          targetAdsPort: 852,
          symbolGroups: {},
        },
        nc: {
          targetAdsPort: 500,
        },
        io: {
          targetAdsPort: 300,
        },
      },
    });

    expect(mockState.clientInstances.map((client) => client.settings.targetAdsPort)).toEqual([
      852,
      500,
      300,
    ]);
    expect(mockState.clientInstances.map((client) => client.settings.rawClient)).toEqual([
      undefined,
      true,
      true,
    ]);
    expect(service.listServices()).toMatchObject([
      { name: "plc", targetAdsPort: 852, connected: false },
      { name: "nc", targetAdsPort: 500, connected: false },
      { name: "io", targetAdsPort: 300, connected: false },
    ]);

    await service.connectService("nc");

    expect(service.getServiceClient("nc").connection.connected).toBe(true);
    expect(service.listServices()).toMatchObject([
      { name: "plc", connected: false },
      { name: "nc", connected: true },
      { name: "io", connected: false },
    ]);
  });

  it("includes readable PLC runtime status in state results", async () => {
    const { AdsService } = await import("../src/ads-service.js");

    const service = new AdsService({
      connectionMode: "router",
      targetAmsNetId: "192.168.1.120.1.1",
      targetAdsPort: 851,
      readOnly: true,
      writeAllowlist: [],
      contextSnapshotSymbols: [],
      notificationCycleTimeMs: 250,
      maxNotifications: 128,
    });

    const state = await service.readState();

    expect(state.plcRuntimeState).toMatchObject({
      adsState: 5,
      deviceState: 0,
    });
    expect(state.plcRuntimeStatus).toEqual({
      adsState: 5,
      adsStateName: "Run",
      deviceState: 0,
      isRun: true,
      isStop: false,
    });
    expect(state.tcSystemStatus.adsStateName).toBe("Run");
  });

  it("enforces the runtime write gate before writing", async () => {
    const { AdsService } = await import("../src/ads-service.js");

    const service = new AdsService({
      connectionMode: "router",
      targetAmsNetId: "192.168.1.120.1.1",
      targetAdsPort: 851,
      readOnly: false,
      writeAllowlist: ["MAIN.value"],
      contextSnapshotSymbols: [],
      notificationCycleTimeMs: 250,
      maxNotifications: 128,
    });

    await expect(service.writeValue("MAIN.value", 7)).rejects.toThrow(
      "runtime write gate",
    );

    service.setWriteMode("enabled");
    const result = await service.writeValue("MAIN.value", 7);
    expect(result.value).toBe(7);
  });

  it("reuses handles and releases them", async () => {
    const { AdsService } = await import("../src/ads-service.js");

    const service = new AdsService({
      connectionMode: "router",
      targetAmsNetId: "192.168.1.120.1.1",
      targetAdsPort: 851,
      readOnly: true,
      writeAllowlist: [],
      contextSnapshotSymbols: [],
      notificationCycleTimeMs: 250,
      maxNotifications: 128,
    });

    const handleA = await service.getOrCreateHandle("MAIN.value");
    const handleB = await service.getOrCreateHandle("MAIN.value");

    expect(handleA.handle).toBe(handleB.handle);
    expect(mockState.createHandleCalls).toBe(1);

    await service.releaseHandle("MAIN.value");
    expect(mockState.deleteHandleCalls).toBe(1);
  });

  it("registers, lists, and idempotently removes watches", async () => {
    const { AdsService } = await import("../src/ads-service.js");

    const service = new AdsService({
      connectionMode: "router",
      targetAmsNetId: "192.168.1.120.1.1",
      targetAdsPort: 851,
      readOnly: true,
      writeAllowlist: [],
      contextSnapshotSymbols: [],
      notificationCycleTimeMs: 250,
      maxNotifications: 128,
    });

    const watch = await service.watchValue("MAIN.watch");
    expect(watch.active).toBe(true);
    expect(watch.lastValue).toBe(true);
    expect(watch.lastTimestamp).toBe("2026-01-01T00:00:00.000Z");
    expect(service.listWatches()).toHaveLength(1);

    const removed = await service.unwatchValue("MAIN.watch");
    expect(removed.active).toBe(false);
    expect(service.listWatches()).toHaveLength(0);

    const missing = await service.unwatchValue("MAIN.watch");
    expect(missing.active).toBe(false);
  });

  it("keeps registered watches listable after another registration fails", async () => {
    const { AdsService } = await import("../src/ads-service.js");
    const service = new AdsService({
      connectionMode: "router", targetAmsNetId: "192.168.1.120.1.1", targetAdsPort: 851, readOnly: true,
      writeAllowlist: [], contextSnapshotSymbols: [], notificationCycleTimeMs: 50, maxNotifications: 2,
    });
    const client = getMockClientByPort(851)!;
    await service.watchSymbol("MAIN.watch");
    vi.spyOn(client, "subscribeValue").mockRejectedValueOnce(new Error("ADS symbol not found"));

    await expect(service.watchSymbol("MAIN.value")).rejects.toThrow("ADS symbol not found");
    expect(service.listWatches()).toMatchObject([{ name: "MAIN.watch", active: true }]);
    await expect(service.watchSymbol("MAIN.value")).resolves.toMatchObject({ active: true });
    await service.disconnect();
  });

  it("cancels a watch registration while the ADS connection is pending", async () => {
    const { AdsService } = await import("../src/ads-service.js");
    const service = new AdsService({
      connectionMode: "router", targetAmsNetId: "192.168.1.120.1.1", targetAdsPort: 851, readOnly: true,
      writeAllowlist: [], contextSnapshotSymbols: [], notificationCycleTimeMs: 50, maxNotifications: 2,
    });
    const client = getMockClientByPort(851)!;
    const connect = client.connect.bind(client);
    let start!: () => void;
    let resume!: () => void;
    const started = new Promise<void>(resolve => { start = resolve; });
    const gate = new Promise<void>(resolve => { resume = resolve; });
    vi.spyOn(client, "connect").mockImplementationOnce(async () => {
      start();
      await gate;
      return connect();
    });
    const subscribe = vi.spyOn(client, "subscribeValue");

    const registration = service.watchValue("MAIN.watch");
    await started;
    expect(await service.unwatchValue("MAIN.watch")).toMatchObject({ active: false });
    resume();

    await expect(registration).rejects.toThrow("PLC watch registration was closed.");
    expect(subscribe).not.toHaveBeenCalled();
    expect(service.listWatches()).toEqual([]);
    await service.disconnect();
  });

  it("cancels a pending watch registration when the symbol is unwatched", async () => {
    const { AdsService } = await import("../src/ads-service.js");
    const service = new AdsService({
      connectionMode: "router", targetAmsNetId: "192.168.1.120.1.1", targetAdsPort: 851, readOnly: true,
      writeAllowlist: [], contextSnapshotSymbols: [], notificationCycleTimeMs: 50, maxNotifications: 2,
    });
    const client = getMockClientByPort(851)!;
    const subscribe = client.subscribeValue.bind(client);
    let start!: () => void;
    let resume!: () => void;
    const started = new Promise<void>(resolve => { start = resolve; });
    const gate = new Promise<void>(resolve => { resume = resolve; });
    const subscribeSpy = vi.spyOn(client, "subscribeValue").mockImplementationOnce(async (...args) => {
      start();
      await gate;
      return subscribe(...args);
    });
    const unsubscribe = vi.spyOn(client, "unsubscribe");

    const registration = service.watchSymbol("MAIN.watch");
    await started;
    expect(await service.unwatchValue("MAIN.watch")).toMatchObject({ active: false });
    resume();

    await expect(registration).rejects.toThrow("PLC watch registration was closed.");
    expect(unsubscribe).toHaveBeenCalledExactlyOnceWith(await subscribeSpy.mock.results[0]!.value);
    expect(service.listWatches()).toEqual([]);
    await service.disconnect();
  });

  it("disconnects active watches while a registration is pending and removes the late subscription", async () => {
    const { AdsService } = await import("../src/ads-service.js");
    const service = new AdsService({
      connectionMode: "router", targetAmsNetId: "192.168.1.120.1.1", targetAdsPort: 851, readOnly: true,
      writeAllowlist: [], contextSnapshotSymbols: [], notificationCycleTimeMs: 50, maxNotifications: 2,
    });
    await service.watchSymbol("MAIN.watch");
    const client = getMockClientByPort(851)!;
    const subscribe = client.subscribeValue.bind(client);
    let resume!: () => void;
    const gate = new Promise<void>(resolve => { resume = resolve; });
    const subscribeSpy = vi.spyOn(client, "subscribeValue").mockImplementationOnce(async (...args) => {
      await gate;
      return subscribe(...args);
    });
    const registration = service.watchSymbol("MAIN.value");
    await vi.waitFor(() => expect(subscribeSpy).toHaveBeenCalledOnce());
    expect(service.listWatches()).toMatchObject([{ name: "MAIN.watch", active: true }]);

    await service.disconnect();
    expect(mockState.unsubscribeCalls).toBe(1);
    expect(client.connection.connected).toBe(false);
    resume();
    await expect(registration).rejects.toThrow("PLC watch registration was closed.");
    expect(mockState.unsubscribeCalls).toBe(2);
    expect(service.listWatches()).toEqual([]);
  });

  it("disconnects transport clients when an active watch unsubscribe stalls", async () => {
    vi.useFakeTimers();
    try {
      const { AdsService } = await import("../src/ads-service.js");
      const service = new AdsService({
        connectionMode: "router", targetAmsNetId: "192.168.1.120.1.1", targetAdsPort: 851, readOnly: true,
        writeAllowlist: [], contextSnapshotSymbols: [], notificationCycleTimeMs: 50, maxNotifications: 2,
      }, { waitCleanupTimeoutMs: 25 });
      const client = getMockClientByPort(851)!;
      const disconnect = vi.spyOn(client, "disconnect");
      const disconnectNc = vi.spyOn(service.getServiceClient("nc"), "disconnect");
      await service.connectService("nc");
      await service.watchSymbol("MAIN.watch");
      await service.watchSymbol("MAIN.value");
      const unsubscribe = vi.spyOn(client, "unsubscribe").mockReturnValueOnce(new Promise(() => {}));

      const closing = service.disconnect();
      await vi.advanceTimersByTimeAsync(24);
      expect(unsubscribe).toHaveBeenCalledTimes(2);
      expect(disconnect).not.toHaveBeenCalled();
      expect(disconnectNc).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(1);
      expect(disconnect).toHaveBeenCalledExactlyOnceWith(true);
      expect(disconnectNc).toHaveBeenCalledOnce();
      await closing;
      expect(service.listWatches()).toEqual([]);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("forces the ADS transport closed when cached handle deletion stalls", async () => {
    vi.useFakeTimers();
    try {
      const { AdsService } = await import("../src/ads-service.js");
      const service = new AdsService({
        connectionMode: "router", targetAmsNetId: "192.168.1.120.1.1", targetAdsPort: 851, readOnly: true,
        writeAllowlist: [], contextSnapshotSymbols: [], notificationCycleTimeMs: 50, maxNotifications: 2,
      }, { waitCleanupTimeoutMs: 25 });
      const handle = await service.getOrCreateHandle("MAIN.value");
      const client = getMockClientByPort(851)!;
      const disconnect = vi.spyOn(client, "disconnect");
      const deleteHandle = vi.spyOn(client, "deleteVariableHandle").mockReturnValueOnce(new Promise(() => {}));

      const closing = service.disconnect();
      await vi.advanceTimersByTimeAsync(24);
      expect(deleteHandle).toHaveBeenCalledExactlyOnceWith(handle);
      expect(disconnect).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(1);
      expect(disconnect).toHaveBeenCalledExactlyOnceWith(true);
      await closing;
      expect(client.connection.connected).toBe(false);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("rebinds watch subscriptions after reconnect", async () => {
    const { AdsService } = await import("../src/ads-service.js");

    const service = new AdsService({
      connectionMode: "router",
      targetAmsNetId: "192.168.1.120.1.1",
      targetAdsPort: 851,
      readOnly: true,
      writeAllowlist: [],
      contextSnapshotSymbols: [],
      notificationCycleTimeMs: 250,
      maxNotifications: 128,
    });

    const firstWatch = await service.watchValue("MAIN.watch");
    const client = getMockClientByPort(851);
    expect(client).toBeDefined();

    client!.activeSubscriptions = {
      "192.168.1.120.1.1:851": {
        999: {
          ...(await client!.subscribeValue("MAIN.watch", () => undefined)),
          notificationHandle: 999,
          settings: {
            target: "MAIN.watch",
          },
          latestData: {
            timestamp: new Date("2026-01-02T00:00:00.000Z"),
            value: false,
          },
        },
      },
    };

    client!.emit("reconnect", true, []);
    await vi.waitFor(() => {
      expect(service.listWatches()[0]?.notificationHandle).toBe(999);
    });

    expect(firstWatch.notificationHandle).not.toBe(999);
  });

  it("evaluates write access across all gate states", async () => {
    const { AdsService } = await import("../src/ads-service.js");

    const readOnlyService = new AdsService({
      connectionMode: "router",
      targetAmsNetId: "192.168.1.120.1.1",
      targetAdsPort: 851,
      readOnly: true,
      writeAllowlist: ["MAIN.value"],
      contextSnapshotSymbols: [],
      notificationCycleTimeMs: 250,
      maxNotifications: 128,
    });

    expect(readOnlyService.evaluateWriteAccess("MAIN.value")).toEqual({
      allow: false,
      reason: "PLC writes are disabled by configuration because readOnly is true.",
    });

    const gatedService = new AdsService({
      connectionMode: "router",
      targetAmsNetId: "192.168.1.120.1.1",
      targetAdsPort: 851,
      readOnly: false,
      writeAllowlist: ["MAIN.value"],
      contextSnapshotSymbols: [],
      notificationCycleTimeMs: 250,
      maxNotifications: 128,
    });

    expect(gatedService.evaluateWriteAccess("MAIN.value")).toEqual({
      allow: false,
      reason:
        "PLC writes are blocked by the runtime write gate. Enable writes explicitly before calling plc_write.",
    });

    gatedService.setWriteMode("enabled");
    expect(gatedService.evaluateWriteAccess("MAIN.other").allow).toBe(false);
    expect(gatedService.evaluateWriteAccess("MAIN.value")).toEqual({
      allow: true,
    });
  });

  it("reads many symbols via raw multi read", async () => {
    const { AdsService } = await import("../src/ads-service.js");

    const service = new AdsService({
      connectionMode: "router",
      targetAmsNetId: "192.168.1.120.1.1",
      targetAdsPort: 851,
      readOnly: true,
      writeAllowlist: [],
      contextSnapshotSymbols: [],
      notificationCycleTimeMs: 250,
      maxNotifications: 128,
    });

    const results = await service.readMany(["MAIN.value", "MAIN.watch"]);

    expect(results).toHaveLength(2);
    expect(results[0]?.name).toBe("MAIN.value");
    expect(results[0]?.value).toBe(42);
    expect(results[1]?.name).toBe("MAIN.watch");
  });

  it("resolves symbols case-insensitively for raw multi read", async () => {
    const { AdsService } = await import("../src/ads-service.js");

    mockState.symbols = {
      "main.value": {
        name: "MAIN.value",
        type: "INT",
        comment: "Test value",
        size: 2,
        flags: 0,
        indexGroup: 1,
        indexOffset: 2,
      },
    };
    mockState.values["MAIN.value"] = 42;
    mockState.values["main.value"] = 42;

    const service = new AdsService({
      connectionMode: "router",
      targetAmsNetId: "192.168.1.120.1.1",
      targetAdsPort: 851,
      readOnly: true,
      writeAllowlist: [],
      contextSnapshotSymbols: [],
      notificationCycleTimeMs: 250,
      maxNotifications: 128,
    });

    const results = await service.readMany(["MAIN.value"]);

    expect(results).toHaveLength(1);
    expect(results[0]?.name).toBe("MAIN.value");
    expect(results[0]?.value).toBe(42);
  });

  it("falls back to direct readValue calls when symbols are missing from the upload cache", async () => {
    const { AdsService } = await import("../src/ads-service.js");

    mockState.symbols = {
      "main.cached": {
        name: "MAIN.cached",
        type: "INT",
        comment: "Cached test value",
        size: 2,
        flags: 0,
        indexGroup: 11,
        indexOffset: 12,
      },
    };
    mockState.values["MAIN.dynamic"] = 99;

    const service = new AdsService({
      connectionMode: "router",
      targetAmsNetId: "192.168.1.120.1.1",
      targetAdsPort: 851,
      readOnly: true,
      writeAllowlist: [],
      contextSnapshotSymbols: [],
      notificationCycleTimeMs: 250,
      maxNotifications: 128,
    });

    const results = await service.readMany(["MAIN.dynamic"]);

    expect(results).toHaveLength(1);
    expect(results[0]?.name).toBe("MAIN.dynamic");
    expect(results[0]?.value).toBe(99);
  });

  it("describes a symbol with its built data type", async () => {
    const { AdsService } = await import("../src/ads-service.js");

    mockState.symbols["MAIN.status"] = {
      name: "MAIN.status",
      type: "ST_Status",
      comment: "Status struct",
      size: 4,
      flags: 0,
      indexGroup: 5,
      indexOffset: 6,
      adsDataType: 65,
      adsDataTypeStr: "ADST_BIGTYPE",
      flagsStr: [],
      arrayDimension: 0,
      arrayInfo: [],
      typeGuid: "",
      attributes: [],
    };

    const service = new AdsService({
      connectionMode: "router",
      targetAmsNetId: "192.168.1.120.1.1",
      targetAdsPort: 851,
      readOnly: true,
      writeAllowlist: [],
      contextSnapshotSymbols: [],
      notificationCycleTimeMs: 250,
      maxNotifications: 128,
    });

    const description = await service.describeSymbol("MAIN.status");

    expect(description.name).toBe("MAIN.status");
    expect(description.dataType?.name).toBe("ST_Status");
    expect(description.dataType?.subItems?.[0]).toMatchObject({
      name: "ready",
      type: "BOOL",
    });
  });

  it("lists and reads configured PLC symbol groups", async () => {
    const { AdsService } = await import("../src/ads-service.js");

    const service = new AdsService({
      connectionMode: "router",
      targetAmsNetId: "192.168.1.120.1.1",
      targetAdsPort: 851,
      readOnly: true,
      writeAllowlist: [],
      contextSnapshotSymbols: [],
      notificationCycleTimeMs: 250,
      maxNotifications: 128,
      services: {
        plc: {
          targetAdsPort: 851,
          symbolGroups: {
            status: ["MAIN.value", "MAIN.watch"],
          },
        },
      },
    });

    expect(service.listGroups()).toEqual([
      {
        name: "status",
        symbols: ["MAIN.value", "MAIN.watch"],
        count: 2,
      },
    ]);

    const result = await service.readGroup("status");
    expect(result.count).toBe(2);
    expect(result.results.map((entry) => entry.name)).toEqual([
      "MAIN.value",
      "MAIN.watch",
    ]);
  });

  it("reads configured NC axes through the NC service", async () => {
    const { AdsService } = await import("../src/ads-service.js");

    const axisIndexGroup = 0x4100 + 1;
    mockState.rawValues.set(
      `500:${axisIndexGroup}:0`,
      createNcOnlineStateBuffer(),
    );
    mockState.rawValues.set(
      `500:${axisIndexGroup}:177`,
      Buffer.from([0, 0, 0, 0]),
    );
    for (const offset of [0x82, 0x83, 0x84, 0x8c, 0x8d, 0x8e, 0x8f, 0x90, 0x9a]) {
      const value = Buffer.alloc(2);
      value.writeUInt16LE(offset === 0x82 || offset === 0x83 ? 1 : 0, 0);
      mockState.rawValues.set(`500:${axisIndexGroup}:${offset}`, value);
    }

    const service = new AdsService({
      connectionMode: "router",
      targetAmsNetId: "192.168.1.120.1.1",
      targetAdsPort: 851,
      readOnly: true,
      writeAllowlist: [],
      contextSnapshotSymbols: [],
      notificationCycleTimeMs: 250,
      maxNotifications: 128,
      services: {
        nc: {
          targetAdsPort: 500,
          axes: [{ name: "X", id: 1 }],
        },
      },
    });

    expect(service.ncListAxes()).toEqual([{ name: "X", id: 1, targetAdsPort: 500 }]);

    const result = await service.ncReadAxis("X");
    expect(result.axis).toEqual({ name: "X", id: 1, targetAdsPort: 500 });
    expect(result.online.actualPosition).toBe(12.5);
    expect(result.online.actualVelocity).toBe(2.5);
    expect(result.status.ready).toBe(true);
    expect(result.status.referenced).toBe(true);
    expect(result.errorCode).toBe(0);
    expect(result.warnings).toEqual([]);

    const position = await service.ncReadAxisPosition("X");
    expect(position.online.actualPosition).toBe(12.5);

    const status = await service.ncReadAxisStatus("X");
    expect(status.status.ready).toBe(true);
    expect(status.status.referenced).toBe(true);
    expect(status.warnings).toEqual([]);
    expect(mockState.rawReadCalls).toContainEqual({
      port: 500,
      indexGroup: axisIndexGroup,
      indexOffset: 0,
      size: 256,
    });
  });

  it("falls back to the legacy NC online state size", async () => {
    const { AdsService } = await import("../src/ads-service.js");

    const axisIndexGroup = 0x4100 + 1;
    mockState.failRawReads.add(`500:${axisIndexGroup}:0:256`);
    mockState.rawValues.set(
      `500:${axisIndexGroup}:0`,
      createNcOnlineStateBuffer(112),
    );
    mockState.rawValues.set(
      `500:${axisIndexGroup}:177`,
      Buffer.from([0, 0, 0, 0]),
    );
    for (const offset of [0x82, 0x83, 0x84, 0x8c, 0x8d, 0x8e, 0x8f, 0x90, 0x9a]) {
      const value = Buffer.alloc(2);
      value.writeUInt16LE(0, 0);
      mockState.rawValues.set(`500:${axisIndexGroup}:${offset}`, value);
    }

    const service = new AdsService({
      connectionMode: "router",
      targetAmsNetId: "192.168.1.120.1.1",
      targetAdsPort: 851,
      readOnly: true,
      writeAllowlist: [],
      contextSnapshotSymbols: [],
      notificationCycleTimeMs: 250,
      maxNotifications: 128,
      services: {
        nc: {
          targetAdsPort: 500,
          axes: [{ name: "X", id: 1 }],
        },
      },
    });

    const result = await service.ncReadAxis(1);

    expect(result.online.actualPosition).toBe(12.5);
    expect(mockState.rawReadCalls.filter((call) => call.indexOffset === 0)).toEqual([
      {
        port: 500,
        indexGroup: axisIndexGroup,
        indexOffset: 0,
        size: 256,
      },
      {
        port: 500,
        indexGroup: axisIndexGroup,
        indexOffset: 0,
        size: 112,
      },
    ]);
  });

  it("keeps NC axis reads available when the separate error-code offset is unavailable", async () => {
    const { AdsService } = await import("../src/ads-service.js");

    const axisIndexGroup = 0x4100 + 1;
    const onlineState = createNcOnlineStateBuffer();
    onlineState.writeUInt32LE(1234, 0);
    mockState.rawValues.set(`500:${axisIndexGroup}:0`, onlineState);
    mockState.failRawReads.add(`500:${axisIndexGroup}:177:4`);
    for (const offset of [0x82, 0x83, 0x84, 0x8c, 0x8d, 0x8e, 0x8f, 0x90, 0x9a]) {
      const value = Buffer.alloc(2);
      value.writeUInt16LE(0, 0);
      mockState.rawValues.set(`500:${axisIndexGroup}:${offset}`, value);
    }

    const service = new AdsService({
      connectionMode: "router",
      targetAmsNetId: "192.168.1.120.1.1",
      targetAdsPort: 851,
      readOnly: true,
      writeAllowlist: [],
      contextSnapshotSymbols: [],
      notificationCycleTimeMs: 250,
      maxNotifications: 128,
      services: {
        nc: {
          targetAdsPort: 500,
          axes: [{ name: "X", id: 1 }],
        },
      },
    });

    const axisResult = await service.ncReadAxis("X");
    expect(axisResult.online.actualPosition).toBe(12.5);
    expect(axisResult.errorCode).toBe(1234);
    expect(axisResult.warnings).toEqual([
      {
        section: "error",
        message:
          "NC axis error-code offset 177 could not be read; using online error state as fallback.",
      },
    ]);

    const errorResult = await service.ncReadError("X");
    expect(errorResult.errorCode).toBe(1234);
    expect(errorResult.hasError).toBe(true);
    expect(errorResult.warnings).toEqual([
      {
        section: "error",
        message:
          "NC axis error-code offset 177 could not be read; using online error state as fallback.",
      },
    ]);
    expect(mockState.rawReadCalls).toContainEqual({
      port: 500,
      indexGroup: axisIndexGroup,
      indexOffset: 177,
      size: 4,
    });
  });

  it("keeps NC axis positions available when status flag reads are unavailable", async () => {
    const { AdsService } = await import("../src/ads-service.js");

    const axisIndexGroup = 0x4100 + 1;
    mockState.rawValues.set(
      `500:${axisIndexGroup}:0`,
      createNcOnlineStateBuffer(),
    );
    mockState.rawValues.set(
      `500:${axisIndexGroup}:177`,
      Buffer.from([0, 0, 0, 0]),
    );
    for (const offset of [0x82, 0x83, 0x84, 0x8c, 0x8d, 0x8e, 0x8f, 0x90, 0x9a]) {
      const value = Buffer.alloc(2);
      value.writeUInt16LE(0, 0);
      mockState.rawValues.set(`500:${axisIndexGroup}:${offset}`, value);
    }
    mockState.failRawReads.add(`500:${axisIndexGroup}:130:2`);

    const service = new AdsService({
      connectionMode: "router",
      targetAmsNetId: "192.168.1.120.1.1",
      targetAdsPort: 851,
      readOnly: true,
      writeAllowlist: [],
      contextSnapshotSymbols: [],
      notificationCycleTimeMs: 250,
      maxNotifications: 128,
      services: {
        nc: {
          targetAdsPort: 500,
          axes: [{ name: "X", id: 1 }],
        },
      },
    });

    const result = await service.ncReadAxis("X");

    expect(result.online.actualPosition).toBe(12.5);
    expect(result.status.ready).toBe(false);
    expect(result.warnings).toContainEqual({
      section: "status",
      message: "NC axis status flag ready at offset 130 could not be read.",
    });

    const status = await service.ncReadAxisStatus("X");
    expect(status.status.ready).toBe(false);
    expect(status.warnings).toContainEqual({
      section: "status",
      message: "NC axis status flag ready at offset 130 could not be read.",
    });
  });

  it("reads configured IO data points and groups through raw ADS reads", async () => {
    const { AdsService } = await import("../src/ads-service.js");

    mockState.rawValues.set("300:61472:128000", Buffer.from([1]));
    const outputValue = Buffer.alloc(2);
    outputValue.writeUInt16LE(123, 0);
    mockState.rawValues.set("300:61488:256000", outputValue);

    const service = new AdsService({
      connectionMode: "router",
      targetAmsNetId: "192.168.1.120.1.1",
      targetAdsPort: 851,
      readOnly: true,
      writeAllowlist: [],
      contextSnapshotSymbols: [],
      notificationCycleTimeMs: 250,
      maxNotifications: 128,
      services: {
        io: {
          targetAdsPort: 300,
          dataPoints: [
            {
              name: "Input1",
              indexGroup: 0xf020,
              indexOffset: 0x1f400,
              type: "BOOL",
            },
            {
              name: "OutputWord",
              indexGroup: 0xf030,
              indexOffset: 0x3e800,
              type: "UINT",
            },
          ],
          groups: {
            mixed: ["Input1", "OutputWord"],
          },
        },
      },
    });

    const single = await service.ioRead("Input1");
    expect(single.value).toBe(true);
    expect(single.dataPoint.size).toBe(1);

    const group = await service.ioReadGroup("mixed");
    expect(group.count).toBe(2);
    expect(group.results.map((entry) => entry.value)).toEqual([true, 123]);
  });

  it("marks diagnose runtime IO unavailable when the IO ADS port cannot connect", async () => {
    const { AdsService } = await import("../src/ads-service.js");

    mockState.failConnectPorts.add(300);

    const service = new AdsService({
      connectionMode: "router",
      targetAmsNetId: "192.168.1.120.1.1",
      targetAdsPort: 851,
      readOnly: true,
      writeAllowlist: [],
      contextSnapshotSymbols: [],
      notificationCycleTimeMs: 250,
      maxNotifications: 128,
      services: {
        io: {
          targetAdsPort: 300,
          dataPoints: [
            {
              name: "Input1",
              indexGroup: 0xf020,
              indexOffset: 0x1f400,
              type: "BOOL",
            },
          ],
          groups: {
            inputs: ["Input1"],
          },
        },
      },
      diagnostics: {
        eventSources: [],
        logSources: [],
      },
    });

    const result = await service.tcDiagnoseRuntime();

    expect(result.summary.ioAvailable).toBe(false);
    expect(result.summary.configuredIoDataPoints).toBe(1);
    expect(result.summary.configuredIoGroups).toBe(1);
    expect(result.io.error).toContain("Port 300 unavailable");
  });

  it("waits until a PLC condition is fulfilled by notification", async () => {
    const { AdsService } = await import("../src/ads-service.js");

    mockState.values["MAIN.watch"] = false;

    const service = new AdsService({
      connectionMode: "router",
      targetAmsNetId: "192.168.1.120.1.1",
      targetAdsPort: 851,
      readOnly: true,
      writeAllowlist: [],
      contextSnapshotSymbols: [],
      notificationCycleTimeMs: 10,
      maxNotifications: 128,
    });

    const waitPromise = service.waitUntil({
      condition: {
        name: "MAIN.watch",
        operator: "equals",
        value: true,
      },
      timeoutMs: 1_000,
    });

    const client = getMockClientByPort(851);
    await vi.waitFor(() => {
      expect(
        client!.activeSubscriptions["192.168.1.120.1.1:851"],
      ).toBeDefined();
    });
    const subscription = Object.values(
      client!.activeSubscriptions["192.168.1.120.1.1:851"]!,
    )[0];

    subscription.settings.callback(
      {
        timestamp: new Date("2026-01-03T00:00:00.000Z"),
        value: true,
      },
      subscription,
    );

    const result = await waitPromise;
    expect(result.status).toBe("fulfilled");
    expect(result.conditionMatched).toBe(true);
    expect(result.values).toMatchObject([
      {
        name: "MAIN.watch",
        value: true,
        timestamp: "2026-01-03T00:00:00.000Z",
      },
    ]);
  });

  it("stops creating wait subscriptions after an early anyOf latestData match", async () => {
    const { AdsService } = await import("../src/ads-service.js");

    mockState.values["MAIN.value"] = 42;
    mockState.values["MAIN.watch"] = false;

    const service = new AdsService({
      connectionMode: "router",
      targetAmsNetId: "192.168.1.120.1.1",
      targetAdsPort: 851,
      readOnly: true,
      writeAllowlist: [],
      contextSnapshotSymbols: [],
      notificationCycleTimeMs: 10,
      maxNotifications: 128,
    });

    const result = await service.waitUntil({
      condition: {
        anyOf: [
          {
            name: "MAIN.value",
            operator: "equals",
            value: 42,
          },
          {
            name: "MAIN.watch",
            operator: "equals",
            value: true,
          },
        ],
      },
      timeoutMs: 1_000,
    });

    const client = getMockClientByPort(851);
    expect(result.status).toBe("fulfilled");
    expect(mockState.subscribeCalls).toBe(1);
    expect(mockState.unsubscribeCalls).toBe(1);
    expect(
      Object.keys(client!.activeSubscriptions["192.168.1.120.1.1:851"] ?? {}),
    ).toHaveLength(0);
  });

  it("returns timeout when a PLC wait condition is not fulfilled", async () => {
    const { AdsService } = await import("../src/ads-service.js");

    mockState.values["MAIN.watch"] = false;

    const service = new AdsService({
      connectionMode: "router",
      targetAmsNetId: "192.168.1.120.1.1",
      targetAdsPort: 851,
      readOnly: true,
      writeAllowlist: [],
      contextSnapshotSymbols: [],
      notificationCycleTimeMs: 10,
      maxNotifications: 128,
    });

    const result = await service.waitUntil({
      condition: {
        name: "MAIN.watch",
        operator: "equals",
        value: true,
      },
      timeoutMs: 10,
    });

    expect(result.status).toBe("timeout");
    expect(result.conditionMatched).toBe(false);
    expect(mockState.unsubscribeCalls).toBe(1);
    await service.disconnect();
  });

  it("times out when a structured PLC value cannot be converted for numeric comparison", async () => {
    const { AdsService } = await import("../src/ads-service.js");
    const structuredValue = { valueOf: 1, toString: 2 };
    mockState.values["MAIN.value"] = structuredValue;
    const service = new AdsService({
      connectionMode: "router", targetAmsNetId: "192.168.1.120.1.1", targetAdsPort: 851, readOnly: true,
      writeAllowlist: [], contextSnapshotSymbols: [], notificationCycleTimeMs: 50, maxNotifications: 8,
    });

    expect(await service.waitUntil({
      condition: { name: "MAIN.value", operator: "greaterThan", value: 0 },
      timeoutMs: 10,
    })).toMatchObject({ status: "timeout", conditionMatched: false, values: [{ value: structuredValue }] });
    expect(mockState.unsubscribeCalls).toBe(1);
    await service.disconnect();
  });

  it("waits for an in-flight subscription and its unsubscribe before returning an abort", async () => {
    const { AdsService } = await import("../src/ads-service.js");
    const service = new AdsService({
      connectionMode: "router", targetAmsNetId: "192.168.1.120.1.1", targetAdsPort: 851, readOnly: true,
      writeAllowlist: [], contextSnapshotSymbols: [], notificationCycleTimeMs: 50, maxNotifications: 8,
    }, { autoReconnect: false });
    const client = getMockClientByPort(851)!;
    expect(client.settings.autoReconnect).toBe(false);
    const controller = new AbortController();
    let releaseSubscribe!: () => void;
    let releaseUnsubscribe!: () => void;
    const subscribing = new Promise<void>(resolve => { releaseSubscribe = resolve; });
    const unsubscribing = new Promise<void>(resolve => { releaseUnsubscribe = resolve; });
    const subscribe = client.subscribeValue.bind(client);
    const unsubscribe = client.unsubscribe.bind(client);
    const subscribeSpy = vi.spyOn(client, "subscribeValue").mockImplementation(async (...args) => {
      await subscribing;
      return subscribe(...args);
    });
    const unsubscribeSpy = vi.spyOn(client, "unsubscribe").mockImplementation(async subscription => {
      await unsubscribing;
      expect(client.connection.connected).toBe(true);
      await unsubscribe(subscription);
    });
    let completed = false;
    const pending = service.waitUntil({
      condition: { name: "MAIN.watch", operator: "equals", value: true },
      timeoutMs: 1_000, signal: controller.signal,
    }).then(async result => {
      completed = true;
      await service.disconnect();
      return result;
    });
    try {
      await vi.waitFor(() => expect(subscribeSpy).toHaveBeenCalledOnce());
      controller.abort();
      releaseSubscribe();
      await vi.waitFor(() => expect(unsubscribeSpy).toHaveBeenCalledOnce());
      expect(completed).toBe(false);
      releaseUnsubscribe();
      expect(await pending).toMatchObject({ status: "cancelled", conditionMatched: false, values: [] });
      expect(client.connection.connected).toBe(false);
      expect(Object.values(client.activeSubscriptions["192.168.1.120.1.1:851"] ?? {})).toHaveLength(0);
    } finally {
      releaseSubscribe();
      releaseUnsubscribe();
      await pending;
    }
  });

  it.each(["subscription", "initial read", "unsubscribe"] as const)(
    "returns a timeout within the cleanup budget when a wait %s hangs",
    async blocked => {
      vi.useFakeTimers();
      try {
        const { AdsService } = await import("../src/ads-service.js");
        mockState.values["MAIN.watch"] = false;
        const service = new AdsService({
          connectionMode: "router", targetAmsNetId: "192.168.1.120.1.1", targetAdsPort: 851, readOnly: true,
          writeAllowlist: [], contextSnapshotSymbols: [], notificationCycleTimeMs: 50, maxNotifications: 8,
        }, { waitCleanupTimeoutMs: 25 });
        const client = getMockClientByPort(851)!;
        const never = new Promise<never>(() => {});
        const subscribe = client.subscribeValue.bind(client);
        const subscription = vi.spyOn(client, "subscribeValue");
        const unsubscribe = vi.spyOn(client, "unsubscribe");
        if (blocked === "subscription") subscription.mockReturnValue(never);
        if (blocked === "initial read") {
          subscription.mockImplementation(async (...args) => ({ ...await subscribe(...args), latestData: undefined }));
          vi.spyOn(service, "readMany").mockReturnValue(never);
        }
        if (blocked === "unsubscribe") unsubscribe.mockReturnValue(never);

        let completed = false;
        const wait = service.waitUntil({
          condition: { name: "MAIN.watch", operator: "equals", value: true },
          timeoutMs: 100,
        }).then(result => { completed = true; return result; });
        await vi.advanceTimersByTimeAsync(124);
        expect(subscription).toHaveBeenCalledOnce();
        expect(unsubscribe).toHaveBeenCalledTimes(blocked === "subscription" ? 0 : 1);
        if (blocked === "initial read") expect(service.readMany).toHaveBeenCalledOnce();
        expect(completed).toBe(false);

        await vi.advanceTimersByTimeAsync(1);
        expect(completed).toBe(true);
        await expect(wait).resolves.toMatchObject({ status: "timeout", durationMs: 100 });
        expect(vi.getTimerCount()).toBe(0);
        await service.disconnect();
      } finally {
        vi.useRealTimers();
      }
    },
  );

  it.each([
    { blocked: "connect", status: "timeout" },
    { blocked: "connect", status: "cancelled" },
    { blocked: "cacheSymbols", status: "timeout" },
    { blocked: "cacheSymbols", status: "cancelled" },
  ] as const)("returns $status when ADS $blocked stalls and drains a late connection", async ({ blocked, status }) => {
    vi.useFakeTimers();
    try {
      const { AdsService } = await import("../src/ads-service.js");
      const service = new AdsService({
        connectionMode: "router", targetAmsNetId: "192.168.1.120.1.1", targetAdsPort: 851, readOnly: true,
        writeAllowlist: [], contextSnapshotSymbols: [], notificationCycleTimeMs: 50, maxNotifications: 8,
      }, { waitCleanupTimeoutMs: 25 });
      const client = getMockClientByPort(851)!;
      let resume!: () => void;
      const gate = new Promise<void>(resolve => { resume = resolve; });
      const operation = client[blocked].bind(client);
      const stall = vi.spyOn(client, blocked).mockImplementationOnce(async () => {
        await gate;
        return operation();
      });
      const subscribe = vi.spyOn(client, "subscribeValue");
      const disconnect = vi.spyOn(client, "disconnect");
      const controller = new AbortController();
      let completed = false;
      const wait = service.waitUntil({
        condition: { name: "MAIN.watch", operator: "equals", value: true },
        timeoutMs: 100, signal: controller.signal,
      }).then(result => { completed = true; return result; });
      await vi.advanceTimersByTimeAsync(0);
      expect(stall).toHaveBeenCalledOnce();

      if (status === "cancelled") controller.abort();
      await vi.advanceTimersByTimeAsync(status === "cancelled" ? 25 : 125);
      expect(completed).toBe(true);
      await expect(wait).resolves.toMatchObject({ status, values: [] });
      await service.disconnect();
      expect(disconnect).toHaveBeenCalledTimes(blocked === "cacheSymbols" ? 1 : 0);

      resume();
      await vi.advanceTimersByTimeAsync(0);
      expect(disconnect).toHaveBeenCalledOnce();
      expect(subscribe).not.toHaveBeenCalled();
      expect(service.hasActiveConnection).toBe(false);
      expect(service.state).toBe("disconnected");
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("attempts to unsubscribe a late wait registration even if that cleanup rejects", async () => {
    vi.useFakeTimers();
    try {
      const { AdsService } = await import("../src/ads-service.js");
      const service = new AdsService({
        connectionMode: "router", targetAmsNetId: "192.168.1.120.1.1", targetAdsPort: 851, readOnly: true,
        writeAllowlist: [], contextSnapshotSymbols: [], notificationCycleTimeMs: 50, maxNotifications: 8,
      }, { waitCleanupTimeoutMs: 25 });
      const client = getMockClientByPort(851)!;
      let resume!: () => void;
      const gate = new Promise<void>(resolve => { resume = resolve; });
      const subscribe = client.subscribeValue.bind(client);
      const subscription = vi.spyOn(client, "subscribeValue").mockImplementation(async (...args) => {
        await gate;
        return subscribe(...args);
      });
      const unsubscribe = vi.spyOn(client, "unsubscribe").mockRejectedValue(new Error("Late ADS cleanup failed"));
      const controller = new AbortController();
      const wait = service.waitUntil({
        condition: { name: "MAIN.watch", operator: "equals", value: true },
        timeoutMs: 1_000, signal: controller.signal,
      });
      await vi.advanceTimersByTimeAsync(0);
      expect(subscription).toHaveBeenCalledOnce();
      controller.abort();
      await vi.advanceTimersByTimeAsync(25);
      await expect(wait).resolves.toMatchObject({ status: "cancelled", values: [] });
      await service.disconnect();
      expect(unsubscribe).not.toHaveBeenCalled();

      resume();
      await vi.advanceTimersByTimeAsync(0);
      expect(unsubscribe).toHaveBeenCalledExactlyOnceWith(await subscription.mock.results[0]!.value);
      expect(service.lastError).toMatchObject({ message: "PLC wait subscription cleanup failed." });
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("requires a continuous stable match across nested wait conditions", async () => {
    const { AdsService } = await import("../src/ads-service.js");
    vi.useFakeTimers();
    try {
      const service = new AdsService({
        connectionMode: "router", targetAmsNetId: "192.168.1.120.1.1", targetAdsPort: 851, readOnly: true,
        writeAllowlist: [], contextSnapshotSymbols: [], notificationCycleTimeMs: 50, maxNotifications: 8,
      });
      let completed = false;
      const wait = service.waitUntil({
        condition: { allOf: [
          { name: "MAIN.value", operator: "greaterThan", value: 30 },
          { anyOf: [{ name: "MAIN.watch", operator: "equals", value: true }] },
        ] },
        timeoutMs: 500, stableForMs: 100,
      }).then(result => { completed = true; return result; });
      await vi.advanceTimersByTimeAsync(60);
      const client = getMockClientByPort(851)!;
      const subscription = Object.values(client.activeSubscriptions["192.168.1.120.1.1:851"]!)
        .find(entry => entry.settings.target === "MAIN.watch");
      subscription.settings.callback({ timestamp: new Date(), value: false }, subscription);
      await vi.advanceTimersByTimeAsync(30);
      subscription.settings.callback({ timestamp: new Date(), value: true }, subscription);
      await vi.advanceTimersByTimeAsync(99);
      expect(completed).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      expect(await wait).toMatchObject({ status: "fulfilled", conditionMatched: true, stableForMs: 100, durationMs: 190 });
      expect(mockState.unsubscribeCalls).toBe(2);
      await service.disconnect();
    } finally {
      vi.useRealTimers();
    }
  });
});
