import { z } from "zod";

import {
  WriteDeniedError,
  type EngineeringListProjectsResult,
  type EngineeringListWorkbenchesResult,
  type EngineeringIoDescribeDeviceResult,
  type EngineeringIoDescribeTerminalResult,
  type EngineeringIoListTopologyResult,
  type EngineeringProjectStateResult,
  type EngineeringProjectTypeConfig,
  type EngineeringTreeDescribeItemResult,
  type EngineeringTreeItemType,
  type EngineeringTreeReadResult,
  type EngineeringTreeSearchResult,
  type IoListGroupsResult,
  type IoReadGroupResult,
  type IoReadManyResult,
  type IoReadResult,
  type NcAxisErrorResult,
  type NcAxisPositionResult,
  type NcAxisReadManyResult,
  type NcAxisReadResult,
  type NcAxisStatusResult,
  type NcAxisSummary,
  type NcStateResult,
  type PlcReadGroupResult,
  type PlcReadResult,
  type PlcStateResult,
  type PlcSymbolDescription,
  type PlcSymbolGroupSummary,
  type PlcSymbolSummary,
  type PlcWatchMode,
  type PlcWatchSnapshot,
  type PlcWaitUntilResult,
  type PlcWriteModeResult,
  type RuntimeErrorListResult,
  type RuntimeEventListResult,
  type RuntimeLogReadResult,
  type TwinCatDiagnoseErrorsResult,
  type TwinCatDiagnoseRuntimeResult,
  type TwinCatStateResult,
  type TwinCatAdsRuntime,
} from "twincat-mcp-core";

const symbolNameSchema = z
  .string()
  .trim()
  .min(1, "Symbol name must not be empty.");

const watchModeSchema = z.enum(["on-change", "cyclic"]);

const listSymbolsInputSchema = z
  .object({
    filter: z.string().trim().min(1).optional(),
  })
  .strict();

const readInputSchema = z
  .object({
    name: symbolNameSchema,
  })
  .strict();
const describeSymbolInputSchema = readInputSchema;

const readManyInputSchema = z
  .object({
    names: z
      .array(symbolNameSchema)
      .min(1, "At least one PLC symbol is required.")
      .max(100, "At most 100 PLC symbols can be read at once."),
  })
  .strict();

const readGroupInputSchema = z
  .object({
    group: z.string().trim().min(1, "PLC symbol group must not be empty."),
  })
  .strict();

const axisRefSchema = z.union([
  z.string().trim().min(1, "NC axis must not be empty."),
  z.number().int().min(1, "NC axis id must be at least 1."),
]);

const ncReadAxisInputSchema = z
  .object({
    axis: axisRefSchema,
  })
  .strict();

const ncReadAxisManyInputSchema = z
  .object({
    axes: z
      .array(axisRefSchema)
      .min(1, "At least one NC axis is required.")
      .max(64, "At most 64 NC axes can be read at once."),
  })
  .strict();

const ioDataPointNameSchema = z
  .string()
  .trim()
  .min(1, "IO data point name must not be empty.");

const ioReadInputSchema = z
  .object({
    name: ioDataPointNameSchema,
  })
  .strict();

const ioReadManyInputSchema = z
  .object({
    names: z
      .array(ioDataPointNameSchema)
      .min(1, "At least one IO data point is required.")
      .max(250, "At most 250 IO data points can be read at once."),
  })
  .strict();

const ioReadGroupInputSchema = z
  .object({
    group: z.string().trim().min(1, "IO group must not be empty."),
  })
  .strict();

const stateInputSchema = z.object({}).strict();

const engineeringProjectTypeSchema = z.enum([
  "solution",
  "sysManager",
  "plc",
  "hmi",
  "unknown",
]);

const engineeringTreeItemTypeSchema = z.enum([
  "project",
  "systemManager",
  "io",
  "device",
  "box",
  "terminal",
  "task",
  "xmlElement",
  "unknown",
]);

const diagnosticSeveritySchema = z.enum([
  "critical",
  "error",
  "warning",
  "info",
  "verbose",
  "unknown",
]);

const diagnosticSeverityInputSchema = z.union([
  diagnosticSeveritySchema,
  z
    .array(diagnosticSeveritySchema)
    .min(1, "At least one severity is required.")
    .max(6, "At most 6 severities are supported."),
]);

const diagnosticDateTimeSchema = z
  .string()
  .trim()
  .min(1)
  .refine(
    (value) => !Number.isNaN(Date.parse(value)),
    "Date/time must be parseable.",
  );

const diagnosticSourceInputSchema = z
  .string()
  .trim()
  .min(1, "Diagnostic source must not be empty.");

