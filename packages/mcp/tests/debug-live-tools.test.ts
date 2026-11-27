import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AdsService, normalizeTwinCatAdsConfig,
  type PlcWaitUntilInput, type PlcWaitUntilResult, type PlcWatchSnapshot, type WatchSymbolOptions,
} from "twincat-mcp-core";
import { createDebugLiveTools } from "../src/debug-live-tools.js";

const grant = { loggedIn: true, grantId: randomUUID(), amsNetId: "1.2.3.4.5.6", adsPort: 856, symbols: ["MAIN.ready", "MAIN.cycle"] };
const { symbols: _symbols, ...targetFields } = grant;
const allGrant = { ...targetFields, symbolScope: "all" };
const response = (target: unknown = grant) => ({ status: "succeeded", result: target });
const observation = { name: "MAIN.ready", type: "BOOL", timestamp: "2026-01-01T00:00:00.000Z", value: true, symbol: {} };

const condition = { name: "MAIN.ready", operator: "equals", value: true };
const waitArgs = { condition, timeoutMs: 120_000 };
const waitResult: PlcWaitUntilResult = {
  status: "fulfilled", conditionMatched: true, startedAt: observation.timestamp,
  completedAt: "2026-01-01T00:00:01.000Z", durationMs: 1000, timeoutMs: 120_000, stableForMs: 0,
  values: [{ name: condition.name, value: true, timestamp: observation.timestamp }],
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

const sessions = new Set<AbortController>();
afterEach(() => {
  for (const session of sessions) session.abort();
  sessions.clear();
  vi.useRealTimers();
});

function setup(invoke = vi.fn().mockResolvedValue(response()), cleanupTimeoutMs?: number) {
  const shutdown = new AbortController();
  sessions.add(shutdown);
  const activeWatches = new Map<string, PlcWatchSnapshot>();
  const disconnect = vi.fn(async () => { activeWatches.clear(); });
  const readSymbol = vi.fn().mockResolvedValue(observation);
  const waitUntil = vi.fn<(input: PlcWaitUntilInput) => Promise<PlcWaitUntilResult>>().mockResolvedValue(waitResult);
  const watchSymbol = vi.fn(async (name: string, options?: WatchSymbolOptions) => {
    const watch = activeWatches.get(name) ?? {
      name, notificationHandle: 123, mode: options?.mode ?? "on-change", cycleTimeMs: options?.cycleTimeMs ?? 250,
      active: true, lastValue: 123n, lastTimestamp: observation.timestamp,
    };
    activeWatches.set(name, watch);
    return { ...watch, unsubscribe: async () => {} };
  });
  const unwatchSymbol = vi.fn(async (name: string) => {
    const watch = activeWatches.get(name) ?? { name, notificationHandle: 0, mode: "on-change" as const, cycleTimeMs: 250 };
    activeWatches.delete(name);
    return { ...watch, active: false };
  });
  const listWatches = vi.fn(() => [...activeWatches.values()]);
  const open = vi.fn(() => ({ hasActiveConnection: true, readSymbol, waitUntil, watchSymbol, unwatchSymbol, listWatches, disconnect }));
  const tools = createDebugLiveTools(invoke, open, shutdown.signal, cleanupTimeoutMs);
  const tool = (name: string) => tools.find(tool => tool.name === "plc_debug_" + name)!;
  return {
    read: tool("read"), state: tool("state"), wait: tool("wait_until"), watch: tool("watch"),
    unwatch: tool("unwatch"), list: tool("list_watches"),
    invoke, open, readSymbol, waitUntil, watchSymbol, unwatchSymbol, disconnect, activeWatches, shutdown,
  };
}

describe("bound Debug ADS reads", () => {
  it("reports legacy and explicit allowlists and the trusted all-symbol scope", async () => {
    for (const target of [grant, { ...grant, symbolScope: "allowlist" }]) {
      const { state } = setup(vi.fn().mockResolvedValue(response(target)));
      expect(await state.execute({})).toEqual({ status: "online", symbols: grant.symbols });
    }
    const { state } = setup(vi.fn().mockResolvedValue(response(allGrant)));
    expect(await state.execute({})).toEqual({ status: "online", symbolScope: "all" });
  });

  it("reads a valid symbol outside the former allowlist under an all-symbol grant", async () => {
    const { read, readSymbol, open, disconnect } = setup(vi.fn().mockResolvedValue(response(allGrant)));
    readSymbol.mockResolvedValue({ ...observation, name: "OTHER.value" });
    expect(await read.execute({ symbols: ["OTHER.value"] })).toMatchObject({ status: "succeeded", values: [{ symbol: "OTHER.value", value: true }] });
    expect(open).toHaveBeenCalledWith(allGrant);
    expect(disconnect).toHaveBeenCalledOnce();
  });

  it("reads up to eight symbols with a context recheck before each sample", async () => {
    const { read, invoke, readSymbol, disconnect } = setup(vi.fn().mockResolvedValue(response(allGrant)));
    const symbols = Array.from({ length: 8 }, (_, index) => `MAIN.a${index}`);
    readSymbol.mockImplementation(async name => ({ ...observation, name }));
    expect(await read.execute({ symbols })).toMatchObject({ status: "succeeded", values: symbols.map(symbol => ({ symbol })) });
    expect(readSymbol).toHaveBeenCalledTimes(8);
    expect(invoke).toHaveBeenCalledTimes(10);
    expect(disconnect).toHaveBeenCalledOnce();
  });

  it("stops and discards earlier samples when scope changes between reads", async () => {
    const invoke = vi.fn().mockResolvedValueOnce(response(allGrant)).mockResolvedValueOnce(response(allGrant))
      .mockResolvedValueOnce(response(grant));
    const { read, readSymbol, disconnect } = setup(invoke);
    expect(await read.execute({ symbols: ["MAIN.ready", "MAIN.cycle"] })).toEqual({ status: "online_context_changed" });
    expect(readSymbol).toHaveBeenCalledExactlyOnceWith("MAIN.ready");
    expect(disconnect).toHaveBeenCalledOnce();
  });

  it.each([
    { ...allGrant, symbols: [] },
    { ...allGrant, symbols: ["MAIN.ready"] },
    { ...targetFields, symbolScope: "allowlist" },
    { ...grant, symbolScope: "other" },
    { ...allGrant, symbolScope: null },
  ])("rejects malformed or mixed scope claims: %j", async target => {
    const { read, state, open } = setup(vi.fn().mockResolvedValue(response(target)));
    expect(await state.execute({})).toEqual({ status: "online_session_not_verified" });
    expect(await read.execute({ symbols: ["MAIN.ready"] })).toEqual({ status: "online_session_not_verified" });
    expect(open).not.toHaveBeenCalled();
  });
  it("opens only the exact approved target, returns bounded samples and disconnects", async () => {
    const { read, invoke, open, readSymbol, disconnect } = setup();
    expect(await read.execute({ symbols: ["MAIN.ready"] })).toEqual({
      status: "succeeded",
      source: "ads_live",
      values: [{ symbol: "MAIN.ready", type: "BOOL", observedAtUtc: observation.timestamp, value: true }],
    });
    expect(open).toHaveBeenCalledWith(grant);
    expect(readSymbol).toHaveBeenCalledExactlyOnceWith("MAIN.ready");
    expect(disconnect).toHaveBeenCalledOnce();
    expect(invoke.mock.calls).toEqual([["debug.context", {}], ["debug.context", {}], ["debug.context", {}]]);
  });

  it("never opens ADS when the login, address or requested symbol is unverified", async () => {
    const invoke = vi.fn()
      .mockResolvedValueOnce(response({ ...grant, loggedIn: false }))
      .mockResolvedValueOnce(response({ ...grant, amsNetId: "0.0.0.0.0.0" }))
      .mockResolvedValueOnce(response());
    const { read, open } = setup(invoke);
    expect(await read.execute({ symbols: ["MAIN.ready"] })).toEqual({ status: "online_session_not_verified" });
    expect(await read.execute({ symbols: ["MAIN.ready"] })).toEqual({ status: "online_session_not_verified" });
    expect(await read.execute({ symbols: ["MAIN.other"] })).toEqual({ status: "symbol_not_approved" });
    expect(open).not.toHaveBeenCalled();
  });

  it.each([
    { adsPort: 850 },
    { adsPort: 900 },
    { adsPort: 856.5 },
    { adsPort: "856" },
    { grantId: "00000000-0000-0000-0000-000000000000" },
    { amsNetId: "1.2.3.4.5.6\n" },
    { symbols: ["MAIN.ready", "MAIN.ready"] },
    { symbols: ["MAIN.ready\n"] },
    { symbols: Array.from({ length: 33 }, (_, index) => "MAIN.a" + index) },
  ])("rejects invalid trusted grant data before constructing a reader: %j", async (invalid) => {
    const { read, open } = setup(vi.fn().mockResolvedValue(response({ ...grant, ...invalid })));
    expect(await read.execute({ symbols: ["MAIN.ready"] })).toEqual({ status: "online_session_not_verified" });
    expect(open).not.toHaveBeenCalled();
  });

  it("refuses extra client fields and invalid, duplicate or excessive requested symbols", async () => {
    const { read, invoke, open } = setup();
    for (const request of [
      { symbols: ["MAIN.ready"], adsPort: 856 },
      { symbols: ["MAIN.ready", "MAIN.ready"] },
      { symbols: ["MAIN.ready\n"] },
      { symbols: ["MAIN.*"] },
      { symbols: Array.from({ length: 9 }, (_, index) => "MAIN.a" + index) },
    ]) {
      await expect(read.execute(request)).rejects.toThrow();
    }
    expect(invoke).not.toHaveBeenCalled();
    expect(open).not.toHaveBeenCalled();
  });

  it("does not read a symbol after the native target changes", async () => {
    const invoke = vi.fn().mockResolvedValueOnce(response())
      .mockResolvedValueOnce(response({ ...grant, adsPort: 857 }));
    const { read, readSymbol, disconnect } = setup(invoke);
    expect(await read.execute({ symbols: ["MAIN.ready"] })).toEqual({ status: "online_context_changed" });
    expect(readSymbol).not.toHaveBeenCalled();
    expect(disconnect).toHaveBeenCalledOnce();
  });

  it("discards the sample and ends the connection when the grant changes", async () => {
    const invoke = vi.fn().mockResolvedValueOnce(response()).mockResolvedValueOnce(response())
      .mockResolvedValueOnce(response({ ...grant, grantId: randomUUID() }));
    const { read, disconnect } = setup(invoke);
    expect(await read.execute({ symbols: ["MAIN.ready"] })).toEqual({ status: "online_context_changed" });
    expect(disconnect).toHaveBeenCalledOnce();
  });

  it.each([
    { ...grant, symbolScope: "allowlist" },
    { ...allGrant, grantId: randomUUID() },
    grant,
  ])("discards samples when the trusted scope or grant changes during the read: %j", async changed => {
    const invoke = vi.fn().mockResolvedValueOnce(response(allGrant)).mockResolvedValueOnce(response(allGrant))
      .mockResolvedValueOnce(response(changed));
    const { read, readSymbol, disconnect } = setup(invoke);
    expect(await read.execute({ symbols: ["MAIN.ready"] })).toEqual({ status: "online_context_changed" });
    expect(readSymbol).toHaveBeenCalledOnce();
    expect(disconnect).toHaveBeenCalledOnce();
  });

  it("preserves scalar bounds under an all-symbol grant", async () => {
    const { read, readSymbol } = setup(vi.fn().mockResolvedValue(response(allGrant)));
    for (const [value, expected] of [
      [123n, { value: "123", encoding: "decimalInteger" }],
      ["x".repeat(1024), { value: "x".repeat(1024) }],
      ["x".repeat(1025), { status: "unsupported_value_type" }],
      [Infinity, { status: "unsupported_value_type" }],
      [{ nested: true }, { status: "unsupported_value_type" }],
    ] as const) {
      readSymbol.mockResolvedValueOnce({ ...observation, value });
      expect(await read.execute({ symbols: ["MAIN.ready"] })).toMatchObject({ status: "succeeded", values: [expected] });
    }
  });
});

describe("bound Debug ADS waits", () => {
  it("forwards an allOf/anyOf condition, stability and notification timing to the approved reader", async () => {
    const { wait, waitUntil, open, disconnect, invoke } = setup();
    const args = {
      condition: { allOf: [condition, { anyOf: [{ name: "MAIN.cycle", operator: "greaterThan", value: 4 }, condition] }] },
      timeoutMs: 120_000, stableForMs: 150, cycleTimeMs: 50, maxDelayMs: 0,
    };
    waitUntil.mockResolvedValue({ ...waitResult, stableForMs: 150 });
    expect(await wait.execute(args)).toEqual({
      status: "succeeded", source: "ads_live", waitStatus: "fulfilled", conditionMatched: true,
      startedAt: waitResult.startedAt, completedAt: waitResult.completedAt, durationMs: 1000,
      timeoutMs: 120_000, stableForMs: 150,
      values: [{ symbol: condition.name, observedAtUtc: observation.timestamp, value: true }],
    });
    expect(waitUntil).toHaveBeenCalledExactlyOnceWith({ ...args, signal: expect.any(AbortSignal) });
    expect(open).toHaveBeenCalledExactlyOnceWith(grant);
    expect(invoke).toHaveBeenCalledTimes(2);
    expect(disconnect).toHaveBeenCalledOnce();
  });

  it.each([
    [123n, { value: "123", encoding: "decimalInteger" }],
    [12.5, { value: 12.5 }],
    ["x".repeat(1024), { value: "x".repeat(1024) }],
    ["x".repeat(1025), { status: "unsupported_value_type" }],
    [NaN, { status: "unsupported_value_type" }],
    [[1], { status: "unsupported_value_type" }],
    [{ secret: true }, { status: "unsupported_value_type" }],
  ])("returns timeout with only sanitized observations (%#)", async (value, expected) => {
    const { wait, waitUntil, disconnect } = setup();
    waitUntil.mockResolvedValue({
      ...waitResult, status: "timeout", conditionMatched: false,
      values: [{ name: condition.name, timestamp: observation.timestamp, value }],
    });
    expect(await wait.execute(waitArgs)).toMatchObject({
      status: "succeeded", waitStatus: "timeout", conditionMatched: false,
      values: [{ symbol: condition.name, observedAtUtc: observation.timestamp, ...expected }],
    });
    expect(disconnect).toHaveBeenCalledOnce();
  });

  it("denies an unapproved symbol anywhere in the tree before opening ADS", async () => {
    const { wait, open } = setup();
    expect(await wait.execute({ ...waitArgs, condition: { anyOf: [condition, { ...condition, name: "MAIN.denied" }] } }))
      .toEqual({ status: "symbol_not_approved" });
    expect(open).not.toHaveBeenCalled();
  });

  it("rejects invalid, excessive and unbounded waits before requesting context", async () => {
    const { wait, invoke, open } = setup();
    for (const invalid of [
      { timeoutMs: 120_001 }, { timeoutMs: 0 }, { timeoutMs: 1.1 }, { stableForMs: 5, timeoutMs: 4 },
      { cycleTimeMs: 49 }, { cycleTimeMs: 60_001 }, { maxDelayMs: -1 }, { maxDelayMs: 60_001 },
      { signal: {} }, { condition: { ...condition, name: "MAIN.*" } },
      { condition: { ...condition, operator: "contains" } },
      { condition: { name: condition.name, operator: condition.operator } },
      ...[null, {}, [], NaN, Infinity, "x".repeat(1025)].map(value => ({ condition: { ...condition, value } })),
      { condition: { ...condition, allOf: [condition] } },
      { condition: { allOf: [] } },
      { condition: { allOf: [{ anyOf: [{ allOf: [{ anyOf: [condition] }] }] }] } },
      { condition: { allOf: [{ anyOf: Array(8).fill(condition) }, { allOf: Array(8).fill(condition) }] } },
      { condition: { allOf: Array.from({ length: 9 }, (_, index) => ({ ...condition, name: `MAIN.a${index}` })) } },
    ]) {
      await expect(wait.execute({ ...waitArgs, ...invalid })).rejects.toThrow();
    }
    expect(invoke).not.toHaveBeenCalled();
    expect(open).not.toHaveBeenCalled();
  });

  it.each([null, { ...grant, grantId: randomUUID() }])("aborts and drains an in-flight wait on context change: %j", async target => {
    vi.useFakeTimers();
    const { wait, waitUntil, invoke, disconnect } = setup();
    const started = deferred<AbortSignal>();
    const finish = deferred<PlcWaitUntilResult>();
    waitUntil.mockImplementation(({ signal }) => {
      started.resolve(signal!);
      return finish.promise;
    });
    const pending = wait.execute(waitArgs);
    const signal = await started.promise;
    invoke.mockResolvedValue(response(target));
    await vi.advanceTimersByTimeAsync(2000);
    expect(signal.aborted).toBe(true);
    expect(disconnect).not.toHaveBeenCalled();
    finish.resolve({ ...waitResult, status: "cancelled" });
    expect(await pending).toEqual({ status: "online_context_changed" });
    expect(disconnect).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(["subscribeValue", "unsubscribe"] as const)(
    "finishes and releases the read slot when ADS %s never settles",
    async blocked => {
      vi.useFakeTimers();
      const { wait, read, invoke, waitUntil, disconnect: disconnectReader } = setup(undefined, 50);
      const config = normalizeTwinCatAdsConfig({ targetAmsNetId: grant.amsNetId, readOnly: true });
      const service = new AdsService(config, { waitCleanupTimeoutMs: 25 });
      vi.spyOn(service, "connect").mockResolvedValue(service.client.connection);
      const subscribe = vi.spyOn(service.client, "subscribeValue");
      const unsubscribe = vi.spyOn(service.client, "unsubscribe");
      const disconnect = vi.spyOn(service, "disconnect");
      const never = new Promise<never>(() => {});
      if (blocked === "subscribeValue") {
        subscribe.mockReturnValue(never);
        unsubscribe.mockResolvedValue(undefined);
        disconnect.mockResolvedValue(undefined);
      } else {
        subscribe.mockResolvedValue({
          latestData: { value: false, timestamp: new Date(observation.timestamp) },
        } as Awaited<ReturnType<typeof service.client.subscribeValue>>);
        unsubscribe.mockReturnValue(never);
        disconnect.mockReturnValue(never);
      }
      waitUntil.mockImplementationOnce(service.waitUntil.bind(service));
      disconnectReader.mockImplementationOnce(service.disconnect.bind(service));

      const revoking = blocked === "unsubscribe";
      const pending = wait.execute({ ...waitArgs, timeoutMs: revoking ? 10_000 : 100 });
      await vi.advanceTimersByTimeAsync(0);
      expect(subscribe).toHaveBeenCalledOnce();
      if (revoking) invoke.mockResolvedValue(response(null));
      await vi.advanceTimersByTimeAsync((revoking ? 2_000 : 100) + 24);
      expect(disconnect).not.toHaveBeenCalled();
      expect(unsubscribe).toHaveBeenCalledTimes(revoking ? 1 : 0);
      await vi.advanceTimersByTimeAsync(1);
      expect(disconnect).toHaveBeenCalledOnce();

      await vi.advanceTimersByTimeAsync(50);
      if (revoking) {
        expect(await pending).toEqual({ status: "online_context_changed" });
        invoke.mockResolvedValue(response({ ...grant, grantId: randomUUID() }));
      } else {
        expect(await pending).toMatchObject({ status: "succeeded", waitStatus: "timeout" });
      }
      expect(vi.getTimerCount()).toBe(0);
      expect(await read.execute({ symbols: [condition.name] })).toMatchObject({ status: "succeeded" });
    },
  );

  it.each(["timeout", "revocation"] as const)(
    "stops the grant monitor and releases the read slot on %s during ADS connect",
    async trigger => {
      vi.useFakeTimers();
      const { wait, read, invoke, waitUntil, disconnect: disconnectReader } = setup(undefined, 50);
      const config = normalizeTwinCatAdsConfig({ targetAmsNetId: grant.amsNetId, readOnly: true });
      const service = new AdsService(config, { autoReconnect: false, waitCleanupTimeoutMs: 25 });
      const { client } = service;
      const connecting = deferred<void>();
      const connect = vi.spyOn(client, "connect").mockImplementation(async () => {
        await connecting.promise;
        Object.assign(client.connection, { connected: true });
        return client.connection;
      });
      const disconnect = vi.spyOn(client, "disconnect").mockImplementation(async () => {
        Object.assign(client.connection, { connected: false });
      });
      const cacheSymbols = vi.spyOn(client, "cacheSymbols").mockResolvedValue(undefined);
      vi.spyOn(client, "cacheDataTypes").mockResolvedValue(undefined);
      vi.spyOn(client, "getSymbols").mockResolvedValue({});
      const subscribe = vi.spyOn(client, "subscribeValue").mockResolvedValue({
        latestData: { value: true, timestamp: new Date(observation.timestamp) },
      } as Awaited<ReturnType<typeof client.subscribeValue>>);
      waitUntil.mockImplementationOnce(service.waitUntil.bind(service));
      disconnectReader.mockImplementationOnce(service.disconnect.bind(service));

      const revoking = trigger === "revocation";
      const pending = wait.execute({ ...waitArgs, timeoutMs: revoking ? 10_000 : 100 });
      await vi.advanceTimersByTimeAsync(0);
      expect(connect).toHaveBeenCalledOnce();
      if (revoking) invoke.mockResolvedValue(response(null));
      await vi.advanceTimersByTimeAsync((revoking ? 2_000 : 100) + 25);
      expect(disconnectReader).toHaveBeenCalledOnce();
      expect(vi.getTimerCount()).toBe(0);

      if (revoking) {
        expect(await pending).toEqual({ status: "online_context_changed" });
        invoke.mockResolvedValue(response({ ...grant, grantId: randomUUID() }));
      } else {
        expect(await pending).toMatchObject({ status: "succeeded", waitStatus: "timeout", durationMs: 100 });
      }
      expect(await read.execute({ symbols: [condition.name] })).toMatchObject({ status: "succeeded" });

      connecting.resolve();
      await vi.advanceTimersByTimeAsync(0);
      expect(disconnect).toHaveBeenCalledOnce();
      expect(cacheSymbols).not.toHaveBeenCalled();
      expect(subscribe).not.toHaveBeenCalled();
      expect(service.hasActiveConnection).toBe(false);
    },
  );

  it("stops a stuck grant monitor and releases the read slot without returning samples", async () => {
    vi.useFakeTimers();
    const { wait, read, invoke, waitUntil, disconnect } = setup(undefined, 50);
    const result = deferred<PlcWaitUntilResult>();
    waitUntil.mockReturnValue(result.promise);
    invoke.mockResolvedValueOnce(response()).mockImplementationOnce(() => new Promise(() => {}));
    const pending = wait.execute(waitArgs);
    await vi.advanceTimersByTimeAsync(2_000);
    expect(invoke).toHaveBeenCalledTimes(2);

    result.resolve(waitResult);
    await vi.advanceTimersByTimeAsync(50);
    expect(await pending).toEqual({ status: "online_context_changed" });
    expect(disconnect).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
    expect(await read.execute({ symbols: [condition.name] })).toMatchObject({ status: "succeeded" });
  });

  it("discards a completed wait if the final verification changes the context", async () => {
    const { wait, waitUntil, invoke, disconnect } = setup();
    invoke.mockResolvedValueOnce(response()).mockResolvedValueOnce(response({ ...grant, adsPort: 857 }));
    expect(await wait.execute(waitArgs)).toEqual({ status: "online_context_changed" });
    expect(waitUntil).toHaveBeenCalledOnce();
    expect(disconnect).toHaveBeenCalledOnce();
  });

  it("redacts ADS errors, disconnects and releases the read slot", async () => {
    const { wait, waitUntil, read, disconnect } = setup();
    waitUntil.mockRejectedValueOnce(new Error("private ADS diagnostics"));
    expect(await wait.execute(waitArgs)).toEqual({ status: "live_read_unavailable" });
    expect(disconnect).toHaveBeenCalledOnce();
    expect(await read.execute({ symbols: [condition.name] })).toMatchObject({ status: "succeeded" });
  });

  it("shares a single flight between reads and waits in either direction", async () => {
    const { wait, waitUntil, read, readSymbol, open } = setup();
    const waitStarted = deferred<void>();
    const waitDone = deferred<PlcWaitUntilResult>();
    waitUntil.mockImplementation(() => { waitStarted.resolve(); return waitDone.promise; });
    const pendingWait = wait.execute(waitArgs);
    await waitStarted.promise;
    expect(await read.execute({ symbols: [condition.name] })).toEqual({ status: "busy" });
    expect(open).toHaveBeenCalledOnce();
    waitDone.resolve(waitResult);
    expect(await pendingWait).toMatchObject({ status: "succeeded" });

    const readStarted = deferred<void>();
    const readDone = deferred<typeof observation>();
    readSymbol.mockImplementation(() => { readStarted.resolve(); return readDone.promise; });
    const pendingRead = read.execute({ symbols: [condition.name] });
    await readStarted.promise;
    expect(await wait.execute(waitArgs)).toEqual({ status: "busy" });
    expect(open).toHaveBeenCalledTimes(2);
    readDone.resolve(observation);
    expect(await pendingRead).toMatchObject({ status: "succeeded" });
  });
});

describe("bound Debug ADS watches", () => {
  it("registers and reuses a watch, lists its latest sample and disconnects after the final removal", async () => {
    vi.useFakeTimers();
    const { watch, list, unwatch, open, watchSymbol, unwatchSymbol, disconnect, activeWatches } = setup();
    const name = condition.name;
    const options = { mode: "cyclic", cycleTimeMs: 50, maxDelayMs: 0 };
    const expected = { name, mode: "cyclic", cycleTimeMs: 50, active: true, lastValue: "123",
      encoding: "decimalInteger", lastTimestamp: observation.timestamp };
    expect(await watch.execute({ name, ...options })).toEqual({ status: "succeeded", source: "ads_live", watch: expected });
    expect(watchSymbol).toHaveBeenCalledExactlyOnceWith(name, options);
    expect(await watch.execute({ name })).toMatchObject({ watch: expected });
    expect(open).toHaveBeenCalledExactlyOnceWith(grant);

    activeWatches.set(name, { ...activeWatches.get(name)!, lastValue: 0, lastTimestamp: waitResult.completedAt });
    expect(await list.execute({})).toMatchObject({ status: "succeeded", count: 1,
      watches: [{ name, active: true, lastValue: 0, lastTimestamp: waitResult.completedAt }] });
    expect(disconnect).not.toHaveBeenCalled();

    expect(await unwatch.execute({ name })).toMatchObject({ status: "succeeded", watch: { name, active: false } });
    expect(unwatchSymbol).toHaveBeenCalledExactlyOnceWith(name);
    expect(disconnect).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
    expect(await list.execute({})).toEqual({ status: "succeeded", source: "ads_live", watches: [], count: 0 });
  });

  it.each([
    { label: "stays revoked", after: null },
    { label: "is reported online again", after: grant },
  ])("discards the final watch snapshot after revocation when the grant $label", async ({ after }) => {
    const { watch, unwatch, disconnect, state, invoke } = setup();
    const name = condition.name;
    await watch.execute({ name });
    const disconnecting = deferred<void>();
    const resume = deferred<void>();
    disconnect.mockImplementationOnce(() => { disconnecting.resolve(); return resume.promise; });

    const removal = unwatch.execute({ name });
    await disconnecting.promise;
    invoke.mockResolvedValue(response(null));
    expect(await state.execute({})).toEqual({ status: "online_session_not_verified" });
    invoke.mockResolvedValue(response(after));
    resume.resolve();
    expect(await removal).toEqual({ status: "online_context_changed" });
  });

  it("reports non-scalar and oversized samples without returning the raw value or notification handle", async () => {
    const { watch, list, activeWatches } = setup();
    const name = condition.name;
    await watch.execute({ name });
    for (const lastValue of [{ hidden: ["private"] }, "x".repeat(1025), Infinity]) {
      activeWatches.set(name, { ...activeWatches.get(name)!, lastValue });
      const result = await list.execute({});
      expect(result).toMatchObject({ watches: [{ name, valueStatus: "unsupported_value_type" }] });
      const serialized = JSON.stringify(result);
      expect(serialized).not.toContain("lastValue");
      expect(serialized).not.toContain("notificationHandle");
      expect(serialized).not.toContain("private");
    }
  });

  it("rejects invalid input and unapproved names without opening ADS", async () => {
    const { watch, unwatch, list, open, invoke } = setup();
    for (const args of [{ name: "MAIN.*" }, { name: condition.name, mode: "poll" },
      { name: condition.name, cycleTimeMs: 49 }, { name: condition.name, maxDelayMs: 60_001 },
      { name: condition.name, targetAdsPort: 851 }]) {
      await expect(watch.execute(args)).rejects.toThrow();
    }
    await expect(unwatch.execute({ name: condition.name, adsPort: 851 })).rejects.toThrow();
    await expect(list.execute({ name: condition.name })).rejects.toThrow();
    expect(invoke).not.toHaveBeenCalled();
    expect(await watch.execute({ name: "MAIN.denied" })).toEqual({ status: "symbol_not_approved" });
    expect(await unwatch.execute({ name: "MAIN.denied" })).toEqual({ status: "symbol_not_approved" });
    expect(open).not.toHaveBeenCalled();
  });

  it("enforces an eight-watch limit while allowing reuse at capacity", async () => {
    const { watch, list, unwatch, open, disconnect, watchSymbol } = setup(vi.fn().mockResolvedValue(response(allGrant)));
    for (let index = 0; index < 8; index++)
      expect(await watch.execute({ name: `MAIN.a${index}` })).toMatchObject({ status: "succeeded" });
    expect(await watch.execute({ name: "MAIN.a8" })).toEqual({ status: "watch_limit_reached", maxWatches: 8 });
    expect(watchSymbol).toHaveBeenCalledTimes(8);
    expect(await watch.execute({ name: "MAIN.a0" })).toMatchObject({ status: "succeeded" });
    expect(await list.execute({})).toMatchObject({ count: 8 });
    await unwatch.execute({ name: "MAIN.a0" });
    expect(disconnect).not.toHaveBeenCalled();
    expect(await watch.execute({ name: "MAIN.a8" })).toMatchObject({ status: "succeeded" });
    expect(open).toHaveBeenCalledOnce();
  });

  it.each(["state", "read", "wait", "watch", "unwatch", "list"] as const)(
    "invalidates existing watches when %s detects a context change",
    async key => {
      const session = setup();
      await session.watch.execute({ name: condition.name });
      session.invoke.mockResolvedValue(response({ ...grant, symbols: ["MAIN.cycle"] }));
      const inputs = { state: {}, read: { symbols: [condition.name] }, wait: waitArgs,
        watch: { name: condition.name }, unwatch: { name: condition.name }, list: {} };
      const result = await session[key].execute(inputs[key]);
      if (key === "watch" || key === "unwatch" || key === "list")
        expect(result).toEqual({ status: "online_context_changed" });
      expect(session.disconnect).toHaveBeenCalledOnce();
      expect(session.activeWatches.size).toBe(0);
      const next = await session.list.execute({});
      if (key === "watch" || key === "unwatch" || key === "list")
        expect(next).toMatchObject({ status: "succeeded", count: 0 });
      else expect(next).toEqual({ status: "online_context_changed" });
    },
  );

  it.each(["watch", "unwatch", "list"] as const)("reports logout once through %s", async key => {
    const session = setup();
    const symbol = { name: condition.name };
    await session.watch.execute(symbol);
    session.invoke.mockResolvedValue(response(null));
    const args = key === "list" ? {} : symbol;

    expect(await session[key].execute(args)).toEqual({ status: "online_context_changed" });
    expect(await session[key].execute(args)).toEqual({ status: "online_session_not_verified" });
    expect(await session.watch.execute(symbol)).toEqual({ status: "online_session_not_verified" });
    expect(session.disconnect).toHaveBeenCalledOnce();
    expect(session.open).toHaveBeenCalledOnce();
  });

  it("reports an unverified online session when there have been no watches", async () => {
    const { list, unwatch, watch, open } = setup(vi.fn().mockResolvedValue(response(null)));
    expect(await list.execute({})).toEqual({ status: "online_session_not_verified" });
    expect(await unwatch.execute({ name: condition.name })).toEqual({ status: "online_session_not_verified" });
    expect(await watch.execute({ name: condition.name })).toEqual({ status: "online_session_not_verified" });
    expect(open).not.toHaveBeenCalled();
  });

  it.each(["list", "unwatch"] as const)("reports watch revocation once through %s under a fresh grant", async key => {
    const session = setup();
    await session.watch.execute({ name: condition.name });
    session.invoke.mockResolvedValue(response(null));
    await session.state.execute({});
    session.invoke.mockResolvedValue(response({ ...grant, grantId: randomUUID() }));

    const args = key === "list" ? {} : { name: condition.name };
    expect(await session[key].execute(args)).toEqual({ status: "online_context_changed" });
    expect(await session[key].execute(args)).toMatchObject({ status: "succeeded" });
    expect(await session.list.execute({})).toMatchObject({ status: "succeeded", count: 0 });
  });

  it.each([null, { ...grant, amsNetId: "1.2.3.4.5.7" }])("monitors and tears down watches without another tool call: %j", async target => {
    vi.useFakeTimers();
    const { watch, list, invoke, disconnect } = setup();
    await watch.execute({ name: condition.name });
    invoke.mockResolvedValue(response(target));
    await vi.advanceTimersByTimeAsync(3000);
    expect(disconnect).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
    expect(await list.execute({})).toEqual({ status: "online_context_changed" });
  });

  it("cleans up a subscription that arrives after revocation during registration", async () => {
    vi.useFakeTimers();
    const { watch, state, invoke, watchSymbol, disconnect, activeWatches } = setup();
    await watch.execute({ name: "MAIN.cycle" });
    const started = deferred<void>();
    const resume = deferred<void>();
    const register = watchSymbol.getMockImplementation()!;
    watchSymbol.mockImplementationOnce(async (...args) => {
      started.resolve();
      await resume.promise;
      return register(...args);
    });
    const registration = watch.execute({ name: condition.name });
    await started.promise;
    invoke.mockResolvedValue(response(null));
    expect(await state.execute({})).toEqual({ status: "online_session_not_verified" });
    expect(disconnect).toHaveBeenCalledOnce();
    expect(activeWatches.size).toBe(0);
    expect(await registration).toEqual({ status: "online_context_changed" });
    resume.resolve();
    await vi.advanceTimersByTimeAsync(0);
    expect(disconnect).toHaveBeenCalledTimes(2);
    expect(activeWatches.size).toBe(0);
  });

  it("disconnects immediately and recovers under a new grant if watch registration and cleanup hang", async () => {
    vi.useFakeTimers();
    const { watch, state, invoke, watchSymbol, disconnect, open, activeWatches } = setup(undefined, 50);
    await watch.execute({ name: "MAIN.cycle" });
    const never = new Promise<never>(() => {});
    watchSymbol.mockReturnValueOnce(never);
    disconnect.mockImplementationOnce(() => { activeWatches.clear(); return never; });
    const registration = watch.execute({ name: condition.name });
    await vi.advanceTimersByTimeAsync(0);
    expect(watchSymbol).toHaveBeenCalledTimes(2);

    invoke.mockResolvedValue(response(null));
    expect(await state.execute({})).toEqual({ status: "online_session_not_verified" });
    expect(disconnect).toHaveBeenCalledOnce();
    expect(activeWatches.size).toBe(0);
    await vi.advanceTimersByTimeAsync(50);
    expect(await registration).toEqual({ status: "online_context_changed" });
    expect(vi.getTimerCount()).toBe(0);

    const fresh = { ...grant, grantId: randomUUID() };
    invoke.mockResolvedValue(response(fresh));
    expect(await watch.execute({ name: condition.name })).toMatchObject({ status: "succeeded" });
    expect(open).toHaveBeenCalledTimes(2);
    expect(open).toHaveBeenLastCalledWith(fresh);
  });

  it("rejects a stale context response that arrives after a newer revocation", async () => {
    const { watch, state, open, invoke } = setup();
    const started = deferred<void>();
    const oldContext = deferred<unknown>();
    invoke.mockImplementationOnce(() => {
      started.resolve();
      return oldContext.promise;
    }).mockResolvedValue(response(null));
    const registration = watch.execute({ name: condition.name });
    await started.promise;
    await state.execute({});
    oldContext.resolve(response());
    expect(await registration).toEqual({ status: "online_context_changed" });
    expect(open).not.toHaveBeenCalled();
  });

  it("releases the persistent reader and monitor on Debug shutdown", async () => {
    vi.useFakeTimers();
    const { watch, shutdown, list, disconnect, invoke } = setup();
    await watch.execute({ name: condition.name });
    shutdown.abort();
    expect(disconnect).toHaveBeenCalledOnce();
    expect(await list.execute({})).toEqual({ status: "online_context_changed" });
    expect(vi.getTimerCount()).toBe(0);
    expect(invoke).toHaveBeenCalledTimes(2);
  });

  it("redacts registration errors and closes the failed reader", async () => {
    const { watch, watchSymbol, list, disconnect } = setup();
    watchSymbol.mockRejectedValueOnce(new Error("private ADS diagnostics"));
    expect(await watch.execute({ name: condition.name })).toEqual({ status: "live_read_unavailable" });
    expect(disconnect).toHaveBeenCalledOnce();
    expect(await list.execute({})).toMatchObject({ status: "succeeded", count: 0 });
  });

  it("preserves a healthy existing watch when another symbol cannot be registered", async () => {
    const { watch, watchSymbol, list, disconnect } = setup(vi.fn().mockResolvedValue(response(allGrant)));
    expect(await watch.execute({ name: "GVL.Good" })).toMatchObject({ status: "succeeded" });
    watchSymbol.mockRejectedValueOnce(new Error("ADS symbol not found"));

    expect(await watch.execute({ name: "GVL.Missing" })).toEqual({ status: "live_read_unavailable" });
    expect(disconnect).not.toHaveBeenCalled();
    expect(await list.execute({})).toMatchObject({
      status: "succeeded", count: 1, watches: [{ name: "GVL.Good", active: true }],
    });
  });
});
