#!/usr/bin/env node

import { readFileSync, realpathSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type CallToolResult,
  type Tool,
} from "@modelcontextprotocol/sdk/types.js";
import {
  AdsService,
  WriteDeniedError,
  createTwinCatAdsRuntime,
  normalizeTwinCatAdsConfig,
  type AdsServiceDependencies,
  type EngineeringProjectTypeConfig,
  type TwinCatAdsConfigInput,
  type TwinCatAdsRuntime,
} from "twincat-mcp-core";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

export const packageName = "twincat-mcp";

function readPackageVersion(): string {
  const packageJsonPath = resolve(
    dirname(fileURLToPath(import.meta.url)),
    "../package.json",
  );
  const packageJson = JSON.parse(
    readFileSync(packageJsonPath, "utf8"),
  ) as { version?: string };
  return packageJson.version ?? "0.0.0";
}

export const packageVersion = readPackageVersion();

export function formatCliVersion(): string {
  return packageVersion;
}

export function formatCliHelp(): string {
  return [
    `${packageName} ${packageVersion}`,
    "",
    "Usage:",
    "  twincat-mcp [--config <file>]",
    "",
    "Options:",
    "  --config <file>  Read TwinCAT ADS connection config from a JSON file.",
    "  --help, -h       Show this help text.",
    "  --version, -v    Show the package version.",
  ].join("\n");
}

export function handleCliMetadataArgs(
  argv: readonly string[] = process.argv.slice(2),
  writeOutput: (message: string) => void = console.log,
): boolean {
  if (argv.includes("--help") || argv.includes("-h")) {
    writeOutput(formatCliHelp());
    return true;
  }

  if (argv.includes("--version") || argv.includes("-v")) {
    writeOutput(formatCliVersion());
    return true;
  }

  return false;
}

const symbolNameSchema = z
  .string()
  .trim()
  .min(1, "Symbol name must not be empty.");

const emptyInputSchema = z.object({}).strict();
const engineeringProjectTypeSchema = z.enum([
  "solution",
  "sysManager",
  "plc",
  "hmi",
  "unknown",
]);
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
const writeInputSchema = z
  .object({
    name: symbolNameSchema,
    value: z.unknown(),
  })
  .strict();
const watchInputSchema = z
  .object({
    name: symbolNameSchema,
    mode: z.enum(["on-change", "cyclic"]).optional(),
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
const unwatchInputSchema = readInputSchema;
const setWriteModeInputSchema = z
  .object({
    mode: z.enum(["read-only", "enabled"]),
  })
  .strict();
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

type McpInputSchema = Tool["inputSchema"];

export interface McpToolDefinition<TInput = unknown> {
  readonly name: string;
  readonly title: string;
  readonly description: string;
  readonly inputSchema: z.ZodType<TInput>;
  readonly annotations?: Tool["annotations"];
  execute(input: TInput): Promise<unknown> | unknown;
}

function toMcpInputSchema(schema: z.ZodType): McpInputSchema {
  const jsonSchema = zodToJsonSchema(schema, {
    $refStrategy: "none",
    target: "jsonSchema7",
  });

  const typedSchema = jsonSchema as { readonly type?: unknown };
  if (
    typeof jsonSchema !== "object" ||
    jsonSchema === null ||
    typedSchema.type !== "object"
  ) {
    throw new Error("MCP tool input schemas must be JSON object schemas.");
  }

  const { $schema: _schema, ...mcpSchema } = jsonSchema;
  return mcpSchema as McpInputSchema;
}

function toMcpTool(tool: McpToolDefinition): Tool {
  const mcpTool: Tool = {
    name: tool.name,
    title: tool.title,
    description: tool.description,
    inputSchema: toMcpInputSchema(tool.inputSchema),
  };

  if (tool.annotations !== undefined) {
    return {
      ...mcpTool,
      annotations: tool.annotations,
    };
  }

  return mcpTool;
}

function toJsonSafeReplacer(_key: string, value: unknown): unknown {
  return typeof value === "bigint" ? value.toString() : value;
}

function toJsonSafeValue(value: unknown): Record<string, unknown> {
  return JSON.parse(JSON.stringify(value, toJsonSafeReplacer)) as Record<
    string,
    unknown
  >;
}

function createToolResult(value: unknown): CallToolResult {
  const structuredContent = toJsonSafeValue(value);
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(structuredContent, null, 2),
      },
    ],
    structuredContent,
  };
}