const tcEventListInputSchema = z
  .object({
    source: diagnosticSourceInputSchema.optional(),
    limit: z
      .number()
      .int()
      .min(1, "Event limit must be at least 1.")
      .max(500, "Event limit must be 500 or lower.")
      .optional(),
    since: diagnosticDateTimeSchema.optional(),
    until: diagnosticDateTimeSchema.optional(),
    severity: diagnosticSeverityInputSchema.optional(),
    contains: z.string().trim().min(1).optional(),
    id: z
      .union([
        z.number().int().min(0),
        z.array(z.number().int().min(0)).min(1).max(100),
      ])
      .optional(),
  })
  .strict();

const tcLogReadInputSchema = z
  .object({
    source: diagnosticSourceInputSchema.optional(),
    limitBytes: z
      .number()
      .int()
      .min(1_024, "Log byte limit must be at least 1024 bytes.")
      .max(1_048_576, "Log byte limit must be 1048576 bytes or lower.")
      .optional(),
    tailLines: z
      .number()
      .int()
      .min(1, "Tail line limit must be at least 1.")
      .max(5_000, "Tail line limit must be 5000 or lower.")
      .optional(),
    since: diagnosticDateTimeSchema.optional(),
    severity: diagnosticSeverityInputSchema.optional(),
    contains: z.string().trim().min(1).optional(),
  })
  .strict();

const tcDiagnoseErrorsInputSchema = z
  .object({
    eventSource: diagnosticSourceInputSchema.optional(),
    logSource: diagnosticSourceInputSchema.optional(),
    limit: z
      .number()
      .int()
      .min(1, "Diagnostic event limit must be at least 1.")
      .max(100, "Diagnostic event limit must be 100 or lower.")
      .optional(),
    logLimitBytes: z
      .number()
      .int()
      .min(1_024, "Diagnostic log byte limit must be at least 1024 bytes.")
      .max(65_536, "Diagnostic log byte limit must be 65536 bytes or lower.")
      .optional(),
    logTailLines: z
      .number()
      .int()
      .min(1, "Diagnostic log tail line limit must be at least 1.")
      .max(500, "Diagnostic log tail line limit must be 500 or lower.")
      .optional(),
    since: diagnosticDateTimeSchema.optional(),
    until: diagnosticDateTimeSchema.optional(),
    severity: diagnosticSeverityInputSchema.optional(),
    contains: z.string().trim().min(1).optional(),
    id: z
      .union([
        z.number().int().min(0),
        z.array(z.number().int().min(0)).min(1).max(100),
      ])
      .optional(),
  })
  .strict();

const tcDiagnoseRuntimeInputSchema = z
  .object({
    eventSource: diagnosticSourceInputSchema.optional(),
    limit: z
      .number()
      .int()
      .min(1, "Runtime error limit must be at least 1.")
      .max(100, "Runtime error limit must be 100 or lower.")
      .optional(),
    since: diagnosticDateTimeSchema.optional(),
    until: diagnosticDateTimeSchema.optional(),
    contains: z.string().trim().min(1).optional(),
  })
  .strict();

const tcListProjectsInputSchema = z
  .object({
    workbenchId: z.string().trim().min(1).optional(),
    type: engineeringProjectTypeSchema.optional(),
  })
  .strict();

const tcProjectStateInputSchema = z
  .object({
    project: z.string().trim().min(1).optional(),
  })
  .strict();

const tcTreeReadInputSchema = z
  .object({
    path: z.string().trim().min(1, "TwinCAT tree path must not be empty."),
    project: z.string().trim().min(1).optional(),
  })
  .strict();

const tcTreeSearchInputSchema = z
  .object({
    query: z.string().trim().min(1).optional(),
    name: z.string().trim().min(1).optional(),
    type: engineeringTreeItemTypeSchema.optional(),
    comment: z.string().trim().min(1).optional(),
    project: z.string().trim().min(1).optional(),
    limit: z
      .number()
      .int()
      .min(1, "Tree search limit must be at least 1.")
      .max(250, "Tree search limit must be 250 or lower.")
      .optional(),
  })
  .strict();

const ioListTopologyInputSchema = z
  .object({
    project: z.string().trim().min(1).optional(),
  })
  .strict();

const ioDescribeDeviceInputSchema = z
  .object({
    device: z.string().trim().min(1, "I/O device must not be empty."),
    project: z.string().trim().min(1).optional(),
  })
  .strict();

const ioDescribeTerminalInputSchema = z
  .object({
    terminal: z.string().trim().min(1, "I/O terminal must not be empty."),
    project: z.string().trim().min(1).optional(),
  })
  .strict();

const writeInputSchema = z
  .object({
    name: symbolNameSchema,
    value: z.unknown(),
  })
  .strict();

const setWriteModeInputSchema = z
  .object({
    mode: z.enum(["read-only", "enabled"]),
  })
  .strict();

