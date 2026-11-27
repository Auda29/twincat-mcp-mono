import {
  ADS,
  Client,
  type ActiveSubscription,
  type AdsClientConnection,
  type AdsClientSettings,
  type AdsDataType,
  type AdsDeviceInfo as AdsClientDeviceInfo,
  type AdsState,
  type AdsSymbol,
  type AdsTcSystemExtendedState,
  type AmsAddress,
  type ReadRawMultiCommand,
  type ReadRawMultiResult,
  type ReadValueResult,
  type SubscriptionCallback,
  type VariableHandle,
  type WriteValueResult,
} from "ads-client";

import {
  DEFAULT_IO_ADS_PORT,
  DEFAULT_MAX_WAIT_UNTIL_MS,
  DEFAULT_NC_ADS_PORT,
  isWriteAllowed,
  normalizeRuntimeDiagnosticsConfig,
  type ExtensionRuntimeConfig,
  type IoDataPointConfig,
  type NcAxisConfig,
  type TwinCatAdsServiceName,
} from "./config.js";
import {
  RuntimeDiagnostics,
  type RuntimeDiagnosticSeverity,
  type RuntimeDiagnosticsCapabilities,
  type RuntimeDiagnosticsDependencies,
  type RuntimeErrorListResult,
  type RuntimeEventListResult,
  type RuntimeEventQuery,
  type RuntimeLogQuery,
  type RuntimeLogReadResult,
} from "./diagnostics.js";

export interface AdsServiceDependencies {
  /** Disable automatic reconnection for clients whose access depends on a live grant. */
  readonly autoReconnect?: boolean;
  /** Maximum time to drain a PLC wait before returning its result. Defaults to 2 seconds. */
  readonly waitCleanupTimeoutMs?: number;
  readonly logger?: Pick<Console, "debug" | "error" | "info" | "warn">;
  readonly diagnostics?: RuntimeDiagnosticsDependencies;
}

export type AdsConnectionState =
  | "disconnected"
  | "connecting"
  | "connected"
  | "degraded";

export type PlcWriteMode = "read-only" | "enabled";
export type PlcWatchMode = "on-change" | "cyclic";
export type AdsConnectionInfo = AdsClientConnection;
export type AdsStateSnapshot = AdsState;
export type AdsDeviceInfo = AdsClientDeviceInfo;

export interface AdsNamedServiceConnectionSummary {
  readonly name: TwinCatAdsServiceName;
  readonly targetAdsPort: number;
  readonly connected: boolean;
  readonly state: AdsConnectionState;
}

export interface PlcSymbolSummary {
  readonly name: string;
  readonly type: string;
  readonly size: number;
  readonly comment: string;
  readonly flags: number;
  readonly indexGroup: number;
  readonly indexOffset: number;
}

export interface PlcDataTypeMemberDescription {
  readonly name: string;
  readonly type: string;
  readonly size: number;
  readonly offset: number;
  readonly comment: string;
  readonly arrayDimension: number;
  readonly arrayInfos: AdsDataType["arrayInfos"];
  readonly attributes: AdsDataType["attributes"];
  readonly subItems?: PlcDataTypeMemberDescription[];
}

export interface PlcSymbolDescription extends PlcSymbolSummary {
  readonly adsDataType?: number;
  readonly adsDataTypeStr?: string;
  readonly flagsStr?: string[];
  readonly arrayDimension?: number;
  readonly arrayInfo?: AdsSymbol["arrayInfo"];
  readonly attributes?: AdsSymbol["attributes"];
  readonly typeGuid?: string;
  readonly dataType?: PlcDataTypeMemberDescription;
}

export interface PlcReadResult<T = unknown> {
  readonly name: string;
  readonly value: T;
  readonly type: string;
  readonly timestamp: string;
  readonly symbol: AdsSymbol;
}

export interface PlcWriteResult<T = unknown> {
  readonly name: string;
  readonly value: T;
  readonly type: string;
  readonly timestamp: string;
}

export interface PlcWatchSnapshot<T = unknown> {
  readonly name: string;
  readonly notificationHandle: number;
  readonly cycleTimeMs: number;
  readonly mode: PlcWatchMode;
  readonly active: boolean;
  readonly lastValue?: T;
  readonly lastTimestamp?: string;
}

export interface AdsStateSummary {
  readonly adsState: number;
  readonly adsStateName: string;
  readonly deviceState: number;
  readonly isRun: boolean;
  readonly isStop: boolean;
}

export interface PlcStateResult {
  readonly connection: AdsClientConnection;
  readonly adsState: AdsConnectionState;
  readonly writeMode: PlcWriteMode;
  readonly watchCount: number;
  readonly writePolicy: {
    readonly configReadOnly: boolean;
    readonly runtimeWriteEnabled: boolean;
    readonly allowlistCount: number;
  };
  readonly plcRuntimeState: AdsState;
  readonly plcRuntimeStatus: AdsStateSummary;
  readonly tcSystemState: AdsState;
  readonly tcSystemStatus: AdsStateSummary;
  readonly tcSystemExtendedState: AdsTcSystemExtendedState;
  readonly deviceInfo: AdsClientDeviceInfo;
}

export interface PlcWatchRegistration extends PlcWatchSnapshot {
  unsubscribe(): Promise<void>;
}

export interface PlcWriteModeResult {
  readonly writeMode: PlcWriteMode;
  readonly runtimeWriteEnabled: boolean;
  readonly configReadOnly: boolean;
  readonly writesAllowed: boolean;
  readonly message: string;
}

export interface PlcWriteAccessResult {
  readonly allow: boolean;
  readonly reason?: string;
}

export interface PlcSymbolGroupSummary {
  readonly name: string;
  readonly symbols: string[];
  readonly count: number;
}

export interface PlcReadGroupResult {
  readonly group: string;
  readonly symbols: string[];
  readonly results: PlcReadResult[];
  readonly count: number;
}

export interface NcAxisSummary {
  readonly name: string;
  readonly id: number;
  readonly targetAdsPort: number;
  readonly description?: string;
}

export interface NcStateResult {
  readonly connection: AdsClientConnection;
  readonly adsState: AdsConnectionState;
  readonly ncRuntimeState: AdsState;
  readonly ncRuntimeStatus: AdsStateSummary;
  readonly deviceInfo: AdsClientDeviceInfo;
  readonly axes: NcAxisSummary[];
}

export interface TwinCatStateComponent<TData> {
  readonly available: boolean;
  readonly data?: TData;
  readonly error?: string;
}

export interface TwinCatStateResult {
  readonly timestamp: string;
  readonly adsState: AdsConnectionState;
  readonly services: AdsNamedServiceConnectionSummary[];
  readonly plc: TwinCatStateComponent<PlcStateResult>;
  readonly nc: TwinCatStateComponent<NcStateResult>;
  readonly diagnostics: RuntimeDiagnosticsCapabilities;
}

export interface TwinCatDiagnoseErrorsInput {
  readonly eventSource?: string | undefined;
  readonly logSource?: string | undefined;
  readonly limit?: number | undefined;
  readonly logLimitBytes?: number | undefined;
  readonly logTailLines?: number | undefined;
  readonly since?: string | undefined;
  readonly until?: string | undefined;
  readonly severity?:
    | RuntimeDiagnosticSeverity
    | readonly RuntimeDiagnosticSeverity[]
    | undefined;
  readonly contains?: string | undefined;
  readonly id?: number | readonly number[] | undefined;
}

export interface TwinCatDiagnoseErrorsSummary {
  readonly runtimeErrorCount: number;
  readonly recentEventCount: number;
  readonly logBytesRead: number;
  readonly runtimeErrorsAvailable: boolean;
  readonly recentEventsAvailable: boolean;
  readonly runtimeLogAvailable: boolean;
  readonly truncated: {
    readonly runtimeErrors: boolean;
    readonly recentEvents: boolean;
    readonly runtimeLog: boolean;
  };
}

export interface TwinCatDiagnoseErrorsResult {
  readonly timestamp: string;
  readonly summary: TwinCatDiagnoseErrorsSummary;
  readonly runtimeErrors: RuntimeErrorListResult;
  readonly recentEvents: RuntimeEventListResult;
  readonly runtimeLog: RuntimeLogReadResult;
}

export interface TwinCatIoStateResult {
  readonly connection: AdsClientConnection;
  readonly service: AdsNamedServiceConnectionSummary;
  readonly groups: IoListGroupsResult;
}

export interface TwinCatDiagnoseRuntimeInput {
  readonly eventSource?: string | undefined;
  readonly limit?: number | undefined;
  readonly since?: string | undefined;
  readonly until?: string | undefined;
  readonly contains?: string | undefined;
}

export interface TwinCatDiagnoseRuntimeSummary {
  readonly adsState: AdsConnectionState;
  readonly plcAvailable: boolean;
  readonly ncAvailable: boolean;
  readonly ioAvailable: boolean;
  readonly configuredIoDataPoints: number;
  readonly configuredIoGroups: number;
  readonly runtimeErrorCount: number;
  readonly runtimeErrorsAvailable: boolean;
}

export interface TwinCatDiagnoseRuntimeResult {
  readonly timestamp: string;
  readonly summary: TwinCatDiagnoseRuntimeSummary;
  readonly tcState: TwinCatStateResult;
  readonly plc: TwinCatStateComponent<PlcStateResult>;
  readonly nc: TwinCatStateComponent<NcStateResult>;
  readonly io: TwinCatStateComponent<TwinCatIoStateResult>;
  readonly runtimeErrors: RuntimeErrorListResult;
}

export interface NcAxisOnlineState {
  readonly errorState: number;
  readonly actualPosition: number;
  readonly moduloActualPosition: number;
  readonly setPosition: number;
  readonly moduloSetPosition: number;
  readonly actualVelocity: number;
  readonly setVelocity: number;
  readonly velocityOverride: number;
  readonly lagErrorPosition: number;
  readonly controllerOutputPercent: number;
  readonly totalOutputPercent: number;
  readonly stateDWord: number;
}

