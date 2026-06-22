import type { EngineeringProjectTypeConfig, TwinCatAdsRuntimeConfig } from "./config.js";
import type {
  AdsConnectionInfo,
  IoListGroupsResult,
  IoReadGroupResult,
  IoReadManyResult,
  IoReadResult,
  NcAxisErrorResult,
  NcAxisPositionResult,
  NcAxisReadManyResult,
  NcAxisReadResult,
  NcAxisStatusResult,
  NcAxisSummary,
  NcStateResult,
  PlcWriteAccessResult,
  PlcReadResult,
  PlcReadGroupResult,
  PlcStateResult,
  PlcSymbolDescription,
  PlcSymbolGroupSummary,
  PlcSymbolSummary,
  PlcWatchMode,
  PlcWatchSnapshot,
  PlcWaitUntilInput,
  PlcWaitUntilResult,
  PlcWriteMode,
  PlcWriteModeResult,
  PlcWriteResult,
  TwinCatDiagnoseErrorsInput as TwinCatDiagnoseErrorsServiceInput,
  TwinCatDiagnoseErrorsResult,
  TwinCatDiagnoseRuntimeInput as TwinCatDiagnoseRuntimeServiceInput,
  TwinCatDiagnoseRuntimeResult,
  TwinCatStateResult,
  TwinCatAdsService,
} from "./ads-service.js";
import type {
  RuntimeErrorListResult,
  RuntimeEventListResult,
  RuntimeEventQuery,
  RuntimeLogQuery,
  RuntimeLogReadResult,
} from "./diagnostics.js";
import {
  EngineeringService,
  type EngineeringListProjectsResult,
  type EngineeringListWorkbenchesResult,
  type EngineeringProjectStateResult,
} from "./engineering.js";

export interface ReadSymbolInput {
  readonly name: string;
}

export interface DescribeSymbolInput {
  readonly name: string;
}

export interface ReadManyInput {
  readonly names: readonly string[];
}

export interface ReadGroupInput {
  readonly group: string;
}

export interface AxisInput {
  readonly axis: string | number;
}

export interface ReadAxisManyInput {
  readonly axes: readonly (string | number)[];
}

export interface IoReadInput {
  readonly name: string;
}

export interface IoReadManyInput {
  readonly names: readonly string[];
}

export interface IoReadGroupInput {
  readonly group: string;
}

export interface TcEventListInput extends RuntimeEventQuery {}

export interface TcRuntimeErrorListInput extends RuntimeEventQuery {}

export interface TcLogReadInput extends RuntimeLogQuery {}

export interface TcDiagnoseErrorsInput extends TwinCatDiagnoseErrorsServiceInput {}

export interface TcDiagnoseRuntimeInput
  extends TwinCatDiagnoseRuntimeServiceInput {}

export interface TcListProjectsInput {
  readonly workbenchId?: string | undefined;
  readonly type?: EngineeringProjectTypeConfig | undefined;
}

export interface TcProjectStateInput {
  readonly project?: string | undefined;
}

export interface WriteSymbolInput<T = unknown> {
  readonly name: string;
  readonly value: T;
}

export interface WatchSymbolInput {
  readonly name: string;
  readonly mode?: PlcWatchMode;
  readonly cycleTimeMs?: number;
  readonly maxDelayMs?: number;
}

export interface UnwatchSymbolInput {
  readonly name: string;
}

export interface ListSymbolsInput {
  readonly filter?: string;
}

export interface SetWriteModeInput {
  readonly mode: PlcWriteMode;
}

export interface TwinCatAdsOperations {
  connect(): Promise<AdsConnectionInfo>;
  disconnect(): Promise<void>;
  listSymbols(input?: ListSymbolsInput): Promise<PlcSymbolSummary[]>;
  describeSymbol(input: DescribeSymbolInput): Promise<PlcSymbolDescription>;
  readSymbol<T = unknown>(input: ReadSymbolInput): Promise<PlcReadResult<T>>;
  readMany(input: ReadManyInput): Promise<PlcReadResult[]>;
  listGroups(): PlcSymbolGroupSummary[];
  readGroup(input: ReadGroupInput): Promise<PlcReadGroupResult>;
  ncState(): Promise<NcStateResult>;
  ncListAxes(): NcAxisSummary[];
  ncReadAxisPosition(input: AxisInput): Promise<NcAxisPositionResult>;
  ncReadAxisStatus(input: AxisInput): Promise<NcAxisStatusResult>;
  ncReadAxis(input: AxisInput): Promise<NcAxisReadResult>;
  ncReadAxisMany(input: ReadAxisManyInput): Promise<NcAxisReadManyResult>;
  ncReadError(input: AxisInput): Promise<NcAxisErrorResult>;
  ioListGroups(): IoListGroupsResult;
  ioRead(input: IoReadInput): Promise<IoReadResult>;
  ioReadMany(input: IoReadManyInput): Promise<IoReadManyResult>;
  ioReadGroup(input: IoReadGroupInput): Promise<IoReadGroupResult>;
  tcState(): Promise<TwinCatStateResult>;
  tcEventList(input?: TcEventListInput): Promise<RuntimeEventListResult>;
  tcRuntimeErrorList(
    input?: TcRuntimeErrorListInput,
  ): Promise<RuntimeErrorListResult>;
  tcLogRead(input?: TcLogReadInput): Promise<RuntimeLogReadResult>;
  tcDiagnoseErrors(
    input?: TcDiagnoseErrorsInput,
  ): Promise<TwinCatDiagnoseErrorsResult>;
  tcDiagnoseRuntime(
    input?: TcDiagnoseRuntimeInput,
  ): Promise<TwinCatDiagnoseRuntimeResult>;
  tcListWorkbenches(): EngineeringListWorkbenchesResult;
  tcListProjects(input?: TcListProjectsInput): EngineeringListProjectsResult;
  tcProjectState(input?: TcProjectStateInput): EngineeringProjectStateResult;
  writeSymbol<T = unknown>(
    input: WriteSymbolInput<T>,
  ): Promise<PlcWriteResult<T>>;
  waitUntil(input: PlcWaitUntilInput): Promise<PlcWaitUntilResult>;
  watchSymbol(input: WatchSymbolInput): Promise<PlcWatchSnapshot>;
  unwatchSymbol(input: UnwatchSymbolInput): Promise<PlcWatchSnapshot>;
  listWatches(): PlcWatchSnapshot[];
  readState(): Promise<PlcStateResult>;
  setWriteMode(input: SetWriteModeInput): Promise<PlcWriteModeResult>;
  getWriteModeState(): PlcWriteModeResult;
  evaluateWriteAccess(symbolName: string): PlcWriteAccessResult;
}