const watchInputSchema = z
  .object({
    name: symbolNameSchema,
    mode: watchModeSchema.optional(),
    cycleTimeMs: z
      .number()
      .int()
      .min(10, "Watch cycle time must be at least 10 ms.")
      .max(60_000, "Watch cycle time must be 60000 ms or lower.")
      .optional(),
    maxDelayMs: z
      .number()
      .int()
      .min(0, "Watch max delay must be 0 ms or higher.")
      .max(60_000, "Watch max delay must be 60000 ms or lower.")
      .optional(),
  })
  .strict();

const unwatchInputSchema = z
  .object({
    name: symbolNameSchema,
  })
  .strict();

const listWatchesInputSchema = z.object({}).strict();

const waitComparisonOperatorSchema = z.enum([
  "equals",
  "notEquals",
  "greaterThan",
  "greaterThanOrEquals",
  "lessThan",
  "lessThanOrEquals",
]);
type WaitConditionInput =
  | {
      readonly name: string;
      readonly operator: z.infer<typeof waitComparisonOperatorSchema>;
      readonly value?: unknown;
    }
  | { readonly allOf: readonly WaitConditionInput[] }
  | { readonly anyOf: readonly WaitConditionInput[] };
const waitConditionSchema: z.ZodType<WaitConditionInput> = z.lazy(() =>
  z.union([
    z
      .object({
        name: symbolNameSchema,
        operator: waitComparisonOperatorSchema,
        value: z.unknown(),
      })
      .strict(),
    z
      .object({
        allOf: z
          .array(waitConditionSchema)
          .min(1, "allOf must contain at least one condition."),
      })
      .strict(),
    z
      .object({
        anyOf: z
          .array(waitConditionSchema)
          .min(1, "anyOf must contain at least one condition."),
      })
      .strict(),
  ]),
);
const waitUntilInputSchema = z
  .object({
    condition: waitConditionSchema,
    timeoutMs: z
      .number()
      .int()
      .min(1, "Wait timeout must be at least 1 ms.")
      .max(3_600_000, "Wait timeout must be 3600000 ms or lower."),
    stableForMs: z
      .number()
      .int()
      .min(0, "Stable duration must be 0 ms or higher.")
      .max(3_600_000, "Stable duration must be 3600000 ms or lower.")
      .optional(),
    cycleTimeMs: z
      .number()
      .int()
      .min(10, "Watch cycle time must be at least 10 ms.")
      .max(60_000, "Watch cycle time must be 60000 ms or lower.")
      .optional(),
    maxDelayMs: z
      .number()
      .int()
      .min(0, "Watch max delay must be 0 ms or higher.")
      .max(60_000, "Watch max delay must be 60000 ms or lower.")
      .optional(),
  })
  .strict();

export interface ToolHandlerContext {
  readonly runtime: TwinCatAdsRuntime;
  readonly signal?: AbortSignal;
}

export interface ToolSuccessResult<TOutput> {
  readonly ok: true;
  readonly data: TOutput;
}

export interface ToolFailureResult {
  readonly ok: false;
  readonly error: {
    readonly message: string;
    readonly code:
      | "TOOL_INPUT_INVALID"
      | "PLC_OPERATION_FAILED"
      | "WRITE_DENIED";
  };
}

export type ToolExecutionResult<TOutput> =
  | ToolSuccessResult<TOutput>
  | ToolFailureResult;

export interface ToolDefinition<TInput, TOutput> {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: z.ZodType<TInput>;
  execute(
    rawInput: unknown,
    context: ToolHandlerContext,
  ): Promise<ToolExecutionResult<TOutput>>;
}

export interface PlcStateToolOutput extends PlcStateResult {}
export interface PlcListSymbolsToolOutput {
  readonly symbols: PlcSymbolSummary[];
  readonly count: number;
}
export interface PlcDescribeSymbolToolOutput {
  readonly symbol: PlcSymbolDescription;
}
export interface PlcReadToolOutput {
  readonly result: PlcReadResult;
}
export interface PlcReadManyToolOutput {
  readonly results: PlcReadResult[];
  readonly count: number;
}
export interface PlcListGroupsToolOutput {
  readonly groups: PlcSymbolGroupSummary[];
  readonly count: number;
}
export interface PlcReadGroupToolOutput {
  readonly group: PlcReadGroupResult;
}
export interface NcStateToolOutput extends NcStateResult {}
export interface NcListAxesToolOutput {
  readonly axes: NcAxisSummary[];
  readonly count: number;
}
export interface NcReadAxisToolOutput {
  readonly result: NcAxisReadResult;
}
export interface NcReadAxisPositionToolOutput {
  readonly position: NcAxisPositionResult;
}
export interface NcReadAxisStatusToolOutput {
  readonly status: NcAxisStatusResult;
}
export interface NcReadAxisManyToolOutput extends NcAxisReadManyResult {}
export interface NcReadErrorToolOutput {
  readonly error: NcAxisErrorResult;
}
export interface IoListGroupsToolOutput extends IoListGroupsResult {}
export interface IoReadToolOutput {
  readonly result: IoReadResult;
}
export interface IoReadManyToolOutput extends IoReadManyResult {}
export interface IoReadGroupToolOutput {
  readonly group: IoReadGroupResult;
}
export interface TcStateToolOutput extends TwinCatStateResult {}
export interface TcEventListToolOutput extends RuntimeEventListResult {}
export interface TcRuntimeErrorListToolOutput extends RuntimeErrorListResult {}
export interface TcLogReadToolOutput extends RuntimeLogReadResult {}
export interface TcDiagnoseErrorsToolOutput extends TwinCatDiagnoseErrorsResult {}
export interface TcDiagnoseRuntimeToolOutput extends TwinCatDiagnoseRuntimeResult {}
export interface TcListWorkbenchesToolOutput
  extends EngineeringListWorkbenchesResult {}
