import { z } from "zod";

export const LOOPBACK_AMS_NET_ID = "127.0.0.1.1.1" as const;
export const DEFAULT_PLC_ADS_PORT = 851 as const;
export const DEFAULT_NC_ADS_PORT = 500 as const;
export const DEFAULT_IO_ADS_PORT = 300 as const;
export const DEFAULT_ROUTER_TCP_PORT = 48_898 as const;
export const DEFAULT_LOCAL_ADS_PORT = 32_000 as const;
export const DEFAULT_NOTIFICATION_CYCLE_TIME_MS = 250 as const;
export const DEFAULT_MAX_NOTIFICATIONS = 128 as const;
export const DEFAULT_MAX_WAIT_UNTIL_MS = 600_000 as const;
export const DEFAULT_RUNTIME_EVENT_LIMIT = 50 as const;
export const DEFAULT_RUNTIME_LOG_LIMIT_BYTES = 65_536 as const;
export const DEFAULT_DIAGNOSTIC_COMMAND_TIMEOUT_MS = 15_000 as const;
export const DEFAULT_TWINCAT_EVENT_LOG_NAME = "Application" as const;
export const DEFAULT_TWINCAT_EVENT_PROVIDER_FILTERS = [
  "TwinCAT",
  "Beckhoff",
  "TcSysSrv",
  "TcSysUi",
  "TcIoSrv",
  "TcNc",
  "TcEvent",
] as const;

const amsNetIdSegmentSchema = z.coerce
  .number()
  .int()
  .min(0)
  .max(255);

function isLoopbackAlias(value: string): boolean {
  return value.trim().toLowerCase() === "localhost";
}

const amsNetIdSchema = z
  .string()
  .trim()
  .refine((value) => {
    if (isLoopbackAlias(value)) {
      return true;
    }

    const segments = value.split(".");
    if (segments.length !== 6) {
      return false;
    }

    return segments.every((segment) => {
      const parsed = amsNetIdSegmentSchema.safeParse(segment);
      return parsed.success;
    });
  }, 'AMS Net ID must contain six numeric segments between 0 and 255 or use "localhost".')
  .transform((value) =>
    isLoopbackAlias(value) ? LOOPBACK_AMS_NET_ID : value.trim(),
  );

const hostSchema = z
  .string()
  .trim()
  .min(1, "Router address is required.")
  .transform((value) => value.trim());

const adsPortSchema = z
  .number()
  .int()
  .min(1, "ADS port must be greater than zero.")
    .max(65_535, "ADS port must be 65535 or lower.");

const symbolPathSchema = z
  .string()
  .trim()
  .min(1, "Allowlist entries must not be empty.")
  .transform((value) => value.trim());

const namedConfigEntrySchema = z
  .string()
  .trim()
  .min(1, "Configured names must not be empty.")
  .transform((value) => value.trim());

const diagnosticSourceIdSchema = z
  .string()
  .trim()
  .min(1, "Diagnostic source id must not be empty.")
  .transform((value) => value.trim());

const diagnosticProviderFilterSchema = z
  .string()
  .trim()
  .min(1, "Diagnostic provider filter must not be empty.")
  .transform((value) => value.trim());

const diagnosticCommandTimeoutSchema = z
  .number()
  .int()
  .min(1_000, "Diagnostic command timeout must be at least 1000 ms.")
  .max(60_000, "Diagnostic command timeout must be 60000 ms or lower.")
  .default(DEFAULT_DIAGNOSTIC_COMMAND_TIMEOUT_MS);

const engineeringBackendSchema = z.enum([
  "configuredProjectFiles",
  "automationInterface",
  "dte",
  "tcXaeShell",
  "gasWebSocket",
]);

const engineeringProjectTypeSchema = z.enum([
  "solution",
  "sysManager",
  "plc",
  "hmi",
  "unknown",
]);

