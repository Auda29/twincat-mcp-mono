import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { createDebugLiveTools } from "../src/debug-live-tools.js";

const grant = { loggedIn: true, grantId: randomUUID(), amsNetId: "1.2.3.4.5.6", adsPort: 856, symbols: ["MAIN.ready", "MAIN.cycle"] };
const { symbols: _symbols, ...targetFields } = grant;
const allGrant = { ...targetFields, symbolScope: "all" };
const response = (target: unknown = grant) => ({ status: "succeeded", result: target });
const observation = { name: "MAIN.ready", type: "BOOL", timestamp: "2026-01-01T00:00:00.000Z", value: true, symbol: {} };

function setup(invoke = vi.fn().mockResolvedValue(response())) {
  const disconnect = vi.fn().mockResolvedValue(undefined);
  const readSymbol = vi.fn().mockResolvedValue(observation);
  const open = vi.fn(() => ({ readSymbol, disconnect }));
  const tools = createDebugLiveTools(invoke, open);
  return { read: tools.find(tool => tool.name === "plc_debug_read")!, state: tools.find(tool => tool.name === "plc_debug_state")!, invoke, open, readSymbol, disconnect };
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