export interface NcAxisStatusFlags {
  readonly ready: boolean;
  readonly referenced: boolean;
  readonly protectedMode: boolean;
  readonly logicalStandstill: boolean;
  readonly referencing: boolean;
  readonly inPositionWindow: boolean;
  readonly atTargetPosition: boolean;
  readonly constantVelocity: boolean;
  readonly busy: boolean;
}

export interface NcAxisReadWarning {
  readonly section: "error" | "status";
  readonly message: string;
}

export interface NcAxisPositionResult {
  readonly axis: NcAxisSummary;
  readonly timestamp: string;
  readonly online: NcAxisOnlineState;
}

export interface NcAxisStatusResult {
  readonly axis: NcAxisSummary;
  readonly timestamp: string;
  readonly status: NcAxisStatusFlags;
  readonly warnings: NcAxisReadWarning[];
}

export interface NcAxisReadResult {
  readonly axis: NcAxisSummary;
  readonly timestamp: string;
  readonly online: NcAxisOnlineState;
  readonly status: NcAxisStatusFlags;
  readonly errorCode: number;
  readonly warnings: NcAxisReadWarning[];
}

export interface NcAxisReadManyResult {
  readonly results: NcAxisReadResult[];
  readonly count: number;
}

export interface NcAxisErrorResult {
  readonly axis: NcAxisSummary;
  readonly timestamp: string;
  readonly errorCode: number;
  readonly hasError: boolean;
  readonly warnings: NcAxisReadWarning[];
}

export interface IoDataPointSummary {
  readonly name: string;
  readonly indexGroup: number;
  readonly indexOffset: number;
  readonly type: string;
  readonly size: number;
  readonly description?: string;
}

export interface IoDataPointGroupSummary {
  readonly name: string;
  readonly dataPoints: string[];
  readonly count: number;
}

export interface IoListGroupsResult {
  readonly groups: IoDataPointGroupSummary[];
  readonly dataPoints: IoDataPointSummary[];
  readonly count: number;
}

export interface IoReadResult {
  readonly dataPoint: IoDataPointSummary;
  readonly value: unknown;
  readonly rawHex: string;
  readonly timestamp: string;
}

export interface IoReadManyResult {
  readonly results: IoReadResult[];
  readonly count: number;
}

export interface IoReadGroupResult {
  readonly group: string;
  readonly dataPoints: string[];
  readonly results: IoReadResult[];
  readonly count: number;
}

export type PlcWaitComparisonOperator =
  | "equals"
  | "notEquals"
  | "greaterThan"
  | "greaterThanOrEquals"
  | "lessThan"
  | "lessThanOrEquals";

export interface PlcWaitComparisonCondition {
  readonly name: string;
  readonly operator: PlcWaitComparisonOperator;
  readonly value?: unknown;
}

export interface PlcWaitAllOfCondition {
  readonly allOf: readonly PlcWaitCondition[];
}

export interface PlcWaitAnyOfCondition {
  readonly anyOf: readonly PlcWaitCondition[];
}

export type PlcWaitCondition =
  | PlcWaitComparisonCondition
  | PlcWaitAllOfCondition
  | PlcWaitAnyOfCondition;

export interface PlcWaitUntilInput {
  readonly condition: PlcWaitCondition;
  readonly timeoutMs: number;
  readonly stableForMs?: number;
  readonly cycleTimeMs?: number;
  readonly maxDelayMs?: number;
  readonly signal?: AbortSignal;
}

export type PlcWaitUntilStatus = "fulfilled" | "timeout" | "cancelled";

export interface PlcWaitValueSnapshot {
  readonly name: string;
  readonly value: unknown;
  readonly timestamp: string;
}

export interface PlcWaitUntilResult {
  readonly status: PlcWaitUntilStatus;
  readonly conditionMatched: boolean;
  readonly startedAt: string;
  readonly completedAt: string;
  readonly durationMs: number;
  readonly timeoutMs: number;
  readonly stableForMs: number;
  readonly values: PlcWaitValueSnapshot[];
}

const ADS_STATE_RUN = 5;
const ADS_STATE_STOP = 6;
const ADS_STATE_NAMES = new Map<number, string>([
  [0, "Invalid"],
  [1, "Idle"],
  [2, "Reset"],
  [3, "Initialize"],
  [4, "Start"],
  [ADS_STATE_RUN, "Run"],
  [ADS_STATE_STOP, "Stop"],
  [7, "SaveConfig"],
  [8, "LoadConfig"],
  [9, "PowerFailure"],
  [10, "PowerGood"],
  [11, "Error"],
  [12, "Shutdown"],
  [13, "Suspend"],
  [14, "Resume"],
  [15, "Config"],
  [16, "Reconfig"],
  [17, "Stopping"],
  [18, "Incompatible"],
  [19, "Exception"],
]);

export class WriteDeniedError extends Error {
  readonly code = "WRITE_DENIED" as const;
}

function summarizeAdsState(state: AdsState): AdsStateSummary {
  const adsStateName =
    state.adsStateStr ??
    ADS_STATE_NAMES.get(state.adsState) ??
    `Unknown(${state.adsState})`;

  return {
    adsState: state.adsState,
    adsStateName,
    deviceState: state.deviceState,
    isRun: state.adsState === ADS_STATE_RUN,
    isStop: state.adsState === ADS_STATE_STOP,
  };
}

export interface WatchSymbolOptions {
  readonly mode?: PlcWatchMode;
  readonly cycleTimeMs?: number;
  readonly maxDelayMs?: number;
}

function collectConditionSymbols(
  condition: PlcWaitCondition,
  symbols = new Set<string>(),
): Set<string> {
  if ("name" in condition) {
    symbols.add(condition.name.trim());
    return symbols;
  }

  if ("allOf" in condition) {
    for (const child of condition.allOf) {
      collectConditionSymbols(child, symbols);
    }
    return symbols;
  }

  for (const child of condition.anyOf) {
    collectConditionSymbols(child, symbols);
  }

  return symbols;
}

function valuesEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) {
    return true;
  }

  if (
    left === null ||
    right === null ||
    typeof left !== "object" ||
    typeof right !== "object"
  ) {
    return false;
  }

  try {
    return JSON.stringify(left) === JSON.stringify(right);
  } catch {
    return false;
  }
}

function compareNumbers(
  left: unknown,
  right: unknown,
  operator: Exclude<PlcWaitComparisonOperator, "equals" | "notEquals">,
): boolean {
  let leftNumber: number;
  let rightNumber: number;
  try {
    leftNumber = Number(left);
    rightNumber = Number(right);
  } catch {
    // A structured PLC value can have fields that shadow JS coercion methods.
    return false;
  }

  if (!Number.isFinite(leftNumber) || !Number.isFinite(rightNumber)) {
    return false;
  }

  switch (operator) {
    case "greaterThan":
      return leftNumber > rightNumber;
    case "greaterThanOrEquals":
      return leftNumber >= rightNumber;
    case "lessThan":
      return leftNumber < rightNumber;
    case "lessThanOrEquals":
      return leftNumber <= rightNumber;
  }
}

function evaluateCondition(
  condition: PlcWaitCondition,
  values: ReadonlyMap<string, PlcWaitValueSnapshot>,
): boolean {
  if ("allOf" in condition) {
    return condition.allOf.every((child) => evaluateCondition(child, values));
  }

  if ("anyOf" in condition) {
    return condition.anyOf.some((child) => evaluateCondition(child, values));
  }

  const snapshot = values.get(condition.name.trim());
  if (snapshot === undefined) {
    return false;
  }

  switch (condition.operator) {
    case "equals":
      return valuesEqual(snapshot.value, condition.value);
    case "notEquals":
      return !valuesEqual(snapshot.value, condition.value);
    default:
      return compareNumbers(snapshot.value, condition.value, condition.operator);
  }
}

const DEFAULT_DIAGNOSE_EVENT_LIMIT = 10;
const DEFAULT_DIAGNOSE_LOG_LIMIT_BYTES = 8_192;
const DEFAULT_DIAGNOSE_LOG_TAIL_LINES = 80;

export interface TwinCatAdsService {
  readonly state: AdsConnectionState;
  readonly writeMode: PlcWriteMode;
  readonly lastError: Error | undefined;
  readonly hasActiveConnection: boolean;

  listServices(): AdsNamedServiceConnectionSummary[];
  getServiceClient(name: TwinCatAdsServiceName): Client;
  connectService(name: TwinCatAdsServiceName): Promise<AdsClientConnection>;
  disconnectService(name: TwinCatAdsServiceName): Promise<void>;
  connect(): Promise<AdsClientConnection>;
  disconnect(): Promise<void>;
  listSymbols(filter?: string): Promise<PlcSymbolSummary[]>;
  describeSymbol(name: string): Promise<PlcSymbolDescription>;
  readSymbol<T = unknown>(name: string): Promise<PlcReadResult<T>>;
  readMany(names: readonly string[]): Promise<PlcReadResult[]>;
  listGroups(): PlcSymbolGroupSummary[];
  readGroup(group: string): Promise<PlcReadGroupResult>;
  ncState(): Promise<NcStateResult>;
  ncListAxes(): NcAxisSummary[];
  ncReadAxisPosition(axis: string | number): Promise<NcAxisPositionResult>;
  ncReadAxisStatus(axis: string | number): Promise<NcAxisStatusResult>;
  ncReadAxis(axis: string | number): Promise<NcAxisReadResult>;
  ncReadAxisMany(axes: readonly (string | number)[]): Promise<NcAxisReadManyResult>;
  ncReadError(axis: string | number): Promise<NcAxisErrorResult>;
  ioListGroups(): IoListGroupsResult;
  ioRead(name: string): Promise<IoReadResult>;
  ioReadMany(names: readonly string[]): Promise<IoReadManyResult>;
  ioReadGroup(group: string): Promise<IoReadGroupResult>;
  tcState(): Promise<TwinCatStateResult>;
  tcEventList(input?: RuntimeEventQuery): Promise<RuntimeEventListResult>;
  tcRuntimeErrorList(input?: RuntimeEventQuery): Promise<RuntimeErrorListResult>;
  tcLogRead(input?: RuntimeLogQuery): Promise<RuntimeLogReadResult>;
  tcDiagnoseErrors(
    input?: TwinCatDiagnoseErrorsInput,
  ): Promise<TwinCatDiagnoseErrorsResult>;
  tcDiagnoseRuntime(
    input?: TwinCatDiagnoseRuntimeInput,
  ): Promise<TwinCatDiagnoseRuntimeResult>;
  writeSymbol<T = unknown>(
    name: string,
    value: T,
  ): Promise<PlcWriteResult<T>>;
  waitUntil(input: PlcWaitUntilInput): Promise<PlcWaitUntilResult>;
  watchSymbol(
    name: string,
    options?: WatchSymbolOptions,
  ): Promise<PlcWatchRegistration>;
  unwatchSymbol(name: string): Promise<PlcWatchSnapshot>;
  listWatches(): PlcWatchSnapshot[];
  readState(): Promise<PlcStateResult>;
  setWriteMode(mode: PlcWriteMode): PlcWriteModeResult;
  getWriteModeState(): PlcWriteModeResult;
  canWrite(symbolName: string): PlcWriteAccessResult;
}

