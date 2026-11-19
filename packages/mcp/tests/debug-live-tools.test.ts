import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { createDebugLiveTools } from "../src/debug-live-tools.js";

const grant = { loggedIn: true, grantId: randomUUID(), amsNetId: "1.2.3.4.5.6", adsPort: 856, symbols: ["MAIN.ready", "MAIN.cycle"] };
const response = (target: unknown = grant) => ({ status: "succeeded", result: target });
const observation = { name: "MAIN.ready", type: "BOOL", timestamp: "2026-01-01T00:00:00.000Z", value: true, symbol: {} };

function setup(invoke = vi.fn().mockResolvedValue(response())) {
  const disconnect = vi.fn().mockResolvedValue(undefined);
  const readSymbol = vi.fn().mockResolvedValue(observation);
  const open = vi.fn(() => ({ readSymbol, disconnect }));
  const tools = createDebugLiveTools(invoke, open);
  return { read: tools.find(tool => tool.name === "plc_debug_read")!, invoke, open, readSymbol, disconnect };
}

describe("bound Debug ADS reads", () => {
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

  it("discards the sample and ends the connection when the grant changes", async () => {
    const invoke = vi.fn().mockResolvedValueOnce(response()).mockResolvedValueOnce(response())
      .mockResolvedValueOnce(response({ ...grant, grantId: randomUUID() }));
    const { read, disconnect } = setup(invoke);
    expect(await read.execute({ symbols: ["MAIN.ready"] })).toEqual({ status: "online_context_changed" });
    expect(disconnect).toHaveBeenCalledOnce();
  });
});
