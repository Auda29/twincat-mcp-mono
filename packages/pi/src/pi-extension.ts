import type { AgentMessage } from "@mariozechner/pi-agent-core";
import type {
  ExtensionAPI,
  ExtensionContext,
  ToolCallEventResult,
  ToolDefinition as PiToolDefinition,
} from "@mariozechner/pi-coding-agent";
import { Type, type TSchema } from "@sinclair/typebox";

import { createExtension, type ExtensionConfigInput } from "./index.js";
import {
  persistTargetConfigUpdate,
  resolvePiConfig,
  type ResolvedPiConfig,
} from "./pi-config.js";

type RegisteredExtension = Awaited<ReturnType<ReturnType<typeof createExtension>["register"]>>;
type RegisteredTool = RegisteredExtension["tools"][number];
type RegisteredHook = RegisteredExtension["hooks"][number];

const emptySchema = Type.Object({}, { additionalProperties: false });
const symbolNameSchema = Type.String({ minLength: 1 });
const axisRefSchema = Type.Union([
  Type.String({ minLength: 1 }),
  Type.Integer({ minimum: 1 }),
]);
const ioDataPointNameSchema = Type.String({ minLength: 1 });
const watchModeType = Type.Union([
  Type.Literal("on-change"),
  Type.Literal("cyclic"),
]);
const writeModeType = Type.Union([
  Type.Literal("read-only"),
  Type.Literal("enabled"),
]);
const diagnosticSeverityType = Type.Union([
  Type.Literal("critical"),
  Type.Literal("error"),
  Type.Literal("warning"),
  Type.Literal("info"),
  Type.Literal("verbose"),
  Type.Literal("unknown"),
]);
const diagnosticSeverityInputType = Type.Union([
  diagnosticSeverityType,
  Type.Array(diagnosticSeverityType, { minItems: 1, maxItems: 6 }),
]);
const engineeringProjectTypeType = Type.Union([
  Type.Literal("solution"),
  Type.Literal("sysManager"),
  Type.Literal("plc"),
  Type.Literal("hmi"),
  Type.Literal("unknown"),
]);
const engineeringTreeItemTypeType = Type.Union([
  Type.Literal("project"),
  Type.Literal("systemManager"),
  Type.Literal("io"),
  Type.Literal("device"),
  Type.Literal("box"),
  Type.Literal("terminal"),
  Type.Literal("task"),
  Type.Literal("xmlElement"),
  Type.Literal("unknown"),
]);
const engineeringPlcObjectKindType = Type.Union([
  Type.Literal("program"),
  Type.Literal("functionBlock"),
  Type.Literal("function"),
  Type.Literal("gvl"),
  Type.Literal("dut"),
  Type.Literal("interface"),
  Type.Literal("method"),
  Type.Literal("action"),
  Type.Literal("property"),
  Type.Literal("unknown"),
]);
const engineeringIssueSeverityType = Type.Union([
  Type.Literal("error"),
  Type.Literal("warning"),
  Type.Literal("info"),
]);
const engineeringIssueSeverityInputType = Type.Union([
  engineeringIssueSeverityType,
  Type.Array(engineeringIssueSeverityType, { minItems: 1, maxItems: 3 }),
]);
const engineeringOutputChannelType = Type.Union([
  Type.Literal("build"),
  Type.Literal("engineering"),
]);
const engineeringHmiArtifactKindType = Type.Union([
  Type.Literal("view"),
  Type.Literal("control"),
  Type.Literal("userControl"),
  Type.Literal("content"),
  Type.Literal("unknown"),
]);

function textContent(text: string) {
  return [{ type: "text" as const, text }];
}