export interface TcListProjectsToolOutput extends EngineeringListProjectsResult {}
export interface TcProjectStateToolOutput extends EngineeringProjectStateResult {}
export interface TcTreeReadToolOutput extends EngineeringTreeReadResult {}
export interface TcTreeSearchToolOutput extends EngineeringTreeSearchResult {}
export interface TcTreeDescribeItemToolOutput
  extends EngineeringTreeDescribeItemResult {}
export interface IoListTopologyToolOutput
  extends EngineeringIoListTopologyResult {}
export interface IoDescribeDeviceToolOutput
  extends EngineeringIoDescribeDeviceResult {}
export interface IoDescribeTerminalToolOutput
  extends EngineeringIoDescribeTerminalResult {}
export interface PlcWriteToolOutput {
  readonly result: {
    readonly name: string;
    readonly value: unknown;
    readonly type: string;
    readonly timestamp: string;
  };
}
export interface PlcSetWriteModeToolOutput extends PlcWriteModeResult {}
export interface PlcWatchToolOutput {
  readonly watch: PlcWatchSnapshot;
}
export interface PlcUnwatchToolOutput {
  readonly watch: PlcWatchSnapshot;
}
export interface PlcListWatchesToolOutput {
  readonly watches: PlcWatchSnapshot[];
  readonly count: number;
}
export interface PlcWaitUntilToolOutput extends PlcWaitUntilResult {}

function normalizeToolError(error: unknown): ToolFailureResult {
  if (error instanceof z.ZodError) {
    return {
      ok: false,
      error: {
        code: "TOOL_INPUT_INVALID",
        message: error.issues.map((issue) => issue.message).join("; "),
      },
    };
  }

  if (error instanceof WriteDeniedError) {
    return {
      ok: false,
      error: {
        code: "WRITE_DENIED",
        message: error.message,
      },
    };
  }

  if (
    error &&
    typeof error === "object" &&
    "code" in error &&
    error.code === "WRITE_DENIED" &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    return {
      ok: false,
      error: {
        code: "WRITE_DENIED",
        message: error.message,
      },
    };
  }

  return {
    ok: false,
    error: {
      code: "PLC_OPERATION_FAILED",
      message: error instanceof Error ? error.message : String(error),
    },
  };
}

function createToolDefinition<TInput, TOutput>(options: {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: z.ZodType<TInput>;
  readonly handler: (
    input: TInput,
    context: ToolHandlerContext,
  ) => Promise<TOutput>;
}): ToolDefinition<TInput, TOutput> {
  return {
    name: options.name,
    description: options.description,
    inputSchema: options.inputSchema,
    async execute(rawInput, context) {
      try {
        const input = options.inputSchema.parse(rawInput);
        const data = await options.handler(input, context);
        return {
          ok: true,
          data,
        };
      } catch (error) {
        return normalizeToolError(error);
      }
    },
  };
}