const engineeringProjectFileSchema = z
  .object({
    path: z
      .string()
      .trim()
      .min(1, "Engineering project file path must not be empty.")
      .transform((value) => value.trim()),
    name: z.string().trim().min(1).optional(),
    type: engineeringProjectTypeSchema.optional(),
  })
  .strict();

export const engineeringConfigSchema = z
  .object({
    enabled: z.boolean().default(false),
    backend: engineeringBackendSchema.default("configuredProjectFiles"),
    workbenchName: z.string().trim().min(1).optional(),
    projectFiles: z.array(engineeringProjectFileSchema).default([]),
  })
  .strict()
  .default({
    enabled: false,
    backend: "configuredProjectFiles",
    projectFiles: [],
  });

const plcSymbolGroupsSchema = z
  .record(
    z
      .array(symbolPathSchema)
      .min(1, "PLC symbol groups must contain at least one symbol."),
  )
  .default({});

const adsServiceConfigSchema = z
  .object({
    targetAdsPort: adsPortSchema.optional(),
  })
  .strict();

const plcAdsServiceConfigSchema = adsServiceConfigSchema
  .extend({
    symbolGroups: plcSymbolGroupsSchema,
  })
  .strict();

const ncAxisConfigSchema = z
  .object({
    name: namedConfigEntrySchema,
    id: z
      .number()
      .int()
      .min(1, "NC axis id must be at least 1.")
      .max(65_535, "NC axis id must be 65535 or lower."),
    targetAdsPort: adsPortSchema.optional(),
    description: z.string().trim().optional(),
  })
  .strict();

const ncAdsServiceConfigSchema = adsServiceConfigSchema
  .extend({
    axes: z.array(ncAxisConfigSchema).default([]),
  })
  .strict();

const ioDataPointConfigSchema = z
  .object({
    name: namedConfigEntrySchema,
    indexGroup: z
      .number()
      .int()
      .min(0, "IO indexGroup must be 0 or greater.")
      .max(0xffffffff, "IO indexGroup must fit into UINT32."),
    indexOffset: z
      .number()
      .int()
      .min(0, "IO indexOffset must be 0 or greater.")
      .max(0xffffffff, "IO indexOffset must fit into UINT32."),
    type: z
      .string()
      .trim()
      .min(1, "IO data point type must not be empty.")
      .transform((value) => value.trim().toUpperCase()),
    size: z
      .number()
      .int()
      .min(1, "IO data point size must be at least 1 byte.")
      .max(65_535, "IO data point size must be 65535 bytes or lower.")
      .optional(),
    description: z.string().trim().optional(),
  })
  .strict();

const ioDataPointGroupsSchema = z
  .record(
    z
      .array(namedConfigEntrySchema)
      .min(1, "IO groups must contain at least one data point."),
  )
  .default({});

const ioAdsServiceConfigSchema = adsServiceConfigSchema
  .extend({
    dataPoints: z.array(ioDataPointConfigSchema).default([]),
    groups: ioDataPointGroupsSchema,
  })
  .strict();

const adsServicesConfigSchema = z
  .object({
    plc: plcAdsServiceConfigSchema.optional(),
    nc: ncAdsServiceConfigSchema.optional(),
    io: ioAdsServiceConfigSchema.optional(),
  })
  .strict()
  .default({});

const windowsEventLogDiagnosticSourceSchema = z
  .object({
    id: diagnosticSourceIdSchema,
    kind: z.literal("windowsEventLog"),
    logName: z
      .string()
      .trim()
      .min(1, "Windows Event Log name must not be empty.")
      .default(DEFAULT_TWINCAT_EVENT_LOG_NAME),
    providerNames: z
      .array(diagnosticProviderFilterSchema)
      .default([...DEFAULT_TWINCAT_EVENT_PROVIDER_FILTERS]),
    commandTimeoutMs: diagnosticCommandTimeoutSchema,
    description: z.string().trim().optional(),
  })
  .strict();

