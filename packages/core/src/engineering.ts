import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
} from "node:fs";
import { basename, dirname, extname, isAbsolute, join, normalize } from "node:path";

import { XMLParser } from "fast-xml-parser";

import type {
  EngineeringBackendConfig,
  EngineeringConfig,
  EngineeringProjectFileConfig,
  EngineeringProjectTypeConfig,
} from "./config.js";

export type EngineeringBackendSource =
  | "configuredProjectFiles"
  | "solutionReference";

export interface EngineeringCapabilityFlags {
  readonly runtimeOnly: boolean;
  readonly engineeringRead: boolean;
  readonly engineeringWrite: boolean;
}

export interface EngineeringBackendCapability {
  readonly backend: EngineeringBackendConfig;
  readonly available: boolean;
  readonly capabilities: EngineeringCapabilityFlags;
  readonly reason?: string;
}

export interface EngineeringWorkbenchSummary {
  readonly id: string;
  readonly name: string;
  readonly backend: EngineeringBackendConfig;
  readonly available: boolean;
  readonly capabilities: EngineeringCapabilityFlags;
  readonly projectCount: number;
}

export interface EngineeringProjectSummary {
  readonly id: string;
  readonly name: string;
  readonly path: string;
  readonly type: EngineeringProjectTypeConfig;
  readonly exists: boolean;
  readonly source: EngineeringBackendSource;
  readonly workbenchId: string;
  readonly resourceUri?: string | undefined;
  readonly folderUri?: string | undefined;
}

export interface EngineeringProjectState {
  readonly project: EngineeringProjectSummary;
  readonly backend: EngineeringBackendConfig;
  readonly capabilities: EngineeringCapabilityFlags;
  readonly activeConnection: {
    readonly available: boolean;
    readonly source: "none" | "configuredProjectFiles";
    readonly reason?: string;
  };
}

export interface EngineeringListWorkbenchesResult {
  readonly backendCapabilities: EngineeringBackendCapability[];
  readonly workbenches: EngineeringWorkbenchSummary[];
  readonly count: number;
}

export interface EngineeringListProjectsInput {
  readonly workbenchId?: string | undefined;
  readonly type?: EngineeringProjectTypeConfig | undefined;
}

export interface EngineeringListProjectsResult {
  readonly backendCapabilities: EngineeringBackendCapability[];
  readonly projects: EngineeringProjectSummary[];
  readonly count: number;
}

export interface EngineeringProjectStateInput {
  readonly project?: string | undefined;
}

export interface EngineeringProjectStateResult {
  readonly backendCapabilities: EngineeringBackendCapability[];
  readonly projects: EngineeringProjectState[];
  readonly count: number;
}

export type EngineeringTreeItemType =
  | "project"
  | "systemManager"
  | "io"
  | "device"
  | "box"
  | "terminal"
  | "task"
  | "xmlElement"
  | "unknown";

export interface EngineeringTreeItemSummary {
  readonly id: string;
  readonly resourceUri?: string | undefined;
  readonly path: string;
  readonly name: string;
  readonly type: EngineeringTreeItemType;
  readonly xmlElement: string;
  readonly sourceFile: string;
  readonly project: EngineeringProjectSummary;
  readonly comment?: string | undefined;
  readonly childCount: number;
}

export interface EngineeringTreeItemDescription
  extends EngineeringTreeItemSummary {
  readonly settings: Record<string, string | number | boolean>;
  readonly children: EngineeringTreeItemSummary[];
}

export interface EngineeringTreeReadInput {
  readonly path: string;
  readonly project?: string | undefined;
}

export interface EngineeringTreeReadResult {
  readonly item: EngineeringTreeItemDescription;
}

export interface EngineeringTreeSearchInput {
  readonly query?: string | undefined;
  readonly name?: string | undefined;
  readonly type?: EngineeringTreeItemType | undefined;
  readonly comment?: string | undefined;
  readonly project?: string | undefined;
  readonly limit?: number | undefined;
}

export interface EngineeringTreeSearchResult {
  readonly items: EngineeringTreeItemSummary[];
  readonly count: number;
  readonly truncated: boolean;
}

export interface EngineeringTreeDescribeItemInput
  extends EngineeringTreeReadInput {}

export interface EngineeringTreeDescribeItemResult {
  readonly item: EngineeringTreeItemDescription;
}

export interface EngineeringIoTerminalSummary extends EngineeringTreeItemSummary {}

export interface EngineeringIoDeviceSummary extends EngineeringTreeItemSummary {
  readonly boxes: EngineeringTreeItemSummary[];
  readonly terminals: EngineeringIoTerminalSummary[];
  readonly boxCount: number;
  readonly terminalCount: number;
}

export interface EngineeringIoListTopologyInput {
  readonly project?: string | undefined;
}

export interface EngineeringIoListTopologyResult {
  readonly devices: EngineeringIoDeviceSummary[];
  readonly count: number;
}

export interface EngineeringIoDescribeDeviceInput {
  readonly device: string;
  readonly project?: string | undefined;
}

export interface EngineeringIoDescribeDeviceResult {
  readonly device: EngineeringIoDeviceSummary;
}

export interface EngineeringIoDescribeTerminalInput {
  readonly terminal: string;
  readonly project?: string | undefined;
}

export interface EngineeringIoDescribeTerminalResult {
  readonly terminal: EngineeringTreeItemDescription;
}

export type EngineeringPlcObjectKind =
  | "program"
  | "functionBlock"
  | "function"
  | "gvl"
  | "dut"
  | "interface"
  | "method"
  | "action"
  | "property"
  | "unknown";

export interface EngineeringPlcPouSummary {
  readonly id: string;
  readonly resourceUri?: string | undefined;
  readonly name: string;
  readonly qualifiedName: string;
  readonly kind: EngineeringPlcObjectKind;
  readonly path: string;
  readonly sourceFile: string;
  readonly project: EngineeringProjectSummary;
}

export interface EngineeringPlcPouContent extends EngineeringPlcPouSummary {
  readonly declaration: string;
  readonly implementation: string;
  readonly rawText: string;
}

export interface EngineeringPlcListPousInput {
  readonly project?: string | undefined;
  readonly kind?: EngineeringPlcObjectKind | undefined;
}

export interface EngineeringPlcListPousResult {
  readonly pous: EngineeringPlcPouSummary[];
  readonly count: number;
}

export interface EngineeringPlcReadPouInput {
  readonly pou: string;
  readonly project?: string | undefined;
}

export interface EngineeringPlcReadPouResult {
  readonly pou: EngineeringPlcPouContent;
}

export interface EngineeringPlcSearchCodeInput {
  readonly query: string;
  readonly project?: string | undefined;
  readonly kind?: EngineeringPlcObjectKind | undefined;
  readonly limit?: number | undefined;
}

export interface EngineeringPlcCodeSearchMatch {
  readonly pou: EngineeringPlcPouSummary;
  readonly section: "declaration" | "implementation" | "raw";
  readonly line: number;
  readonly snippet: string;
}

export interface EngineeringPlcSearchCodeResult {
  readonly matches: EngineeringPlcCodeSearchMatch[];
  readonly count: number;
  readonly truncated: boolean;
}

export interface EngineeringPlcDescribePouInput
  extends EngineeringPlcReadPouInput {}

export interface EngineeringPlcDescribePouResult {
  readonly pou: EngineeringPlcPouSummary;
  readonly declarationLineCount: number;
  readonly implementationLineCount: number;
  readonly declarationPreview: string;
  readonly implementationPreview: string;
}

export interface EngineeringPlcLibrarySummary {
  readonly id: string;
  readonly resourceUri?: string | undefined;
  readonly sourceFileUri?: string | undefined;
  readonly name: string;
  readonly sourceFile: string;
  readonly project: EngineeringProjectSummary;
  readonly version?: string | undefined;
  readonly namespace?: string | undefined;
}

export interface EngineeringPlcListLibrariesInput {
  readonly project?: string | undefined;
}

export interface EngineeringPlcListLibrariesResult {
  readonly libraries: EngineeringPlcLibrarySummary[];
  readonly count: number;
}

export interface EngineeringPlcDescribeLibraryInput {
  readonly library: string;
  readonly project?: string | undefined;
}

export interface EngineeringPlcDescribeLibraryResult {
  readonly library: EngineeringPlcLibrarySummary;
}

export type EngineeringHmiArtifactKind =
  | "view"
  | "control"
  | "userControl"
  | "content"
  | "unknown";

export interface EngineeringHmiProjectSummary {
  readonly project: EngineeringProjectSummary;
  readonly artifactCount: number;
  readonly routerPort?: number | undefined;
  readonly serverPort?: number | undefined;
  readonly previewAvailable: boolean;
  readonly previewReason?: string | undefined;
}

export interface EngineeringHmiArtifactSummary {
  readonly id: string;
  readonly resourceUri: string;
  readonly name: string;
  readonly kind: EngineeringHmiArtifactKind;
  readonly path: string;
  readonly sourceFile: string;
  readonly project: EngineeringProjectSummary;
}

export interface EngineeringHmiStateInput {
  readonly project?: string | undefined;
}

export interface EngineeringHmiStateResult {
  readonly backendCapabilities: EngineeringBackendCapability[];
  readonly projects: EngineeringHmiProjectSummary[];
  readonly count: number;
  readonly activeConnection: {
    readonly available: boolean;
    readonly source: "none" | "configuredProjectFiles";
    readonly reason?: string | undefined;
  };
}

export interface EngineeringHmiListProjectsInput {
  readonly project?: string | undefined;
}

export interface EngineeringHmiListProjectsResult {
  readonly projects: EngineeringHmiProjectSummary[];
  readonly count: number;
}

export interface EngineeringHmiPreviewInfoInput {
  readonly project?: string | undefined;
}

export interface EngineeringHmiPreviewInfoResult {
  readonly available: boolean;
  readonly project?: EngineeringProjectSummary | undefined;
  readonly routerPort?: number | undefined;
  readonly serverPort?: number | undefined;
  readonly url?: string | undefined;
  readonly reason?: string | undefined;
}