function formatValue(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function formatWarningMessages(warnings: Array<{ message?: string }>): string {
  const messages = warnings
    .map((warning) => warning.message)
    .filter((message): message is string => message !== undefined && message.length > 0);

  return messages.length === 0 ? "" : `: ${messages.join(" ")}`;
}

function formatSnapshotLine(snapshot: {
  name: string;
  value: unknown;
  type: string;
  timestamp: string;
}): string {
  return `- ${snapshot.name} = ${formatValue(snapshot.value)} (${snapshot.type}) @ ${snapshot.timestamp}`;
}

function formatAdsStateSummary(state: {
  plcRuntimeStatus?: {
    adsState: number;
    adsStateName: string;
    deviceState: number;
    isRun: boolean;
    isStop: boolean;
  };
  plcRuntimeState?: string | {
    adsState: number;
    adsStateStr?: string;
    deviceState: number;
  };
}): string {
  if (state.plcRuntimeStatus !== undefined) {
    const status = state.plcRuntimeStatus;
    return `${status.adsStateName} (adsState=${status.adsState}, deviceState=${status.deviceState})`;
  }

  if (
    state.plcRuntimeState &&
    typeof state.plcRuntimeState === "object" &&
    "adsState" in state.plcRuntimeState
  ) {
    const runtimeState = state.plcRuntimeState;
    return `${runtimeState.adsStateStr ?? `ADS state ${runtimeState.adsState}`} (adsState=${runtimeState.adsState}, deviceState=${runtimeState.deviceState})`;
  }

  return String(state.plcRuntimeState ?? "unknown");
}

function formatBootstrapSummary(summary: {
  state: {
    adsState: string;
    plcRuntimeState?: string | {
      adsState: number;
      adsStateStr?: string;
      deviceState: number;
    };
    plcRuntimeStatus?: {
      adsState: number;
      adsStateName: string;
      deviceState: number;
      isRun: boolean;
      isStop: boolean;
    };
    writeMode: string;
    watchCount: number;
    writePolicy: {
      configReadOnly: boolean;
      runtimeWriteEnabled: boolean;
      allowlistCount: number;
    };
  };
  snapshots: Array<{
    name: string;
    value: unknown;
    type: string;
    timestamp: string;
  }>;
  failedSnapshots: string[];
  watches: Array<{ name: string }>;
}): string {
  const lines = [
    "TwinCAT ADS bootstrap context:",
    `- ADS state: ${summary.state.adsState}`,
    `- PLC runtime state: ${formatAdsStateSummary(summary.state)}`,
    `- Runtime write mode: ${summary.state.writeMode}`,
    `- Active watches: ${summary.state.watchCount}`,
    `- Config read-only: ${summary.state.writePolicy.configReadOnly}`,
    `- Runtime writes enabled: ${summary.state.writePolicy.runtimeWriteEnabled}`,
    `- Write allowlist size: ${summary.state.writePolicy.allowlistCount}`,
  ];

  if (summary.snapshots.length > 0) {
    lines.push("- Snapshot symbols:");
    lines.push(...summary.snapshots.map(formatSnapshotLine));
  }

  if (summary.failedSnapshots.length > 0) {
    lines.push(
      `- Snapshot read failures: ${summary.failedSnapshots.join(", ")}`,
    );
  }

  if (summary.watches.length > 0) {
    lines.push(`- Registered watches: ${summary.watches.map((watch) => watch.name).join(", ")}`);
  }

  lines.push(
    "Treat this as live PLC telemetry. Verify state with plc_state/plc_read before making any write decisions.",
  );

  return lines.join("\n");
}

function formatTurnContext(context: {
  snapshots: Array<{
    name: string;
    value: unknown;
    type: string;
    timestamp: string;
  }>;
  failedSnapshots: string[];
  watchCount: number;
  writeMode: {
    writeMode: string;
    writesAllowed: boolean;
    message: string;
  };
}): string {
  const lines = [
    "System-generated PLC turn context:",
    `- Runtime write mode: ${context.writeMode.writeMode}`,
    `- Writes allowed right now: ${context.writeMode.writesAllowed}`,
    `- Write gate message: ${context.writeMode.message}`,
    `- Active watch count: ${context.watchCount}`,
  ];

  if (context.snapshots.length > 0) {
    lines.push("- Live snapshots:");
    lines.push(...context.snapshots.map(formatSnapshotLine));
  }

  if (context.failedSnapshots.length > 0) {
    lines.push(
      `- Snapshot read failures: ${context.failedSnapshots.join(", ")}`,
    );
  }

  return lines.join("\n");
}

export function formatToolSuccess(toolName: string, data: unknown): string {
  if (toolName === "plc_read") {
    const result = (data as { result: { name: string; value: unknown; type: string; timestamp: string } }).result;
    return `Read ${result.name} = ${formatValue(result.value)} (${result.type}) @ ${result.timestamp}`;
  }

  if (toolName === "plc_read_many") {
    const result = data as { count: number };
    return `Read ${result.count} PLC symbols successfully.`;
  }

  if (toolName === "plc_list_symbols") {
    const result = data as { count: number };
    return `Listed ${result.count} PLC symbols.`;
  }

  if (toolName === "plc_describe_symbol") {
    const result = data as { symbol: { name: string; type: string; size: number } };
    return `Symbol ${result.symbol.name}: ${result.symbol.type}, ${result.symbol.size} bytes.`;
  }

  if (toolName === "plc_list_groups") {
    const result = data as { count: number };
    return `Listed ${result.count} PLC symbol groups.`;
  }

  if (toolName === "plc_read_group") {
    const result = data as { group: { group: string; count: number } };
    return `Read PLC group ${result.group.group} with ${result.group.count} symbols.`;
  }

  if (toolName === "plc_state") {
    const result = data as {
      adsState: string;
      plcRuntimeState?: string | {
        adsState: number;
        adsStateStr?: string;
        deviceState: number;
      };
      plcRuntimeStatus?: {
        adsState: number;
        adsStateName: string;
        deviceState: number;
        isRun: boolean;
        isStop: boolean;
      };
      writeMode: string;
      watchCount: number;
    };
    return `ADS=${result.adsState}, PLC=${formatAdsStateSummary(result)}, writeMode=${result.writeMode}, watches=${result.watchCount}`;
  }

  if (toolName === "nc_state") {
    const result = data as {
      adsState: string;
      ncRuntimeStatus?: {
        adsState: number;
        adsStateName: string;
        deviceState: number;
      };
      axes: unknown[];
    };
    const ncState =
      result.ncRuntimeStatus === undefined
        ? "unknown"
        : `${result.ncRuntimeStatus.adsStateName} (adsState=${result.ncRuntimeStatus.adsState}, deviceState=${result.ncRuntimeStatus.deviceState})`;
    return `ADS=${result.adsState}, NC=${ncState}, configured axes=${result.axes.length}`;
  }

  if (toolName === "nc_list_axes") {
    const result = data as {
      count: number;
      axes: Array<{
        name: string;
        id: number;
        targetAdsPort?: number;
        description?: string;
      }>;
    };
    if (result.axes.length === 0) {
      return "Listed 0 configured NC axes.";
    }

    const axes = result.axes
      .map((axis) => {
        const port =
          axis.targetAdsPort === undefined ? "" : `, port ${axis.targetAdsPort}`;
        const description =
          axis.description === undefined ? "" : `, ${axis.description}`;
        return `${axis.name} (id ${axis.id}${port}${description})`;
      })
      .join("; ");
    return `Listed ${result.count} configured NC axes: ${axes}.`;
  }

  if (toolName === "nc_read_axis") {
    const result = data as {
      result: {
        axis: { name: string; id: number };
        online: { actualPosition: number; actualVelocity: number };
        errorCode: number;
        warnings?: unknown[];
        timestamp: string;
      };
    };
    const warnings =
      result.result.warnings === undefined || result.result.warnings.length === 0
        ? ""
        : `, warnings=${result.result.warnings.length}`;
    return `NC axis ${result.result.axis.name} (id ${result.result.axis.id}) position=${result.result.online.actualPosition}, velocity=${result.result.online.actualVelocity}, error=${result.result.errorCode}${warnings} @ ${result.result.timestamp}`;
  }

  if (toolName === "nc_read_axis_position") {
    const result = data as {
      position: {
        axis: { name: string; id: number };
        online: { actualPosition: number; actualVelocity: number };
        timestamp: string;
      };
    };
    return `NC axis ${result.position.axis.name} (id ${result.position.axis.id}) position=${result.position.online.actualPosition}, velocity=${result.position.online.actualVelocity} @ ${result.position.timestamp}`;
  }

  if (toolName === "nc_read_axis_status") {
    const result = data as {
      status: {
        axis: { name: string; id: number };
        status: Record<string, boolean>;
        warnings?: Array<{ message?: string }>;
        timestamp: string;
      };
    };
    const activeFlags = Object.entries(result.status.status)
      .filter(([, value]) => value)
      .map(([key]) => key);
    const warningMessages = result.status.warnings ?? [];
    const warningCount = warningMessages.length;
    const status =
      activeFlags.length === 0 && warningCount >= Object.keys(result.status.status).length
        ? "unavailable"
        : activeFlags.length === 0
          ? "no active flags"
          : activeFlags.join(", ");
    const warnings =
      warningCount === 0
        ? ""
        : `, warnings=${warningCount}${formatWarningMessages(warningMessages)}`;
    return `NC axis ${result.status.axis.name} (id ${result.status.axis.id}) status=${status}${warnings} @ ${result.status.timestamp}`;
  }

  if (toolName === "nc_read_axis_many") {
    const result = data as { count: number };
    return `Read ${result.count} NC axes successfully.`;
  }

  if (toolName === "nc_read_error") {
    const result = data as {
      error: {
        axis: { name: string; id: number };
        errorCode: number;
        hasError: boolean;
        timestamp: string;
      };
    };
    return `NC axis ${result.error.axis.name} (id ${result.error.axis.id}) error=${result.error.errorCode}, hasError=${result.error.hasError} @ ${result.error.timestamp}`;
  }

  if (toolName === "io_list_groups") {
    const result = data as { count: number; dataPoints: unknown[] };
    return `Listed ${result.count} IO groups and ${result.dataPoints.length} configured IO data points.`;
  }

  if (toolName === "io_read") {
    const result = data as {
      result: {
        dataPoint: { name: string; type: string };
        value: unknown;
        timestamp: string;
      };
    };
    return `Read IO ${result.result.dataPoint.name} = ${formatValue(result.result.value)} (${result.result.dataPoint.type}) @ ${result.result.timestamp}`;
  }

  if (toolName === "io_read_many") {
    const result = data as { count: number };
    return `Read ${result.count} IO data points successfully.`;
  }

  if (toolName === "io_read_group") {
    const result = data as { group: { group: string; count: number } };
    return `Read IO group ${result.group.group} with ${result.group.count} data points.`;
  }

  if (toolName === "tc_state") {
    const result = data as {
      adsState: string;
      services: unknown[];
      plc: { available: boolean };
      nc: { available: boolean };
      diagnostics: { eventSources: unknown[]; logSources: unknown[] };
    };
    return `TwinCAT ADS=${result.adsState}, services=${result.services.length}, PLC available=${result.plc.available}, NC available=${result.nc.available}, event sources=${result.diagnostics.eventSources.length}, log sources=${result.diagnostics.logSources.length}.`;
  }

  if (toolName === "tc_event_list") {
    const result = data as {
      available: boolean;
      count: number;
      source: string | null;
      capability: { reason?: string };
    };
    return result.available
      ? `Listed ${result.count} TwinCAT events from ${result.source ?? "default source"}.`
      : `TwinCAT events unavailable: ${result.capability.reason ?? "no source available"}.`;
  }

  if (toolName === "tc_runtime_error_list") {
    const result = data as {
      available: boolean;
      count: number;
      source: string | null;
      capability: { reason?: string };
    };
    return result.available
      ? `Listed ${result.count} TwinCAT runtime errors from ${result.source ?? "default source"}.`
      : `TwinCAT runtime errors unavailable: ${result.capability.reason ?? "no source available"}.`;
  }

  if (toolName === "tc_log_read") {
    const result = data as {
      available: boolean;
      bytesRead: number;
      source: string | null;
      truncated: boolean;
      capability: { reason?: string };
    };
    return result.available
      ? `Read ${result.bytesRead} bytes from ${result.source ?? "default log source"} (truncated=${result.truncated}).`
      : `TwinCAT runtime log unavailable: ${result.capability.reason ?? "no source available"}.`;
  }

  if (toolName === "tc_diagnose_errors") {
    const result = data as {
      summary: {
        runtimeErrorCount: number;
        recentEventCount: number;
        logBytesRead: number;
        runtimeErrorsAvailable: boolean;
        recentEventsAvailable: boolean;
        runtimeLogAvailable: boolean;
        truncated: {
          runtimeErrors: boolean;
          recentEvents: boolean;
          runtimeLog: boolean;
        };
      };
    };
    return `TwinCAT error diagnostic: errors=${result.summary.runtimeErrorCount} (available=${result.summary.runtimeErrorsAvailable}, truncated=${result.summary.truncated.runtimeErrors}), events=${result.summary.recentEventCount} (available=${result.summary.recentEventsAvailable}, truncated=${result.summary.truncated.recentEvents}), logBytes=${result.summary.logBytesRead} (available=${result.summary.runtimeLogAvailable}, truncated=${result.summary.truncated.runtimeLog}).`;
  }

  if (toolName === "tc_diagnose_runtime") {
    const result = data as {
      summary: {
        adsState: string;
        plcAvailable: boolean;
        ncAvailable: boolean;
        ioAvailable: boolean;
        configuredIoDataPoints: number;
        configuredIoGroups: number;
        runtimeErrorCount: number;
        runtimeErrorsAvailable: boolean;
      };
    };
    return `TwinCAT runtime diagnostic: ADS=${result.summary.adsState}, PLC available=${result.summary.plcAvailable}, NC available=${result.summary.ncAvailable}, IO available=${result.summary.ioAvailable}, IO data points=${result.summary.configuredIoDataPoints}, IO groups=${result.summary.configuredIoGroups}, runtime errors=${result.summary.runtimeErrorCount} (available=${result.summary.runtimeErrorsAvailable}).`;
  }

  if (toolName === "plc_watch") {
    const result = data as { watch: { name: string; notificationHandle: number } };
    return `Watch active for ${result.watch.name} (handle ${result.watch.notificationHandle}).`;
  }

  if (toolName === "plc_unwatch") {
    const result = data as { watch: { name: string; active: boolean } };
    return `Watch ${result.watch.name} is now active=${result.watch.active}.`;
  }

  if (toolName === "plc_list_watches") {
    const result = data as { count: number };
    return `There are ${result.count} registered PLC watches.`;
  }

  if (toolName === "plc_wait_until") {
    const result = data as { status: string; durationMs: number };
    return `PLC wait completed with status ${result.status} after ${result.durationMs} ms.`;
  }

  if (toolName === "plc_set_write_mode") {
    const result = data as { message: string };
    return result.message;
  }

  if (toolName === "plc_write") {
    const result = (data as {
      result: { name: string; value: unknown; type: string; timestamp: string };
    }).result;
    return `Wrote ${result.name} = ${formatValue(result.value)} (${result.type}) @ ${result.timestamp}`;
  }

  return JSON.stringify(data, null, 2);
}

async function getInternalTool(
  registration: RegisteredExtension,
  toolName: string,
): Promise<RegisteredTool> {
  const tool = registration.tools.find((candidate) => candidate.name === toolName);
  if (!tool) {
    throw new Error(`Internal tool "${toolName}" is not registered.`);
  }

  return tool;
}

async function getInternalHook(
  registration: RegisteredExtension,
  hookName: string,
): Promise<RegisteredHook> {
  const hook = registration.hooks.find((candidate) => candidate.name === hookName);
  if (!hook) {
    throw new Error(`Internal hook "${hookName}" is not registered.`);
  }

  return hook;
}

type ToolSpec = {
  name: string;
  label: string;
  description: string;
  parameters: TSchema;
};

const toolSpecs: ToolSpec[] = [
  {
    name: "plc_set_target",
    label: "PLC Target",
    description:
      "Persist the target AMS Net ID and optional ADS port in the active PLC config file.",
    parameters: Type.Object(
      {
        targetAmsNetId: Type.String({ minLength: 1 }),
        targetAdsPort: Type.Optional(
          Type.Integer({ minimum: 1, maximum: 65_535 }),
        ),
      },
      { additionalProperties: false },
    ),
  },
  {
    name: "plc_list_symbols",
    label: "PLC Symbols",
    description: "List available PLC symbols with metadata.",
    parameters: Type.Object(
      {
        filter: Type.Optional(Type.String({ minLength: 1 })),
      },
      { additionalProperties: false },
    ),
  },
  {
    name: "plc_describe_symbol",
    label: "PLC Describe Symbol",
    description:
      "Describe a PLC symbol including type, size, metadata, arrays and struct members when available.",
    parameters: Type.Object(
      {
        name: symbolNameSchema,
      },
      { additionalProperties: false },
    ),
  },
  {
    name: "plc_set_write_mode",
    label: "PLC Write Mode",
    description:
      "Enable or disable PLC writes for the current session runtime gate.",
    parameters: Type.Object(
      {
        mode: writeModeType,
      },
      { additionalProperties: false },
    ),
  },
  {
    name: "plc_read",
    label: "PLC Read",
    description: "Read a PLC symbol by name.",
    parameters: Type.Object(
      {
        name: symbolNameSchema,
      },
      { additionalProperties: false },
    ),
  },
  {
    name: "plc_read_many",
    label: "PLC Read Many",
    description: "Read multiple PLC symbols using a bundled ADS request.",
    parameters: Type.Object(
      {
        names: Type.Array(symbolNameSchema, {
          minItems: 1,
          maxItems: 100,
        }),
      },
      { additionalProperties: false },
    ),
  },
  {
    name: "plc_list_groups",
    label: "PLC Groups",
    description: "List configured PLC symbol groups.",
    parameters: emptySchema,
  },
  {
    name: "plc_read_group",
    label: "PLC Read Group",
    description: "Read all symbols from a configured PLC symbol group.",
    parameters: Type.Object(
      {
        group: Type.String({ minLength: 1 }),
      },
      { additionalProperties: false },
    ),
  },
  {
    name: "nc_state",
    label: "NC State",
    description: "Inspect NC ADS connection and runtime state.",
    parameters: emptySchema,
  },
  {
    name: "nc_list_axes",
    label: "NC Axes",
    description: "List configured NC axes.",
    parameters: emptySchema,
  },
  {
    name: "nc_read_axis",
    label: "NC Read Axis",
    description:
      "Read configured NC axis online state, status flags, position, velocity, and error code. Returns available data with warnings when optional status or error fields cannot be read.",
    parameters: Type.Object(
      {
        axis: axisRefSchema,
      },
      { additionalProperties: false },
    ),
  },
  {
    name: "nc_read_axis_position",
    label: "NC Axis Position",
    description:
      "Read only the configured NC axis online position and velocity state.",
    parameters: Type.Object(
      {
        axis: axisRefSchema,
      },
      { additionalProperties: false },
    ),
  },
  {
    name: "nc_read_axis_status",
    label: "NC Axis Status",
    description:
      "Read only configured NC axis status flags such as ready, referenced, in-position, and busy.",
    parameters: Type.Object(
      {
        axis: axisRefSchema,
      },
      { additionalProperties: false },
    ),
  },
  {
    name: "nc_read_axis_many",
    label: "NC Read Axes",
    description: "Read multiple configured NC axes.",
    parameters: Type.Object(
      {
        axes: Type.Array(axisRefSchema, {
          minItems: 1,
          maxItems: 64,
        }),
      },
      { additionalProperties: false },
    ),
  },
  {
    name: "nc_read_error",
    label: "NC Read Error",
    description: "Read the current error code for a configured NC axis.",
    parameters: Type.Object(
      {
        axis: axisRefSchema,
      },
      { additionalProperties: false },
    ),
  },
  {
    name: "io_list_groups",
    label: "IO Groups",
    description: "List configured IO groups and data points.",
    parameters: emptySchema,
  },
  {
    name: "io_read",
    label: "IO Read",
    description: "Read a configured IO data point by ADS indexGroup/indexOffset.",
    parameters: Type.Object(
      {
        name: ioDataPointNameSchema,
      },
      { additionalProperties: false },
    ),
  },
  {
    name: "io_read_many",
    label: "IO Read Many",
    description: "Read multiple configured IO data points with one ADS sum read.",
    parameters: Type.Object(
      {
        names: Type.Array(ioDataPointNameSchema, {
          minItems: 1,
          maxItems: 250,
        }),
      },
      { additionalProperties: false },
    ),
  },
  {
    name: "io_read_group",
    label: "IO Read Group",
    description: "Read all configured IO data points in an IO group.",
    parameters: Type.Object(
      {
        group: Type.String({ minLength: 1 }),
      },
      { additionalProperties: false },
    ),
  },
  {
    name: "tc_state",
    label: "TwinCAT State",
    description:
      "Inspect compact TwinCAT-wide ADS, PLC, NC, and diagnostics capability state.",
    parameters: emptySchema,
  },
  {
    name: "tc_event_list",
    label: "TwinCAT Events",
    description:
      "List recent TwinCAT runtime events from a configured diagnostic source.",
    parameters: Type.Object(
      {
        source: Type.Optional(Type.String({ minLength: 1 })),
        limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 500 })),
        since: Type.Optional(Type.String({ minLength: 1 })),
        until: Type.Optional(Type.String({ minLength: 1 })),
        severity: Type.Optional(diagnosticSeverityInputType),
        contains: Type.Optional(Type.String({ minLength: 1 })),
        id: Type.Optional(
          Type.Union([
            Type.Integer({ minimum: 0 }),
            Type.Array(Type.Integer({ minimum: 0 }), {
              minItems: 1,
              maxItems: 100,
            }),
          ]),
        ),
      },
      { additionalProperties: false },
    ),
  },
  {
    name: "tc_runtime_error_list",
    label: "TwinCAT Runtime Errors",
    description:
      "List recent critical/error TwinCAT runtime events from a configured diagnostic source.",
    parameters: Type.Object(
      {
        source: Type.Optional(Type.String({ minLength: 1 })),
        limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 500 })),
        since: Type.Optional(Type.String({ minLength: 1 })),
        until: Type.Optional(Type.String({ minLength: 1 })),
        severity: Type.Optional(diagnosticSeverityInputType),
        contains: Type.Optional(Type.String({ minLength: 1 })),
        id: Type.Optional(
          Type.Union([
            Type.Integer({ minimum: 0 }),
            Type.Array(Type.Integer({ minimum: 0 }), {
              minItems: 1,
              maxItems: 100,
            }),
          ]),
        ),
      },
      { additionalProperties: false },
    ),
  },
  {
    name: "tc_log_read",
    label: "TwinCAT Runtime Log",
    description:
      "Read bounded runtime log text from a configured diagnostic source.",
    parameters: Type.Object(
      {
        source: Type.Optional(Type.String({ minLength: 1 })),
        limitBytes: Type.Optional(
          Type.Integer({ minimum: 1_024, maximum: 1_048_576 }),
        ),
        tailLines: Type.Optional(
          Type.Integer({ minimum: 1, maximum: 5_000 }),
        ),
        since: Type.Optional(Type.String({ minLength: 1 })),
        severity: Type.Optional(diagnosticSeverityInputType),
        contains: Type.Optional(Type.String({ minLength: 1 })),
      },
      { additionalProperties: false },
    ),
  },
  {
    name: "tc_diagnose_errors",
    label: "TwinCAT Error Diagnostic",
    description:
      "Run a small bounded TwinCAT error diagnostic: runtime errors, recent events, and runtime log tail.",
    parameters: Type.Object(
      {
        eventSource: Type.Optional(Type.String({ minLength: 1 })),
        logSource: Type.Optional(Type.String({ minLength: 1 })),
        limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 })),
        logLimitBytes: Type.Optional(
          Type.Integer({ minimum: 1_024, maximum: 65_536 }),
        ),
        logTailLines: Type.Optional(
          Type.Integer({ minimum: 1, maximum: 500 }),
        ),
        since: Type.Optional(Type.String({ minLength: 1 })),
        until: Type.Optional(Type.String({ minLength: 1 })),
        severity: Type.Optional(diagnosticSeverityInputType),
        contains: Type.Optional(Type.String({ minLength: 1 })),
        id: Type.Optional(
          Type.Union([
            Type.Integer({ minimum: 0 }),
            Type.Array(Type.Integer({ minimum: 0 }), {
              minItems: 1,
              maxItems: 100,
            }),
          ]),
        ),
      },
      { additionalProperties: false },
    ),
  },
  {
    name: "tc_diagnose_runtime",
    label: "TwinCAT Runtime Diagnostic",
    description:
      "Run a small bounded TwinCAT runtime diagnostic: TC state, PLC state, NC state, IO config state, and active runtime errors.",
    parameters: Type.Object(
      {
        eventSource: Type.Optional(Type.String({ minLength: 1 })),
        limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 })),
        since: Type.Optional(Type.String({ minLength: 1 })),
        until: Type.Optional(Type.String({ minLength: 1 })),
        contains: Type.Optional(Type.String({ minLength: 1 })),
      },
      { additionalProperties: false },
    ),
  },
  {
    name: "tc_list_workbenches",
    label: "TwinCAT Engineering Workbenches",
    description:
      "List configured TwinCAT engineering workbenches and backend capabilities.",
    parameters: emptySchema,
  },
  {
    name: "tc_list_projects",
    label: "TwinCAT Engineering Projects",
    description:
      "List read-only TwinCAT engineering projects from configured project files.",
    parameters: Type.Object(
      {
        workbenchId: Type.Optional(Type.String({ minLength: 1 })),
        type: Type.Optional(engineeringProjectTypeType),
      },
      { additionalProperties: false },
    ),
  },
  {
    name: "tc_project_state",
    label: "TwinCAT Engineering Project State",
    description:
      "Describe read-only TwinCAT engineering project files, type, backend source, and live-connection availability.",
    parameters: Type.Object(
      {
        project: Type.Optional(Type.String({ minLength: 1 })),
      },
      { additionalProperties: false },
    ),
  },
  {
    name: "tc_build_project",
    label: "TwinCAT Build Project",
    description:
      "Build a configured TwinCAT/XAE engineering project when a live build backend is available.",
    parameters: Type.Object(
      {
        project: Type.Optional(Type.String({ minLength: 1 })),
        target: Type.Optional(Type.String({ minLength: 1 })),
        timeoutMs: Type.Optional(
          Type.Integer({ minimum: 1_000, maximum: 3_600_000 }),
        ),
      },
      { additionalProperties: false },
    ),
  },
  {
    name: "plc_build_project",
    label: "PLC Build Project",
    description:
      "Build a configured PLC engineering project when it can be addressed separately by the active backend.",
    parameters: Type.Object(
      {
        project: Type.Optional(Type.String({ minLength: 1 })),
        target: Type.Optional(Type.String({ minLength: 1 })),
        timeoutMs: Type.Optional(
          Type.Integer({ minimum: 1_000, maximum: 3_600_000 }),
        ),
      },
      { additionalProperties: false },
    ),
  },
  {
    name: "tc_build_and_get_errors",
    label: "TwinCAT Build And Get Errors",
    description:
      "Run a bounded TwinCAT build and return structured engineering errors and warnings.",
    parameters: Type.Object(
      {
        project: Type.Optional(Type.String({ minLength: 1 })),
        target: Type.Optional(Type.String({ minLength: 1 })),
        timeoutMs: Type.Optional(
          Type.Integer({ minimum: 1_000, maximum: 3_600_000 }),
        ),
        limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 250 })),
      },
      { additionalProperties: false },
    ),
  },
  {
    name: "tc_error_list",
    label: "TwinCAT Engineering Errors",
    description:
      "List bounded engineering, compiler, or parser errors and warnings from the active engineering backend.",
    parameters: Type.Object(
      {
        project: Type.Optional(Type.String({ minLength: 1 })),
        severity: Type.Optional(engineeringIssueSeverityInputType),
        limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 250 })),
      },
      { additionalProperties: false },
    ),
  },
  {
    name: "tc_error_context",
    label: "TwinCAT Engineering Error Context",
    description:
      "Resolve one engineering error to bounded source-file context when location data is available.",
    parameters: Type.Object(
      {
        error: Type.Optional(Type.String({ minLength: 1 })),
        file: Type.Optional(Type.String({ minLength: 1 })),
        line: Type.Optional(Type.Integer({ minimum: 1 })),
        project: Type.Optional(Type.String({ minLength: 1 })),
        contextLines: Type.Optional(Type.Integer({ minimum: 0, maximum: 20 })),
      },
      { additionalProperties: false },
    ),
  },
  {
    name: "tc_output_read",
    label: "TwinCAT Engineering Output",
    description:
      "Read bounded build or engineering output from the active engineering backend.",
    parameters: Type.Object(
      {
        project: Type.Optional(Type.String({ minLength: 1 })),
        channel: Type.Optional(engineeringOutputChannelType),
        contains: Type.Optional(Type.String({ minLength: 1 })),
        limitBytes: Type.Optional(
          Type.Integer({ minimum: 1_024, maximum: 1_048_576 }),
        ),
        tailLines: Type.Optional(Type.Integer({ minimum: 1, maximum: 5_000 })),
      },
      { additionalProperties: false },
    ),
  },
  {
    name: "tc_resource_read",
    label: "TwinCAT Engineering Resource Read",
    description:
      "Dereference bounded TwinCAT engineering resource URIs such as plcc, err, io, tcfile, and tcfolder.",
    parameters: Type.Object(
      {
        uri: Type.String({ minLength: 1 }),
        limitBytes: Type.Optional(
          Type.Integer({ minimum: 1_024, maximum: 1_048_576 }),
        ),
        contextLines: Type.Optional(Type.Integer({ minimum: 0, maximum: 20 })),
      },
      { additionalProperties: false },
    ),
  },
  {
    name: "hmi_state",
    label: "HMI State",
    description:
      "Inspect read-only HMI engineering project state, inferred ports, and preview availability.",
    parameters: Type.Object(
      {
        project: Type.Optional(Type.String({ minLength: 1 })),
      },
      { additionalProperties: false },
    ),
  },
  {
    name: "hmi_list_projects",
    label: "HMI Projects",
    description: "List configured HMI engineering projects from project files.",
    parameters: Type.Object(
      {
        project: Type.Optional(Type.String({ minLength: 1 })),
      },
      { additionalProperties: false },
    ),
  },
  {
    name: "hmi_preview_info",
    label: "HMI Preview Info",
    description:
      "Describe whether a configured HMI project has enough live backend information for preview.",
    parameters: Type.Object(
      {
        project: Type.Optional(Type.String({ minLength: 1 })),
      },
      { additionalProperties: false },
    ),
  },
  {
    name: "hmi_list_controls",
    label: "HMI Controls",
    description:
      "List HMI view, control, user-control, and content artifacts referenced by configured HMI project files.",
    parameters: Type.Object(
      {
        project: Type.Optional(Type.String({ minLength: 1 })),
        kind: Type.Optional(engineeringHmiArtifactKindType),
        limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 250 })),
      },
      { additionalProperties: false },
    ),
  },
  {
    name: "tc_tree_read",
    label: "TwinCAT Tree Read",
    description:
      "Read one TwinCAT/System Manager tree item from configured project files.",
    parameters: Type.Object(
      {
        path: Type.String({ minLength: 1 }),
        project: Type.Optional(Type.String({ minLength: 1 })),
      },
      { additionalProperties: false },
    ),
  },
  {
    name: "tc_tree_search",
    label: "TwinCAT Tree Search",
    description:
      "Search TwinCAT/System Manager tree items by text, name, type, comment, or project.",
    parameters: Type.Object(
      {
        query: Type.Optional(Type.String({ minLength: 1 })),
        name: Type.Optional(Type.String({ minLength: 1 })),
        type: Type.Optional(engineeringTreeItemTypeType),
        comment: Type.Optional(Type.String({ minLength: 1 })),
        project: Type.Optional(Type.String({ minLength: 1 })),
        limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 250 })),
      },
      { additionalProperties: false },
    ),
  },
  {
    name: "tc_tree_describe_item",
    label: "TwinCAT Tree Describe Item",
    description:
      "Describe a TwinCAT/System Manager tree item with settings and children.",
    parameters: Type.Object(
      {
        path: Type.String({ minLength: 1 }),
        project: Type.Optional(Type.String({ minLength: 1 })),
      },
      { additionalProperties: false },
    ),
  },
  {
    name: "io_list_topology",
    label: "I/O List Topology",
    description:
      "List read-only I/O topology from configured TwinCAT engineering project files.",
    parameters: Type.Object(
      {
        project: Type.Optional(Type.String({ minLength: 1 })),
      },
      { additionalProperties: false },
    ),
  },
  {
    name: "io_describe_device",
    label: "I/O Describe Device",
    description:
      "Describe one read-only I/O device and its boxes and terminals from engineering project files.",
    parameters: Type.Object(
      {
        device: Type.String({ minLength: 1 }),
        project: Type.Optional(Type.String({ minLength: 1 })),
      },
      { additionalProperties: false },
    ),
  },
  {
    name: "io_describe_terminal",
    label: "I/O Describe Terminal",
    description:
      "Describe one read-only I/O terminal from configured TwinCAT engineering project files.",
    parameters: Type.Object(
      {
        terminal: Type.String({ minLength: 1 }),
        project: Type.Optional(Type.String({ minLength: 1 })),
      },
      { additionalProperties: false },
    ),
  },
  {
    name: "plc_list_pous",
    label: "PLC List POUs",
    description:
      "List read-only PLC objects such as programs, function blocks, functions, GVLs, DUTs, interfaces, methods, actions, and properties from configured PLC projects.",
    parameters: Type.Object(
      {
        project: Type.Optional(Type.String({ minLength: 1 })),
        kind: Type.Optional(engineeringPlcObjectKindType),
      },
      { additionalProperties: false },
    ),
  },
  {
    name: "plc_read_pou",
    label: "PLC Read POU",
    description:
      "Read declaration and implementation text for one configured PLC object.",
    parameters: Type.Object(
      {
        pou: Type.String({ minLength: 1 }),
        project: Type.Optional(Type.String({ minLength: 1 })),
      },
      { additionalProperties: false },
    ),
  },
  {
    name: "plc_search_code",
    label: "PLC Search Code",
    description:
      "Search declaration and implementation text across configured PLC objects with bounded results.",
    parameters: Type.Object(
      {
        query: Type.String({ minLength: 1 }),
        project: Type.Optional(Type.String({ minLength: 1 })),
        kind: Type.Optional(engineeringPlcObjectKindType),
        limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 250 })),
      },
      { additionalProperties: false },
    ),
  },
  {
    name: "plc_describe_pou",
    label: "PLC Describe POU",
    description:
      "Describe one configured PLC object with kind, source path, and declaration/implementation previews.",
    parameters: Type.Object(
      {
        pou: Type.String({ minLength: 1 }),
        project: Type.Optional(Type.String({ minLength: 1 })),
      },
      { additionalProperties: false },
    ),
  },
  {
    name: "plc_list_libraries",
    label: "PLC List Libraries",
    description: "List read-only PLC library references from configured PLC projects.",
    parameters: Type.Object(
      {
        project: Type.Optional(Type.String({ minLength: 1 })),
      },
      { additionalProperties: false },
    ),
  },
  {
    name: "plc_describe_library",
    label: "PLC Describe Library",
    description: "Describe one PLC library reference from configured PLC projects.",
    parameters: Type.Object(
      {
        library: Type.String({ minLength: 1 }),
        project: Type.Optional(Type.String({ minLength: 1 })),
      },
      { additionalProperties: false },
    ),
  },
  {
    name: "plc_watch",
    label: "PLC Watch",
    description: "Register or reuse a PLC notification watch for a symbol.",
    parameters: Type.Object(
      {
        name: symbolNameSchema,
        mode: Type.Optional(watchModeType),
        cycleTimeMs: Type.Optional(
          Type.Integer({ minimum: 10, maximum: 60_000 }),
        ),
        maxDelayMs: Type.Optional(
          Type.Integer({ minimum: 0, maximum: 60_000 }),
        ),
      },
      { additionalProperties: false },
    ),
  },
  {
    name: "plc_unwatch",
    label: "PLC Unwatch",
    description: "Remove a previously registered PLC watch by symbol name.",
    parameters: Type.Object(
      {
        name: symbolNameSchema,
      },
      { additionalProperties: false },
    ),
  },
  {
    name: "plc_list_watches",
    label: "PLC Watches",
    description: "List currently registered PLC watches for this session.",
    parameters: emptySchema,
  },
  {
    name: "plc_wait_until",
    label: "PLC Wait Until",
    description:
      "Wait for PLC symbol conditions to become true, optionally requiring a stable duration.",
    parameters: Type.Object(
      {
        condition: Type.Any(),
        timeoutMs: Type.Integer({ minimum: 1, maximum: 3_600_000 }),
        stableForMs: Type.Optional(
          Type.Integer({ minimum: 0, maximum: 3_600_000 }),
        ),
        cycleTimeMs: Type.Optional(
          Type.Integer({ minimum: 10, maximum: 60_000 }),
        ),
        maxDelayMs: Type.Optional(
          Type.Integer({ minimum: 0, maximum: 60_000 }),
        ),
      },
      { additionalProperties: false },
    ),
  },
  {
    name: "plc_write",
    label: "PLC Write",
    description:
      "Write a PLC symbol when config and runtime write gates permit it.",
    parameters: Type.Object(
      {
        name: symbolNameSchema,
        value: Type.Any(),
      },
      { additionalProperties: false },
    ),
  },
  {
    name: "plc_state",
    label: "PLC State",
    description: "Inspect TwinCAT runtime and ADS connection state.",
    parameters: emptySchema,
  },
];

