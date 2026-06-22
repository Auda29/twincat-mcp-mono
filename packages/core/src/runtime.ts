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
  type EngineeringBuildAndGetErrorsResult,
  type EngineeringBuildResult,
  type EngineeringErrorContextResult,
  type EngineeringErrorListResult,
  type EngineeringHmiArtifactKind,
  type EngineeringHmiListControlsResult,
  type EngineeringHmiListProjectsResult,
  type EngineeringHmiPreviewInfoResult,
  type EngineeringHmiStateResult,
  type EngineeringListProjectsResult,
  type EngineeringListWorkbenchesResult,
  type EngineeringIoDescribeDeviceResult,
  type EngineeringIoDescribeTerminalResult,
  type EngineeringIoListTopologyResult,
  type EngineeringIssueSeverity,
  type EngineeringOutputChannel,
  type EngineeringOutputReadResult,
  type EngineeringProjectStateResult,
  type EngineeringPlcDescribeLibraryResult,
  type EngineeringPlcDescribePouResult,
  type EngineeringPlcLibrarySummary,
  type EngineeringPlcListLibrariesResult,
  type EngineeringPlcListPousResult,
  type EngineeringPlcObjectKind,
  type EngineeringPlcReadPouResult,
  type EngineeringPlcSearchCodeResult,
  type EngineeringResourceReadResult,
  type EngineeringTreeDescribeItemResult,
  type EngineeringTreeItemType,
  type EngineeringTreeReadResult,
  type EngineeringTreeSearchResult,
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

export interface TcBuildProjectInput {
  readonly project?: string | undefined;
  readonly target?: string | undefined;
  readonly timeoutMs?: number | undefined;
}

export interface PlcBuildProjectInput extends TcBuildProjectInput {}

export interface TcBuildAndGetErrorsInput extends TcBuildProjectInput {
  readonly limit?: number | undefined;
}

export interface TcErrorListInput {
  readonly project?: string | undefined;
  readonly severity?: EngineeringIssueSeverity | readonly EngineeringIssueSeverity[] | undefined;
  readonly limit?: number | undefined;
}

export interface TcErrorContextInput {
  readonly error?: string | undefined;
  readonly file?: string | undefined;
  readonly line?: number | undefined;
  readonly project?: string | undefined;
  readonly contextLines?: number | undefined;
}

export interface TcOutputReadInput {
  readonly project?: string | undefined;
  readonly channel?: EngineeringOutputChannel | undefined;
  readonly contains?: string | undefined;
  readonly limitBytes?: number | undefined;
  readonly tailLines?: number | undefined;
}

export interface TcResourceReadInput {
  readonly uri: string;
  readonly limitBytes?: number | undefined;
  readonly contextLines?: number | undefined;
}

export interface HmiStateInput {
  readonly project?: string | undefined;
}

export interface HmiListProjectsInput {
  readonly project?: string | undefined;
}

export interface HmiPreviewInfoInput {
  readonly project?: string | undefined;
}

export interface HmiListControlsInput {
  readonly project?: string | undefined;
  readonly kind?: EngineeringHmiArtifactKind | undefined;
  readonly limit?: number | undefined;
}

export interface TcTreeReadInput {
  readonly path: string;
  readonly project?: string | undefined;
}

export interface TcTreeSearchInput {
  readonly query?: string | undefined;
  readonly name?: string | undefined;
  readonly type?: EngineeringTreeItemType | undefined;
  readonly comment?: string | undefined;
  readonly project?: string | undefined;
  readonly limit?: number | undefined;
}

export interface TcTreeDescribeItemInput extends TcTreeReadInput {}

export interface IoListTopologyInput {
  readonly project?: string | undefined;
}

export interface IoDescribeDeviceInput {
  readonly device: string;
  readonly project?: string | undefined;
}

export interface IoDescribeTerminalInput {
  readonly terminal: string;
  readonly project?: string | undefined;
}

export interface PlcListPousInput {
  readonly project?: string | undefined;
  readonly kind?: EngineeringPlcObjectKind | undefined;
}

export interface PlcReadPouInput {
  readonly pou: string;
  readonly project?: string | undefined;
}

export interface PlcSearchCodeInput {
  readonly query: string;
  readonly project?: string | undefined;
  readonly kind?: EngineeringPlcObjectKind | undefined;
  readonly limit?: number | undefined;
}