export interface EngineeringHmiListControlsInput {
  readonly project?: string | undefined;
  readonly kind?: EngineeringHmiArtifactKind | undefined;
  readonly limit?: number | undefined;
}

export interface EngineeringHmiListControlsResult {
  readonly controls: EngineeringHmiArtifactSummary[];
  readonly count: number;
  readonly truncated: boolean;
  readonly available: boolean;
  readonly reason?: string | undefined;
}

export type EngineeringBuildScope = "twinCatProject" | "plcProject";
export type EngineeringBuildStatus =
  | "succeeded"
  | "failed"
  | "unavailable"
  | "skipped";
export type EngineeringIssueSeverity = "error" | "warning" | "info";
export type EngineeringOutputChannel = "build" | "engineering";

export interface EngineeringBuildInput {
  readonly project?: string | undefined;
  readonly target?: string | undefined;
  readonly timeoutMs?: number | undefined;
}

export interface EngineeringBuildSafetyBoundary {
  readonly activateConfiguration: false;
  readonly download: false;
  readonly login: false;
  readonly run: false;
  readonly stop: false;
}

export interface EngineeringIssue {
  readonly id: string;
  readonly uri: string;
  readonly severity: EngineeringIssueSeverity;
  readonly message: string;
  readonly project?: EngineeringProjectSummary | undefined;
  readonly source: "engineeringBackend" | "compiler" | "parser";
  readonly code?: string | undefined;
  readonly file?: string | undefined;
  readonly line?: number | undefined;
  readonly column?: number | undefined;
}

export interface EngineeringBuildResult {
  readonly scope: EngineeringBuildScope;
  readonly status: EngineeringBuildStatus;
  readonly available: boolean;
  readonly backend: EngineeringBackendConfig;
  readonly project?: EngineeringProjectSummary | undefined;
  readonly target?: string | undefined;
  readonly startedAt: string;
  readonly completedAt: string;
  readonly durationMs: number;
  readonly safetyBoundary: EngineeringBuildSafetyBoundary;
  readonly reason?: string | undefined;
  readonly errors: EngineeringIssue[];
  readonly warnings: EngineeringIssue[];
  readonly output: {
    readonly channel: EngineeringOutputChannel;
    readonly text: string;
    readonly truncated: boolean;
  };
}

export interface EngineeringBuildAndGetErrorsInput extends EngineeringBuildInput {
  readonly limit?: number | undefined;
}

export interface EngineeringBuildAndGetErrorsResult {
  readonly build: EngineeringBuildResult;
  readonly errors: EngineeringIssue[];
  readonly warnings: EngineeringIssue[];
  readonly count: number;
  readonly truncated: boolean;
}

export interface EngineeringErrorListInput {
  readonly project?: string | undefined;
  readonly severity?: EngineeringIssueSeverity | readonly EngineeringIssueSeverity[] | undefined;
  readonly limit?: number | undefined;
}

export interface EngineeringErrorListResult {
  readonly available: boolean;
  readonly backend: EngineeringBackendConfig;
  readonly errors: EngineeringIssue[];
  readonly warnings: EngineeringIssue[];
  readonly issues: EngineeringIssue[];
  readonly count: number;
  readonly truncated: boolean;
  readonly reason?: string | undefined;
}

export interface EngineeringErrorContextInput {
  readonly error?: string | undefined;
  readonly file?: string | undefined;
  readonly line?: number | undefined;
  readonly project?: string | undefined;
  readonly contextLines?: number | undefined;
}

export interface EngineeringErrorContextResult {
  readonly available: boolean;
  readonly backend: EngineeringBackendConfig;
  readonly issue?: EngineeringIssue | undefined;
  readonly file?: string | undefined;
  readonly line?: number | undefined;
  readonly context?: {
    readonly startLine: number;
    readonly endLine: number;
    readonly text: string;
  } | undefined;
  readonly reason?: string | undefined;
}

export interface EngineeringOutputReadInput {
  readonly project?: string | undefined;
  readonly channel?: EngineeringOutputChannel | undefined;
  readonly contains?: string | undefined;
  readonly limitBytes?: number | undefined;
  readonly tailLines?: number | undefined;
}

export interface EngineeringOutputReadResult {
  readonly available: boolean;
  readonly backend: EngineeringBackendConfig;
  readonly channel: EngineeringOutputChannel;
  readonly text: string;
  readonly bytesRead: number;
  readonly truncated: boolean;
  readonly reason?: string | undefined;
}

export type EngineeringResourceScheme =
  | "plcc"
  | "plcpp"
  | "err"
  | "io"
  | "tcfile"
  | "tcfolder";

export type EngineeringResourceKind =
  | "plcObject"
  | "plcPlusPlusObject"
  | "engineeringIssue"
  | "ioItem"
  | "file"
  | "folder";

export interface EngineeringResourceReadInput {
  readonly uri: string;
  readonly limitBytes?: number | undefined;
  readonly contextLines?: number | undefined;
}

export interface EngineeringResourceReadResult {
  readonly uri: string;
  readonly scheme: EngineeringResourceScheme;
  readonly kind: EngineeringResourceKind;
  readonly available: boolean;
  readonly contentType?: string | undefined;
  readonly text?: string | undefined;
  readonly data?: unknown;
  readonly bytesRead?: number | undefined;
  readonly truncated: boolean;
  readonly reason?: string | undefined;
}

interface SolutionProjectReference {
  readonly name: string;
  readonly path: string;
}

interface InternalTreeItem {
  readonly id: string;
  readonly path: string;
  readonly name: string;
  readonly type: EngineeringTreeItemType;
  readonly xmlElement: string;
  readonly sourceFile: string;
  readonly project: EngineeringProjectSummary;
  readonly settings: Record<string, string | number | boolean>;
  readonly childIds: string[];
  readonly parentId?: string | undefined;
  readonly comment?: string | undefined;
}

interface TreeIndex {
  readonly items: Map<string, InternalTreeItem>;
  readonly byPath: Map<string, InternalTreeItem>;
}

const WORKBENCH_ID = "configured-project-files";
const MAX_REFERENCED_PROJECT_FILES = 200;
const DEFAULT_TREE_SEARCH_LIMIT = 50;
const MAX_TREE_SEARCH_LIMIT = 250;
const XML_REFERENCE_EXTENSIONS = new Set([
  ".xti",
  ".xml",
  ".tcio",
  ".xtp",
]);
const PLC_OBJECT_EXTENSIONS = new Set([".tcpou", ".tcgvl", ".tcdut", ".tcio"]);
const HMI_ARTIFACT_EXTENSIONS = new Set([
  ".view",
  ".control",
  ".usercontrol",
  ".content",
  ".html",
]);
const DEFAULT_CODE_SEARCH_LIMIT = 50;
const MAX_CODE_SEARCH_LIMIT = 250;
const CODE_PREVIEW_LINE_COUNT = 12;
const DEFAULT_HMI_ARTIFACT_LIMIT = 50;
const MAX_HMI_ARTIFACT_LIMIT = 250;
const DEFAULT_ENGINEERING_ISSUE_LIMIT = 50;
const MAX_ENGINEERING_ISSUE_LIMIT = 250;
const DEFAULT_ENGINEERING_CONTEXT_LINES = 3;
const MAX_ENGINEERING_CONTEXT_LINES = 20;
const DEFAULT_ENGINEERING_OUTPUT_LIMIT_BYTES = 65_536;
const MAX_ENGINEERING_OUTPUT_LIMIT_BYTES = 1_048_576;
const DEFAULT_RESOURCE_LIMIT_BYTES = 65_536;
const MAX_RESOURCE_LIMIT_BYTES = 1_048_576;
const MAX_FOLDER_RESOURCE_ENTRIES = 250;
const BUILD_SAFETY_BOUNDARY: EngineeringBuildSafetyBoundary = {
  activateConfiguration: false,
  download: false,
  login: false,
  run: false,
  stop: false,
};
const CONFIGURED_BACKEND_BUILD_UNAVAILABLE_REASON =
  "The configured project-file backend has no live XAE/Visual Studio Automation Interface connection, so it cannot run TwinCAT builds or read compiler error lists.";
const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@",
  textNodeName: "#text",
  trimValues: true,
});

function capabilities(
  runtimeOnly: boolean,
  engineeringRead: boolean,
  engineeringWrite = false,
): EngineeringCapabilityFlags {
  return {
    runtimeOnly,
    engineeringRead,
    engineeringWrite,
  };
}

function inferProjectType(path: string): EngineeringProjectTypeConfig {
  switch (extname(path).toLowerCase()) {
    case ".sln":
      return "solution";
    case ".tsproj":
      return "sysManager";
    case ".plcproj":
      return "plc";
    case ".hmiproj":
    case ".hmi":
      return "hmi";
    default:
      return "unknown";
  }
}

function projectName(path: string): string {
  const extension = extname(path);
  return extension.length === 0
    ? basename(path)
    : basename(path, extension);
}

function normalizeProjectPath(path: string, basePath?: string): string {
  if (isAbsolute(path)) {
    return normalize(path);
  }

  return normalize(join(basePath ?? process.cwd(), path));
}

function encodedQuery(params: Record<string, string>): string {
  return new URLSearchParams(params).toString();
}

function tcFileUri(path: string): string {
  return `tcfile://file?${encodedQuery({ path: normalize(path) })}`;
}

function tcFolderUri(path: string): string {
  return `tcfolder://folder?${encodedQuery({ path: normalize(path) })}`;
}

function plccPouUri(project: EngineeringProjectSummary, qualifiedName: string): string {
  return `plcc://pou?${encodedQuery({
    project: project.id,
    name: qualifiedName,
  })}`;
}

function ioItemUri(project: EngineeringProjectSummary, treePath: string): string {
  return `io://item?${encodedQuery({
    project: project.id,
    path: treePath,
  })}`;
}