const fileDiagnosticLogSourceSchema = z
  .object({
    id: diagnosticSourceIdSchema,
    kind: z.literal("file"),
    path: z
      .string()
      .trim()
      .min(1, "Diagnostic log file path must not be empty.")
      .transform((value) => value.trim()),
    encoding: z.enum(["utf8", "utf16le", "latin1"]).default("utf8"),
    description: z.string().trim().optional(),
  })
  .strict();

const defaultWindowsEventSourceConfig = {
  id: "local-windows-application",
  kind: "windowsEventLog" as const,
  logName: DEFAULT_TWINCAT_EVENT_LOG_NAME,
  providerNames: [...DEFAULT_TWINCAT_EVENT_PROVIDER_FILTERS],
  commandTimeoutMs: DEFAULT_DIAGNOSTIC_COMMAND_TIMEOUT_MS,
  description:
    "Local Windows Application log filtered for TwinCAT and Beckhoff providers.",
};

const defaultWindowsLogSourceConfig = {
  ...defaultWindowsEventSourceConfig,
  id: "local-windows-application-log",
  description:
    "Local Windows Application log rendered as bounded runtime log text.",
};

const runtimeEventSourceConfigSchema = windowsEventLogDiagnosticSourceSchema;
const runtimeLogSourceConfigSchema = z.discriminatedUnion("kind", [
  windowsEventLogDiagnosticSourceSchema,
  fileDiagnosticLogSourceSchema,
]);

export const runtimeDiagnosticsConfigSchema = z
  .object({
    maxEvents: z
      .number()
      .int()
      .min(1, "Diagnostic event limit must be at least 1.")
      .max(500, "Diagnostic event limit must be 500 or lower.")
      .default(DEFAULT_RUNTIME_EVENT_LIMIT),
    maxLogBytes: z
      .number()
      .int()
      .min(1_024, "Diagnostic log byte limit must be at least 1024 bytes.")
      .max(1_048_576, "Diagnostic log byte limit must be 1048576 bytes or lower.")
      .default(DEFAULT_RUNTIME_LOG_LIMIT_BYTES),
    eventSources: z
      .array(runtimeEventSourceConfigSchema)
      .default([defaultWindowsEventSourceConfig]),
    logSources: z
      .array(runtimeLogSourceConfigSchema)
      .default([defaultWindowsLogSourceConfig]),
  })
  .strict()
  .default({
    maxEvents: DEFAULT_RUNTIME_EVENT_LIMIT,
    maxLogBytes: DEFAULT_RUNTIME_LOG_LIMIT_BYTES,
    eventSources: [defaultWindowsEventSourceConfig],
    logSources: [defaultWindowsLogSourceConfig],
  });

const commonConfigSchema = z.object({
  targetAmsNetId: amsNetIdSchema,
  targetAdsPort: adsPortSchema.default(DEFAULT_PLC_ADS_PORT),
  readOnly: z.boolean().default(true),
  writeAllowlist: z.array(symbolPathSchema).default([]),
  contextSnapshotSymbols: z.array(symbolPathSchema).default([]),
  notificationCycleTimeMs: z
    .number()
    .int()
    .min(10, "Notification cycle time must be at least 10 ms.")
    .max(60_000, "Notification cycle time must be 60000 ms or lower.")
    .default(DEFAULT_NOTIFICATION_CYCLE_TIME_MS),
  maxNotifications: z
    .number()
    .int()
    .min(1, "At least one notification slot must be available.")
    .max(550, "Max notifications should stay within Beckhoff ADS limits.")
    .default(DEFAULT_MAX_NOTIFICATIONS),
  maxWaitUntilMs: z
    .number()
    .int()
    .min(1_000, "Max wait-until timeout must be at least 1000 ms.")
    .max(3_600_000, "Max wait-until timeout must be 3600000 ms or lower.")
    .default(DEFAULT_MAX_WAIT_UNTIL_MS),
  services: adsServicesConfigSchema,
  diagnostics: runtimeDiagnosticsConfigSchema,
  engineering: engineeringConfigSchema,
});