export function createToolDefinitions(): Array<
  | ToolDefinition<z.infer<typeof listSymbolsInputSchema>, PlcListSymbolsToolOutput>
  | ToolDefinition<
      z.infer<typeof describeSymbolInputSchema>,
      PlcDescribeSymbolToolOutput
    >
  | ToolDefinition<z.infer<typeof readInputSchema>, PlcReadToolOutput>
  | ToolDefinition<z.infer<typeof readManyInputSchema>, PlcReadManyToolOutput>
  | ToolDefinition<z.infer<typeof readGroupInputSchema>, PlcReadGroupToolOutput>
  | ToolDefinition<z.infer<typeof ncReadAxisInputSchema>, NcReadAxisToolOutput>
  | ToolDefinition<
      z.infer<typeof ncReadAxisInputSchema>,
      NcReadAxisPositionToolOutput
    >
  | ToolDefinition<
      z.infer<typeof ncReadAxisInputSchema>,
      NcReadAxisStatusToolOutput
    >
  | ToolDefinition<
      z.infer<typeof ncReadAxisManyInputSchema>,
      NcReadAxisManyToolOutput
    >
  | ToolDefinition<z.infer<typeof ncReadAxisInputSchema>, NcReadErrorToolOutput>
  | ToolDefinition<z.infer<typeof ioReadInputSchema>, IoReadToolOutput>
  | ToolDefinition<z.infer<typeof ioReadManyInputSchema>, IoReadManyToolOutput>
  | ToolDefinition<z.infer<typeof ioReadGroupInputSchema>, IoReadGroupToolOutput>
  | ToolDefinition<z.infer<typeof stateInputSchema>, NcStateToolOutput>
  | ToolDefinition<z.infer<typeof stateInputSchema>, NcListAxesToolOutput>
  | ToolDefinition<z.infer<typeof stateInputSchema>, IoListGroupsToolOutput>
  | ToolDefinition<z.infer<typeof stateInputSchema>, PlcListGroupsToolOutput>
  | ToolDefinition<z.infer<typeof stateInputSchema>, TcStateToolOutput>
  | ToolDefinition<z.infer<typeof tcEventListInputSchema>, TcEventListToolOutput>
  | ToolDefinition<
      z.infer<typeof tcEventListInputSchema>,
      TcRuntimeErrorListToolOutput
    >
  | ToolDefinition<z.infer<typeof tcLogReadInputSchema>, TcLogReadToolOutput>
  | ToolDefinition<
      z.infer<typeof tcDiagnoseErrorsInputSchema>,
      TcDiagnoseErrorsToolOutput
    >
  | ToolDefinition<
      z.infer<typeof tcDiagnoseRuntimeInputSchema>,
      TcDiagnoseRuntimeToolOutput
    >
  | ToolDefinition<z.infer<typeof stateInputSchema>, TcListWorkbenchesToolOutput>
  | ToolDefinition<
      z.infer<typeof tcListProjectsInputSchema>,
      TcListProjectsToolOutput
    >
  | ToolDefinition<
      z.infer<typeof tcProjectStateInputSchema>,
      TcProjectStateToolOutput
    >
  | ToolDefinition<z.infer<typeof tcTreeReadInputSchema>, TcTreeReadToolOutput>
  | ToolDefinition<
      z.infer<typeof tcTreeSearchInputSchema>,
      TcTreeSearchToolOutput
    >
  | ToolDefinition<
      z.infer<typeof tcTreeReadInputSchema>,
      TcTreeDescribeItemToolOutput
    >
  | ToolDefinition<
      z.infer<typeof ioListTopologyInputSchema>,
      IoListTopologyToolOutput
    >
  | ToolDefinition<
      z.infer<typeof ioDescribeDeviceInputSchema>,
      IoDescribeDeviceToolOutput
    >
  | ToolDefinition<
      z.infer<typeof ioDescribeTerminalInputSchema>,
      IoDescribeTerminalToolOutput
    >
  | ToolDefinition<z.infer<typeof stateInputSchema>, PlcStateToolOutput>
  | ToolDefinition<z.infer<typeof writeInputSchema>, PlcWriteToolOutput>
  | ToolDefinition<
      z.infer<typeof setWriteModeInputSchema>,
      PlcSetWriteModeToolOutput
    >
  | ToolDefinition<z.infer<typeof watchInputSchema>, PlcWatchToolOutput>
  | ToolDefinition<z.infer<typeof unwatchInputSchema>, PlcUnwatchToolOutput>
  | ToolDefinition<
      z.infer<typeof listWatchesInputSchema>,
      PlcListWatchesToolOutput
    >
  | ToolDefinition<z.infer<typeof waitUntilInputSchema>, PlcWaitUntilToolOutput>
