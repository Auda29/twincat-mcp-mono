import { randomUUID } from "node:crypto";
import { win32 } from "node:path";
import { z } from "zod";

import type { McpToolDefinition } from "./index.js";

const uuid = z.string().uuid().refine((value) => value !== "00000000-0000-0000-0000-000000000000").transform((value) => value.toLowerCase());
const canonicalPath = z.string().refine((value) =>
  /^(?:[a-z]:\\|\\\\[^\\]+\\[^\\]+\\)/i.test(value) &&
  win32.isAbsolute(value) && win32.normalize(value) === value,
  "A canonical absolute Windows path is required.",
);
const contextSchema = z.object({
  sessionId: uuid,
  idePid: z.number().int().positive(),
  ideStartedUtc: z.string().datetime(),
  solutionFile: canonicalPath,
  projectFile: canonicalPath,
  contextEpoch: z.string().min(1).max(256),
}).strict();

export type LiveEngineeringContext = z.infer<typeof contextSchema>;

export interface LiveEngineeringToolBinding {
  readonly context: Readonly<LiveEngineeringContext>;
  /** Authenticated host transport, bound outside model-visible tool arguments. */
  readonly dispatch: (requestJson: string) => Promise<string>;
}

const startInput = z.object({}).strict();
const targetInput = z.object({ targetOperationId: uuid }).strict();
const responseSchema = z.object({
  protocolVersion: z.literal(1),
  sessionId: uuid,
  operationId: uuid,
  status: z.enum(["accepted", "running", "succeeded", "failed", "refused", "conflict", "cancelled", "unknown", "unsupported"]),
  provenance: z.object({}).passthrough(),
  output: z.string().max(65536).nullable().optional(),
  diagnostics: z.array(z.unknown()).max(100).optional(),
}).passthrough();

/** Explicit live mode. The default file backend and its tools remain unchanged. */
export function createLiveEngineeringToolDefinitions(
  binding: LiveEngineeringToolBinding,
): McpToolDefinition[] {
  const context = Object.freeze(contextSchema.parse(binding.context));
  const dispatch = binding.dispatch;
  if (typeof dispatch !== "function") throw new Error("An authenticated host dispatch function is required.");
  const { sessionId, ...identity } = context;
  const expected = Object.freeze(identity);

  const invoke = async (operation: string, args: Record<string, unknown>): Promise<unknown> => {
    const operationId = randomUUID();
    const target = typeof args.targetOperationId === "string" ? args.targetOperationId : operationId;
    const request = JSON.stringify({ protocolVersion: 1, sessionId, operationId, operation, expected, arguments: args });
    try {
      // Exactly one dispatch. In particular, an unknown submission is not retried.
      const text = await dispatch(request);
      if (Buffer.byteLength(text, "utf8") > 512 * 1024) throw new Error("Oversized response");
      const response = responseSchema.parse(JSON.parse(text));
      if (response.sessionId !== sessionId || response.operationId !== operationId) throw new Error("Response binding mismatch");
      const result = response.result;
      const resultBuildId = result !== null && typeof result === "object" && !Array.isArray(result)
        ? (result as Record<string, unknown>).buildOperationId : undefined;
      const provenanceBuildId = response.provenance.buildOperationId;
      if ((resultBuildId != null && resultBuildId !== target) ||
          (provenanceBuildId != null && provenanceBuildId !== target)) throw new Error("Build ownership mismatch");
      const hasEvidence = response.output != null || (response.diagnostics?.length ?? 0) > 0;
      const discovery = operation === "session.describe" || operation === "project.association";
      if (discovery && hasEvidence) throw new Error("Unexpected build evidence");
      if (!discovery && (hasEvidence || ["accepted", "running", "succeeded", "failed", "cancelled"].includes(response.status)) &&
          provenanceBuildId !== target) throw new Error("Missing build ownership");
      return response;
    } catch {
      // Do not expose transport errors, which may contain connection credentials.
      return {
        protocolVersion: 1, sessionId, operationId, status: "unknown",
        provenance: { observedContext: context, observedAt: new Date().toISOString(), source: "unknown", dirtyState: "unknown", buildOperationId: target },
        error: operation === "session.describe" || operation === "project.association"
          ? "Host observation could not be verified."
          : "Host outcome could not be verified. Query this build operation before taking further action; do not automatically retry submission.",
      };
    }
  };

  const build = (name: string, title: string): McpToolDefinition => ({
    name, title,
    description: "Submit a build of the host-bound PLC project after explicit native approval. Returns an operation ID immediately; query tc_operation_get, then read diagnostics or output with that targetOperationId. Does not save or change configuration.",
    inputSchema: startInput,
    annotations: { destructiveHint: false, idempotentHint: false, openWorldHint: false },
    execute: async (input: unknown) => { startInput.parse(input); return invoke("build.start", { approvalExpiresUtc: new Date(Date.now() + 90_000).toISOString() }); },
  });
  const read = (name: string, title: string, operation: string, description: string, cancel = false): McpToolDefinition => ({
    name, title, description,
    inputSchema: targetInput,
    annotations: cancel
      ? { destructiveHint: false, idempotentHint: false, openWorldHint: false }
      : { readOnlyHint: true, openWorldHint: false },
    execute: async (input: unknown) => invoke(operation, targetInput.parse(input)),
  });

  return [
    { name: "tc_session_describe", title: "TwinCAT Live Session Capabilities",
      description: "Describe the bound live engineering session and provider capabilities without starting a build.",
      inputSchema: startInput, annotations: { readOnlyHint: true, openWorldHint: false },
      execute: async (input: unknown) => { startInput.parse(input); return invoke("session.describe", {}); } },
    { name: "tc_project_association", title: "TwinCAT Project Association",
      description: "Read the unique association between the bound PLC project and its owning TwinCAT project. This does not build or change the project.",
      inputSchema: startInput, annotations: { readOnlyHint: true, openWorldHint: false },
      execute: async (input: unknown) => { startInput.parse(input); return invoke("project.association", {}); } },
    build("tc_build_project", "TwinCAT Live Build Project"),
    { name: "plc_build_project", title: "PLC Live Build Project",
      description: "A separately scoped PLC build is unavailable until the host can verify a PLC-specific command.",
      inputSchema: startInput, annotations: { destructiveHint: false, idempotentHint: false, openWorldHint: false },
      execute: async (input: unknown) => { startInput.parse(input); return { status: "unsupported", reason: "A uniquely scoped PLC build command is not verified." }; } },
    build("tc_build_and_get_errors", "TwinCAT Live Build And Get Errors"),
    read("tc_error_list", "TwinCAT Live Build Diagnostics", "diagnostics.read", "Read bounded diagnostics belonging to the explicit build operation. Never reads unrelated IDE Error List entries or starts a build. Filters are unsupported."),
    read("tc_output_read", "TwinCAT Live Build Output", "output.read", "Read bounded output belonging to the explicit build operation, preserving provider provenance and truncation indicators. Filters are unsupported."),
    read("tc_operation_get", "TwinCAT Live Operation Status", "operation.get", "Query the explicit build operation without waiting for completion or submitting another build."),
    read("tc_operation_cancel", "TwinCAT Live Operation Cancel", "operation.cancel", "Request best-effort cancellation of the explicit build operation. An unknown outcome does not prove the IDE stopped; query the same operation to resolve it.", true),
  ];
}