export interface TwinCatAdsRuntime extends TwinCatAdsOperations {
  readonly service: TwinCatAdsService;
  readonly engineering: EngineeringService;
  readonly config?: TwinCatAdsRuntimeConfig;
}

export interface CreateTwinCatAdsRuntimeOptions {
  readonly config?: TwinCatAdsRuntimeConfig;
  readonly engineering?: EngineeringService;
}

export function createTwinCatAdsRuntime(
  service: TwinCatAdsService,
  options: CreateTwinCatAdsRuntimeOptions = {},
): TwinCatAdsRuntime {
  const engineering =
    options.engineering ??
    new EngineeringService(
      options.config?.engineering ?? {
        enabled: false,
        backend: "configuredProjectFiles",
        projectFiles: [],
      },
    );
  const runtime: TwinCatAdsRuntime = {
    service,
    engineering,
    connect: async () => service.connect(),
    disconnect: async () => service.disconnect(),
    listSymbols: async (input = {}) => service.listSymbols(input.filter),
    describeSymbol: async (input) => service.describeSymbol(input.name),
    readSymbol: async (input) => service.readSymbol(input.name),
    readMany: async (input) => service.readMany(input.names),
    listGroups: () => service.listGroups(),
    readGroup: async (input) => service.readGroup(input.group),
    ncState: async () => service.ncState(),
    ncListAxes: () => service.ncListAxes(),
    ncReadAxisPosition: async (input) => service.ncReadAxisPosition(input.axis),
    ncReadAxisStatus: async (input) => service.ncReadAxisStatus(input.axis),
    ncReadAxis: async (input) => service.ncReadAxis(input.axis),
    ncReadAxisMany: async (input) => service.ncReadAxisMany(input.axes),
    ncReadError: async (input) => service.ncReadError(input.axis),
    ioListGroups: () => service.ioListGroups(),
    ioRead: async (input) => service.ioRead(input.name),
    ioReadMany: async (input) => service.ioReadMany(input.names),
    ioReadGroup: async (input) => service.ioReadGroup(input.group),
    tcState: async () => service.tcState(),
    tcEventList: async (input = {}) => service.tcEventList(input),
    tcRuntimeErrorList: async (input = {}) =>
      service.tcRuntimeErrorList(input),
    tcLogRead: async (input = {}) => service.tcLogRead(input),
    tcDiagnoseErrors: async (input = {}) => service.tcDiagnoseErrors(input),
    tcDiagnoseRuntime: async (input = {}) => service.tcDiagnoseRuntime(input),
    tcListWorkbenches: () => engineering.listWorkbenches(),
    tcListProjects: (input = {}) => engineering.listProjects(input),
    tcProjectState: (input = {}) => engineering.projectState(input),
    writeSymbol: async (input) => service.writeSymbol(input.name, input.value),
    waitUntil: async (input) => service.waitUntil(input),
    watchSymbol: async (input) => {
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

      return service.watchSymbol(input.name, watchOptions);
    },
    unwatchSymbol: async (input) => service.unwatchSymbol(input.name),
    listWatches: () => service.listWatches(),
    readState: async () => service.readState(),
    setWriteMode: async (input) => service.setWriteMode(input.mode),
    getWriteModeState: () => service.getWriteModeState(),
    evaluateWriteAccess: (symbolName) =>
      service.canWrite?.(symbolName) ?? {
        allow: false,
        reason: "The configured ADS service does not expose write access evaluation.",
      },
  };

  if (options.config !== undefined) {
    return {
      ...runtime,
      config: options.config,
    };
  }

  return runtime;
}