> {
  return [
    createToolDefinition({
      name: "plc_list_symbols",
      description: "List available PLC symbols with metadata.",
      inputSchema: listSymbolsInputSchema,
      handler: async (input, context) => {
        const symbols = await context.runtime.listSymbols(
          input.filter === undefined ? {} : { filter: input.filter },
        );
        return {
          symbols,
          count: symbols.length,
        };
      },
    }),
    createToolDefinition({
      name: "plc_describe_symbol",
      description:
        "Describe a PLC symbol including type, size, metadata, arrays and struct members when available.",
      inputSchema: describeSymbolInputSchema,
      handler: async (input, context) => ({
        symbol: await context.runtime.describeSymbol(input),
      }),
    }),
    createToolDefinition({
      name: "plc_set_write_mode",
      description:
        "Enable or disable PLC writes for the current session runtime gate.",
      inputSchema: setWriteModeInputSchema,
      handler: async (input, context) => context.runtime.setWriteMode(input),
    }),
    createToolDefinition({
      name: "plc_read",
      description: "Read a PLC symbol by name.",
      inputSchema: readInputSchema,
      handler: async (input, context) => {
        const result = await context.runtime.readSymbol(input);
        return { result };
      },
    }),
    createToolDefinition({
      name: "plc_read_many",
      description: "Read multiple PLC symbols using a bundled ADS request.",
      inputSchema: readManyInputSchema,
      handler: async (input, context) => {
        const results = await context.runtime.readMany(input);
        return {
          results,
          count: results.length,
        };
      },
    }),
    createToolDefinition({
      name: "plc_list_groups",
      description: "List configured PLC symbol groups.",
      inputSchema: stateInputSchema,
      handler: async (_input, context) => {
        const groups = context.runtime.listGroups();
        return {
          groups,
          count: groups.length,
        };
      },
    }),
    createToolDefinition({
      name: "plc_read_group",
      description: "Read all symbols from a configured PLC symbol group.",
      inputSchema: readGroupInputSchema,
      handler: async (input, context) => ({
        group: await context.runtime.readGroup(input),
      }),
    }),
    createToolDefinition({
      name: "nc_state",
      description: "Inspect NC ADS connection and runtime state.",
      inputSchema: stateInputSchema,
      handler: async (_input, context) => context.runtime.ncState(),
    }),
    createToolDefinition({
      name: "nc_list_axes",
      description: "List configured NC axes.",
      inputSchema: stateInputSchema,
      handler: async (_input, context) => {
        const axes = context.runtime.ncListAxes();
        return {
          axes,
          count: axes.length,
        };
      },
    }),
    createToolDefinition({
      name: "nc_read_axis",
      description:
        "Read configured NC axis online state, status flags, position, velocity, and error code. Returns available data with warnings when optional status or error fields cannot be read.",
      inputSchema: ncReadAxisInputSchema,
      handler: async (input, context) => ({
        result: await context.runtime.ncReadAxis(input),
      }),
    }),
    createToolDefinition({
      name: "nc_read_axis_position",
      description:
        "Read only the configured NC axis online position and velocity state.",
      inputSchema: ncReadAxisInputSchema,
      handler: async (input, context) => ({
        position: await context.runtime.ncReadAxisPosition(input),
      }),
    }),
    createToolDefinition({
      name: "nc_read_axis_status",
      description:
        "Read only configured NC axis status flags such as ready, referenced, in-position, and busy.",
      inputSchema: ncReadAxisInputSchema,
      handler: async (input, context) => ({
        status: await context.runtime.ncReadAxisStatus(input),
      }),
    }),
    createToolDefinition({
      name: "nc_read_axis_many",
      description: "Read multiple configured NC axes.",
      inputSchema: ncReadAxisManyInputSchema,
      handler: async (input, context) => context.runtime.ncReadAxisMany(input),
    }),
    createToolDefinition({
      name: "nc_read_error",
      description: "Read the current error code for a configured NC axis.",
      inputSchema: ncReadAxisInputSchema,
      handler: async (input, context) => ({
        error: await context.runtime.ncReadError(input),
      }),
    }),
    createToolDefinition({
      name: "io_list_groups",
      description: "List configured IO groups and data points.",
      inputSchema: stateInputSchema,
      handler: async (_input, context) => context.runtime.ioListGroups(),
    }),
    createToolDefinition({
      name: "io_read",
      description: "Read a configured IO data point by ADS indexGroup/indexOffset.",
      inputSchema: ioReadInputSchema,
      handler: async (input, context) => ({
        result: await context.runtime.ioRead(input),
      }),
    }),
    createToolDefinition({
      name: "io_read_many",
      description: "Read multiple configured IO data points with one ADS sum read.",
      inputSchema: ioReadManyInputSchema,
      handler: async (input, context) => context.runtime.ioReadMany(input),
    }),
    createToolDefinition({
      name: "io_read_group",
      description: "Read all configured IO data points in an IO group.",
      inputSchema: ioReadGroupInputSchema,
      handler: async (input, context) => ({
        group: await context.runtime.ioReadGroup(input),
      }),
    }),
    createToolDefinition({
      name: "tc_state",
      description:
        "Inspect compact TwinCAT-wide ADS, PLC, NC, and diagnostics capability state.",
      inputSchema: stateInputSchema,
      handler: async (_input, context) => context.runtime.tcState(),
    }),
    createToolDefinition({
      name: "tc_event_list",
      description:
        "List recent TwinCAT runtime events from a configured diagnostic source.",
      inputSchema: tcEventListInputSchema,
      handler: async (input, context) => context.runtime.tcEventList(input),
    }),
    createToolDefinition({
      name: "tc_runtime_error_list",
      description:
        "List recent critical/error TwinCAT runtime events from a configured diagnostic source.",
      inputSchema: tcEventListInputSchema,
      handler: async (input, context) =>
        context.runtime.tcRuntimeErrorList(input),
    }),
    createToolDefinition({
      name: "tc_log_read",
      description:
        "Read bounded runtime log text from a configured diagnostic source.",
      inputSchema: tcLogReadInputSchema,
      handler: async (input, context) => context.runtime.tcLogRead(input),
    }),
    createToolDefinition({
      name: "tc_diagnose_errors",
      description:
        "Run a small bounded TwinCAT error diagnostic: runtime errors, recent events, and runtime log tail.",
      inputSchema: tcDiagnoseErrorsInputSchema,
      handler: async (input, context) => context.runtime.tcDiagnoseErrors(input),
    }),
    createToolDefinition({
      name: "tc_diagnose_runtime",
      description:
        "Run a small bounded TwinCAT runtime diagnostic: TC state, PLC state, NC state, IO config state, and active runtime errors.",
      inputSchema: tcDiagnoseRuntimeInputSchema,
      handler: async (input, context) => context.runtime.tcDiagnoseRuntime(input),
    }),
    createToolDefinition({
      name: "tc_list_workbenches",
      description:
        "List configured TwinCAT engineering workbenches and backend capabilities.",
      inputSchema: stateInputSchema,
      handler: async (_input, context) => context.runtime.tcListWorkbenches(),
    }),
    createToolDefinition({
      name: "tc_list_projects",
      description:
        "List read-only TwinCAT engineering projects from configured project files.",
      inputSchema: tcListProjectsInputSchema,
      handler: async (input, context) => {
        const projectInput: {
          workbenchId?: string;
          type?: EngineeringProjectTypeConfig;
        } = {};

        if (input.workbenchId !== undefined) {
          projectInput.workbenchId = input.workbenchId;
        }

        if (input.type !== undefined) {
          projectInput.type = input.type;
        }

        return context.runtime.tcListProjects(projectInput);
      },
    }),
    createToolDefinition({
      name: "tc_project_state",
      description:
        "Describe read-only TwinCAT engineering project files, type, backend source, and live-connection availability.",
      inputSchema: tcProjectStateInputSchema,
      handler: async (input, context) =>
        context.runtime.tcProjectState(
          input.project === undefined ? {} : { project: input.project },
        ),
    }),
    createToolDefinition({
      name: "tc_tree_read",
      description:
        "Read one TwinCAT/System Manager tree item from configured project files.",
      inputSchema: tcTreeReadInputSchema,
      handler: async (input, context) =>
        context.runtime.tcTreeRead(
          input.project === undefined
            ? { path: input.path }
            : { path: input.path, project: input.project },
        ),
    }),
    createToolDefinition({
      name: "tc_tree_search",
      description:
        "Search TwinCAT/System Manager tree items by text, name, type, comment, or project.",
      inputSchema: tcTreeSearchInputSchema,
      handler: async (input, context) => {
        const searchInput: {
          query?: string;
          name?: string;
          type?: EngineeringTreeItemType;
          comment?: string;
          project?: string;
          limit?: number;
        } = {};

        if (input.query !== undefined) {
          searchInput.query = input.query;
        }

        if (input.name !== undefined) {
          searchInput.name = input.name;
        }

        if (input.type !== undefined) {
          searchInput.type = input.type;
        }

        if (input.comment !== undefined) {
          searchInput.comment = input.comment;
        }

        if (input.project !== undefined) {
          searchInput.project = input.project;
        }

        if (input.limit !== undefined) {
          searchInput.limit = input.limit;
        }

        return context.runtime.tcTreeSearch(searchInput);
      },
    }),
    createToolDefinition({
      name: "tc_tree_describe_item",
      description:
        "Describe a TwinCAT/System Manager tree item with settings and children.",
      inputSchema: tcTreeReadInputSchema,
      handler: async (input, context) =>
        context.runtime.tcTreeDescribeItem(
          input.project === undefined
            ? { path: input.path }
            : { path: input.path, project: input.project },
        ),
    }),
    createToolDefinition({
      name: "io_list_topology",
      description:
        "List read-only I/O topology from configured TwinCAT engineering project files.",
      inputSchema: ioListTopologyInputSchema,
      handler: async (input, context) =>
        context.runtime.ioListTopology(
          input.project === undefined ? {} : { project: input.project },
        ),
    }),
    createToolDefinition({
      name: "io_describe_device",
      description:
        "Describe one read-only I/O device and its boxes and terminals from engineering project files.",
      inputSchema: ioDescribeDeviceInputSchema,
      handler: async (input, context) =>
        context.runtime.ioDescribeDevice(
          input.project === undefined
            ? { device: input.device }
            : { device: input.device, project: input.project },
        ),
    }),
    createToolDefinition({
      name: "io_describe_terminal",
      description:
        "Describe one read-only I/O terminal from configured TwinCAT engineering project files.",
      inputSchema: ioDescribeTerminalInputSchema,
      handler: async (input, context) =>
        context.runtime.ioDescribeTerminal(
          input.project === undefined
            ? { terminal: input.terminal }
            : { terminal: input.terminal, project: input.project },
        ),
    }),
    createToolDefinition({
      name: "plc_watch",
      description:
        "Register or reuse a PLC notification watch for a symbol.",
      inputSchema: watchInputSchema,
      handler: async (input, context): Promise<PlcWatchToolOutput> => {
        const watchOptions: {
          mode?: PlcWatchMode;
          cycleTimeMs?: number;
          maxDelayMs?: number;
        } = {};

        if (input.mode !== undefined) {
          watchOptions.mode = input.mode;
        }

        if (input.cycleTimeMs !== undefined) {
          watchOptions.cycleTimeMs = input.cycleTimeMs;
        }

        if (input.maxDelayMs !== undefined) {
          watchOptions.maxDelayMs = input.maxDelayMs;
        }

        const watch = await context.runtime.watchSymbol({
          name: input.name,
          ...watchOptions,
        });

        const snapshot: {
          name: string;
          notificationHandle: number;
          cycleTimeMs: number;
          mode: PlcWatchMode;
          active: boolean;
          lastValue?: unknown;
          lastTimestamp?: string;
        } = {
          name: watch.name,
          notificationHandle: watch.notificationHandle,
          cycleTimeMs: watch.cycleTimeMs,
          mode: watch.mode,
          active: true,
        };

        if (watch.lastValue !== undefined) {
          snapshot.lastValue = watch.lastValue;
        }

        if (watch.lastTimestamp !== undefined) {
          snapshot.lastTimestamp = watch.lastTimestamp;
        }

        return {
          watch: snapshot,
        };
      },
    }),
    createToolDefinition({
      name: "plc_unwatch",
      description: "Remove a previously registered PLC watch by symbol name.",
      inputSchema: unwatchInputSchema,
      handler: async (input, context) => {
        const watch = await context.runtime.unwatchSymbol(input);
        return { watch };
      },
    }),
    createToolDefinition({
      name: "plc_list_watches",
      description: "List currently registered PLC watches for this session.",
      inputSchema: listWatchesInputSchema,
      handler: async (_input, context) => {
        const watches = context.runtime.listWatches();
        return {
          watches,
          count: watches.length,
        };
      },
    }),
    createToolDefinition({
      name: "plc_wait_until",
      description:
        "Wait for PLC symbol conditions to become true, optionally requiring a stable duration.",
      inputSchema: waitUntilInputSchema,
      handler: async (input, context) => {
        const waitInput = {
          condition: input.condition,
          timeoutMs: input.timeoutMs,
          ...(context.signal === undefined ? {} : { signal: context.signal }),
          ...(input.stableForMs === undefined
            ? {}
            : { stableForMs: input.stableForMs }),
          ...(input.cycleTimeMs === undefined
            ? {}
            : { cycleTimeMs: input.cycleTimeMs }),
          ...(input.maxDelayMs === undefined
            ? {}
            : { maxDelayMs: input.maxDelayMs }),
        };

        return context.runtime.waitUntil(waitInput);
      },
    }),
    createToolDefinition({
      name: "plc_write",
      description:
        "Write a PLC symbol when config and runtime write gates permit it.",
      inputSchema: writeInputSchema,
      handler: async (input, context) => {
        return {
          result: await context.runtime.writeSymbol({
            name: input.name,
            value: input.value,
          }),
        };
      },
    }),
    createToolDefinition({
      name: "plc_state",
      description: "Inspect TwinCAT runtime and ADS connection state.",
      inputSchema: stateInputSchema,
      handler: async (_input, context) => context.runtime.readState(),
    }),
  ];
}

export {
  listSymbolsInputSchema,
  describeSymbolInputSchema,
  readInputSchema,
  readManyInputSchema,
  readGroupInputSchema,
  ncReadAxisInputSchema,
  ncReadAxisManyInputSchema,
  ioReadInputSchema,
  ioReadManyInputSchema,
  ioReadGroupInputSchema,
  tcEventListInputSchema,
  tcLogReadInputSchema,
  tcListProjectsInputSchema,
  tcProjectStateInputSchema,
  tcTreeReadInputSchema,
  tcTreeSearchInputSchema,
  ioListTopologyInputSchema,
  ioDescribeDeviceInputSchema,
  ioDescribeTerminalInputSchema,
  stateInputSchema,
  writeInputSchema,
  setWriteModeInputSchema,
  watchInputSchema,
  unwatchInputSchema,
  listWatchesInputSchema,
  waitUntilInputSchema,
  WriteDeniedError,
};