export const adsRouterConnectionConfigSchema = commonConfigSchema.extend({
  connectionMode: z.literal("router").default("router"),
  routerAddress: z.string().trim().optional(),
  routerTcpPort: z.number().int().optional(),
  localAmsNetId: z.string().trim().optional(),
  localAdsPort: z.number().int().optional(),
});

export const adsDirectConnectionConfigSchema = commonConfigSchema.extend({
  connectionMode: z.literal("direct"),
  routerAddress: hostSchema,
  routerTcpPort: adsPortSchema.default(DEFAULT_ROUTER_TCP_PORT),
  localAmsNetId: amsNetIdSchema,
  localAdsPort: adsPortSchema.default(DEFAULT_LOCAL_ADS_PORT),
});

export const twinCatAdsConfigSchema = z
  .discriminatedUnion("connectionMode", [
    adsRouterConnectionConfigSchema,
    adsDirectConnectionConfigSchema,
  ])
  .superRefine((value, ctx) => {
    if (value.readOnly && value.writeAllowlist.length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "writeAllowlist has no effect when readOnly is enabled. Disable readOnly to permit writes.",
        path: ["writeAllowlist"],
      });
    }
  });

export type TwinCatAdsServiceName = "plc" | "nc" | "io";
export interface AdsNamedServiceConfig {
  readonly targetAdsPort: number;
}
export interface PlcAdsNamedServiceConfig extends AdsNamedServiceConfig {
  readonly symbolGroups: Record<string, string[]>;
}
export interface NcAxisConfig {
  readonly name: string;
  readonly id: number;
  readonly targetAdsPort?: number | undefined;
  readonly description?: string | undefined;
}
export interface NcAdsNamedServiceConfig extends AdsNamedServiceConfig {
  readonly axes: NcAxisConfig[];
}
export interface IoDataPointConfig {
  readonly name: string;
  readonly indexGroup: number;
  readonly indexOffset: number;
  readonly type: string;
  readonly size?: number | undefined;
  readonly description?: string | undefined;
}
export interface IoAdsNamedServiceConfig extends AdsNamedServiceConfig {
  readonly dataPoints: IoDataPointConfig[];
  readonly groups: Record<string, string[]>;
}
export interface TwinCatAdsServiceConfigs {
  readonly plc: PlcAdsNamedServiceConfig;
  readonly nc: NcAdsNamedServiceConfig;
  readonly io: IoAdsNamedServiceConfig;
}
export interface WindowsEventLogDiagnosticSourceConfig {
  readonly id: string;
  readonly kind: "windowsEventLog";
  readonly logName: string;
  readonly providerNames: string[];
  readonly commandTimeoutMs: number;
  readonly description?: string | undefined;
}
export interface FileDiagnosticLogSourceConfig {
  readonly id: string;
  readonly kind: "file";
  readonly path: string;
  readonly encoding: "utf8" | "utf16le" | "latin1";
  readonly description?: string | undefined;
}
export type RuntimeEventSourceConfig = WindowsEventLogDiagnosticSourceConfig;
export type RuntimeLogSourceConfig =
  | WindowsEventLogDiagnosticSourceConfig
  | FileDiagnosticLogSourceConfig;
export interface RuntimeDiagnosticsConfig {
  readonly maxEvents: number;
  readonly maxLogBytes: number;
  readonly eventSources: RuntimeEventSourceConfig[];
  readonly logSources: RuntimeLogSourceConfig[];
}
export type EngineeringBackendConfig =
  | "configuredProjectFiles"
  | "automationInterface"
  | "dte"
  | "tcXaeShell"
  | "gasWebSocket";
export type EngineeringProjectTypeConfig =
  | "solution"
  | "sysManager"
  | "plc"
  | "hmi"
  | "unknown";