interface PlcWatchEntry {
  subscription: ActiveSubscription<unknown>;
  cycleTimeMs: number;
  mode: PlcWatchMode;
  callback?: SubscriptionCallback<unknown>;
  maxDelayMs?: number;
  lastValue?: unknown;
  lastTimestamp?: string;
}

type AdsServiceRuntimeConfigInput = Omit<
  ExtensionRuntimeConfig,
  "diagnostics" | "maxWaitUntilMs" | "services"
> & {
  readonly diagnostics?: ExtensionRuntimeConfig["diagnostics"];
  readonly maxWaitUntilMs?: number;
  readonly services?: Partial<ExtensionRuntimeConfig["services"]>;
};

function completeRuntimeConfig(
  config: AdsServiceRuntimeConfigInput,
): ExtensionRuntimeConfig {
  const plcTargetAdsPort =
    config.services?.plc?.targetAdsPort ?? config.targetAdsPort;

  return {
    ...config,
    diagnostics: normalizeRuntimeDiagnosticsConfig(config.diagnostics),
    targetAdsPort: plcTargetAdsPort,
    maxWaitUntilMs: config.maxWaitUntilMs ?? DEFAULT_MAX_WAIT_UNTIL_MS,
    services: {
      plc: {
        targetAdsPort: plcTargetAdsPort,
        symbolGroups: config.services?.plc?.symbolGroups ?? {},
      },
      nc: {
        targetAdsPort:
          config.services?.nc?.targetAdsPort ?? DEFAULT_NC_ADS_PORT,
        axes: config.services?.nc?.axes ?? [],
      },
      io: {
        targetAdsPort:
          config.services?.io?.targetAdsPort ?? DEFAULT_IO_ADS_PORT,
        dataPoints: config.services?.io?.dataPoints ?? [],
        groups: config.services?.io?.groups ?? {},
      },
    },
  };
}

function toAdsClientSettings(
  config: ExtensionRuntimeConfig,
  targetAdsPort: number,
  options: { readonly rawClient?: boolean; readonly autoReconnect: boolean },
): AdsClientSettings {
  if (config.connectionMode === "direct") {
    const settings: AdsClientSettings = {
      targetAmsNetId: config.targetAmsNetId,
      targetAdsPort,
      autoReconnect: options.autoReconnect,
    };

    if (options.rawClient === true) {
      settings.rawClient = true;
    }

    if (config.routerAddress !== undefined) {
      settings.routerAddress = config.routerAddress;
    }

    if (config.routerTcpPort !== undefined) {
      settings.routerTcpPort = config.routerTcpPort;
    }

    if (config.localAmsNetId !== undefined) {
      settings.localAmsNetId = config.localAmsNetId;
    }

    if (config.localAdsPort !== undefined) {
      settings.localAdsPort = config.localAdsPort;
    }

    return settings;
  }

  const settings: AdsClientSettings = {
    targetAmsNetId: config.targetAmsNetId,
    targetAdsPort,
    autoReconnect: options.autoReconnect,
  };

  if (options.rawClient === true) {
    settings.rawClient = true;
  }

  return settings;
}

function createServiceClients(
  config: ExtensionRuntimeConfig,
  autoReconnect: boolean,
): Map<TwinCatAdsServiceName, Client> {
  return new Map<TwinCatAdsServiceName, Client>([
    [
      "plc",
      new Client(
        toAdsClientSettings(config, config.services.plc.targetAdsPort, { autoReconnect }),
      ),
    ],
    [
      "nc",
      new Client(
        toAdsClientSettings(config, config.services.nc.targetAdsPort, {
          rawClient: true,
          autoReconnect,
        }),
      ),
    ],
    [
      "io",
      new Client(
        toAdsClientSettings(config, config.services.io.targetAdsPort, {
          rawClient: true,
          autoReconnect,
        }),
      ),
    ],
  ]);
}

function toSymbolSummary(name: string, symbol: AdsSymbol): PlcSymbolSummary {
  return {
    name,
    type: symbol.type,
    size: symbol.size,
    comment: symbol.comment ?? "",
    flags: symbol.flags,
    indexGroup: symbol.indexGroup,
    indexOffset: symbol.indexOffset,
  };
}

function toDataTypeDescription(
  dataType: AdsDataType,
  depth = 0,
): PlcDataTypeMemberDescription {
  const description: {
    name: string;
    type: string;
    size: number;
    offset: number;
    comment: string;
    arrayDimension: number;
    arrayInfos: AdsDataType["arrayInfos"];
    attributes: AdsDataType["attributes"];
    subItems?: PlcDataTypeMemberDescription[];
  } = {
    name: dataType.name,
    type: dataType.type,
    size: dataType.size,
    offset: dataType.offset,
    comment: dataType.comment ?? "",
    arrayDimension: dataType.arrayDimension,
    arrayInfos: dataType.arrayInfos,
    attributes: dataType.attributes,
  };

  if (depth < 2 && dataType.subItems.length > 0) {
    description.subItems = dataType.subItems.map((subItem) =>
      toDataTypeDescription(subItem, depth + 1),
    );
  }

  return description;
}

function toSymbolDescription(
  name: string,
  symbol: AdsSymbol,
  dataType?: AdsDataType,
): PlcSymbolDescription {
  const description: {
    name: string;
    type: string;
    size: number;
    comment: string;
    flags: number;
    indexGroup: number;
    indexOffset: number;
    adsDataType?: number;
    adsDataTypeStr?: string;
    flagsStr?: string[];
    arrayDimension?: number;
    arrayInfo?: AdsSymbol["arrayInfo"];
    attributes?: AdsSymbol["attributes"];
    typeGuid?: string;
    dataType?: PlcDataTypeMemberDescription;
  } = {
    ...toSymbolSummary(name, symbol),
  };

  if (symbol.adsDataType !== undefined) {
    description.adsDataType = symbol.adsDataType;
  }

  if (symbol.adsDataTypeStr !== undefined) {
    description.adsDataTypeStr = symbol.adsDataTypeStr;
  }

  if (symbol.flagsStr !== undefined) {
    description.flagsStr = symbol.flagsStr;
  }

  if (symbol.arrayDimension !== undefined) {
    description.arrayDimension = symbol.arrayDimension;
  }

  if (symbol.arrayInfo !== undefined) {
    description.arrayInfo = symbol.arrayInfo;
  }

  if (symbol.attributes !== undefined) {
    description.attributes = symbol.attributes;
  }

  if (symbol.typeGuid !== undefined) {
    description.typeGuid = symbol.typeGuid;
  }

  if (dataType !== undefined) {
    description.dataType = toDataTypeDescription(dataType);
  }

  return description;
}

function toReadResult<T>(result: ReadValueResult<T>): PlcReadResult<T> {
  return {
    name: result.symbol.name,
    value: result.value,
    type: result.dataType.name,
    timestamp: new Date().toISOString(),
    symbol: result.symbol,
  };
}

function toRawReadCommand(symbol: AdsSymbol): ReadRawMultiCommand {
  return {
    indexGroup: symbol.indexGroup,
    indexOffset: symbol.indexOffset,
    size: symbol.size,
  };
}

const NC_AXIS_STATE_INDEX_GROUP_BASE = 0x4100;
const NC_AXIS_ONLINE_STATE_OFFSET = 0x00000000;
const NC_AXIS_ONLINE_STATE_SIZE = 256;
const NC_AXIS_ONLINE_STATE_LEGACY_SIZE = 112;
const NC_AXIS_ERROR_CODE_OFFSET = 0x000000b1;

const NC_AXIS_STATUS_OFFSETS = {
  ready: 0x00000082,
  referenced: 0x00000083,
  protectedMode: 0x00000084,
  logicalStandstill: 0x0000008c,
  referencing: 0x0000008d,
  inPositionWindow: 0x0000008e,
  atTargetPosition: 0x0000008f,
  constantVelocity: 0x00000090,
  busy: 0x0000009a,
} as const;

const IO_TYPE_SIZES = new Map<string, number>([
  ["BOOL", 1],
  ["BYTE", 1],
  ["USINT", 1],
  ["SINT", 1],
  ["WORD", 2],
  ["UINT", 2],
  ["INT", 2],
  ["DWORD", 4],
  ["UDINT", 4],
  ["DINT", 4],
  ["REAL", 4],
  ["LWORD", 8],
  ["ULINT", 8],
  ["LINT", 8],
  ["LREAL", 8],
  ["REAL64", 8],
]);

function adsTargetOptions(
  targetAdsPort: number | undefined,
): Partial<AmsAddress> | undefined {
  return targetAdsPort === undefined ? undefined : { adsPort: targetAdsPort };
}