export interface PlcDescribePouInput extends PlcReadPouInput {}

export interface PlcListLibrariesInput {
  readonly project?: string | undefined;
}

export interface PlcDescribeLibraryInput {
  readonly library: string;
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
  tcBuildProject(input?: TcBuildProjectInput): EngineeringBuildResult;
  plcBuildProject(input?: PlcBuildProjectInput): EngineeringBuildResult;
  tcBuildAndGetErrors(
    input?: TcBuildAndGetErrorsInput,
  ): EngineeringBuildAndGetErrorsResult;
  tcErrorList(input?: TcErrorListInput): EngineeringErrorListResult;
  tcErrorContext(input: TcErrorContextInput): EngineeringErrorContextResult;
  tcOutputRead(input?: TcOutputReadInput): EngineeringOutputReadResult;
  tcResourceRead(input: TcResourceReadInput): EngineeringResourceReadResult;
  hmiState(input?: HmiStateInput): EngineeringHmiStateResult;
  hmiListProjects(
    input?: HmiListProjectsInput,
  ): EngineeringHmiListProjectsResult;
  hmiPreviewInfo(input?: HmiPreviewInfoInput): EngineeringHmiPreviewInfoResult;
  hmiListControls(input?: HmiListControlsInput): EngineeringHmiListControlsResult;
  tcTreeRead(input: TcTreeReadInput): EngineeringTreeReadResult;
  tcTreeSearch(input?: TcTreeSearchInput): EngineeringTreeSearchResult;
  tcTreeDescribeItem(
    input: TcTreeDescribeItemInput,
  ): EngineeringTreeDescribeItemResult;
  ioListTopology(input?: IoListTopologyInput): EngineeringIoListTopologyResult;
  ioDescribeDevice(
    input: IoDescribeDeviceInput,
  ): EngineeringIoDescribeDeviceResult;
  ioDescribeTerminal(
    input: IoDescribeTerminalInput,
  ): EngineeringIoDescribeTerminalResult;
  plcListPous(input?: PlcListPousInput): EngineeringPlcListPousResult;
  plcReadPou(input: PlcReadPouInput): EngineeringPlcReadPouResult;
  plcSearchCode(input: PlcSearchCodeInput): EngineeringPlcSearchCodeResult;
  plcDescribePou(input: PlcDescribePouInput): EngineeringPlcDescribePouResult;
  plcListLibraries(
    input?: PlcListLibrariesInput,
  ): EngineeringPlcListLibrariesResult;
  plcDescribeLibrary(
    input: PlcDescribeLibraryInput,
  ): EngineeringPlcDescribeLibraryResult;
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
    tcBuildProject: (input = {}) => engineering.tcBuildProject(input),
    plcBuildProject: (input = {}) => engineering.plcBuildProject(input),
    tcBuildAndGetErrors: (input = {}) =>
      engineering.tcBuildAndGetErrors(input),
    tcErrorList: (input = {}) => engineering.tcErrorList(input),
    tcErrorContext: (input) => engineering.tcErrorContext(input),
    tcOutputRead: (input = {}) => engineering.tcOutputRead(input),
    tcResourceRead: (input) => engineering.tcResourceRead(input),
    hmiState: (input = {}) => engineering.hmiState(input),
    hmiListProjects: (input = {}) => engineering.hmiListProjects(input),
    hmiPreviewInfo: (input = {}) => engineering.hmiPreviewInfo(input),
    hmiListControls: (input = {}) => engineering.hmiListControls(input),
    tcTreeRead: (input) => engineering.treeRead(input),
    tcTreeSearch: (input = {}) => engineering.treeSearch(input),
    tcTreeDescribeItem: (input) => engineering.treeDescribeItem(input),
    ioListTopology: (input = {}) => engineering.ioListTopology(input),
    ioDescribeDevice: (input) => engineering.ioDescribeDevice(input),
    ioDescribeTerminal: (input) => engineering.ioDescribeTerminal(input),
    plcListPous: (input = {}) => engineering.plcListPous(input),
    plcReadPou: (input) => engineering.plcReadPou(input),
    plcSearchCode: (input) => engineering.plcSearchCode(input),
    plcDescribePou: (input) => engineering.plcDescribePou(input),
    plcListLibraries: (input = {}) => engineering.plcListLibraries(input),
    plcDescribeLibrary: (input) => engineering.plcDescribeLibrary(input),
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
