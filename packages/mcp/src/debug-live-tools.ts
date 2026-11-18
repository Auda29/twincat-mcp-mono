import { AdsService, normalizeTwinCatAdsConfig, type PlcReadResult } from "twincat-mcp-core";
import { z } from "zod";
import type { McpToolDefinition } from "./index.js";

const symbolName = z.string().max(160).regex(/^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*|\[\d{1,6}\])*$/);
const netId = z.string().regex(/^(?:0|[1-9]\d{0,2})(?:\.(?:0|[1-9]\d{0,2})){5}$/)
  .refine(value => value !== "0.0.0.0.0.0" && value.split(".").every(octet => Number(octet) <= 255));
const targetSchema = z.object({
  loggedIn: z.literal(true),
  grantId: z.string().uuid(),
  amsNetId: netId,
  adsPort: z.number().int().min(1).max(65535),
  symbols: z.array(symbolName).min(1).max(32).refine(names => new Set(names).size === names.length),
}).strict();
const readInput = z.object({
  symbols: z.array(symbolName).min(1).max(8).refine(names => new Set(names).size === names.length),
}).strict();
const emptyInput = z.object({}).strict();
const readOnly = { readOnlyHint: true, openWorldHint: false };

export type DebugTarget = z.infer<typeof targetSchema>;
type DebugReader = Pick<AdsService, "readSymbol" | "disconnect">;
type OpenReader = (target: DebugTarget) => DebugReader;
type InvokeHost = (operation: string, args: Record<string, unknown>) => Promise<unknown>;

function openReadOnlyAds(target: DebugTarget): DebugReader {
  return new AdsService(normalizeTwinCatAdsConfig({
    connectionMode: "router",
    targetAmsNetId: target.amsNetId,
    targetAdsPort: target.adsPort,
    readOnly: true,
    writeAllowlist: [],
  }));
}

function sample(requested: string, value: PlcReadResult) {
  if (value.name !== requested || !Number.isFinite(Date.parse(value.timestamp)) || value.type.length > 128)
    throw new Error("Unexpected online sample");
  const scalar = value.value;
  if (typeof scalar === "bigint")
    return { symbol: requested, type: value.type, observedAtUtc: value.timestamp, value: scalar.toString(), encoding: "decimalInteger" };
  if ((typeof scalar === "string" && scalar.length <= 1024) || typeof scalar === "boolean"
      || (typeof scalar === "number" && Number.isFinite(scalar)))
    return { symbol: requested, type: value.type, observedAtUtc: value.timestamp, value: scalar };
  return { symbol: requested, type: value.type, observedAtUtc: value.timestamp, status: "unsupported_value_type" };
}

export function createDebugLiveTools(invoke: InvokeHost, openReader: OpenReader = openReadOnlyAds): McpToolDefinition[] {
  let reading = false;
  async function onlineTarget() {
    const response = await invoke("debug.context", {});
    const envelope = z.object({ status: z.literal("succeeded"), result: targetSchema }).safeParse(response);
    return envelope.success ? envelope.data.result : null;
  }
  return [
    {
      name: "plc_debug_state", title: "Bound PLC Debug State", inputSchema: emptyInput, annotations: readOnly,
      description: "Check whether the native Assistant confirms an approved Debug grant for its already logged-in PLC project.",
      async execute(input) {
        emptyInput.parse(input);
        const target = await onlineTarget();
        return target ? { status: "online", symbols: target.symbols } : { status: "online_session_not_verified" };
      },
    },
    {
      name: "plc_debug_read", title: "Read Approved Live PLC Values", inputSchema: readInput, annotations: readOnly,
      description: "Read up to eight explicitly approved symbols from the bound online PLC. Values are observed individually, with a timestamp for each sample.",
      async execute(input) {
        const { symbols } = readInput.parse(input);
        if (reading) return { status: "busy" };
        reading = true;
        let reader: DebugReader | undefined;
        try {
          const target = await onlineTarget();
          if (!target) return { status: "online_session_not_verified" };
          if (symbols.some(name => !target.symbols.includes(name))) return { status: "symbol_not_approved" };
          const identity = JSON.stringify(target);
          reader = openReader(target);
          const values = [];
          for (const name of symbols) {
            if (JSON.stringify(await onlineTarget()) !== identity) return { status: "online_context_changed" };
            values.push(sample(name, await reader.readSymbol(name)));
          }
          await reader.disconnect();
          reader = undefined;
          if (JSON.stringify(await onlineTarget()) !== identity) return { status: "online_context_changed" };
          return { status: "succeeded", source: "ads_live", values };
        } catch {
          return { status: "live_read_unavailable" };
        } finally {
          try { await reader?.disconnect(); } catch { /* The owned child closes its ADS socket on exit. */ }
          finally { reading = false; }
        }
      },
    },
  ];
}