function axisStateIndexGroup(axisId: number): number {
  return NC_AXIS_STATE_INDEX_GROUP_BASE + axisId;
}

function readUInt16Flag(buffer: Buffer): boolean {
  return buffer.readUInt16LE(0) !== 0;
}

function decodeNcAxisOnlineState(buffer: Buffer): NcAxisOnlineState {
  return {
    errorState: buffer.readInt32LE(0),
    actualPosition: buffer.readDoubleLE(8),
    moduloActualPosition: buffer.readDoubleLE(16),
    setPosition: buffer.readDoubleLE(24),
    moduloSetPosition: buffer.readDoubleLE(32),
    actualVelocity: buffer.readDoubleLE(40),
    setVelocity: buffer.readDoubleLE(48),
    velocityOverride: buffer.readUInt32LE(56),
    lagErrorPosition: buffer.readDoubleLE(64),
    controllerOutputPercent: buffer.readDoubleLE(88),
    totalOutputPercent: buffer.readDoubleLE(96),
    stateDWord: buffer.readUInt32LE(104),
  };
}

async function readNcAxisOnlineState(
  client: Client,
  indexGroup: number,
  targetOptions: Partial<AmsAddress> | undefined,
): Promise<Buffer> {
  try {
    return await client.readRaw(
      indexGroup,
      NC_AXIS_ONLINE_STATE_OFFSET,
      NC_AXIS_ONLINE_STATE_SIZE,
      targetOptions,
    );
  } catch (error) {
    try {
      return await client.readRaw(
        indexGroup,
        NC_AXIS_ONLINE_STATE_OFFSET,
        NC_AXIS_ONLINE_STATE_LEGACY_SIZE,
        targetOptions,
      );
    } catch {
      throw error;
    }
  }
}

async function readNcAxisErrorCode(
  client: Client,
  indexGroup: number,
  targetOptions: Partial<AmsAddress> | undefined,
  onlineStateBuffer?: Buffer,
): Promise<{ errorCode: number; warnings: NcAxisReadWarning[] }> {
  try {
    const buffer = await client.readRaw(
      indexGroup,
      NC_AXIS_ERROR_CODE_OFFSET,
      4,
      targetOptions,
    );
    return { errorCode: buffer.readUInt32LE(0), warnings: [] };
  } catch {
    const warning = {
      section: "error",
      message:
        "NC axis error-code offset 177 could not be read; using online error state as fallback.",
    } satisfies NcAxisReadWarning;

    if (onlineStateBuffer !== undefined) {
      return {
        errorCode: onlineStateBuffer.readUInt32LE(0),
        warnings: [warning],
      };
    }

    const buffer = await readNcAxisOnlineState(
      client,
      indexGroup,
      targetOptions,
    );
    return {
      errorCode: buffer.readUInt32LE(0),
      warnings: [warning],
    };
  }
}

function defaultNcAxisStatusFlags(): NcAxisStatusFlags {
  return Object.fromEntries(
    Object.keys(NC_AXIS_STATUS_OFFSETS).map((key) => [key, false]),
  ) as unknown as NcAxisStatusFlags;
}

async function readNcAxisStatusFlags(
  client: Client,
  indexGroup: number,
  targetOptions: Partial<AmsAddress> | undefined,
): Promise<{ status: NcAxisStatusFlags; warnings: NcAxisReadWarning[] }> {
  const statusKeys = Object.keys(
    NC_AXIS_STATUS_OFFSETS,
  ) as Array<keyof NcAxisStatusFlags>;
  const statusCommands = Object.values(NC_AXIS_STATUS_OFFSETS).map(
    (indexOffset): ReadRawMultiCommand => ({
      indexGroup,
      indexOffset,
      size: 2,
    }),
  );

  try {
    const results = await client.readRawMulti(statusCommands, targetOptions);
    const warnings: NcAxisReadWarning[] = [];
    const status = Object.fromEntries(
      statusKeys.map((key, index) => {
        const result = results[index];
        const indexOffset = statusCommands[index]?.indexOffset;
        const readable = result?.success === true && result.value !== undefined;
        if (!readable) {
          warnings.push({
            section: "status",
            message: `NC axis status flag ${String(key)} at offset ${indexOffset ?? "unknown"} could not be read.`,
          });
        }
        const value =
          readable && result.value !== undefined
            ? readUInt16Flag(result.value)
            : false;
        return [key, value];
      }),
    ) as unknown as NcAxisStatusFlags;
    return { status, warnings };
  } catch {
    return {
      status: defaultNcAxisStatusFlags(),
      warnings: [
        {
          section: "status",
          message: "NC axis status flags could not be read.",
        },
      ],
    };
  }
}

function ioTypeSize(type: string): number | undefined {
  const normalizedType = type.trim().toUpperCase();
  const stringMatch = normalizedType.match(/^STRING(?:\((\d+)\))?$/);
  if (stringMatch) {
    return Number(stringMatch[1] ?? 81);
  }

  return IO_TYPE_SIZES.get(normalizedType);
}

function decodeIoValue(buffer: Buffer, type: string): unknown {
  const normalizedType = type.trim().toUpperCase();
  if (normalizedType.startsWith("STRING")) {
    return buffer.toString("utf8").replace(/\0.*$/u, "");
  }

  switch (normalizedType) {
    case "BOOL":
      return buffer.readUInt8(0) !== 0;
    case "BYTE":
    case "USINT":
      return buffer.readUInt8(0);
    case "SINT":
      return buffer.readInt8(0);
    case "WORD":
    case "UINT":
      return buffer.readUInt16LE(0);
    case "INT":
      return buffer.readInt16LE(0);
    case "DWORD":
    case "UDINT":
      return buffer.readUInt32LE(0);
    case "DINT":
      return buffer.readInt32LE(0);
    case "REAL":
      return buffer.readFloatLE(0);
    case "LWORD":
    case "ULINT":
      return buffer.readBigUInt64LE(0);
    case "LINT":
      return buffer.readBigInt64LE(0);
    case "LREAL":
    case "REAL64":
      return buffer.readDoubleLE(0);
    default:
      return buffer.toString("hex");
  }
}

function assertRawReadSuccess(
  result: ReadRawMultiResult,
  label: string,
): Buffer {
  if (!result.success || result.value === undefined) {
    throw new Error(`ADS raw read failed for ${label}.`);
  }

  return result.value;
}

export class AdsService {
  readonly #serviceClients: Map<TwinCatAdsServiceName, Client>;
  readonly #client: Client;
  readonly #symbolCache = new Map<string, AdsSymbol>();
  readonly #symbolLookupCache = new Map<string, AdsSymbol>();
  readonly #handleCache = new Map<string, VariableHandle>();
  readonly #watchCache = new Map<string, PlcWatchEntry>();
  readonly #watchRegistrations = new Map<string, Promise<PlcWatchRegistration>>();

  #state: AdsConnectionState = "disconnected";
  #lastError: Error | undefined;
  #connectPromise: Promise<AdsClientConnection> | undefined;
  #symbolsLoaded = false;
  #writeMode: PlcWriteMode = "read-only";
  #disconnectGeneration = 0;
  private readonly config: ExtensionRuntimeConfig;
  private readonly runtimeDiagnostics: RuntimeDiagnostics;

