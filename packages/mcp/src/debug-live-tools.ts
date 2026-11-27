import {
  AdsService, DEFAULT_NOTIFICATION_CYCLE_TIME_MS, normalizeTwinCatAdsConfig,
  type PlcReadResult, type PlcWaitCondition, type PlcWatchSnapshot,
} from "twincat-mcp-core";
import { z } from "zod";
import type { McpToolDefinition } from "./index.js";

const maxSymbols = 8;
const maxWaitMs = 120_000;
const maxConditionNodes = 16;
const scalarString = z.string().max(1024);
const symbolName = z.string().max(160).regex(/^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*|\[\d{1,6}\])*(?![\s\S])/);
const netId = z.string().max(23).regex(/^(?:0|[1-9]\d{0,2})(?:\.(?:0|[1-9]\d{0,2})){5}(?![\s\S])/)
  .refine(value => value !== "0.0.0.0.0.0" && value.split(".").every(octet => Number(octet) <= 255));
const targetFields = {
  loggedIn: z.literal(true),
  grantId: z.string().uuid().refine(value => value !== "00000000-0000-0000-0000-000000000000"),
  amsNetId: netId,
  adsPort: z.number().int().min(851).max(899),
};
const targetSchema = z.union([
  z.object({ ...targetFields, symbolScope: z.literal("allowlist").optional(),
    symbols: z.array(symbolName).min(1).max(32).refine(names => new Set(names).size === names.length) }).strict(),
  z.object({ ...targetFields, symbolScope: z.literal("all") }).strict(),
]);
const contextEnvelope = z.object({ status: z.literal("succeeded"), result: targetSchema });
const readInput = z.object({
  symbols: z.array(symbolName).min(1).max(maxSymbols).refine(names => new Set(names).size === names.length),
}).strict();
const comparison = z.object({
  name: symbolName,
  operator: z.enum(["equals", "notEquals", "greaterThan", "greaterThanOrEquals", "lessThan", "lessThanOrEquals"]),
  value: z.union([z.boolean(), z.number().finite(), scalarString]),
}).strict();

function conditionSchema(depth: number): z.ZodType<PlcWaitCondition> {
  if (depth === 1) return comparison;
  const children = z.array(conditionSchema(depth - 1)).min(1).max(maxConditionNodes - 1);
  return z.union([
    comparison,
    z.object({ allOf: children }).strict(),
    z.object({ anyOf: children }).strict(),
  ]);
}

function inspectCondition(condition: PlcWaitCondition, symbols: Set<string>): number {
  if ("name" in condition) {
    symbols.add(condition.name);
    return 1;
  }
  const children = "allOf" in condition ? condition.allOf : condition.anyOf;
  return children.reduce((count, child) => count + inspectCondition(child, symbols), 1);
}

const timingFields = {
  cycleTimeMs: z.number().int().min(50).max(60_000).optional(),
  maxDelayMs: z.number().int().min(0).max(60_000).optional(),
};
const waitInput = z.object({
  condition: conditionSchema(4).describe("A condition tree with at most four levels, 16 nodes and eight distinct symbols."),
  timeoutMs: z.number().int().min(1).max(maxWaitMs),
  stableForMs: z.number().int().min(0).max(maxWaitMs).optional().describe("Required continuous match time, at most timeoutMs."),
  ...timingFields,
}).strict().superRefine(({ condition, timeoutMs, stableForMs }, context) => {
  const symbols = new Set<string>();
  const nodes = inspectCondition(condition, symbols);
  if (nodes > maxConditionNodes || symbols.size > maxSymbols)
    context.addIssue({ code: "custom", path: ["condition"], message: "Use at most 16 condition nodes and eight distinct symbols." });
  if (stableForMs !== undefined && stableForMs > timeoutMs)
    context.addIssue({ code: "custom", path: ["stableForMs"], message: "Must be at most timeoutMs." });
});
const watchInput = z.object({
  name: symbolName,
  mode: z.enum(["on-change", "cyclic"]).optional(),
  ...timingFields,
}).strict();
const unwatchInput = z.object({ name: symbolName }).strict();
const emptyInput = z.object({}).strict();
const readOnly = { readOnlyHint: true, openWorldHint: false };

export type DebugTarget = z.infer<typeof targetSchema>;
type DebugReader = Pick<AdsService, "readSymbol" | "waitUntil" | "watchSymbol" | "unwatchSymbol" | "listWatches" | "disconnect">
  & Partial<Pick<AdsService, "hasActiveConnection">>;
