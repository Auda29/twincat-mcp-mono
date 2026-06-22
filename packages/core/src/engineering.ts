import { existsSync, readFileSync } from "node:fs";
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
}