export interface EngineeringProjectFileConfig {
  readonly path: string;
  readonly name?: string | undefined;
  readonly type?: EngineeringProjectTypeConfig | undefined;
}
export interface EngineeringConfig {
  readonly enabled: boolean;
  readonly backend: EngineeringBackendConfig;
  readonly workbenchName?: string | undefined;
  readonly projectFiles: EngineeringProjectFileConfig[];
}

export type AdsConnectionMode = z.infer<
  typeof twinCatAdsConfigSchema
>["connectionMode"];
export type AdsRouterConnectionConfig = z.infer<
  typeof adsRouterConnectionConfigSchema
>;
export type AdsDirectConnectionConfig = z.infer<
  typeof adsDirectConnectionConfigSchema
>;
type ParsedTwinCatAdsRuntimeConfig = z.infer<typeof twinCatAdsConfigSchema>;
export type TwinCatAdsRuntimeConfig = Omit<
  ParsedTwinCatAdsRuntimeConfig,
  "services" | "targetAdsPort"
> & {
  readonly targetAdsPort: number;
  readonly services: TwinCatAdsServiceConfigs;
};
export type TwinCatAdsRouterConfigInput = Omit<
  z.input<typeof adsRouterConnectionConfigSchema>,
  "connectionMode"
> & {
  readonly connectionMode?: "router";
};
export type TwinCatAdsConfigInput =
  | TwinCatAdsRouterConfigInput
  | z.input<typeof adsDirectConnectionConfigSchema>;
export type RuntimeDiagnosticsConfigInput = z.input<
  typeof runtimeDiagnosticsConfigSchema
>;
export type ExtensionRuntimeConfig = TwinCatAdsRuntimeConfig;
export type ExtensionConfigInput = TwinCatAdsConfigInput;
export type WritePolicy = Pick<
  TwinCatAdsRuntimeConfig,
  "readOnly" | "writeAllowlist"
>;

function normalizeServiceConfigs(
  config: ParsedTwinCatAdsRuntimeConfig,
): TwinCatAdsServiceConfigs {
  const plcTargetAdsPort =
    config.services.plc?.targetAdsPort ?? config.targetAdsPort;

  return {
    plc: {
      targetAdsPort: plcTargetAdsPort,
      symbolGroups: config.services.plc?.symbolGroups ?? {},
    },
    nc: {
      targetAdsPort:
        config.services.nc?.targetAdsPort ?? DEFAULT_NC_ADS_PORT,
      axes: config.services.nc?.axes ?? [],
    },
    io: {
      targetAdsPort:
        config.services.io?.targetAdsPort ?? DEFAULT_IO_ADS_PORT,
      dataPoints: config.services.io?.dataPoints ?? [],
      groups: config.services.io?.groups ?? {},
    },
  };
}

export function normalizeTwinCatAdsConfig(
  input: TwinCatAdsConfigInput,
): TwinCatAdsRuntimeConfig {
  const normalizedInput =
    typeof input === "object" &&
    input !== null &&
    !Array.isArray(input) &&
    !("connectionMode" in input)
      ? { ...input, connectionMode: "router" }
      : input;

  const parsed = twinCatAdsConfigSchema.parse(normalizedInput);
  const services = normalizeServiceConfigs(parsed);

  return {
    ...parsed,
    targetAdsPort: services.plc.targetAdsPort,
    services,
  };
}

export function normalizeRuntimeDiagnosticsConfig(
  input?: RuntimeDiagnosticsConfigInput,
): RuntimeDiagnosticsConfig {
  return runtimeDiagnosticsConfigSchema.parse(input);
}

export function normalizeExtensionConfig(
  input: ExtensionConfigInput,
): ExtensionRuntimeConfig {
  return normalizeTwinCatAdsConfig(input);
}

export function isWriteAllowed(
  config: WritePolicy,
  symbolName: string,
): boolean {
  if (config.readOnly) {
    return false;
  }

  return config.writeAllowlist.includes(symbolName.trim());
}

export { twinCatAdsConfigSchema as extensionConfigSchema };