type OpenReader = (target: DebugTarget) => DebugReader;
type InvokeHost = (operation: string, args: Record<string, unknown>) => Promise<unknown>;

interface WatchSession {
  identity: string;
  reader: DebugReader;
  monitor: ReturnType<typeof setInterval>;
  pendingOperation?: Promise<PlcWatchSnapshot> | undefined;
}

function openReadOnlyAds(target: DebugTarget): DebugReader {
  return new AdsService(normalizeTwinCatAdsConfig({
    connectionMode: "router",
    targetAmsNetId: target.amsNetId,
    targetAdsPort: target.adsPort,
    readOnly: true,
    writeAllowlist: [],
    maxWaitUntilMs: maxWaitMs,
    maxNotifications: maxSymbols,
  }), { autoReconnect: false });
}

function scalarValue(value: unknown) {
  if (typeof value === "bigint") return { value: value.toString(), encoding: "decimalInteger" } as const;
  if (typeof value === "boolean" || (typeof value === "number" && Number.isFinite(value))
      || (typeof value === "string" && scalarString.safeParse(value).success)) return { value };
  return { status: "unsupported_value_type" } as const;
}

function sample(requested: string, value: PlcReadResult) {
  if (value.name !== requested || !Number.isFinite(Date.parse(value.timestamp)) || value.type.length > 128)
    throw new Error("Unexpected online sample");
  return { symbol: requested, type: value.type, observedAtUtc: value.timestamp, ...scalarValue(value.value) };
}

function watchSnapshot(watch: PlcWatchSnapshot) {
  // Expose observation metadata without the ADS notification handle.
  const { name, mode, cycleTimeMs, active, lastValue, lastTimestamp } = watch;
  const snapshot = { name, mode, cycleTimeMs, active, lastTimestamp };
  if (lastValue === undefined) return snapshot;
  const scalar = scalarValue(lastValue);
  if ("status" in scalar) return { ...snapshot, valueStatus: scalar.status };
  const { value, ...metadata } = scalar;
  return { ...snapshot, lastValue: value, ...metadata };
}

function notificationOptions({ cycleTimeMs, maxDelayMs }: { cycleTimeMs?: number | undefined; maxDelayMs?: number | undefined }) {
  return { cycleTimeMs: cycleTimeMs ?? DEFAULT_NOTIFICATION_CYCLE_TIME_MS, ...(maxDelayMs === undefined ? {} : { maxDelayMs }) };
}

function approved(target: DebugTarget, symbols: Iterable<string>): boolean {
  return target.symbolScope === "all" || [...symbols].every(name => target.symbols.includes(name));
}

async function disconnectReader(reader?: DebugReader) {
  try { await reader?.disconnect(); } catch { /* Disconnect still attempts to close the underlying ADS socket. */ }
}