  constructor(
    config: AdsServiceRuntimeConfigInput,
    private readonly dependencies: AdsServiceDependencies = {},
  ) {
    this.config = completeRuntimeConfig(config);
    this.runtimeDiagnostics = new RuntimeDiagnostics(
      this.config.diagnostics,
      dependencies.diagnostics,
    );
    this.#serviceClients = createServiceClients(
      this.config,
      dependencies.autoReconnect ?? true,
    );
    this.#client = this.#getExistingServiceClient("plc");
    this.#bindClientEvents();
  }

  get client(): Client {
    return this.#client;
  }

  get state(): AdsConnectionState {
    return this.#state;
  }

  get lastError(): Error | undefined {
    return this.#lastError;
  }

  get hasActiveConnection(): boolean {
    return this.#client.connection.connected;
  }

  get writeMode(): PlcWriteMode {
    return this.#writeMode;
  }

  listServices(): AdsNamedServiceConnectionSummary[] {
    return (["plc", "nc", "io"] as const).map((name) => {
      const client = this.#getExistingServiceClient(name);
      return {
        name,
        targetAdsPort: this.config.services[name].targetAdsPort,
        connected: client.connection.connected,
        state: name === "plc" ? this.#state : this.#serviceState(client),
      };
    });
  }

  getServiceClient(name: TwinCatAdsServiceName): Client {
    return this.#getExistingServiceClient(name);
  }

  async connectService(
    name: TwinCatAdsServiceName,
  ): Promise<AdsClientConnection> {
    if (name === "plc") {
      return this.connect();
    }

    const client = this.#getExistingServiceClient(name);
    if (client.connection.connected) {
      return client.connection;
    }

    return client.connect();
  }

  async disconnectService(name: TwinCatAdsServiceName): Promise<void> {
    if (name === "plc") {
      await this.disconnect();
      return;
    }

    const client = this.#getExistingServiceClient(name);
    if (client.connection.connected) {
      await client.disconnect();
    }
  }

  async connect(): Promise<AdsClientConnection> {
    if (this.#connectPromise) {
      return this.#connectPromise;
    }

    if (this.#client.connection.connected) {
      return this.#client.connection;
    }

    const generation = this.#disconnectGeneration;
    const assertCurrent = () => {
      if (generation !== this.#disconnectGeneration) {
        throw new Error("ADS connection was closed.");
      }
    };
    this.#state = "connecting";
    this.#connectPromise = (async () => {
      try {
        const connection = await this.#client.connect().finally(async () => {
          // The transport can become connected after disconnect saw it as offline.
          if (generation !== this.#disconnectGeneration && this.#client.connection.connected) {
            await this.#client.disconnect();
          }
        });
        assertCurrent();

        await this.#client.cacheSymbols();
        assertCurrent();
        await this.#client.cacheDataTypes();
        assertCurrent();
        await this.#loadSymbolCache();
        assertCurrent();

        this.#state = "connected";
        this.#lastError = undefined;
        return connection;
      } catch (error) {
        if (generation === this.#disconnectGeneration) {
          this.#state = "degraded";
          this.#lastError =
            error instanceof Error ? error : new Error(String(error));
        }
        throw error;
      } finally {
        this.#connectPromise = undefined;
      }
    })();

    return this.#connectPromise;
  }

  async disconnect(): Promise<void> {
    this.#disconnectGeneration++;
    this.#watchRegistrations.clear();
    const watchEntries = [...this.#watchCache.values()];
    const handles = [...this.#handleCache.values()];
    const cleanupErrors: Error[] = [];
    let cleanupTimedOut = false;
    if (watchEntries.length > 0 || handles.length > 0) {
      const runCleanup = async (operation: () => Promise<unknown>) => {
        try {
          await operation();
        } catch (error) {
          cleanupErrors.push(
            error instanceof Error ? error : new Error(String(error)),
          );
        }
      };
      let timer: ReturnType<typeof setTimeout> | undefined;
      const deadline = new Promise<void>(resolve => {
        timer = setTimeout(() => {
          cleanupTimedOut = true;
          resolve();
        }, this.dependencies.waitCleanupTimeoutMs ?? 2_000).unref();
      });
      const cleanup = Promise.allSettled([
        ...watchEntries.map(watch => runCleanup(() => this.#client.unsubscribe(watch.subscription))),
        ...handles.map(handle => runCleanup(() => this.#client.deleteVariableHandle(handle))),
      ]);
      try {
        await Promise.race([cleanup, deadline]);
      } finally {
        clearTimeout(timer);
      }
    }

    this.#watchCache.clear();
    this.#invalidateRuntimeCaches();

    if (cleanupTimedOut || this.#client.connection.connected) {
      try {
        // A graceful ADS disconnect retries any subscriptions still active.
        await this.#client.disconnect(cleanupTimedOut);
      } catch (error) {
        cleanupErrors.push(
          error instanceof Error ? error : new Error(String(error)),
        );
      }
    }

    for (const [name, client] of this.#serviceClients.entries()) {
      if (name === "plc" || !client.connection.connected) {
        continue;
      }

      try {
        await client.disconnect();
      } catch (error) {
        cleanupErrors.push(
          error instanceof Error ? error : new Error(String(error)),
        );
      }
    }

    this.#state = "disconnected";

    if (cleanupErrors.length > 0) {
      throw new AggregateError(cleanupErrors, "ADS cleanup failed.");
    }
  }

  async listSymbols(filter?: string): Promise<PlcSymbolSummary[]> {
    await this.connect();
    await this.#ensureSymbolsLoaded();

    const normalizedFilter = filter?.trim().toLowerCase();

    return [...this.#symbolCache.entries()]
      .filter(([name, symbol]) => {
        if (!normalizedFilter) {
          return true;
        }

        return (
          name.toLowerCase().includes(normalizedFilter) ||
          symbol.type.toLowerCase().includes(normalizedFilter) ||
          (symbol.comment ?? "").toLowerCase().includes(normalizedFilter)
        );
      })
      .map(([name, symbol]) => toSymbolSummary(name, symbol))
      .sort((left, right) => left.name.localeCompare(right.name));
  }

  async describeSymbol(name: string): Promise<PlcSymbolDescription> {
    await this.connect();
    const symbol = await this.getSymbol(name);

    try {
      const dataType = await this.#client.getDataType(symbol.type);
      return toSymbolDescription(symbol.name, symbol, dataType);
    } catch {
      return toSymbolDescription(symbol.name, symbol);
    }
  }

  listGroups(): PlcSymbolGroupSummary[] {
    return Object.entries(this.config.services.plc.symbolGroups)
      .map(([name, symbols]) => ({
        name,
        symbols: [...symbols],
        count: symbols.length,
      }))
      .sort((left, right) => left.name.localeCompare(right.name));
  }

  async readGroup(group: string): Promise<PlcReadGroupResult> {
    const normalizedGroup = group.trim();
    const symbols = this.config.services.plc.symbolGroups[normalizedGroup];

    if (symbols === undefined) {
      throw new Error(`PLC symbol group "${normalizedGroup}" was not found.`);
    }

    const results = await this.readMany(symbols);
    return {
      group: normalizedGroup,
      symbols: [...symbols],
      results,
      count: results.length,
    };
  }

  async ncState(): Promise<NcStateResult> {
    const client = await this.#connectServiceClient("nc");
    const [ncRuntimeState, deviceInfo] = await Promise.all([
      client.readState(),
      client.readDeviceInfo(),
    ]);

    return {
      connection: client.connection,
      adsState: this.#serviceState(client),
      ncRuntimeState,
      ncRuntimeStatus: summarizeAdsState(ncRuntimeState),
      deviceInfo,
      axes: this.ncListAxes(),
    };
  }

  ncListAxes(): NcAxisSummary[] {
    return this.config.services.nc.axes
      .map((axis) => this.#toNcAxisSummary(axis))
      .sort((left, right) => left.name.localeCompare(right.name));
  }

  async ncReadAxisPosition(
    axis: string | number,
  ): Promise<NcAxisPositionResult> {
    const axisConfig = this.#resolveNcAxis(axis);
    const axisSummary = this.#toNcAxisSummary(axisConfig);
    const client = await this.#connectServiceClient("nc");
    const onlineBuffer = await readNcAxisOnlineState(
      client,
      axisStateIndexGroup(axisConfig.id),
      adsTargetOptions(axisConfig.targetAdsPort),
    );

    return {
      axis: axisSummary,
      timestamp: new Date().toISOString(),
      online: decodeNcAxisOnlineState(onlineBuffer),
    };
  }

  async ncReadAxisStatus(axis: string | number): Promise<NcAxisStatusResult> {
    const axisConfig = this.#resolveNcAxis(axis);
    const axisSummary = this.#toNcAxisSummary(axisConfig);
    const client = await this.#connectServiceClient("nc");
    const { status, warnings } = await readNcAxisStatusFlags(
      client,
      axisStateIndexGroup(axisConfig.id),
      adsTargetOptions(axisConfig.targetAdsPort),
    );

    return {
      axis: axisSummary,
      timestamp: new Date().toISOString(),
      status,
      warnings,
    };
  }

  async ncReadAxis(axis: string | number): Promise<NcAxisReadResult> {
    const axisConfig = this.#resolveNcAxis(axis);
    const axisSummary = this.#toNcAxisSummary(axisConfig);
    const client = await this.#connectServiceClient("nc");
    const targetOptions = adsTargetOptions(axisConfig.targetAdsPort);
    const indexGroup = axisStateIndexGroup(axisConfig.id);

    const onlineStatePromise = readNcAxisOnlineState(
      client,
      indexGroup,
      targetOptions,
    );
    const statusPromise = readNcAxisStatusFlags(client, indexGroup, targetOptions);
    const onlineBuffer = await onlineStatePromise;
    const [errorResult, statusResult] = await Promise.all([
      readNcAxisErrorCode(client, indexGroup, targetOptions, onlineBuffer),
      statusPromise,
    ]);

    return {
      axis: axisSummary,
      timestamp: new Date().toISOString(),
      online: decodeNcAxisOnlineState(onlineBuffer),
      status: statusResult.status,
      errorCode: errorResult.errorCode,
      warnings: [...errorResult.warnings, ...statusResult.warnings],
    };
  }

  async ncReadAxisMany(
    axes: readonly (string | number)[],
  ): Promise<NcAxisReadManyResult> {
    const results = await Promise.all(
      axes.map((axis) => this.ncReadAxis(axis)),
    );

    return {
      results,
      count: results.length,
    };
  }

  async ncReadError(axis: string | number): Promise<NcAxisErrorResult> {
    const axisConfig = this.#resolveNcAxis(axis);
    const axisSummary = this.#toNcAxisSummary(axisConfig);
    const client = await this.#connectServiceClient("nc");
    const { errorCode, warnings } = await readNcAxisErrorCode(
      client,
      axisStateIndexGroup(axisConfig.id),
      adsTargetOptions(axisConfig.targetAdsPort),
    );

    return {
      axis: axisSummary,
      timestamp: new Date().toISOString(),
      errorCode,
      hasError: errorCode !== 0,
      warnings,
    };
  }

  ioListGroups(): IoListGroupsResult {
    const groups = Object.entries(this.config.services.io.groups)
      .map(([name, dataPoints]) => ({
        name,
        dataPoints: [...dataPoints],
        count: dataPoints.length,
      }))
      .sort((left, right) => left.name.localeCompare(right.name));
    const dataPoints = this.#listIoDataPoints();

    return {
      groups,
      dataPoints,
      count: groups.length,
    };
  }

  async ioRead(name: string): Promise<IoReadResult> {
    const dataPoint = this.#resolveIoDataPoint(name);
    const summary = this.#toIoDataPointSummary(dataPoint);
    const client = await this.#connectServiceClient("io");
    const rawValue = await client.readRaw(
      dataPoint.indexGroup,
      dataPoint.indexOffset,
      summary.size,
    );

    return {
      dataPoint: summary,
      value: decodeIoValue(rawValue, dataPoint.type),
      rawHex: rawValue.toString("hex"),
      timestamp: new Date().toISOString(),
    };
  }

  async ioReadMany(names: readonly string[]): Promise<IoReadManyResult> {
    const dataPoints = names.map((name) => this.#resolveIoDataPoint(name));
    const client = await this.#connectServiceClient("io");
    const rawResults = await client.readRawMulti(
      dataPoints.map((dataPoint) => {
        const summary = this.#toIoDataPointSummary(dataPoint);
        return {
          indexGroup: dataPoint.indexGroup,
          indexOffset: dataPoint.indexOffset,
          size: summary.size,
        };
      }),
    );
    const timestamp = new Date().toISOString();
    const results = rawResults.map((result, index): IoReadResult => {
      const dataPoint = dataPoints[index];
      if (dataPoint === undefined) {
        throw new Error(`Internal IO data point mapping failed at index ${index}.`);
      }

      const summary = this.#toIoDataPointSummary(dataPoint);
      const rawValue = assertRawReadSuccess(result, `IO data point ${summary.name}`);
      return {
        dataPoint: summary,
        value: decodeIoValue(rawValue, dataPoint.type),
        rawHex: rawValue.toString("hex"),
        timestamp,
      };
    });

    return {
      results,
      count: results.length,
    };
  }

  async ioReadGroup(group: string): Promise<IoReadGroupResult> {
    const normalizedGroup = group.trim();
    const dataPoints = this.config.services.io.groups[normalizedGroup];

    if (dataPoints === undefined) {
      throw new Error(`IO group "${normalizedGroup}" was not found.`);
    }

    const result = await this.ioReadMany(dataPoints);
    return {
      group: normalizedGroup,
      dataPoints: [...dataPoints],
      results: result.results,
      count: result.count,
    };
  }

  async tcState(): Promise<TwinCatStateResult> {
    const [plc, nc] = await Promise.all([
      this.#captureStateComponent(() => this.readState()),
      this.#captureStateComponent(() => this.ncState()),
    ]);

    return {
      timestamp: new Date().toISOString(),
      adsState: this.#state,
      services: this.listServices(),
      plc,
      nc,
      diagnostics: this.runtimeDiagnostics.listCapabilities(),
    };
  }

  async tcEventList(
    input: RuntimeEventQuery = {},
  ): Promise<RuntimeEventListResult> {
    return this.runtimeDiagnostics.listEvents(input);
  }

  async tcRuntimeErrorList(
    input: RuntimeEventQuery = {},
  ): Promise<RuntimeErrorListResult> {
    return this.runtimeDiagnostics.listRuntimeErrors(input);
  }

  async tcLogRead(input: RuntimeLogQuery = {}): Promise<RuntimeLogReadResult> {
    return this.runtimeDiagnostics.readLog(input);
  }

  async tcDiagnoseErrors(
    input: TwinCatDiagnoseErrorsInput = {},
  ): Promise<TwinCatDiagnoseErrorsResult> {
    const eventQuery: RuntimeEventQuery = {
      source: input.eventSource,
      limit: input.limit ?? DEFAULT_DIAGNOSE_EVENT_LIMIT,
      since: input.since,
      until: input.until,
      severity: input.severity,
      contains: input.contains,
      id: input.id,
    };
    const logQuery: RuntimeLogQuery = {
      source: input.logSource,
      limitBytes: input.logLimitBytes ?? DEFAULT_DIAGNOSE_LOG_LIMIT_BYTES,
      tailLines: input.logTailLines ?? DEFAULT_DIAGNOSE_LOG_TAIL_LINES,
      since: input.since,
      severity: input.severity,
      contains: input.contains,
    };
    const [runtimeErrors, recentEvents, runtimeLog] = await Promise.all([
      this.tcRuntimeErrorList(eventQuery),
      this.tcEventList(eventQuery),
      this.tcLogRead(logQuery),
    ]);

    return {
      timestamp: new Date().toISOString(),
      summary: {
        runtimeErrorCount: runtimeErrors.count,
        recentEventCount: recentEvents.count,
        logBytesRead: runtimeLog.bytesRead,
        runtimeErrorsAvailable: runtimeErrors.available,
        recentEventsAvailable: recentEvents.available,
        runtimeLogAvailable: runtimeLog.available,
        truncated: {
          runtimeErrors: runtimeErrors.truncated,
          recentEvents: recentEvents.truncated,
          runtimeLog: runtimeLog.truncated,
        },
      },
      runtimeErrors,
      recentEvents,
      runtimeLog,
    };
  }

  async tcDiagnoseRuntime(
    input: TwinCatDiagnoseRuntimeInput = {},
  ): Promise<TwinCatDiagnoseRuntimeResult> {
    const ioGroups = this.ioListGroups();
    const [tcState, io, runtimeErrors] = await Promise.all([
      this.tcState(),
      this.#captureStateComponent(() => this.#readIoState(ioGroups)),
      this.tcRuntimeErrorList({
        source: input.eventSource,
        limit: input.limit ?? DEFAULT_DIAGNOSE_EVENT_LIMIT,
        since: input.since,
        until: input.until,
        contains: input.contains,
      }),
    ]);

    return {
      timestamp: new Date().toISOString(),
      summary: {
        adsState: tcState.adsState,
        plcAvailable: tcState.plc.available,
        ncAvailable: tcState.nc.available,
        ioAvailable: io.available,
        configuredIoDataPoints: ioGroups.count,
        configuredIoGroups: ioGroups.groups.length,
        runtimeErrorCount: runtimeErrors.count,
        runtimeErrorsAvailable: runtimeErrors.available,
      },
      tcState,
      plc: tcState.plc,
      nc: tcState.nc,
      io,
      runtimeErrors,
    };
  }

  async readValue<T = unknown>(name: string): Promise<PlcReadResult<T>> {
    await this.connect();
    const result = await this.#client.readValue<T>(name);
    return toReadResult(result);
  }

  async readSymbol<T = unknown>(name: string): Promise<PlcReadResult<T>> {
    return this.readValue(name);
  }

  async readMany(names: readonly string[]): Promise<PlcReadResult[]> {
    await this.connect();
    await this.#ensureSymbolsLoaded();

    const symbolResults = await Promise.all(
      names.map(async (name) => {
        try {
          return await this.getSymbol(name);
        } catch {
          return undefined;
        }
      }),
    );

    if (symbolResults.some((symbol) => symbol === undefined)) {
      return Promise.all(
        names.map(async (name) => {
          const result = await this.#client.readValue(name);
          return toReadResult(result);
        }),
      );
    }

    const symbols = symbolResults as AdsSymbol[];
    const commands = symbols.map((symbol) => toRawReadCommand(symbol));
    const rawResults = await this.#client.readRawMulti(commands);
    const timestamp = new Date().toISOString();

    return Promise.all(
      rawResults.map(async (result, index) => {
        const symbol = symbols[index];
        if (!symbol) {
          throw new Error(
            `Internal symbol mapping failed for PLC read at index ${index}.`,
          );
        }

        if (!result.success || !result.value) {
          throw new Error(`Failed to read PLC symbol "${symbol.name}".`);
        }

        const value = await this.#client.convertFromRaw(
          result.value,
          symbol.type as string | AdsDataType,
        );

        return {
          name: symbol.name,
          value,
          type: symbol.type,
          timestamp,
          symbol,
        };
      }),
    );
  }

  async writeValue<T = unknown>(
    name: string,
    value: T,
  ): Promise<WriteValueResult<T>> {
    await this.connect();
    this.#assertWriteAllowed(name);
    return this.#client.writeValue(name, value);
  }

  async writeSymbol<T = unknown>(
    name: string,
    value: T,
  ): Promise<PlcWriteResult<T>> {
    const result = await this.writeValue(name, value);
    return {
      name: result.symbol.name,
      value: result.value,
      type: result.dataType.name,
      timestamp: new Date().toISOString(),
    };
  }

  setWriteMode(mode: PlcWriteMode): PlcWriteModeResult {
    if (mode === "enabled" && this.config.readOnly) {
      throw new WriteDeniedError(
        "Writes cannot be enabled while config.readOnly is true.",
      );
    }

    this.#writeMode = mode;
    return this.#buildWriteModeResult();
  }

  getWriteModeState(): PlcWriteModeResult {
    return this.#buildWriteModeResult();
  }

  evaluateWriteAccess(symbolName: string): PlcWriteAccessResult {
    try {
      this.#assertWriteAllowed(symbolName);
      return {
        allow: true,
      };
    } catch (error) {
      return {
        allow: false,
        reason: error instanceof Error ? error.message : String(error),
      };
    }
  }

  canWrite(symbolName: string): PlcWriteAccessResult {
    return this.evaluateWriteAccess(symbolName);
  }

  async readState(): Promise<PlcStateResult> {
    await this.connect();

    const [plcRuntimeState, tcSystemState, tcSystemExtendedState, deviceInfo] =
      await Promise.all([
        this.#client.readPlcRuntimeState(),
        this.#client.readTcSystemState(),
        this.#client.readTcSystemExtendedState(),
        this.#client.readDeviceInfo(),
      ]);

    return {
      connection: this.#client.connection,
      adsState: this.#state,
      writeMode: this.#writeMode,
      watchCount: this.#watchCache.size,
      writePolicy: {
        configReadOnly: this.config.readOnly,
        runtimeWriteEnabled: this.#writeMode === "enabled",
        allowlistCount: this.config.writeAllowlist.length,
      },
      plcRuntimeState,
      plcRuntimeStatus: summarizeAdsState(plcRuntimeState),
      tcSystemState,
      tcSystemStatus: summarizeAdsState(tcSystemState),
      tcSystemExtendedState,
      deviceInfo,
    };
  }

  async watchValue(
    name: string,
    callback?: SubscriptionCallback<unknown>,
    options?: {
      readonly cycleTimeMs?: number;
      readonly mode?: PlcWatchMode;
      readonly maxDelayMs?: number;
    },
  ): Promise<PlcWatchRegistration> {
    const generation = this.#disconnectGeneration;

    let existing = this.#watchCache.get(name);
    if (existing && !this.#client.connection.connected) {
      await this.connect();
      if (generation !== this.#disconnectGeneration) {
        throw new Error("PLC watch registration was closed.");
      }
      existing = this.#watchCache.get(name);
    }
    if (existing) {
      return this.#toWatchRegistration(name, existing);
    }

    const pending = this.#watchRegistrations.get(name);
    if (pending) return pending;

    if (this.#watchCache.size + this.#watchRegistrations.size >= this.config.maxNotifications) {
      throw new Error(
        `Notification limit reached (${this.config.maxNotifications}).`,
      );
    }

    const cycleTimeMs =
      options?.cycleTimeMs ?? this.config.notificationCycleTimeMs;
    const mode = options?.mode ?? "on-change";

    const entry: Omit<PlcWatchEntry, "subscription"> = {
      cycleTimeMs,
      mode,
      ...(callback === undefined ? {} : { callback }),
      ...(options?.maxDelayMs === undefined ? {} : { maxDelayMs: options.maxDelayMs }),
    };
    const isCurrent = () =>
      generation === this.#disconnectGeneration && this.#watchRegistrations.get(name) === registration;
    const registration: Promise<PlcWatchRegistration> = Promise.resolve()
      .then(async () => {
        if (!isCurrent()) throw new Error("PLC watch registration was closed.");
        await this.connect();
        if (!isCurrent()) throw new Error("PLC watch registration was closed.");

        const subscription = await this.#subscribeWatch(name, entry);
        if (!isCurrent()) {
          void Promise.resolve().then(() => this.#client.unsubscribe(subscription)).catch(() => {});
          throw new Error("PLC watch registration was closed.");
        }

        const registered = Object.assign(entry, { subscription });
        this.#watchCache.set(name, registered);
        return this.#toWatchRegistration(name, registered);
      }).finally(() => {
        if (this.#watchRegistrations.get(name) === registration) this.#watchRegistrations.delete(name);
      });
    this.#watchRegistrations.set(name, registration);
    return registration;
  }

  async watchSymbol(
    name: string,
    options?: WatchSymbolOptions,
  ): Promise<PlcWatchRegistration> {
    return this.watchValue(name, undefined, options);
  }

  async waitUntil(input: PlcWaitUntilInput): Promise<PlcWaitUntilResult> {
    if (input.timeoutMs > this.config.maxWaitUntilMs) {
      throw new Error(
        `PLC wait timeout ${input.timeoutMs} ms exceeds configured maximum ${this.config.maxWaitUntilMs} ms.`,
      );
    }

    const symbolNames = [...collectConditionSymbols(input.condition)];
    if (symbolNames.length === 0) {
      throw new Error("PLC wait condition must reference at least one symbol.");
    }

    const startedAtTime = Date.now();
    const startedAt = new Date(startedAtTime).toISOString();
    const stableForMs = input.stableForMs ?? 0;
    const cycleTimeMs = input.cycleTimeMs ?? this.config.notificationCycleTimeMs;
    const values = new Map<string, PlcWaitValueSnapshot>();
    const subscriptions: ActiveSubscription<unknown>[] = [];

    return new Promise<PlcWaitUntilResult>((resolve, reject) => {
      let settled = false;
      let stableSince: number | undefined;
      let stableTimer: ReturnType<typeof setTimeout> | undefined;
      let pollTimer: ReturnType<typeof setTimeout> | undefined;
      let pendingOperation = Promise.resolve();

      const timeoutTimer = setTimeout(() => {
        finish("timeout");
      }, input.timeoutMs);

      const abortHandler = () => {
        finish("cancelled");
      };

      const cleanup = async (): Promise<void> => {
        const results = await Promise.allSettled(
          subscriptions.splice(0).map(async subscription => this.#client.unsubscribe(subscription)),
        );
        const cleanupErrors = results.flatMap(result => {
          if (result.status === "fulfilled") return [];
          const error: unknown = result.reason;
          return [error instanceof Error ? error : new Error(String(error))];
        });

        if (cleanupErrors.length > 0) {
          this.#lastError = new AggregateError(
            cleanupErrors,
            "PLC wait subscription cleanup failed.",
          );
        }
      };

      const snapshotValues = (): PlcWaitValueSnapshot[] =>
        symbolNames
          .map((name) => values.get(name))
          .filter((value): value is PlcWaitValueSnapshot => value !== undefined);

      const settle = (complete: () => void): void => {
        settled = true;
        clearTimeout(timeoutTimer);
        clearTimeout(stableTimer);
        clearTimeout(pollTimer);
        input.signal?.removeEventListener("abort", abortHandler);
        // Close existing subscriptions now and drain any late registration even
        // if the caller has already proceeded to disconnect.
        const teardown = Promise.all([cleanup(), pendingOperation.then(cleanup)]);
        let cleanupTimer: ReturnType<typeof setTimeout>;
        const deadline = new Promise<void>(resolve => {
          cleanupTimer = setTimeout(resolve, this.dependencies.waitCleanupTimeoutMs ?? 2_000).unref();
        });
        void Promise.race([teardown, deadline]).finally(() => clearTimeout(cleanupTimer)).then(complete, reject);
      };

      const runOperation = (operation: () => Promise<void>): void => {
        pendingOperation = Promise.resolve().then(operation).catch(error => {
          if (!settled) settle(() => reject(error));
        });
      };

      const finish = (status: PlcWaitUntilStatus): void => {
        if (settled) {
          return;
        }

        const completedAtTime = Date.now();
        const result: PlcWaitUntilResult = {
          status,
          conditionMatched: evaluateCondition(input.condition, values),
          startedAt,
          completedAt: new Date(completedAtTime).toISOString(),
          durationMs: completedAtTime - startedAtTime,
          timeoutMs: input.timeoutMs,
          stableForMs,
          values: snapshotValues(),
        };
        settle(() => resolve(result));
      };

      const evaluate = (): void => {
        if (settled) {
          return;
        }

        const conditionMatched = evaluateCondition(input.condition, values);
        if (!conditionMatched) {
          stableSince = undefined;
          if (stableTimer !== undefined) {
            clearTimeout(stableTimer);
            stableTimer = undefined;
          }
          return;
        }

        if (stableForMs <= 0) {
          finish("fulfilled");
          return;
        }

        const now = Date.now();
        stableSince ??= now;
        const elapsedStableMs = now - stableSince;

        if (elapsedStableMs >= stableForMs) {
          finish("fulfilled");
          return;
        }

        if (stableTimer === undefined) {
          stableTimer = setTimeout(() => {
            stableTimer = undefined;
            evaluate();
          }, stableForMs - elapsedStableMs);
        }
      };

      const updateValue = (name: string, value: unknown, timestamp: Date): void => {
        if (settled) return;
        values.set(name, {
          name,
          value,
          timestamp: timestamp.toISOString(),
        });
        evaluate();
      };

      const poll = async (): Promise<void> => {
        if (settled) return;
        const results = await this.readMany(symbolNames);
        for (const result of results) {
          updateValue(result.name, result.value, new Date(result.timestamp));
        }

        if (!settled) {
          pollTimer = setTimeout(() => runOperation(poll), cycleTimeMs);
        }
      };

      const subscribe = async (): Promise<void> => {
        if (settled || input.signal?.aborted) return;
        await this.connect();
        if (settled || input.signal?.aborted) return;

        try {
          for (const name of symbolNames) {
            if (settled) {
              break;
            }

            const subscription = await this.#client.subscribeValue(
              name,
              (data) => updateValue(name, data.value, data.timestamp),
              cycleTimeMs,
              true,
              input.maxDelayMs,
            );

            subscriptions.push(subscription);
            if (settled) break;
            if (subscription.latestData) {
              updateValue(
                name,
                subscription.latestData.value,
                subscription.latestData.timestamp,
              );
            }

            if (settled) {
              break;
            }
          }

          const missingNames = settled
            ? []
            : symbolNames.filter((name) => !values.has(name));
          if (missingNames.length > 0) {
            const initialValues = await this.readMany(missingNames);
            for (const result of initialValues) {
              updateValue(result.name, result.value, new Date(result.timestamp));
            }
          }
        } catch {
          if (settled) return;
          await cleanup();
          if (!settled) await poll();
        }
      };

      if (input.signal?.aborted) {
        abortHandler();
      } else {
        input.signal?.addEventListener("abort", abortHandler, { once: true });
        runOperation(subscribe);
      }
    });
  }

  async unwatchValue(name: string): Promise<PlcWatchSnapshot> {
    this.#watchRegistrations.delete(name);
    const entry = this.#watchCache.get(name);
    if (!entry) {
      return {
        name,
        notificationHandle: 0,
        cycleTimeMs: this.config.notificationCycleTimeMs,
        mode: "on-change",
        active: false,
      };
    }

    const snapshot = this.#toWatchSnapshot(name, entry);
    await this.#client.unsubscribe(entry.subscription);
    this.#watchCache.delete(name);

    return {
      ...snapshot,
      active: false,
    };
  }

  async unwatchSymbol(name: string): Promise<PlcWatchSnapshot> {
    return this.unwatchValue(name);
  }

  listWatches(): PlcWatchSnapshot[] {
    return [...this.#watchCache.entries()]
      .map(([name, entry]) => this.#toWatchSnapshot(name, entry))
      .sort((left, right) => left.name.localeCompare(right.name));
  }

  async getOrCreateHandle(name: string): Promise<VariableHandle> {
    await this.connect();

    const cached = this.#handleCache.get(name);
    if (cached) {
      return cached;
    }

    const handle = await this.#client.createVariableHandle(name);
    this.#handleCache.set(name, handle);
    return handle;
  }

  async getSymbol(name: string): Promise<AdsSymbol> {
    await this.connect();
    await this.#ensureSymbolsLoaded();

    const cached = this.#getCachedSymbol(name);
    if (cached) {
      return cached;
    }

    throw new Error(`PLC symbol "${name}" was not found.`);
  }

  async releaseHandle(name: string): Promise<void> {
    const handle = this.#handleCache.get(name);
    if (!handle) {
      return;
    }

    await this.#client.deleteVariableHandle(handle);
    this.#handleCache.delete(name);
  }

  #bindClientEvents(): void {
    this.#client.on("connect", () => {
      this.#state = "connected";
      this.dependencies.logger?.info?.("ADS client connected.");
    });

    this.#client.on("disconnect", () => {
      this.#state = "disconnected";
      this.dependencies.logger?.info?.("ADS client disconnected.");
    });

    this.#client.on("connectionLost", () => {
      this.#state = "degraded";
      this.#invalidateRuntimeCaches();
      this.dependencies.logger?.warn?.("ADS client connection lost.");
    });

    this.#client.on("reconnect", () => {
      this.#state = "connected";
      this.#invalidateRuntimeCaches();
      void this.#refreshRuntimeStateAfterReconnect();
      this.dependencies.logger?.info?.("ADS client reconnected.");
    });

    this.#client.on("plcSymbolVersionChange", () => {
      this.#invalidateRuntimeCaches();
      void this.#refreshRuntimeStateAfterReconnect();
    });

    this.#client.on("client-error", (error) => {
      this.#lastError = error;
      this.dependencies.logger?.error?.("ADS client error.", error);
    });
  }

  async #ensureSymbolsLoaded(): Promise<void> {
    if (this.#symbolsLoaded) {
      return;
    }

    await this.#loadSymbolCache();
  }

  #getExistingServiceClient(name: TwinCatAdsServiceName): Client {
    const client = this.#serviceClients.get(name);
    if (client === undefined) {
      throw new Error(`ADS service "${name}" is not configured.`);
    }

    return client;
  }

  async #connectServiceClient(name: TwinCatAdsServiceName): Promise<Client> {
    await this.connectService(name);
    return this.#getExistingServiceClient(name);
  }

  #serviceState(client: Client): AdsConnectionState {
    return client.connection.connected ? "connected" : "disconnected";
  }

  async #captureStateComponent<TData>(
    readComponent: () => Promise<TData>,
  ): Promise<TwinCatStateComponent<TData>> {
    try {
      return {
        available: true,
        data: await readComponent(),
      };
    } catch (error) {
      return {
        available: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async #readIoState(groups: IoListGroupsResult): Promise<TwinCatIoStateResult> {
    const connection = await this.connectService("io");
    const service = this.listServices().find((entry) => entry.name === "io");
    if (service === undefined) {
      throw new Error("IO ADS service summary is not available.");
    }

    return {
      connection,
      service,
      groups,
    };
  }

  #toNcAxisSummary(axis: NcAxisConfig): NcAxisSummary {
    const summary: {
      name: string;
      id: number;
      targetAdsPort: number;
      description?: string;
    } = {
      name: axis.name,
      id: axis.id,
      targetAdsPort: axis.targetAdsPort ?? this.config.services.nc.targetAdsPort,
    };

    if (axis.description !== undefined) {
      summary.description = axis.description;
    }

    return summary;
  }

  #resolveNcAxis(axis: string | number): NcAxisConfig {
    const normalizedAxis =
      typeof axis === "number" ? String(axis) : axis.trim();
    const numericAxis = Number(normalizedAxis);

    const axisConfig = this.config.services.nc.axes.find(
      (entry) =>
        entry.name.toLowerCase() === normalizedAxis.toLowerCase() ||
        (Number.isInteger(numericAxis) && entry.id === numericAxis),
    );

    if (axisConfig === undefined) {
      throw new Error(`NC axis "${normalizedAxis}" was not found.`);
    }

    return axisConfig;
  }

  #toIoDataPointSummary(dataPoint: IoDataPointConfig): IoDataPointSummary {
    const size = dataPoint.size ?? ioTypeSize(dataPoint.type);
    if (size === undefined) {
      throw new Error(
        `IO data point "${dataPoint.name}" uses unsupported type "${dataPoint.type}". Configure size to read it as raw data.`,
      );
    }

    const summary: {
      name: string;
      indexGroup: number;
      indexOffset: number;
      type: string;
      size: number;
      description?: string;
    } = {
      name: dataPoint.name,
      indexGroup: dataPoint.indexGroup,
      indexOffset: dataPoint.indexOffset,
      type: dataPoint.type,
      size,
    };

    if (dataPoint.description !== undefined) {
      summary.description = dataPoint.description;
    }

    return summary;
  }

  #listIoDataPoints(): IoDataPointSummary[] {
    return this.config.services.io.dataPoints
      .map((dataPoint) => this.#toIoDataPointSummary(dataPoint))
      .sort((left, right) => left.name.localeCompare(right.name));
  }

  #resolveIoDataPoint(name: string): IoDataPointConfig {
    const normalizedName = name.trim();
    const dataPoint = this.config.services.io.dataPoints.find(
      (entry) => entry.name.toLowerCase() === normalizedName.toLowerCase(),
    );

    if (dataPoint === undefined) {
      throw new Error(`IO data point "${normalizedName}" was not found.`);
    }

    return dataPoint;
  }

  async #loadSymbolCache(): Promise<void> {
    const generation = this.#disconnectGeneration;
    const symbols = await this.#client.getSymbols();
    if (generation !== this.#disconnectGeneration) return;
    this.#symbolCache.clear();
    this.#symbolLookupCache.clear();

    for (const [name, symbol] of Object.entries(symbols)) {
      this.#symbolCache.set(name, symbol);
      this.#symbolLookupCache.set(name.trim().toLowerCase(), symbol);
    }

    this.#symbolsLoaded = true;
  }

  #invalidateRuntimeCaches(): void {
    this.#symbolCache.clear();
    this.#symbolLookupCache.clear();
    this.#handleCache.clear();
    this.#symbolsLoaded = false;
  }

  #getCachedSymbol(name: string): AdsSymbol | undefined {
    const trimmedName = name.trim();

    return (
      this.#symbolCache.get(trimmedName) ??
      this.#symbolLookupCache.get(trimmedName.toLowerCase())
    );
  }

  #assertWriteAllowed(symbolName: string): void {
    if (this.config.readOnly) {
      throw new WriteDeniedError(
        "PLC writes are disabled by configuration because readOnly is true.",
      );
    }

    if (this.#writeMode !== "enabled") {
      throw new WriteDeniedError(
        "PLC writes are blocked by the runtime write gate. Enable writes explicitly before calling plc_write.",
      );
    }

    if (this.config.writeAllowlist.length === 0) {
      throw new WriteDeniedError(
        "PLC write denied because the configured writeAllowlist is empty, so no writes are currently permitted.",
      );
    }

    if (!isWriteAllowed(this.config, symbolName)) {
      throw new WriteDeniedError(
        `PLC write denied because "${symbolName}" is not in the configured writeAllowlist.`,
      );
    }
  }

  async #refreshRuntimeStateAfterReconnect(): Promise<void> {
    if (!this.#client.connection.connected) {
      return;
    }

    try {
      await this.#client.cacheSymbols();
      await this.#client.cacheDataTypes();
      await this.#loadSymbolCache();
      await this.#rebindWatchSubscriptions();
    } catch (error) {
      this.#lastError = error instanceof Error ? error : new Error(String(error));
      this.dependencies.logger?.warn?.(
        "ADS runtime refresh after reconnect failed.",
      );
    }
  }

  async #rebindWatchSubscriptions(): Promise<void> {
    const restoredSubscriptions = this.#collectActiveSubscriptionsByTarget();

    for (const [name, entry] of this.#watchCache.entries()) {
      const restored = restoredSubscriptions.get(name);

      if (restored) {
        entry.subscription = restored;

        if (restored.latestData) {
          entry.lastValue = restored.latestData.value;
          entry.lastTimestamp = restored.latestData.timestamp.toISOString();
        }

        continue;
      }

      entry.subscription = await this.#subscribeWatch(name, entry);
    }
  }

  #collectActiveSubscriptionsByTarget(): Map<string, ActiveSubscription<unknown>> {
    const subscriptions = new Map<string, ActiveSubscription<unknown>>();

    for (const targetContainer of Object.values(this.#client.activeSubscriptions)) {
      for (const subscription of Object.values(targetContainer)) {
        const target = subscription.settings.target;

        if (typeof target === "string") {
          subscriptions.set(target, subscription as ActiveSubscription<unknown>);
        }
      }
    }

    return subscriptions;
  }

  async #subscribeWatch(
    name: string,
    entry: Omit<PlcWatchEntry, "subscription">,
  ): Promise<ActiveSubscription<unknown>> {
    const subscription = await this.#client.subscribeValue(
      name,
      (data, activeSubscription) => {
        entry.lastValue = data.value;
        entry.lastTimestamp = data.timestamp.toISOString();
        entry.callback?.(data, activeSubscription);
      },
      entry.cycleTimeMs,
      entry.mode === "on-change",
      entry.maxDelayMs,
    );

    if (subscription.latestData) {
      entry.lastValue = subscription.latestData.value;
      entry.lastTimestamp = subscription.latestData.timestamp.toISOString();
    }

    return subscription;
  }

  #toWatchRegistration(
    name: string,
    entry: PlcWatchEntry,
  ): PlcWatchRegistration {
    const snapshot = this.#toWatchSnapshot(name, entry);

    return {
      ...snapshot,
      unsubscribe: async () => {
        await this.unwatchValue(name);
      },
    };
  }

  #toWatchSnapshot(name: string, entry: PlcWatchEntry): PlcWatchSnapshot {
    const snapshot: {
      name: string;
      notificationHandle: number;
      cycleTimeMs: number;
      mode: PlcWatchMode;
      active: boolean;
      lastValue?: unknown;
      lastTimestamp?: string;
    } = {
      name,
      notificationHandle: entry.subscription.notificationHandle,
      cycleTimeMs: entry.cycleTimeMs,
      mode: entry.mode,
      active: true,
    };

    if (entry.lastValue !== undefined) {
      snapshot.lastValue = entry.lastValue;
    }

    if (entry.lastTimestamp !== undefined) {
      snapshot.lastTimestamp = entry.lastTimestamp;
    }

    return snapshot;
  }

  #buildWriteModeResult(): PlcWriteModeResult {
    return {
      writeMode: this.#writeMode,
      runtimeWriteEnabled: this.#writeMode === "enabled",
      configReadOnly: this.config.readOnly,
      writesAllowed: !this.config.readOnly && this.#writeMode === "enabled",
      message:
        this.#writeMode === "enabled"
          ? "PLC writes are enabled for this session."
          : "PLC writes are blocked for this session.",
    };
  }
}

export { ADS };
