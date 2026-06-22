import { existsSync, readFileSync } from "node:fs";
import { basename, dirname, extname, isAbsolute, join, normalize } from "node:path";

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

interface SolutionProjectReference {
  readonly name: string;
  readonly path: string;
}

const WORKBENCH_ID = "configured-project-files";

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
}