export function createDebugLiveTools(
  invoke: InvokeHost,
  openReader: OpenReader = openReadOnlyAds,
  shutdown?: AbortSignal,
): McpToolDefinition[] {
  let reading = false;
  let activeWait: { identity: string; controller: AbortController } | undefined;
  let watching = false;
  let watchSession: WatchSession | undefined;
  let watchContextChanged = false;
  let watchCleanup: Promise<void> | undefined;
  let nextContextCheck = 0;
  let latestContextCheck = 0;
  let latestIdentity: string | undefined;

  function closeWatches(session: WatchSession, contextChanged = false) {
    if (watchSession !== session) return;
    watchSession = undefined;
    watchContextChanged = contextChanged;
    clearInterval(session.monitor);
    // A subscription can arrive after revocation while its ADS request is in flight.
    // Disconnect after that request settles so it cannot reopen or outlive the reader.
    const pending = session.pendingOperation;
    watchCleanup = pending === undefined ? disconnectReader(session.reader)
      : pending.then(() => disconnectReader(session.reader), () => disconnectReader(session.reader));
  }

  shutdown?.addEventListener("abort", () => {
    activeWait?.controller.abort();
    if (watchSession) closeWatches(watchSession, true);
  }, { once: true });

  async function onlineTarget() {
    const check = ++nextContextCheck;
    let target: DebugTarget | null = null;
    if (!shutdown?.aborted) {
      try {
        const envelope = contextEnvelope.safeParse(await invoke("debug.context", {}));
        if (envelope.success && !shutdown?.aborted) target = envelope.data.result;
      } catch { /* A failed context check invalidates the grant. */ }
    }
    let identity = JSON.stringify(target);
    if (check > latestContextCheck) {
      latestContextCheck = check;
      latestIdentity = identity;
    } else if (identity !== latestIdentity) {
      // A slower response must not reauthorize a superseded context.
      target = null;
      identity = "null";
    }
    if (activeWait && identity !== activeWait.identity) activeWait.controller.abort();
    if (watchSession && identity !== watchSession.identity) closeWatches(watchSession, true);
    return target;
  }

  // At most one check is in flight per monitor. Joining a check before handing
  // back data also respects a revocation observed by that check.
  function monitorContext(intervalMs: number, check: () => Promise<unknown>) {
    let pending: Promise<unknown> | undefined;
    const timer = setInterval(() => {
      pending ??= check().finally(() => { pending = undefined; });
    }, intervalMs).unref();
    return { timer, async stop() { clearInterval(timer); await pending; } };
  }

  async function withReadAccess(
    symbols: Iterable<string>,
    run: (target: DebugTarget, reader: DebugReader, close: () => Promise<void>) => Promise<unknown>,
  ) {
    if (reading) {
      await onlineTarget();
      return { status: "busy" };
    }
    reading = true;
    let reader: DebugReader | undefined;
    try {
      const target = await onlineTarget();
      if (!target) return { status: "online_session_not_verified" };
      if (shutdown?.aborted || JSON.stringify(target) !== latestIdentity) return { status: "online_context_changed" };
      if (!approved(target, symbols)) return { status: "symbol_not_approved" };
      const openedReader = openReader(target);
      reader = openedReader;
      return await run(target, openedReader, async () => {
        reader = undefined;
        await openedReader.disconnect();
      });
    } catch {
      return { status: "live_read_unavailable" };
    } finally {
      await disconnectReader(reader);
      reading = false;
    }
  }

  async function withWatchAccess(run: (target: DebugTarget) => Promise<unknown> | unknown) {
    if (watching) {
      await onlineTarget();
      return { status: "busy" };
    }
    watching = true;
    try {
      const previous = watchSession;
      await watchCleanup;
      const target = await onlineTarget();
      if (!target || shutdown?.aborted || JSON.stringify(target) !== latestIdentity || (previous && previous !== watchSession)) {
        await watchCleanup;
        return { status: "online_context_changed" };
      }
      if (watchSession?.reader.hasActiveConnection === false) {
        closeWatches(watchSession);
        await watchCleanup;
        return { status: "live_read_unavailable" };
      }
      return await run(target);
    } catch {
      if (watchSession) closeWatches(watchSession);
      await watchCleanup;
      return { status: "live_read_unavailable" };
    } finally {
      watching = false;
    }
  }

  async function performWatchOperation(session: WatchSession, operation: () => Promise<PlcWatchSnapshot>) {
    try {
      session.pendingOperation = operation();
      const watch = await session.pendingOperation;
      session.pendingOperation = undefined;
      await onlineTarget();
      if (watchSession !== session) {
        await watchCleanup;
        return { status: "online_context_changed" };
      }
      if (session.reader.listWatches().length === 0) {
        closeWatches(session);
        await watchCleanup;
      }
      return { status: "succeeded", source: "ads_live", watch: watchSnapshot(watch) };
    } catch (error) {
      if (watchSession === session) throw error;
      await watchCleanup;
      return { status: "online_context_changed" };
    } finally {
      session.pendingOperation = undefined;
    }
  }

  return [
    {
      name: "plc_debug_state", title: "Bound PLC Debug State", inputSchema: emptyInput, annotations: readOnly,
      description: "Check whether the native Assistant confirms an approved Debug grant and its symbol scope for its already logged-in PLC project.",
      async execute(input) {
        emptyInput.parse(input);
        const target = await onlineTarget();
        return target ? target.symbolScope === "all"
          ? { status: "online", symbolScope: "all" }
          : { status: "online", symbols: target.symbols }
          : { status: "online_session_not_verified" };
      },
    },
    {
      name: "plc_debug_read", title: "Read Approved Live PLC Values", inputSchema: readInput, annotations: readOnly,
      description: "Read up to eight symbols permitted by the native Assistant's Debug grant from the bound online PLC. Values are observed individually, with a timestamp for each sample.",
      async execute(input) {
        const { symbols } = readInput.parse(input);
        return withReadAccess(symbols, async (target, reader, close) => {
          const identity = JSON.stringify(target);
          const values = [];
          for (const name of symbols) {
            if (JSON.stringify(await onlineTarget()) !== identity) return { status: "online_context_changed" };
            values.push(sample(name, await reader.readSymbol(name)));
          }
          await close();
          if (JSON.stringify(await onlineTarget()) !== identity) return { status: "online_context_changed" };
          return { status: "succeeded", source: "ads_live", values };
        });
      },
    },
    {
      name: "plc_debug_wait_until", title: "Wait for Approved Live PLC Values", inputSchema: waitInput, annotations: readOnly,
      description: "Wait up to 120 seconds for a condition over approved live PLC symbols, optionally requiring a continuous match.",
      async execute(input) {
        const args = waitInput.parse(input);
        const symbols = new Set<string>();
        inspectCondition(args.condition, symbols);
        return withReadAccess(symbols, async (target, reader, close) => {
          const identity = JSON.stringify(target);
          const controller = new AbortController();
          activeWait = { identity, controller };
          if (shutdown?.aborted) controller.abort();
          const monitor = monitorContext(2_000, onlineTarget);
          try {
            const result = await reader.waitUntil({
              condition: args.condition, timeoutMs: args.timeoutMs, stableForMs: args.stableForMs ?? 0,
              ...notificationOptions(args), signal: controller.signal,
            });
            await close();
            await monitor.stop();
            await onlineTarget();
            if (controller.signal.aborted) return { status: "online_context_changed" };
            const { status: waitStatus, conditionMatched, startedAt, completedAt, durationMs,
              timeoutMs, stableForMs, values } = result;
            return {
              status: "succeeded", source: "ads_live", waitStatus, conditionMatched, startedAt, completedAt,
              durationMs, timeoutMs, stableForMs,
              values: values.map(({ name, timestamp, value }) => {
                if (!symbols.has(name) || !Number.isFinite(Date.parse(timestamp))) throw new Error("Unexpected wait sample");
                return { symbol: name, observedAtUtc: timestamp, ...scalarValue(value) };
              }),
            };
          } catch (error) {
            await monitor.stop();
            if (controller.signal.aborted) return { status: "online_context_changed" };
            throw error;
          } finally {
            activeWait = undefined;
          }
        });
      },
    },
    {
      name: "plc_debug_watch", title: "Watch an Approved Live PLC Symbol", inputSchema: watchInput, annotations: readOnly,
      description: "Register or reuse a read-only watch for an approved live PLC symbol. The Debug session supports up to eight watches.",
      async execute(input) {
        const { name, ...options } = watchInput.parse(input);
        return withWatchAccess(async target => {
          if (!approved(target, [name])) return { status: "symbol_not_approved" };
          if (!watchSession) {
            const reader = openReader(target);
            const { timer } = monitorContext(3_000, async () => {
              await onlineTarget();
              if (watchSession?.reader === reader && !watchSession.pendingOperation && reader.hasActiveConnection === false)
                closeWatches(watchSession);
            });
            watchSession = { identity: JSON.stringify(target), reader, monitor: timer };
            watchContextChanged = false;
          }
          const session = watchSession;
          const watches = session.reader.listWatches();
          if (watches.length >= maxSymbols && !watches.some(watch => watch.name === name))
            return { status: "watch_limit_reached", maxWatches: maxSymbols };
          return performWatchOperation(session, () => session.reader.watchSymbol(name, {
            mode: options.mode ?? "on-change", ...notificationOptions(options),
          }));
        });
      },
    },
    {
      name: "plc_debug_unwatch", title: "Remove a Live PLC Watch", inputSchema: unwatchInput, annotations: readOnly,
      description: "Remove a live PLC watch from the Debug session.",
      async execute(input) {
        const { name } = unwatchInput.parse(input);
        return withWatchAccess(target => {
          if (watchContextChanged) return { status: "online_context_changed" };
          if (!approved(target, [name])) return { status: "symbol_not_approved" };
          const session = watchSession;
          if (session) return performWatchOperation(session, () => session.reader.unwatchSymbol(name));
          return { status: "succeeded", source: "ads_live", watch: { name, mode: "on-change",
            cycleTimeMs: DEFAULT_NOTIFICATION_CYCLE_TIME_MS, active: false } };
        });
      },
    },
    {
      name: "plc_debug_list_watches", title: "List Live PLC Watches", inputSchema: emptyInput, annotations: readOnly,
      description: "List live PLC watches and their latest available observations for the approved Debug session.",
      async execute(input) {
        emptyInput.parse(input);
        return withWatchAccess(() => {
          if (watchContextChanged) return { status: "online_context_changed" };
          const watches = watchSession?.reader.listWatches().map(watchSnapshot) ?? [];
          return { status: "succeeded", source: "ads_live", watches, count: watches.length };
        });
      },
    },
  ];
}