function createToolErrorResult(
  code: string,
  message: string,
  details?: unknown,
): CallToolResult {
  return {
    content: [
      {
        type: "text",
        text: message,
      },
    ],
    structuredContent: toJsonSafeValue({
      error: {
        code,
        message,
        details,
      },
    }),
    isError: true,
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function createMcpToolDefinitions(
  runtime: TwinCatAdsRuntime,
): McpToolDefinition[] {
  return [
    {
      name: "ads_connect",
      title: "ADS Connect",
      description: "Open the configured ADS connection.",
      inputSchema: emptyInputSchema,
      annotations: { idempotentHint: true, openWorldHint: true },
      execute: async () => ({
        connection: await runtime.connect(),
      }),
    },
    {
      name: "ads_disconnect",
      title: "ADS Disconnect",
      description: "Close the ADS connection and release active handles.",
      inputSchema: emptyInputSchema,
      annotations: { idempotentHint: true, openWorldHint: false },
      execute: async () => {
        await runtime.disconnect();
        return { disconnected: true };
      },
    },
    {
      name: "plc_list_symbols",
      title: "PLC List Symbols",
      description: "List available PLC symbols with metadata.",
      inputSchema: listSymbolsInputSchema,
      annotations: { readOnlyHint: true, openWorldHint: true },
      execute: async (input: z.infer<typeof listSymbolsInputSchema>) => {
        const symbols = await runtime.listSymbols(
          input.filter === undefined ? {} : { filter: input.filter },
        );
        return {
          symbols,
          count: symbols.length,
        };
      },
    },
    {
      name: "plc_describe_symbol",
      title: "PLC Describe Symbol",
      description:
        "Describe a PLC symbol including type, size, metadata, arrays and struct members when available.",
      inputSchema: describeSymbolInputSchema,
      annotations: { readOnlyHint: true, openWorldHint: true },
      execute: async (input: z.infer<typeof describeSymbolInputSchema>) => ({
        symbol: await runtime.describeSymbol(input),
      }),
    },
    {
      name: "plc_read",
      title: "PLC Read",
      description: "Read a PLC symbol by name.",
      inputSchema: readInputSchema,
      annotations: { readOnlyHint: true, openWorldHint: true },
      execute: async (input: z.infer<typeof readInputSchema>) => ({
        result: await runtime.readSymbol(input),
      }),
    },
    {
      name: "plc_read_many",
      title: "PLC Read Many",
      description: "Read multiple PLC symbols using a bundled ADS request.",
      inputSchema: readManyInputSchema,
      annotations: { readOnlyHint: true, openWorldHint: true },
      execute: async (input: z.infer<typeof readManyInputSchema>) => {
        const results = await runtime.readMany(input);
        return {
          results,
          count: results.length,
        };
      },
    },
    {
      name: "plc_list_groups",
      title: "PLC List Groups",
      description: "List configured PLC symbol groups.",
      inputSchema: emptyInputSchema,
      annotations: { readOnlyHint: true, openWorldHint: false },
      execute: () => {
        const groups = runtime.listGroups();
        return {
          groups,
          count: groups.length,
        };
      },
    },
    {
      name: "plc_read_group",
      title: "PLC Read Group",
      description: "Read all symbols from a configured PLC symbol group.",
      inputSchema: readGroupInputSchema,
      annotations: { readOnlyHint: true, openWorldHint: true },
      execute: async (input: z.infer<typeof readGroupInputSchema>) => ({
        group: await runtime.readGroup(input),
      }),
    },
    {
      name: "nc_state",
      title: "NC State",
      description: "Inspect NC ADS connection and runtime state.",
      inputSchema: emptyInputSchema,
      annotations: { readOnlyHint: true, openWorldHint: true },
      execute: async () => runtime.ncState(),
    },
    {
      name: "nc_list_axes",
      title: "NC List Axes",
      description: "List configured NC axes.",
      inputSchema: emptyInputSchema,
      annotations: { readOnlyHint: true, openWorldHint: false },
      execute: () => {
        const axes = runtime.ncListAxes();
        return {
          axes,
          count: axes.length,
        };
      },
    },
    {
      name: "nc_read_axis",
      title: "NC Read Axis",
      description:
        "Read configured NC axis online state, status flags, position, velocity, and error code. Returns available data with warnings when optional status or error fields cannot be read.",
      inputSchema: ncReadAxisInputSchema,
      annotations: { readOnlyHint: true, openWorldHint: true },
      execute: async (input: z.infer<typeof ncReadAxisInputSchema>) => ({
        result: await runtime.ncReadAxis(input),
      }),
    },
    {
      name: "nc_read_axis_position",
      title: "NC Read Axis Position",
      description:
        "Read only the configured NC axis online position and velocity state.",
      inputSchema: ncReadAxisInputSchema,
      annotations: { readOnlyHint: true, openWorldHint: true },
      execute: async (input: z.infer<typeof ncReadAxisInputSchema>) => ({
        position: await runtime.ncReadAxisPosition(input),
      }),
    },
    {
      name: "nc_read_axis_status",
      title: "NC Read Axis Status",
      description:
        "Read only configured NC axis status flags such as ready, referenced, in-position, and busy.",
      inputSchema: ncReadAxisInputSchema,
      annotations: { readOnlyHint: true, openWorldHint: true },
      execute: async (input: z.infer<typeof ncReadAxisInputSchema>) => ({
        status: await runtime.ncReadAxisStatus(input),
      }),
    },
    {
      name: "nc_read_axis_many",
      title: "NC Read Axis Many",
      description: "Read multiple configured NC axes.",
      inputSchema: ncReadAxisManyInputSchema,
      annotations: { readOnlyHint: true, openWorldHint: true },
      execute: async (input: z.infer<typeof ncReadAxisManyInputSchema>) =>
        runtime.ncReadAxisMany(input),
    },
    {
      name: "nc_read_error",
      title: "NC Read Error",
      description: "Read the current error code for a configured NC axis.",
      inputSchema: ncReadAxisInputSchema,
      annotations: { readOnlyHint: true, openWorldHint: true },
      execute: async (input: z.infer<typeof ncReadAxisInputSchema>) => ({
        error: await runtime.ncReadError(input),
      }),
    },
    {
      name: "io_list_groups",
      title: "IO List Groups",
      description: "List configured IO groups and data points.",
      inputSchema: emptyInputSchema,
      annotations: { readOnlyHint: true, openWorldHint: false },
      execute: () => runtime.ioListGroups(),
    },
    {
      name: "io_read",
      title: "IO Read",
      description: "Read a configured IO data point by ADS indexGroup/indexOffset.",
      inputSchema: ioReadInputSchema,
      annotations: { readOnlyHint: true, openWorldHint: true },
      execute: async (input: z.infer<typeof ioReadInputSchema>) => ({
        result: await runtime.ioRead(input),
      }),
    },
    {
      name: "io_read_many",
      title: "IO Read Many",
      description: "Read multiple configured IO data points with one ADS sum read.",
      inputSchema: ioReadManyInputSchema,
      annotations: { readOnlyHint: true, openWorldHint: true },
      execute: async (input: z.infer<typeof ioReadManyInputSchema>) =>
        runtime.ioReadMany(input),
    },
    {
      name: "io_read_group",
      title: "IO Read Group",
      description: "Read all configured IO data points in an IO group.",
      inputSchema: ioReadGroupInputSchema,
      annotations: { readOnlyHint: true, openWorldHint: true },
      execute: async (input: z.infer<typeof ioReadGroupInputSchema>) => ({
        group: await runtime.ioReadGroup(input),
      }),
    },
    {
      name: "tc_state",
      title: "TwinCAT State",
      description:
        "Inspect compact TwinCAT-wide ADS, PLC, NC, and diagnostics capability state.",
      inputSchema: emptyInputSchema,
      annotations: { readOnlyHint: true, openWorldHint: true },
      execute: async () => runtime.tcState(),
    },
    {
      name: "tc_event_list",
      title: "TwinCAT Events",
      description:
        "List recent TwinCAT runtime events from a configured diagnostic source.",
      inputSchema: tcEventListInputSchema,
      annotations: { readOnlyHint: true, openWorldHint: true },
      execute: async (input: z.infer<typeof tcEventListInputSchema>) =>
        runtime.tcEventList(input),
    },
    {
      name: "tc_runtime_error_list",
      title: "TwinCAT Runtime Errors",
      description:
        "List recent critical/error TwinCAT runtime events from a configured diagnostic source.",
      inputSchema: tcEventListInputSchema,
      annotations: { readOnlyHint: true, openWorldHint: true },
      execute: async (input: z.infer<typeof tcEventListInputSchema>) =>
        runtime.tcRuntimeErrorList(input),
    },
    {
      name: "tc_log_read",
      title: "TwinCAT Runtime Log",
      description:
        "Read bounded runtime log text from a configured diagnostic source.",
      inputSchema: tcLogReadInputSchema,
      annotations: { readOnlyHint: true, openWorldHint: true },
      execute: async (input: z.infer<typeof tcLogReadInputSchema>) =>
        runtime.tcLogRead(input),
    },
    {
      name: "tc_diagnose_errors",
      title: "TwinCAT Diagnose Errors",
      description:
        "Run a small bounded TwinCAT error diagnostic: runtime errors, recent events, and runtime log tail.",
      inputSchema: tcDiagnoseErrorsInputSchema,
      annotations: { readOnlyHint: true, openWorldHint: true },
      execute: async (input: z.infer<typeof tcDiagnoseErrorsInputSchema>) =>
        runtime.tcDiagnoseErrors(input),
    },
    {
      name: "tc_diagnose_runtime",
      title: "TwinCAT Diagnose Runtime",
      description:
        "Run a small bounded TwinCAT runtime diagnostic: TC state, PLC state, NC state, IO config state, and active runtime errors.",
      inputSchema: tcDiagnoseRuntimeInputSchema,
      annotations: { readOnlyHint: true, openWorldHint: true },
      execute: async (input: z.infer<typeof tcDiagnoseRuntimeInputSchema>) =>
        runtime.tcDiagnoseRuntime(input),
    },
    {
      name: "tc_list_workbenches",
      title: "TwinCAT Engineering Workbenches",
      description:
        "List configured TwinCAT engineering workbenches and backend capabilities.",
      inputSchema: emptyInputSchema,
      annotations: { readOnlyHint: true, openWorldHint: false },
      execute: () => runtime.tcListWorkbenches(),
    },
    {
      name: "tc_list_projects",
      title: "TwinCAT Engineering Projects",
      description:
        "List read-only TwinCAT engineering projects from configured project files.",
      inputSchema: tcListProjectsInputSchema,
      annotations: { readOnlyHint: true, openWorldHint: false },
      execute: async (
        input: z.infer<typeof tcListProjectsInputSchema>,
      ) => {
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

        return runtime.tcListProjects(projectInput);
      },
    },
    {
      name: "tc_project_state",
      title: "TwinCAT Engineering Project State",
      description:
        "Describe read-only TwinCAT engineering project files, type, backend source, and live-connection availability.",
      inputSchema: tcProjectStateInputSchema,
      annotations: { readOnlyHint: true, openWorldHint: false },
      execute: async (input: z.infer<typeof tcProjectStateInputSchema>) =>
        runtime.tcProjectState(
          input.project === undefined ? {} : { project: input.project },
        ),
    },
    {
      name: "plc_write",
      title: "PLC Write",
      description:
        "Write a PLC symbol when config and runtime write gates permit it.",
      inputSchema: writeInputSchema,
      annotations: {
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: true,
      },
      execute: async (input: z.infer<typeof writeInputSchema>) => ({
        result: await runtime.writeSymbol({
          name: input.name,
          value: input.value,
        }),
      }),
    },
    {
      name: "plc_watch",
      title: "PLC Watch",
      description:
        "Register or reuse a PLC notification watch for a symbol.",
      inputSchema: watchInputSchema,
      annotations: { readOnlyHint: true, openWorldHint: true },
      execute: async (input: z.infer<typeof watchInputSchema>) => {
        const watchInput = {
          name: input.name,
          ...(input.mode === undefined ? {} : { mode: input.mode }),
          ...(input.cycleTimeMs === undefined
            ? {}
            : { cycleTimeMs: input.cycleTimeMs }),
          ...(input.maxDelayMs === undefined
            ? {}
            : { maxDelayMs: input.maxDelayMs }),
        };

        return {
          watch: await runtime.watchSymbol(watchInput),
        };
      },
    },
    {
      name: "plc_wait_until",
      title: "PLC Wait Until",
      description:
        "Wait for PLC symbol conditions to become true, optionally requiring a stable duration.",
      inputSchema: waitUntilInputSchema,
      annotations: { readOnlyHint: true, openWorldHint: true },
      execute: async (input: z.infer<typeof waitUntilInputSchema>) => {
        const waitInput = {
          condition: input.condition,
          timeoutMs: input.timeoutMs,
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

        return runtime.waitUntil(waitInput);
      },
    },
    {
      name: "plc_unwatch",
      title: "PLC Unwatch",
      description: "Remove a previously registered PLC watch by symbol name.",
      inputSchema: unwatchInputSchema,
      annotations: { idempotentHint: true, openWorldHint: false },
      execute: async (input: z.infer<typeof unwatchInputSchema>) => ({
        watch: await runtime.unwatchSymbol(input),
      }),
    },
    {
      name: "plc_list_watches",
      title: "PLC List Watches",
      description: "List currently registered PLC watches for this server.",
      inputSchema: emptyInputSchema,
      annotations: { readOnlyHint: true, openWorldHint: false },
      execute: () => {
        const watches = runtime.listWatches();
        return {
          watches,
          count: watches.length,
        };
      },
    },
    {
      name: "plc_state",
      title: "PLC State",
      description: "Inspect TwinCAT runtime and ADS connection state.",
      inputSchema: emptyInputSchema,
      annotations: { readOnlyHint: true, openWorldHint: true },
      execute: async () => runtime.readState(),
    },
    {
      name: "plc_set_write_mode",
      title: "PLC Set Write Mode",
      description:
        "Enable or disable PLC writes for the current server runtime gate.",
      inputSchema: setWriteModeInputSchema,
      annotations: { destructiveHint: false, idempotentHint: true },
      execute: async (input: z.infer<typeof setWriteModeInputSchema>) =>
        runtime.setWriteMode(input),
    },
    {
      name: "plc_get_write_mode",
      title: "PLC Get Write Mode",
      description: "Read the current PLC write-mode gate state.",
      inputSchema: emptyInputSchema,
      annotations: { readOnlyHint: true, openWorldHint: false },
      execute: () => runtime.getWriteModeState(),
    },
    {
      name: "plc_evaluate_write_access",
      title: "PLC Evaluate Write Access",
      description:
        "Check whether the configured write gates would allow a symbol write.",
      inputSchema: readInputSchema,
      annotations: { readOnlyHint: true, openWorldHint: false },
      execute: (input: z.infer<typeof readInputSchema>) =>
        runtime.evaluateWriteAccess(input.name),
    },
  ];
}

export async function callMcpTool(
  tools: readonly McpToolDefinition[],
  name: string,
  rawArguments: unknown,
): Promise<CallToolResult> {
  const tool = tools.find((entry) => entry.name === name);

  if (tool === undefined) {
    return createToolErrorResult(
      "TOOL_NOT_FOUND",
      `Unknown TwinCAT ADS MCP tool: ${name}`,
    );
  }

  const parseResult = tool.inputSchema.safeParse(rawArguments ?? {});
  if (!parseResult.success) {
    return createToolErrorResult(
      "TOOL_INPUT_INVALID",
      "Tool arguments did not match the MCP tool schema.",
      parseResult.error.flatten(),
    );
  }

  try {
    return createToolResult(await tool.execute(parseResult.data));
  } catch (error) {
    return createToolErrorResult(
      error instanceof WriteDeniedError ? error.code : "PLC_OPERATION_FAILED",
      errorMessage(error),
    );
  }
}

export function createMcpServer(runtime: TwinCatAdsRuntime): Server {
  const tools = createMcpToolDefinitions(runtime);
  const server = new Server(
    {
      name: packageName,
      version: packageVersion,
    },
    {
      capabilities: {
        tools: {},
      },
      instructions:
        "TwinCAT ADS MCP server exposing PLC operations backed by twincat-mcp-core.",
    },
  );

  server.setRequestHandler(ListToolsRequestSchema, () => ({
    tools: tools.map(toMcpTool),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) =>
    callMcpTool(tools, request.params.name, request.params.arguments ?? {}),
  );

  return server;
}

export function createRuntimeFromConfig(
  input: TwinCatAdsConfigInput,
  dependencies: AdsServiceDependencies = {},
): TwinCatAdsRuntime {
  const config = normalizeTwinCatAdsConfig(input);
  const service = new AdsService(config, dependencies);
  return createTwinCatAdsRuntime(service, { config });
}

function parseOptionalNumber(value: string | undefined): number | undefined {
  if (value === undefined || value.trim() === "") {
    return undefined;
  }

  return Number(value);
}

function parseOptionalBoolean(value: string | undefined): boolean | undefined {
  if (value === undefined || value.trim() === "") {
    return undefined;
  }

  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}

function parseSymbolList(value: string | undefined): string[] | undefined {
  if (value === undefined || value.trim() === "") {
    return undefined;
  }

  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function withoutUndefined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter((entry) => entry[1] !== undefined),
  ) as T;
}

function configPathFromArgs(argv: readonly string[]): string | undefined {
  const flagIndex = argv.findIndex((entry) => entry === "--config");
  if (flagIndex === -1) {
    return undefined;
  }

  return argv[flagIndex + 1];
}

export async function loadConfigInput(
  argv: readonly string[] = process.argv.slice(2),
  env: NodeJS.ProcessEnv = process.env,
): Promise<TwinCatAdsConfigInput> {
  const configPath = configPathFromArgs(argv);
  if (configPath !== undefined) {
    const resolvedPath = resolve(process.cwd(), configPath);
    return JSON.parse(await readFile(resolvedPath, "utf8")) as TwinCatAdsConfigInput;
  }

  if (env.TWINCAT_ADS_CONFIG !== undefined) {
    return JSON.parse(env.TWINCAT_ADS_CONFIG) as TwinCatAdsConfigInput;
  }

  if (env.TWINCAT_ADS_TARGET_AMS_NET_ID !== undefined) {
    const connectionMode =
      env.TWINCAT_ADS_CONNECTION_MODE === "direct" ? "direct" : "router";
    const baseConfig = {
      connectionMode,
      targetAmsNetId: env.TWINCAT_ADS_TARGET_AMS_NET_ID,
      targetAdsPort: parseOptionalNumber(env.TWINCAT_ADS_TARGET_ADS_PORT),
      readOnly: parseOptionalBoolean(env.TWINCAT_ADS_READ_ONLY),
      writeAllowlist: parseSymbolList(env.TWINCAT_ADS_WRITE_ALLOWLIST),
      contextSnapshotSymbols: parseSymbolList(
        env.TWINCAT_ADS_CONTEXT_SNAPSHOT_SYMBOLS,
      ),
      notificationCycleTimeMs: parseOptionalNumber(
        env.TWINCAT_ADS_NOTIFICATION_CYCLE_TIME_MS,
      ),
      maxNotifications: parseOptionalNumber(env.TWINCAT_ADS_MAX_NOTIFICATIONS),
      maxWaitUntilMs: parseOptionalNumber(env.TWINCAT_ADS_MAX_WAIT_UNTIL_MS),
      routerAddress: env.TWINCAT_ADS_ROUTER_ADDRESS,
      routerTcpPort: parseOptionalNumber(env.TWINCAT_ADS_ROUTER_TCP_PORT),
      localAmsNetId: env.TWINCAT_ADS_LOCAL_AMS_NET_ID,
      localAdsPort: parseOptionalNumber(env.TWINCAT_ADS_LOCAL_ADS_PORT),
    };

    return withoutUndefined(baseConfig) as TwinCatAdsConfigInput;
  }

  throw new Error(
    "Missing TwinCAT ADS config. Pass --config <file>, set TWINCAT_ADS_CONFIG, or set TWINCAT_ADS_TARGET_AMS_NET_ID.",
  );
}

export async function main(): Promise<void> {
  if (handleCliMetadataArgs()) {
    return;
  }

  const config = await loadConfigInput();
  const runtime = createRuntimeFromConfig(config);
  const server = createMcpServer(runtime);
  await server.connect(new StdioServerTransport());
}

export function isCliEntryPoint(
  argvPath: string | undefined = process.argv[1],
  modulePath: string = fileURLToPath(import.meta.url),
  resolveRealPath: (path: string) => string = realpathSync,
): boolean {
  if (argvPath === undefined) {
    return false;
  }

  try {
    return resolveRealPath(argvPath) === resolveRealPath(modulePath);
  } catch {
    return argvPath === modulePath;
  }
}

if (isCliEntryPoint()) {
  main().catch((error: unknown) => {
    console.error(errorMessage(error));
    process.exitCode = 1;
  });
}