async function runHook<TOutput>(
  registration: RegisteredExtension,
  hookName: string,
  input: unknown,
): Promise<TOutput> {
  const hook = await getInternalHook(registration, hookName);
  const execute = hook.execute as (rawInput: unknown) => Promise<unknown>;
  const result = (await execute(input)) as Awaited<ReturnType<RegisteredHook["execute"]>>;

  if (!result.ok) {
    throw new Error(`[${hookName}] ${result.error.message}`);
  }

  return result.data as TOutput;
}

function buildContextMessage(content: string) {
  const message: AgentMessage = {
    role: "user",
    content,
    timestamp: Date.now(),
  };

  return message;
}

function setStatus(ctx: ExtensionContext, message: string | undefined): void {
  ctx.ui.setStatus("plc-ads", message);
}

export default function piTwinCatAdsExtension(pi: ExtensionAPI): void {
  pi.registerFlag("plc-config", {
    description:
      "Path to a pi-twincat-ads JSON config file, or an inline JSON string.",
    type: "string",
  });

  let registrationPromise: Promise<RegisteredExtension> | undefined;
  let activeResolvedConfig: ResolvedPiConfig | undefined;

  const loadResolvedConfig = async (): Promise<ResolvedPiConfig> => {
    const plcConfigFlag = pi.getFlag("plc-config");
    const resolveOptions = {
      cwd: process.cwd(),
    } as {
      cwd: string;
      flagValue?: string;
      envPath?: string;
      envJson?: string;
    };

    if (typeof plcConfigFlag === "string") {
      resolveOptions.flagValue = plcConfigFlag;
    }

    if (process.env.PI_TWINCAT_ADS_CONFIG !== undefined) {
      resolveOptions.envPath = process.env.PI_TWINCAT_ADS_CONFIG;
    }

    if (process.env.PI_TWINCAT_ADS_CONFIG_JSON !== undefined) {
      resolveOptions.envJson = process.env.PI_TWINCAT_ADS_CONFIG_JSON;
    }

    const resolved = await resolvePiConfig(resolveOptions);

    activeResolvedConfig = resolved;
    return resolved;
  };

  const resetRegistration = async (): Promise<void> => {
    if (!registrationPromise) {
      return;
    }

    const registration = await getRegistration();
    await runHook(registration, "session_end", {});
    registrationPromise = undefined;
  };

  const getRegistration = async (): Promise<RegisteredExtension> => {
    if (!registrationPromise) {
      registrationPromise = (async () => {
        const resolvedConfig = await loadResolvedConfig();
        const extension = createExtension(resolvedConfig.config);
        return extension.register();
      })().catch((error) => {
        registrationPromise = undefined;
        throw error;
      });
    }

    return registrationPromise;
  };

  for (const spec of toolSpecs) {
    const tool: PiToolDefinition<TSchema, unknown> = {
      name: spec.name,
      label: spec.label,
      description: spec.description,
      parameters: spec.parameters,
      async execute(toolCallId, params, signal, _onUpdate, _ctx) {
        if (spec.name === "plc_set_target") {
          const resolvedConfig = activeResolvedConfig ?? (await loadResolvedConfig());

          if (!resolvedConfig.configPath) {
            throw new Error(
              "The active PLC config was provided as inline JSON and cannot be updated persistently. Use a plc.config.json file instead.",
            );
          }

          const input = params as {
            targetAmsNetId: string;
            targetAdsPort?: number;
          };
          const updateOptions = {
            configPath: resolvedConfig.configPath,
            targetAmsNetId: input.targetAmsNetId,
          } as {
            configPath: string;
            targetAmsNetId: string;
            targetAdsPort?: number;
          };

          if (input.targetAdsPort !== undefined) {
            updateOptions.targetAdsPort = input.targetAdsPort;
          }

          const nextConfig = await persistTargetConfigUpdate(updateOptions);

          await resetRegistration();

          return {
            content: textContent(
              `Persisted PLC target ${nextConfig.targetAmsNetId}:${nextConfig.targetAdsPort} in ${resolvedConfig.configPath}.`,
            ),
            details: {
              configPath: resolvedConfig.configPath,
              targetAmsNetId: nextConfig.targetAmsNetId,
              targetAdsPort: nextConfig.targetAdsPort,
            },
          };
        }

        const registration = await getRegistration();
        const internalTool = await getInternalTool(registration, spec.name);
        const execute = internalTool.execute as (
          rawInput: unknown,
          signal?: AbortSignal,
        ) => Promise<unknown>;
        const result = (await execute(params, signal)) as Awaited<
          ReturnType<RegisteredTool["execute"]>
        >;

        if (!result.ok) {
          const error = new Error(result.error.message);
          Object.assign(error, { code: result.error.code });
          throw error;
        }

        return {
          content: textContent(formatToolSuccess(spec.name, result.data)),
          details: result.data,
        };
      },
    };

    pi.registerTool(tool);
  }

  pi.on("session_start", async (_event, ctx) => {
    const registration = await getRegistration();
    const result = await runHook<{
      state: {
        adsState: string;
        plcRuntimeState?: string | {
          adsState: number;
          adsStateStr?: string;
          deviceState: number;
        };
        plcRuntimeStatus?: {
          adsState: number;
          adsStateName: string;
          deviceState: number;
          isRun: boolean;
          isStop: boolean;
        };
      };
      snapshotCount: number;
      failedSnapshots: string[];
    }>(registration, "session_start", {});

    const status = `ADS ${result.state.adsState}, PLC ${formatAdsStateSummary(result.state)}, snapshots ${result.snapshotCount}`;
    setStatus(ctx, status);

    if (result.failedSnapshots.length > 0) {
      ctx.ui.notify(
        `PLC snapshot reads failed: ${result.failedSnapshots.join(", ")}`,
        "warning",
      );
    }
  });

  pi.on("before_agent_start", async (event) => {
    const registration = await getRegistration();
    const result = await runHook<{
      summary: {
        state: {
          adsState: string;
          plcRuntimeState?: string | {
            adsState: number;
            adsStateStr?: string;
            deviceState: number;
          };
          plcRuntimeStatus?: {
            adsState: number;
            adsStateName: string;
            deviceState: number;
            isRun: boolean;
            isStop: boolean;
          };
          writeMode: string;
          watchCount: number;
          writePolicy: {
            configReadOnly: boolean;
            runtimeWriteEnabled: boolean;
            allowlistCount: number;
          };
        };
        snapshots: Array<{
          name: string;
          value: unknown;
          type: string;
          timestamp: string;
        }>;
        failedSnapshots: string[];
        watches: Array<{ name: string }>;
      };
    }>(registration, "before_agent_start", {});

    return {
      systemPrompt: `${event.systemPrompt}\n\n${formatBootstrapSummary(result.summary)}`,
    };
  });

  pi.on("context", async (event) => {
    const registration = await getRegistration();
    const result = await runHook<{
      context: {
        snapshots: Array<{
          name: string;
          value: unknown;
          type: string;
          timestamp: string;
        }>;
        failedSnapshots: string[];
        watchCount: number;
        writeMode: {
          writeMode: string;
          writesAllowed: boolean;
          message: string;
        };
      };
    }>(registration, "context", {});

    const contextMessage = buildContextMessage(
      formatTurnContext(result.context),
    );

    return {
      messages: [...event.messages, contextMessage],
    };
  });

  pi.on("tool_call", async (event): Promise<ToolCallEventResult | void> => {
    const registration = await getRegistration();
    const result = await runHook<{
      allow: boolean;
      requiresConfirmation: boolean;
      reason?: string;
    }>(registration, "tool_call", {
      toolName: event.toolName,
      arguments: event.input,
    });

    if (result.allow) {
      return;
    }

    return {
      block: true,
      reason: result.reason ?? `Tool call ${event.toolName} was blocked.`,
    };
  });

  pi.on("session_shutdown", async (_event, ctx) => {
    if (!registrationPromise) {
      return;
    }

    const registration = await getRegistration();
    await runHook(registration, "session_end", {});
    setStatus(ctx, undefined);
  });
}