function limitBytes(value: string, maxBytes: number): {
  readonly text: string;
  readonly bytesRead: number;
  readonly truncated: boolean;
} {
  const bytes = Buffer.from(value, "utf8");
  if (bytes.length <= maxBytes) {
    return {
      text: value,
      bytesRead: bytes.length,
      truncated: false,
    };
  }

  return {
    text: bytes.subarray(0, maxBytes).toString("utf8"),
    bytesRead: maxBytes,
    truncated: true,
  };
}

function parseEngineeringResourceUri(uri: string): {
  readonly scheme: EngineeringResourceScheme;
  readonly kind: EngineeringResourceKind;
  readonly params: URLSearchParams;
} {
  let parsed: URL;
  try {
    parsed = new URL(uri);
  } catch {
    throw new Error(`Engineering resource URI "${uri}" is not a valid URI.`);
  }

  const scheme = parsed.protocol.slice(0, -1);

  switch (scheme) {
    case "plcc":
      return { scheme, kind: "plcObject", params: parsed.searchParams };
    case "plcpp":
      return { scheme, kind: "plcPlusPlusObject", params: parsed.searchParams };
    case "err":
      return { scheme, kind: "engineeringIssue", params: parsed.searchParams };
    case "io":
      return { scheme, kind: "ioItem", params: parsed.searchParams };
    case "tcfile":
      return { scheme, kind: "file", params: parsed.searchParams };
    case "tcfolder":
      return { scheme, kind: "folder", params: parsed.searchParams };
    default:
      throw new Error(`Engineering resource URI scheme "${scheme}" is not supported.`);
  }
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [value];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function scalarValue(value: unknown): string | number | boolean | undefined {
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (isRecord(value)) {
    const text = value["#text"];
    if (
      typeof text === "string" ||
      typeof text === "number" ||
      typeof text === "boolean"
    ) {
      return text;
    }
  }

  return undefined;
}

function settingValueAsString(value: string | number | boolean): string {
  return String(value).trim();
}

function collectSettings(
  element: Record<string, unknown>,
): Record<string, string | number | boolean> {
  const settings: Record<string, string | number | boolean> = {};

  for (const [key, value] of Object.entries(element)) {
    if (key === "#text") {
      continue;
    }

    const scalar = scalarValue(value);
    if (scalar === undefined) {
      continue;
    }

    const normalizedKey = key.startsWith("@") ? key.slice(1) : key;
    if (normalizedKey.length > 0) {
      settings[normalizedKey] = scalar;
    }
  }

  return settings;
}

function childElementEntries(
  element: Record<string, unknown>,
): Array<readonly [string, unknown]> {
  return Object.entries(element).filter(([key, value]) => {
    if (key.startsWith("@") || key === "#text") {
      return false;
    }

    return isRecord(value) || Array.isArray(value);
  });
}

function stringSetting(
  settings: Record<string, string | number | boolean>,
  ...keys: string[]
): string | undefined {
  for (const key of keys) {
    const value = settings[key];
    if (value !== undefined) {
      const text = settingValueAsString(value);
      if (text.length > 0) {
        return text;
      }
    }
  }

  return undefined;
}

function firstChildScalar(
  element: Record<string, unknown>,
  ...keys: string[]
): string | undefined {
  for (const key of keys) {
    const value = scalarValue(element[key]);
    if (value !== undefined) {
      const text = settingValueAsString(value);
      if (text.length > 0) {
        return text;
      }
    }
  }

  return undefined;
}

function displayName(
  elementName: string,
  element: Record<string, unknown>,
  fallbackIndex: number,
): string {
  const settings = collectSettings(element);
  return (
    stringSetting(
      settings,
      "Name",
      "name",
      "Include",
      "Path",
      "File",
      "Id",
      "Type",
    ) ??
    firstChildScalar(element, "Name", "name", "Comment", "Description") ??
    `${elementName}[${fallbackIndex + 1}]`
  );
}

function commentText(
  element: Record<string, unknown>,
  settings: Record<string, string | number | boolean>,
): string | undefined {
  return (
    stringSetting(settings, "Comment", "comment", "Description", "description") ??
    firstChildScalar(element, "Comment", "Description", "DescriptionText")
  );
}

function classifyTreeItem(
  elementName: string,
  name: string,
  settings: Record<string, string | number | boolean>,
): EngineeringTreeItemType {
  const haystack = [
    elementName,
    name,
    stringSetting(settings, "Type", "SubType", "Class", "ClassName") ?? "",
  ]
    .join(" ")
    .toLowerCase();

  if (
    haystack.includes("terminal") ||
    /(^|[^a-z0-9])(el|kl|ej|ep)\d{4}([^a-z0-9]|$)/i.test(haystack)
  ) {
    return "terminal";
  }

  if (
    haystack.includes("ethercat master") ||
    haystack.includes("i/o device") ||
    haystack.includes("io device") ||
    haystack.includes("device")
  ) {
    return "device";
  }

  if (
    haystack.includes("box") ||
    haystack.includes("slave") ||
    haystack.includes("module")
  ) {
    return "box";
  }

  if (haystack.includes("task")) {
    return "task";
  }

  if (haystack.includes("i/o") || haystack.includes("io")) {
    return "io";
  }

  if (haystack.includes("project")) {
    return "project";
  }

  return "xmlElement";
}

function pathSegment(
  elementName: string,
  name: string,
  siblingIndex: number,
): string {
  const safeName = name.replaceAll("/", "_").trim();
  const base = safeName.length > 0 ? `${elementName}:${safeName}` : elementName;
  return siblingIndex === 0 ? base : `${base}[${siblingIndex + 1}]`;
}

function isXmlReference(path: string): boolean {
  return XML_REFERENCE_EXTENSIONS.has(extname(path).toLowerCase());
}

function collectFileReferences(
  value: unknown,
  basePath: string,
  references = new Set<string>(),
): Set<string> {
  if (references.size >= MAX_REFERENCED_PROJECT_FILES) {
    return references;
  }

  if (Array.isArray(value)) {
    for (const entry of value) {
      collectFileReferences(entry, basePath, references);
    }
    return references;
  }

  if (!isRecord(value)) {
    return references;
  }

  for (const [key, entryValue] of Object.entries(value)) {
    if (
      key.startsWith("@") &&
      typeof entryValue === "string" &&
      isXmlReference(entryValue)
    ) {
      const path = normalizeProjectPath(entryValue, basePath);
      if (existsSync(path)) {
        references.add(path);
      }
      continue;
    }

    collectFileReferences(entryValue, basePath, references);
  }

  return references;
}

function isPlcObjectReference(path: string): boolean {
  return PLC_OBJECT_EXTENSIONS.has(extname(path).toLowerCase());
}

function collectAttributeReferences(
  value: unknown,
  basePath: string,
  predicate: (path: string) => boolean,
  references = new Set<string>(),
): Set<string> {
  if (Array.isArray(value)) {
    for (const entry of value) {
      collectAttributeReferences(entry, basePath, predicate, references);
    }
    return references;
  }

  if (!isRecord(value)) {
    return references;
  }

  for (const [key, entryValue] of Object.entries(value)) {
    if (key.startsWith("@") && typeof entryValue === "string") {
      const path = normalizeProjectPath(entryValue, basePath);
      if (predicate(entryValue) && existsSync(path)) {
        references.add(path);
      }
      continue;
    }

    collectAttributeReferences(entryValue, basePath, predicate, references);
  }

  return references;
}

function collectPlcObjectReferences(
  projectXml: unknown,
  projectPath: string,
): string[] {
  return [
    ...collectAttributeReferences(
      projectXml,
      dirname(projectPath),
      isPlcObjectReference,
    ),
  ].sort((left, right) => left.localeCompare(right));
}

function isHmiArtifactReference(path: string): boolean {
  return HMI_ARTIFACT_EXTENSIONS.has(extname(path).toLowerCase());
}

function collectHmiArtifactReferences(
  projectXml: unknown,
  projectPath: string,
): string[] {
  return [
    ...collectAttributeReferences(
      projectXml,
      dirname(projectPath),
      isHmiArtifactReference,
    ),
  ].sort((left, right) => left.localeCompare(right));
}

function collectTextValues(value: unknown, texts: string[] = []): string[] {
  const scalar = scalarValue(value);
  if (scalar !== undefined) {
    const text = settingValueAsString(scalar);
    if (text.length > 0) {
      texts.push(text);
    }
    return texts;
  }

  if (Array.isArray(value)) {
    for (const entry of value) {
      collectTextValues(entry, texts);
    }
    return texts;
  }

  if (isRecord(value)) {
    for (const [key, entryValue] of Object.entries(value)) {
      if (key.startsWith("@")) {
        continue;
      }

      collectTextValues(entryValue, texts);
    }
  }

  return texts;
}

function findFirstElement(
  value: unknown,
  elementNames: readonly string[],
): Record<string, unknown> | undefined {
  if (Array.isArray(value)) {
    for (const entry of value) {
      const found = findFirstElement(entry, elementNames);
      if (found !== undefined) {
        return found;
      }
    }
    return undefined;
  }

  if (!isRecord(value)) {
    return undefined;
  }

  for (const [key, entryValue] of Object.entries(value)) {
    if (elementNames.includes(key) && isRecord(entryValue)) {
      return entryValue;
    }

    if (elementNames.includes(key) && Array.isArray(entryValue)) {
      const first = entryValue.find(isRecord);
      if (first !== undefined) {
        return first;
      }
    }

    const found = findFirstElement(entryValue, elementNames);
    if (found !== undefined) {
      return found;
    }
  }

  return undefined;
}

function findElementTexts(
  value: unknown,
  elementNames: readonly string[],
  texts: string[] = [],
): string[] {
  if (Array.isArray(value)) {
    for (const entry of value) {
      findElementTexts(entry, elementNames, texts);
    }
    return texts;
  }

  if (!isRecord(value)) {
    return texts;
  }

  for (const [key, entryValue] of Object.entries(value)) {
    if (elementNames.includes(key)) {
      texts.push(...collectTextValues(entryValue));
      continue;
    }

    if (!key.startsWith("@")) {
      findElementTexts(entryValue, elementNames, texts);
    }
  }

  return texts;
}

function findSectionTexts(
  value: unknown,
  elementNames: readonly string[],
  excludedObjectNames: readonly string[] = ["Method", "Action", "Property"],
  texts: string[] = [],
): string[] {
  if (Array.isArray(value)) {
    for (const entry of value) {
      findSectionTexts(entry, elementNames, excludedObjectNames, texts);
    }
    return texts;
  }

  if (!isRecord(value)) {
    return texts;
  }

  for (const [key, entryValue] of Object.entries(value)) {
    if (excludedObjectNames.includes(key)) {
      continue;
    }

    if (elementNames.includes(key)) {
      texts.push(...collectTextValues(entryValue));
      continue;
    }

    if (!key.startsWith("@")) {
      findSectionTexts(entryValue, elementNames, excludedObjectNames, texts);
    }
  }

  return texts;
}

function firstObjectElementName(parsed: unknown): string | undefined {
  if (!isRecord(parsed)) {
    return undefined;
  }

  const root = parsed.TcPlcObject;
  const source = isRecord(root) ? root : parsed;
  const preferred = ["POU", "GVL", "DUT", "Itf", "Interface", "Method", "Action", "Property"];

  for (const key of preferred) {
    if (key in source) {
      return key;
    }
  }

  return Object.keys(source).find((key) => !key.startsWith("@"));
}

function classifyPlcObject(
  path: string,
  objectElementName: string | undefined,
  objectElement: Record<string, unknown> | undefined,
  declaration = "",
): EngineeringPlcObjectKind {
  const extension = extname(path).toLowerCase();
  const settings = objectElement === undefined ? {} : collectSettings(objectElement);
  const objectType = stringSetting(settings, "SpecialFunc", "PouType", "Type");
  const rootElement = objectElementName?.toLowerCase() ?? "";
  const haystack = [extension, rootElement, objectType ?? "", declaration, path]
    .join(" ")
    .toLowerCase();

  if (rootElement === "method") {
    return "method";
  }

  if (rootElement === "action") {
    return "action";
  }

  if (rootElement === "property") {
    return "property";
  }

  if (/\bfunction_block\b/.test(haystack)) {
    return "functionBlock";
  }

  if (/\bprogram\b/.test(haystack)) {
    return "program";
  }

  if (/\bfunction\b/.test(haystack)) {
    return "function";
  }

  if (extension === ".tcgvl" || rootElement === "gvl") {
    return "gvl";
  }

  if (extension === ".tcdut" || rootElement === "dut") {
    return "dut";
  }

  if (rootElement === "itf" || rootElement === "interface") {
    return "interface";
  }

  return "unknown";
}

function plcObjectName(
  path: string,
  objectElement: Record<string, unknown> | undefined,
): string {
  if (objectElement !== undefined) {
    const settings = collectSettings(objectElement);
    const name = stringSetting(settings, "Name", "name");
    if (name !== undefined) {
      return name;
    }
  }

  return projectName(path);
}

function classifyHmiArtifact(path: string): EngineeringHmiArtifactKind {
  switch (extname(path).toLowerCase()) {
    case ".view":
      return "view";
    case ".control":
      return "control";
    case ".usercontrol":
      return "userControl";
    case ".content":
    case ".html":
      return "content";
    default:
      return "unknown";
  }
}

function artifactName(path: string): string {
  const extension = extname(path);
  return extension.length === 0 ? basename(path) : basename(path, extension);
}

function findNumericSetting(
  value: unknown,
  keys: readonly string[],
): number | undefined {
  if (Array.isArray(value)) {
    for (const entry of value) {
      const found = findNumericSetting(entry, keys);
      if (found !== undefined) {
        return found;
      }
    }
    return undefined;
  }

  if (!isRecord(value)) {
    return undefined;
  }

  const settings = collectSettings(value);
  for (const key of keys) {
    const value = settings[key];
    if (typeof value === "number" && Number.isInteger(value)) {
      return value;
    }

    if (typeof value === "string") {
      const parsed = Number(value.trim());
      if (Number.isInteger(parsed)) {
        return parsed;
      }
    }
  }

  for (const key of keys) {
    const scalar = firstChildScalar(value, key);
    if (scalar !== undefined) {
      const parsed = Number(scalar.trim());
      if (Number.isInteger(parsed)) {
        return parsed;
      }
    }
  }

  for (const [key, entryValue] of Object.entries(value)) {
    if (key.startsWith("@")) {
      continue;
    }

    const found = findNumericSetting(entryValue, keys);
    if (found !== undefined) {
      return found;
    }
  }

  return undefined;
}

interface PlcObjectElementEntry {
  readonly elementName: string;
  readonly element: Record<string, unknown>;
  readonly ownerName?: string | undefined;
}

function plcObjectSource(parsed: unknown): Record<string, unknown> | undefined {
  if (!isRecord(parsed)) {
    return undefined;
  }

  const root = parsed.TcPlcObject;
  return isRecord(root) ? root : parsed;
}

function collectEmbeddedPlcObjectElements(
  value: unknown,
  ownerName: string,
  entries: PlcObjectElementEntry[],
): void {
  if (Array.isArray(value)) {
    for (const entry of value) {
      collectEmbeddedPlcObjectElements(entry, ownerName, entries);
    }
    return;
  }

  if (!isRecord(value)) {
    return;
  }

  for (const [key, entryValue] of Object.entries(value)) {
    if (key.startsWith("@") || key === "#text") {
      continue;
    }

    if (["Method", "Action", "Property"].includes(key)) {
      for (const entry of asArray(entryValue)) {
        if (isRecord(entry)) {
          entries.push({
            elementName: key,
            element: entry,
            ownerName,
          });
        }
      }
      continue;
    }

    collectEmbeddedPlcObjectElements(entryValue, ownerName, entries);
  }
}

function collectPlcObjectElements(parsed: unknown): PlcObjectElementEntry[] {
  const source = plcObjectSource(parsed);
  if (source === undefined) {
    return [];
  }

  const entries: PlcObjectElementEntry[] = [];
  const topLevelNames = ["POU", "GVL", "DUT", "Itf", "Interface", "Method", "Action", "Property"];

  for (const elementName of topLevelNames) {
    const value = source[elementName];
    if (value === undefined) {
      continue;
    }

    for (const element of asArray(value)) {
      if (!isRecord(element)) {
        continue;
      }

      entries.push({ elementName, element });

      if (["POU", "Itf", "Interface"].includes(elementName)) {
        collectEmbeddedPlcObjectElements(
          element,
          plcObjectName("", element),
          entries,
        );
      }
    }
  }

  return entries;
}

function lineCount(text: string): number {
  if (text.trim().length === 0) {
    return 0;
  }

  return text.split(/\r?\n/).length;
}

function previewText(text: string): string {
  return text
    .split(/\r?\n/)
    .slice(0, CODE_PREVIEW_LINE_COUNT)
    .join("\n")
    .trim();
}

function findLibraryReferences(
  value: unknown,
  project: EngineeringProjectSummary,
  sourceFile: string,
  libraries = new Map<string, EngineeringPlcLibrarySummary>(),
): Map<string, EngineeringPlcLibrarySummary> {
  if (Array.isArray(value)) {
    for (const entry of value) {
      findLibraryReferences(entry, project, sourceFile, libraries);
    }
    return libraries;
  }

  if (!isRecord(value)) {
    return libraries;
  }

  for (const [key, entryValue] of Object.entries(value)) {
    if (!isRecord(entryValue) && !Array.isArray(entryValue)) {
      continue;
    }

    for (const entry of asArray(entryValue)) {
      if (!isRecord(entry)) {
        continue;
      }

      const settings = collectSettings(entry);
      const include = stringSetting(settings, "Include", "Name", "Library", "Placeholder");
      const normalizedKey = key.toLowerCase();

      if (
        include !== undefined &&
        (normalizedKey.includes("library") ||
          normalizedKey.includes("placeholder") ||
          normalizedKey === "reference" ||
          normalizedKey === "placeholderreference")
      ) {
        const version = stringSetting(settings, "Version", "DefaultResolution");
        const namespace = stringSetting(settings, "Namespace", "NamespaceName");
        const id = `${project.id}:library:${include.toLowerCase()}`;
        libraries.set(id, {
          id,
          sourceFileUri: tcFileUri(sourceFile),
          name: include,
          sourceFile,
          project,
          ...(version === undefined ? {} : { version }),
          ...(namespace === undefined ? {} : { namespace }),
        });
      }

      findLibraryReferences(entry, project, sourceFile, libraries);
    }
  }

  return libraries;
}

function matchesText(value: string | undefined, query: string | undefined): boolean {
  if (query === undefined || query.trim().length === 0) {
    return true;
  }

  return value?.toLowerCase().includes(query.trim().toLowerCase()) ?? false;
}

function parseSolutionReferences(solutionPath: string): SolutionProjectReference[] {
  if (!existsSync(solutionPath)) {
    return [];
  }

  const solutionDirectory = dirname(solutionPath);
  const content = readFileSync(solutionPath, "utf8");
  const references: SolutionProjectReference[] = [];
  const projectLinePattern =
    /^Project\("\{[^}]+\}"\)\s*=\s*"([^"]+)",\s*"([^"]+)",\s*"\{[^}]+\}"/;

  for (const line of content.split(/\r?\n/)) {
    const match = projectLinePattern.exec(line.trim());
    if (match === null) {
      continue;
    }

    const [, name, relativePath] = match;
    if (name === undefined || relativePath === undefined) {
      continue;
    }

    const type = inferProjectType(relativePath);
    if (type === "unknown" || type === "solution") {
      continue;
    }

    references.push({
      name,
      path: normalizeProjectPath(relativePath, solutionDirectory),
    });
  }

  return references;
}

function isEnabledConfiguredBackend(config: EngineeringConfig): boolean {
  return (
    config.enabled &&
    config.backend === "configuredProjectFiles" &&
    config.projectFiles.length > 0
  );
}

export class EngineeringService {
  constructor(readonly config: EngineeringConfig) {}

  listBackendCapabilities(): EngineeringBackendCapability[] {
    const configuredAvailable = isEnabledConfiguredBackend(this.config);
    const configuredReason = configuredAvailable
      ? undefined
      : this.config.enabled
        ? "Configure engineering.projectFiles to enable read-only project context."
        : "Engineering context is disabled by configuration.";

    return [
      {
        backend: "configuredProjectFiles",
        available: configuredAvailable,
        capabilities: capabilities(!configuredAvailable, configuredAvailable),
        ...(configuredReason === undefined ? {} : { reason: configuredReason }),
      },
      {
        backend: "automationInterface",
        available: false,
        capabilities: capabilities(false, false),
        reason: "Automation Interface support is planned but not implemented.",
      },
      {
        backend: "dte",
        available: false,
        capabilities: capabilities(false, false),
        reason: "Visual Studio DTE support is planned but not implemented.",
      },
      {
        backend: "tcXaeShell",
        available: false,
        capabilities: capabilities(false, false),
        reason: "TcXaeShell live-context support is planned but not implemented.",
      },
      {
        backend: "gasWebSocket",
        available: false,
        capabilities: capabilities(false, false),
        reason: "GAS/WebSocket support is experimental and not implemented.",
      },
    ];
  }

  listWorkbenches(): EngineeringListWorkbenchesResult {
    const projects = this.discoverProjects();
    const available = isEnabledConfiguredBackend(this.config);
    const workbenches = available
      ? [
          {
            id: WORKBENCH_ID,
            name: this.config.workbenchName ?? "Configured project files",
            backend: this.config.backend,
            available,
            capabilities: capabilities(false, true),
            projectCount: projects.length,
          },
        ]
      : [];

    return {
      backendCapabilities: this.listBackendCapabilities(),
      workbenches,
      count: workbenches.length,
    };
  }

  listProjects(
    input: EngineeringListProjectsInput = {},
  ): EngineeringListProjectsResult {
    const projects = this.discoverProjects().filter((project) => {
      if (
        input.workbenchId !== undefined &&
        project.workbenchId !== input.workbenchId
      ) {
        return false;
      }

      return input.type === undefined || project.type === input.type;
    });

    return {
      backendCapabilities: this.listBackendCapabilities(),
      projects,
      count: projects.length,
    };
  }

  projectState(
    input: EngineeringProjectStateInput = {},
  ): EngineeringProjectStateResult {
    const normalizedProject = input.project?.trim().toLowerCase();
    const projects = this.discoverProjects()
      .filter((project) => {
        if (normalizedProject === undefined || normalizedProject.length === 0) {
          return true;
        }

        return (
          project.id.toLowerCase() === normalizedProject ||
          project.name.toLowerCase() === normalizedProject ||
          project.path.toLowerCase() === normalizedProject
        );
      })
      .map((project) => ({
        project,
        backend: this.config.backend,
        capabilities: capabilities(false, true),
        activeConnection: {
          available: false,
          source: "none" as const,
          reason:
            "The configured project-file backend is read-only and has no live XAE connection.",
        },
      }));

    return {
      backendCapabilities: this.listBackendCapabilities(),
      projects,
      count: projects.length,
    };
  }

  treeRead(input: EngineeringTreeReadInput): EngineeringTreeReadResult {
    const item = this.findTreeItem(input.path, input.project);
    return {
      item: this.describeInternalTreeItem(item, this.buildTreeIndex(input.project)),
    };
  }

  treeSearch(input: EngineeringTreeSearchInput = {}): EngineeringTreeSearchResult {
    const index = this.buildTreeIndex(input.project);
    const limit = Math.min(
      Math.max(input.limit ?? DEFAULT_TREE_SEARCH_LIMIT, 1),
      MAX_TREE_SEARCH_LIMIT,
    );
    const query = input.query?.trim().toLowerCase();
    const name = input.name?.trim().toLowerCase();
    const comment = input.comment?.trim().toLowerCase();
    const matches: EngineeringTreeItemSummary[] = [];

    for (const item of index.items.values()) {
      if (input.type !== undefined && item.type !== input.type) {
        continue;
      }

      if (name !== undefined && !item.name.toLowerCase().includes(name)) {
        continue;
      }

      if (
        comment !== undefined &&
        !(item.comment?.toLowerCase().includes(comment) ?? false)
      ) {
        continue;
      }

      if (
        query !== undefined &&
        ![
          item.name,
          item.path,
          item.type,
          item.xmlElement,
          item.comment ?? "",
        ].some((value) => value.toLowerCase().includes(query))
      ) {
        continue;
      }

      matches.push(this.toTreeItemSummary(item));
      if (matches.length > limit) {
        break;
      }
    }

    return {
      items: matches.slice(0, limit),
      count: Math.min(matches.length, limit),
      truncated: matches.length > limit,
    };
  }

  treeDescribeItem(
    input: EngineeringTreeDescribeItemInput,
  ): EngineeringTreeDescribeItemResult {
    return this.treeRead(input);
  }

  ioListTopology(
    input: EngineeringIoListTopologyInput = {},
  ): EngineeringIoListTopologyResult {
    const index = this.buildTreeIndex(input.project);
    const devices = [...index.items.values()]
      .filter((item) => item.type === "device")
      .map((device) => this.toIoDeviceSummary(device, index));

    return {
      devices,
      count: devices.length,
    };
  }

  ioDescribeDevice(
    input: EngineeringIoDescribeDeviceInput,
  ): EngineeringIoDescribeDeviceResult {
    const index = this.buildTreeIndex(input.project);
    const device = this.findTopologyItem(index, input.device, "device");
    return {
      device: this.toIoDeviceSummary(device, index),
    };
  }

  ioDescribeTerminal(
    input: EngineeringIoDescribeTerminalInput,
  ): EngineeringIoDescribeTerminalResult {
    const index = this.buildTreeIndex(input.project);
    const terminal = this.findTopologyItem(index, input.terminal, "terminal");
    return {
      terminal: this.describeInternalTreeItem(terminal, index),
    };
  }

  plcListPous(
    input: EngineeringPlcListPousInput = {},
  ): EngineeringPlcListPousResult {
    const pous = this.buildPlcObjects(input.project)
      .filter((pou) => input.kind === undefined || pou.kind === input.kind)
      .map((pou) => this.toPlcPouSummary(pou));

    return {
      pous,
      count: pous.length,
    };
  }

  plcReadPou(input: EngineeringPlcReadPouInput): EngineeringPlcReadPouResult {
    return {
      pou: this.findPlcObject(input.pou, input.project),
    };
  }

  plcSearchCode(
    input: EngineeringPlcSearchCodeInput,
  ): EngineeringPlcSearchCodeResult {
    const query = input.query.trim().toLowerCase();
    const limit = Math.min(
      Math.max(input.limit ?? DEFAULT_CODE_SEARCH_LIMIT, 1),
      MAX_CODE_SEARCH_LIMIT,
    );
    const matches: EngineeringPlcCodeSearchMatch[] = [];

    for (const pou of this.buildPlcObjects(input.project)) {
      if (input.kind !== undefined && pou.kind !== input.kind) {
        continue;
      }

      const sections = [
        ["declaration", pou.declaration] as const,
        ["implementation", pou.implementation] as const,
      ];

      for (const [section, text] of sections) {
        const lines = text.split(/\r?\n/);
        for (const [index, line] of lines.entries()) {
          if (!line.toLowerCase().includes(query)) {
            continue;
          }

          matches.push({
            pou: this.toPlcPouSummary(pou),
            section,
            line: index + 1,
            snippet: line.trim(),
          });

          if (matches.length > limit) {
            return {
              matches: matches.slice(0, limit),
              count: limit,
              truncated: true,
            };
          }
        }
      }
    }

    return {
      matches,
      count: matches.length,
      truncated: false,
    };
  }

  plcDescribePou(
    input: EngineeringPlcDescribePouInput,
  ): EngineeringPlcDescribePouResult {
    const pou = this.findPlcObject(input.pou, input.project);
    return {
      pou: this.toPlcPouSummary(pou),
      declarationLineCount: lineCount(pou.declaration),
      implementationLineCount: lineCount(pou.implementation),
      declarationPreview: previewText(pou.declaration),
      implementationPreview: previewText(pou.implementation),
    };
  }

  plcListLibraries(
    input: EngineeringPlcListLibrariesInput = {},
  ): EngineeringPlcListLibrariesResult {
    const libraries = this.buildPlcLibraries(input.project);
    return {
      libraries,
      count: libraries.length,
    };
  }

  plcDescribeLibrary(
    input: EngineeringPlcDescribeLibraryInput,
  ): EngineeringPlcDescribeLibraryResult {
    const normalizedLibrary = input.library.trim().toLowerCase();
    const library = this.buildPlcLibraries(input.project).find(
      (entry) =>
        entry.id.toLowerCase() === normalizedLibrary ||
        entry.name.toLowerCase() === normalizedLibrary,
    );

    if (library === undefined) {
      throw new Error(`PLC library "${input.library}" was not found.`);
    }

    return { library };
  }

  hmiState(input: EngineeringHmiStateInput = {}): EngineeringHmiStateResult {
    const projects = this.buildHmiProjectSummaries(input.project);
    return {
      backendCapabilities: this.listBackendCapabilities(),
      projects,
      count: projects.length,
      activeConnection: {
        available: false,
        source: "none",
        reason:
          "The configured project-file backend is read-only and has no live HMI server or XAE connection.",
      },
    };
  }

  hmiListProjects(
    input: EngineeringHmiListProjectsInput = {},
  ): EngineeringHmiListProjectsResult {
    const projects = this.buildHmiProjectSummaries(input.project);
    return {
      projects,
      count: projects.length,
    };
  }

  hmiPreviewInfo(
    input: EngineeringHmiPreviewInfoInput = {},
  ): EngineeringHmiPreviewInfoResult {
    const project = this.buildHmiProjectSummaries(input.project)[0];
    if (project === undefined) {
      return {
        available: false,
        reason: "No configured HMI project was found.",
      };
    }

    return {
      available: false,
      project: project.project,
      ...(project.routerPort === undefined ? {} : { routerPort: project.routerPort }),
      ...(project.serverPort === undefined ? {} : { serverPort: project.serverPort }),
      reason:
        project.previewReason ??
        "No live HMI server information is available from the configured project-file backend.",
    };
  }

  hmiListControls(
    input: EngineeringHmiListControlsInput = {},
  ): EngineeringHmiListControlsResult {
    const limit = Math.min(
      Math.max(input.limit ?? DEFAULT_HMI_ARTIFACT_LIMIT, 1),
      MAX_HMI_ARTIFACT_LIMIT,
    );
    const artifacts = this.buildHmiArtifacts(input.project).filter(
      (artifact) => input.kind === undefined || artifact.kind === input.kind,
    );
    const controls = artifacts.slice(0, limit);

    return {
      controls,
      count: controls.length,
      truncated: artifacts.length > limit,
      available: controls.length > 0,
      ...(controls.length > 0
        ? {}
        : {
            reason:
              "No HMI view/control/content artifact references were found in configured HMI project files.",
          }),
    };
  }

  tcBuildProject(input: EngineeringBuildInput = {}): EngineeringBuildResult {
    return this.createUnavailableBuildResult(input, "twinCatProject");
  }

  plcBuildProject(input: EngineeringBuildInput = {}): EngineeringBuildResult {
    return this.createUnavailableBuildResult(input, "plcProject");
  }

  tcBuildAndGetErrors(
    input: EngineeringBuildAndGetErrorsInput = {},
  ): EngineeringBuildAndGetErrorsResult {
    const build = this.tcBuildProject(input);
    const issueList = this.tcErrorList({
      project: input.project,
      limit: input.limit,
      severity: ["error", "warning"],
    });

    return {
      build,
      errors: issueList.errors,
      warnings: issueList.warnings,
      count: issueList.count,
      truncated: issueList.truncated,
    };
  }

  tcErrorList(input: EngineeringErrorListInput = {}): EngineeringErrorListResult {
    const limit = Math.min(
      Math.max(input.limit ?? DEFAULT_ENGINEERING_ISSUE_LIMIT, 1),
      MAX_ENGINEERING_ISSUE_LIMIT,
    );
    const severities =
      input.severity === undefined
        ? new Set<EngineeringIssueSeverity>(["error", "warning", "info"])
        : new Set(
            Array.isArray(input.severity) ? input.severity : [input.severity],
          );
    const issues = this.collectEngineeringIssues(input.project).filter((issue) =>
      severities.has(issue.severity),
    );
    const limitedIssues = issues.slice(0, limit);

    return {
      available: false,
      backend: this.config.backend,
      errors: limitedIssues.filter((issue) => issue.severity === "error"),
      warnings: limitedIssues.filter((issue) => issue.severity === "warning"),
      issues: limitedIssues,
      count: limitedIssues.length,
      truncated: issues.length > limit,
      reason: CONFIGURED_BACKEND_BUILD_UNAVAILABLE_REASON,
    };
  }

  tcErrorContext(
    input: EngineeringErrorContextInput,
  ): EngineeringErrorContextResult {
    const issue =
      input.error === undefined
        ? undefined
        : this.collectEngineeringIssues(input.project).find(
            (entry) =>
              entry.id.toLowerCase() === input.error?.trim().toLowerCase() ||
              entry.uri.toLowerCase() === input.error?.trim().toLowerCase(),
          );
    const file = input.file ?? issue?.file;
    const line = input.line ?? issue?.line;

    if (file === undefined || line === undefined) {
      return {
        available: false,
        backend: this.config.backend,
        ...(issue === undefined ? {} : { issue }),
        reason:
          "No engineering error source location is available for the configured project-file backend.",
      };
    }

    const resolvedFile = this.resolveProjectFile(file, input.project);
    if (resolvedFile === undefined || !existsSync(resolvedFile)) {
      return {
        available: false,
        backend: this.config.backend,
        ...(issue === undefined ? {} : { issue }),
        file,
        line,
        reason:
          "The requested error context file is not part of a configured engineering project.",
      };
    }

    const lines = readFileSync(resolvedFile, "utf8").split(/\r?\n/);
    const contextLines = Math.min(
      Math.max(input.contextLines ?? DEFAULT_ENGINEERING_CONTEXT_LINES, 0),
      MAX_ENGINEERING_CONTEXT_LINES,
    );
    const targetLine = Math.min(Math.max(line, 1), lines.length);
    const startLine = Math.max(targetLine - contextLines, 1);
    const endLine = Math.min(targetLine + contextLines, lines.length);
    const text = lines.slice(startLine - 1, endLine).join("\n");

    return {
      available: true,
      backend: this.config.backend,
      ...(issue === undefined ? {} : { issue }),
      file: resolvedFile,
      line: targetLine,
      context: {
        startLine,
        endLine,
        text,
      },
    };
  }

  tcOutputRead(
    input: EngineeringOutputReadInput = {},
  ): EngineeringOutputReadResult {
    const channel = input.channel ?? "build";
    const limitBytes = Math.min(
      Math.max(input.limitBytes ?? DEFAULT_ENGINEERING_OUTPUT_LIMIT_BYTES, 1),
      MAX_ENGINEERING_OUTPUT_LIMIT_BYTES,
    );
    const text = "";

    return {
      available: false,
      backend: this.config.backend,
      channel,
      text,
      bytesRead: Math.min(Buffer.byteLength(text, "utf8"), limitBytes),
      truncated: false,
      reason: CONFIGURED_BACKEND_BUILD_UNAVAILABLE_REASON,
    };
  }

  tcResourceRead(
    input: EngineeringResourceReadInput,
  ): EngineeringResourceReadResult {
    const parsed = parseEngineeringResourceUri(input.uri.trim());
    const limit = Math.min(
      Math.max(input.limitBytes ?? DEFAULT_RESOURCE_LIMIT_BYTES, 1),
      MAX_RESOURCE_LIMIT_BYTES,
    );

    switch (parsed.scheme) {
      case "plcc":
        return this.readPlcResource(input.uri, parsed, limit);
      case "plcpp":
        return {
          uri: input.uri,
          scheme: parsed.scheme,
          kind: parsed.kind,
          available: false,
          truncated: false,
          reason:
            "PLC++ resource URIs are reserved, but no PLC++ engineering backend is implemented yet.",
        };
      case "err":
        return this.readErrorResource(input.uri, parsed, input.contextLines);
      case "io":
        return this.readIoResource(input.uri, parsed);
      case "tcfile":
        return this.readFileResource(input.uri, parsed, limit);
      case "tcfolder":
        return this.readFolderResource(input.uri, parsed);
    }
  }

  private readPlcResource(
    uri: string,
    parsed: ReturnType<typeof parseEngineeringResourceUri>,
    limit: number,
  ): EngineeringResourceReadResult {
    const pouName = parsed.params.get("name");
    if (pouName === null || pouName.trim().length === 0) {
      throw new Error(`PLC code resource URI "${uri}" does not include a name.`);
    }

    const project = parsed.params.get("project") ?? undefined;
    const pou = this.findPlcObject(pouName, project);
    const limited = limitBytes(pou.rawText, limit);

    return {
      uri,
      scheme: "plcc",
      kind: "plcObject",
      available: true,
      contentType: "text/x-iecst",
      text: limited.text,
      data: {
        pou: this.toPlcPouSummary(pou),
        declarationLineCount: lineCount(pou.declaration),
        implementationLineCount: lineCount(pou.implementation),
      },
      bytesRead: limited.bytesRead,
      truncated: limited.truncated,
    };
  }

  private readErrorResource(
    uri: string,
    parsed: ReturnType<typeof parseEngineeringResourceUri>,
    contextLines?: number,
  ): EngineeringResourceReadResult {
    const id = parsed.params.get("id");
    const issue = this.collectEngineeringIssues().find(
      (entry) => entry.uri === uri || (id !== null && entry.id === id),
    );

    if (issue === undefined) {
      return {
        uri,
        scheme: "err",
        kind: "engineeringIssue",
        available: false,
        truncated: false,
        reason:
          "The requested engineering issue is not available from the active backend.",
      };
    }

    const context =
      issue.file === undefined || issue.line === undefined
        ? undefined
        : this.tcErrorContext({
            error: issue.uri,
            contextLines,
          });

    return {
      uri,
      scheme: "err",
      kind: "engineeringIssue",
      available: true,
      contentType: "application/json",
      data: {
        issue,
        context: context?.context,
      },
      truncated: false,
    };
  }

  private readIoResource(
    uri: string,
    parsed: ReturnType<typeof parseEngineeringResourceUri>,
  ): EngineeringResourceReadResult {
    const path = parsed.params.get("path");
    if (path === null || path.trim().length === 0) {
      throw new Error(`I/O resource URI "${uri}" does not include a path.`);
    }

    const project = parsed.params.get("project") ?? undefined;
    const item = this.treeRead({ path, project }).item;

    return {
      uri,
      scheme: "io",
      kind: "ioItem",
      available: true,
      contentType: "application/json",
      data: { item },
      truncated: false,
    };
  }

  private readFileResource(
    uri: string,
    parsed: ReturnType<typeof parseEngineeringResourceUri>,
    limit: number,
  ): EngineeringResourceReadResult {
    const file = parsed.params.get("path");
    if (file === null || file.trim().length === 0) {
      throw new Error(`File resource URI "${uri}" does not include a path.`);
    }

    const project = parsed.params.get("project") ?? undefined;
    const resolvedFile = this.resolveProjectFile(file, project);
    if (resolvedFile === undefined || !existsSync(resolvedFile)) {
      return {
        uri,
        scheme: "tcfile",
        kind: "file",
        available: false,
        truncated: false,
        reason:
          "The requested file resource is not part of a configured engineering project.",
      };
    }

    const limited = limitBytes(readFileSync(resolvedFile, "utf8"), limit);
    return {
      uri,
      scheme: "tcfile",
      kind: "file",
      available: true,
      contentType: "text/plain",
      text: limited.text,
      data: { path: resolvedFile },
      bytesRead: limited.bytesRead,
      truncated: limited.truncated,
    };
  }

  private readFolderResource(
    uri: string,
    parsed: ReturnType<typeof parseEngineeringResourceUri>,
  ): EngineeringResourceReadResult {
    const folder = parsed.params.get("path");
    if (folder === null || folder.trim().length === 0) {
      throw new Error(`Folder resource URI "${uri}" does not include a path.`);
    }

    const project = parsed.params.get("project") ?? undefined;
    const resolvedFolder = this.resolveProjectFolder(folder, project);
    if (resolvedFolder === undefined || !existsSync(resolvedFolder)) {
      return {
        uri,
        scheme: "tcfolder",
        kind: "folder",
        available: false,
        truncated: false,
        reason:
          "The requested folder resource is not part of a configured engineering project.",
      };
    }

    const entries = readdirSync(resolvedFolder)
      .sort((left, right) => left.localeCompare(right))
      .slice(0, MAX_FOLDER_RESOURCE_ENTRIES)
      .map((entry) => {
        const path = join(resolvedFolder, entry);
        const stats = statSync(path);
        return {
          name: entry,
          path,
          type: stats.isDirectory() ? "folder" : "file",
          size: stats.isDirectory() ? undefined : stats.size,
          resourceUri: stats.isDirectory() ? tcFolderUri(path) : tcFileUri(path),
        };
      });

    return {
      uri,
      scheme: "tcfolder",
      kind: "folder",
      available: true,
      contentType: "application/json",
      data: {
        path: resolvedFolder,
        entries,
        count: entries.length,
      },
      truncated: entries.length >= MAX_FOLDER_RESOURCE_ENTRIES,
    };
  }

  private createUnavailableBuildResult(
    input: EngineeringBuildInput,
    scope: EngineeringBuildScope,
  ): EngineeringBuildResult {
    const startedAt = new Date().toISOString();
    const project = this.findBuildProject(input.project, scope);
    const completedAt = new Date().toISOString();
    const outputText =
      `${scope} build is unavailable for backend "${this.config.backend}". ` +
      "No Activate Configuration, Download, Login, Run, or Stop action was performed.";

    return {
      scope,
      status: "unavailable",
      available: false,
      backend: this.config.backend,
      ...(project === undefined ? {} : { project }),
      ...(input.target === undefined ? {} : { target: input.target }),
      startedAt,
      completedAt,
      durationMs: Math.max(
        new Date(completedAt).getTime() - new Date(startedAt).getTime(),
        0,
      ),
      safetyBoundary: BUILD_SAFETY_BOUNDARY,
      reason: CONFIGURED_BACKEND_BUILD_UNAVAILABLE_REASON,
      errors: [],
      warnings: [],
      output: {
        channel: "build",
        text: outputText,
        truncated: false,
      },
    };
  }

  private findBuildProject(
    projectFilter: string | undefined,
    scope: EngineeringBuildScope,
  ): EngineeringProjectSummary | undefined {
    const preferredType = scope === "plcProject" ? "plc" : undefined;
    return this.filterProjects(projectFilter, preferredType)[0];
  }

  private collectEngineeringIssues(
    projectFilter?: string,
  ): EngineeringIssue[] {
    void this.filterProjects(projectFilter);
    return [];
  }

  private resolveProjectFile(
    file: string,
    projectFilter?: string,
  ): string | undefined {
    const projects = this.filterProjects(projectFilter);
    for (const project of projects) {
      const projectDirectory = dirname(project.path);
      const resolved = normalizeProjectPath(file, projectDirectory);
      const normalizedProjectDirectory = `${normalize(projectDirectory).toLowerCase()}\\`;
      const normalizedResolved = normalize(resolved).toLowerCase();

      if (
        normalizedResolved === project.path.toLowerCase() ||
        normalizedResolved.startsWith(normalizedProjectDirectory)
      ) {
        return resolved;
      }
    }

    return undefined;
  }

  private resolveProjectFolder(
    folder: string,
    projectFilter?: string,
  ): string | undefined {
    const projects = this.filterProjects(projectFilter);
    for (const project of projects) {
      const projectDirectory = dirname(project.path);
      const resolved = normalizeProjectPath(folder, projectDirectory);
      const normalizedProjectDirectory = normalize(projectDirectory).toLowerCase();
      const normalizedResolved = normalize(resolved).toLowerCase();

      if (
        normalizedResolved === normalizedProjectDirectory ||
        normalizedResolved.startsWith(`${normalizedProjectDirectory}\\`)
      ) {
        return resolved;
      }
    }

    return undefined;
  }

  private discoverProjects(): EngineeringProjectSummary[] {
    if (!isEnabledConfiguredBackend(this.config)) {
      return [];
    }

    const projects: EngineeringProjectSummary[] = [];
    const seen = new Set<string>();

    const addProject = (
      file: EngineeringProjectFileConfig | SolutionProjectReference,
      source: EngineeringBackendSource,
    ): void => {
      const path = normalizeProjectPath(file.path);
      const type =
        "type" in file && file.type !== undefined
          ? file.type
          : inferProjectType(path);
      const name =
        "name" in file && file.name !== undefined ? file.name : projectName(path);
      const id = `${source}:${path.toLowerCase()}`;

      if (seen.has(id)) {
        return;
      }

      seen.add(id);
      projects.push({
        id,
        name,
        path,
        type,
        exists: existsSync(path),
        source,
        workbenchId: WORKBENCH_ID,
        resourceUri: tcFileUri(path),
        folderUri: tcFolderUri(dirname(path)),
      });
    };

    for (const file of this.config.projectFiles) {
      addProject(file, "configuredProjectFiles");

      const normalizedPath = normalizeProjectPath(file.path);
      if ((file.type ?? inferProjectType(normalizedPath)) === "solution") {
        for (const reference of parseSolutionReferences(normalizedPath)) {
          addProject(reference, "solutionReference");
        }
      }
    }

    return projects.sort((left, right) => left.name.localeCompare(right.name));
  }

  private buildTreeIndex(projectFilter?: string): TreeIndex {
    const projects = this.filterProjects(projectFilter, "sysManager");
    const items = new Map<string, InternalTreeItem>();
    const byPath = new Map<string, InternalTreeItem>();

    for (const project of projects) {
      if (!project.exists) {
        continue;
      }

      this.addXmlFileTree(project.path, project, undefined, items, byPath);
    }

    return { items, byPath };
  }

  private filterProjects(
    projectFilter: string | undefined,
    preferredType?: EngineeringProjectTypeConfig,
  ): EngineeringProjectSummary[] {
    const normalizedProject = projectFilter?.trim().toLowerCase();
    return this.discoverProjects().filter((project) => {
      if (
        preferredType !== undefined &&
        project.type !== preferredType &&
        normalizedProject === undefined
      ) {
        return false;
      }

      if (normalizedProject === undefined || normalizedProject.length === 0) {
        return true;
      }

      return (
        project.id.toLowerCase() === normalizedProject ||
        project.name.toLowerCase() === normalizedProject ||
        project.path.toLowerCase() === normalizedProject
      );
    });
  }

  private addXmlFileTree(
    filePath: string,
    project: EngineeringProjectSummary,
    parentPath: string | undefined,
    items: Map<string, InternalTreeItem>,
    byPath: Map<string, InternalTreeItem>,
    visited = new Set<string>(),
  ): void {
    const normalizedFilePath = normalizeProjectPath(filePath);
    if (visited.has(normalizedFilePath) || !existsSync(normalizedFilePath)) {
      return;
    }

    visited.add(normalizedFilePath);
    const parsed = xmlParser.parse(
      readFileSync(normalizedFilePath, "utf8"),
    ) as unknown;
    const sourceRoot = parentPath ?? `/${project.name}`;
    const fileRoot = `${sourceRoot}/${basename(normalizedFilePath)}`;
    const basePath = dirname(normalizedFilePath);

    if (isRecord(parsed)) {
      this.collectXmlTreeItems(
        parsed,
        fileRoot,
        normalizedFilePath,
        project,
        items,
        byPath,
      );
    }

    for (const reference of collectFileReferences(parsed, basePath)) {
      this.addXmlFileTree(reference, project, fileRoot, items, byPath, visited);
    }
  }

  private collectXmlTreeItems(
    elementContainer: Record<string, unknown>,
    parentPath: string,
    sourceFile: string,
    project: EngineeringProjectSummary,
    items: Map<string, InternalTreeItem>,
    byPath: Map<string, InternalTreeItem>,
    parentId?: string,
  ): void {
    for (const [elementName, value] of childElementEntries(elementContainer)) {
      for (const [index, element] of asArray(value).entries()) {
        if (!isRecord(element)) {
          continue;
        }

        const settings = collectSettings(element);
        const name = displayName(elementName, element, index);
        const path = `${parentPath}/${pathSegment(elementName, name, index)}`;
        const id = `${sourceFile}:${path}`;
        const item: InternalTreeItem = {
          id,
          path,
          name,
          type: classifyTreeItem(elementName, name, settings),
          xmlElement: elementName,
          sourceFile,
          project,
          settings,
          childIds: [],
          ...(parentId === undefined ? {} : { parentId }),
          ...(commentText(element, settings) === undefined
            ? {}
            : { comment: commentText(element, settings) }),
        };

        items.set(id, item);
        byPath.set(path.toLowerCase(), item);

        if (parentId !== undefined) {
          const parent = items.get(parentId);
          parent?.childIds.push(id);
        }

        this.collectXmlTreeItems(
          element,
          path,
          sourceFile,
          project,
          items,
          byPath,
          id,
        );
      }
    }
  }

  private findTreeItem(
    treePath: string,
    projectFilter?: string,
  ): InternalTreeItem {
    const index = this.buildTreeIndex(projectFilter);
    const normalizedPath = treePath.trim().toLowerCase();
    const item =
      index.byPath.get(normalizedPath) ??
      [...index.items.values()].find(
        (entry) =>
          entry.id.toLowerCase() === normalizedPath ||
          entry.name.toLowerCase() === normalizedPath,
      );

    if (item === undefined) {
      throw new Error(`TwinCAT tree item "${treePath}" was not found.`);
    }

    return item;
  }

  private findTopologyItem(
    index: TreeIndex,
    query: string,
    type: EngineeringTreeItemType,
  ): InternalTreeItem {
    const normalizedQuery = query.trim().toLowerCase();
    const item = [...index.items.values()].find(
      (entry) =>
        entry.type === type &&
        (entry.path.toLowerCase() === normalizedQuery ||
          entry.name.toLowerCase() === normalizedQuery ||
          entry.id.toLowerCase() === normalizedQuery),
    );

    if (item === undefined) {
      throw new Error(`TwinCAT ${type} "${query}" was not found.`);
    }

    return item;
  }

  private toTreeItemSummary(item: InternalTreeItem): EngineeringTreeItemSummary {
    return {
      id: item.id,
      resourceUri: ioItemUri(item.project, item.path),
      path: item.path,
      name: item.name,
      type: item.type,
      xmlElement: item.xmlElement,
      sourceFile: item.sourceFile,
      project: item.project,
      ...(item.comment === undefined ? {} : { comment: item.comment }),
      childCount: item.childIds.length,
    };
  }

  private describeInternalTreeItem(
    item: InternalTreeItem,
    index: TreeIndex,
  ): EngineeringTreeItemDescription {
    return {
      ...this.toTreeItemSummary(item),
      settings: item.settings,
      children: item.childIds
        .map((childId) => index.items.get(childId))
        .filter((child): child is InternalTreeItem => child !== undefined)
        .map((child) => this.toTreeItemSummary(child)),
    };
  }

  private descendantItems(
    root: InternalTreeItem,
    index: TreeIndex,
  ): InternalTreeItem[] {
    const descendants: InternalTreeItem[] = [];
    const visit = (item: InternalTreeItem): void => {
      for (const childId of item.childIds) {
        const child = index.items.get(childId);
        if (child === undefined) {
          continue;
        }

        descendants.push(child);
        visit(child);
      }
    };

    visit(root);
    return descendants;
  }

  private toIoDeviceSummary(
    device: InternalTreeItem,
    index: TreeIndex,
  ): EngineeringIoDeviceSummary {
    const descendants = this.descendantItems(device, index);
    const boxes = descendants
      .filter((item) => item.type === "box")
      .map((item) => this.toTreeItemSummary(item));
    const terminals = descendants
      .filter((item) => item.type === "terminal")
      .map((item) => this.toTreeItemSummary(item));

    return {
      ...this.toTreeItemSummary(device),
      boxes,
      terminals,
      boxCount: boxes.length,
      terminalCount: terminals.length,
    };
  }

  private buildPlcObjects(projectFilter?: string): EngineeringPlcPouContent[] {
    const projects = this.filterProjects(projectFilter, "plc");
    const objects: EngineeringPlcPouContent[] = [];

    for (const project of projects) {
      if (!project.exists) {
        continue;
      }

      const parsedProject = xmlParser.parse(readFileSync(project.path, "utf8"));
      for (const objectPath of collectPlcObjectReferences(
        parsedProject,
        project.path,
      )) {
        objects.push(...this.readPlcObjects(objectPath, project));
      }
    }

    return objects.sort((left, right) =>
      left.qualifiedName.localeCompare(right.qualifiedName),
    );
  }

  private readPlcObjects(
    sourceFile: string,
    project: EngineeringProjectSummary,
  ): EngineeringPlcPouContent[] {
    if (!existsSync(sourceFile)) {
      return [];
    }

    const rawXml = readFileSync(sourceFile, "utf8");
    const parsed = xmlParser.parse(rawXml) as unknown;
    return collectPlcObjectElements(parsed).map((entry, index) => {
      const name = plcObjectName(sourceFile, entry.element);
      const qualifiedName =
        entry.ownerName === undefined || entry.ownerName.length === 0
          ? name
          : `${entry.ownerName}.${name}`;
      const declaration = findSectionTexts(entry.element, ["Declaration"])
        .join("\n")
        .trim();
      const implementation = findSectionTexts(entry.element, [
        "Implementation",
        "ST",
        "FBD",
        "LD",
        "SFC",
        "CFC",
      ])
        .join("\n")
        .trim();
      const rawText = [declaration, implementation]
        .filter((text) => text.length > 0)
        .join("\n\n");
      const kind = classifyPlcObject(
        sourceFile,
        entry.elementName,
        entry.element,
        declaration,
      );

      return {
        id: `${project.id}:pou:${sourceFile.toLowerCase()}:${qualifiedName.toLowerCase()}:${index}`,
        resourceUri: plccPouUri(project, qualifiedName),
        name,
        qualifiedName,
        kind,
        path: `/${project.name}/${qualifiedName}`,
        sourceFile,
        project,
        declaration,
        implementation,
        rawText,
      };
    });
  }

  private findPlcObject(
    pou: string,
    projectFilter?: string,
  ): EngineeringPlcPouContent {
    const normalizedPou = pou.trim().toLowerCase();
    const object = this.buildPlcObjects(projectFilter).find(
      (entry) =>
        entry.id.toLowerCase() === normalizedPou ||
        entry.name.toLowerCase() === normalizedPou ||
        entry.qualifiedName.toLowerCase() === normalizedPou ||
        entry.sourceFile.toLowerCase() === normalizedPou,
    );

    if (object === undefined) {
      throw new Error(`PLC object "${pou}" was not found.`);
    }

    return object;
  }

  private toPlcPouSummary(
    pou: EngineeringPlcPouContent,
  ): EngineeringPlcPouSummary {
    return {
      id: pou.id,
      resourceUri: plccPouUri(pou.project, pou.qualifiedName),
      name: pou.name,
      qualifiedName: pou.qualifiedName,
      kind: pou.kind,
      path: pou.path,
      sourceFile: pou.sourceFile,
      project: pou.project,
    };
  }

  private buildHmiProjectSummaries(
    projectFilter?: string,
  ): EngineeringHmiProjectSummary[] {
    return this.filterHmiProjects(projectFilter).map((project) => {
      const metadata = this.readHmiProjectMetadata(project);
      const previewReason =
        metadata.serverPort === undefined
          ? "No live HMI server port or preview URL is available from the configured project file."
          : "A server port was found in project metadata, but no live HMI preview endpoint is managed by this backend.";

      return {
        project,
        artifactCount: this.buildHmiArtifacts(project.id).length,
        previewAvailable: false,
        ...(metadata.routerPort === undefined
          ? {}
          : { routerPort: metadata.routerPort }),
        ...(metadata.serverPort === undefined
          ? {}
          : { serverPort: metadata.serverPort }),
        previewReason,
      };
    });
  }

  private readHmiProjectMetadata(project: EngineeringProjectSummary): {
    readonly routerPort?: number | undefined;
    readonly serverPort?: number | undefined;
  } {
    if (!project.exists) {
      return {};
    }

    const parsedProject = xmlParser.parse(readFileSync(project.path, "utf8"));
    const routerPort = findNumericSetting(parsedProject, [
      "RouterPort",
      "AmsRouterPort",
      "AdsRouterPort",
    ]);
    const serverPort = findNumericSetting(parsedProject, [
      "ServerPort",
      "WebServerPort",
      "HttpPort",
      "HttpsPort",
      "Port",
    ]);

    return {
      ...(routerPort === undefined ? {} : { routerPort }),
      ...(serverPort === undefined ? {} : { serverPort }),
    };
  }

  private buildHmiArtifacts(
    projectFilter?: string,
  ): EngineeringHmiArtifactSummary[] {
    const artifacts: EngineeringHmiArtifactSummary[] = [];

    for (const project of this.filterHmiProjects(projectFilter)) {
      if (!project.exists) {
        continue;
      }

      const parsedProject = xmlParser.parse(readFileSync(project.path, "utf8"));
      for (const artifactPath of collectHmiArtifactReferences(
        parsedProject,
        project.path,
      )) {
        artifacts.push({
          id: `${project.id}:hmi:${artifactPath.toLowerCase()}`,
          resourceUri: tcFileUri(artifactPath),
          name: artifactName(artifactPath),
          kind: classifyHmiArtifact(artifactPath),
          path: `/${project.name}/${artifactName(artifactPath)}`,
          sourceFile: artifactPath,
          project,
        });
      }
    }

    return artifacts.sort((left, right) =>
      left.name.localeCompare(right.name),
    );
  }

  private filterHmiProjects(projectFilter?: string): EngineeringProjectSummary[] {
    return this.filterProjects(projectFilter, "hmi").filter(
      (project) => project.type === "hmi",
    );
  }

  private buildPlcLibraries(
    projectFilter?: string,
  ): EngineeringPlcLibrarySummary[] {
    const libraries = new Map<string, EngineeringPlcLibrarySummary>();

    for (const project of this.filterProjects(projectFilter, "plc")) {
      if (!project.exists) {
        continue;
      }

      const parsedProject = xmlParser.parse(readFileSync(project.path, "utf8"));
      findLibraryReferences(parsedProject, project, project.path, libraries);
    }

    return [...libraries.values()].sort((left, right) =>
      left.name.localeCompare(right.name),
    );
  }
}
