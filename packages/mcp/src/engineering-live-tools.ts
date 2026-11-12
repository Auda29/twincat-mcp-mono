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
const buildInput = z.object({ configuration: z.enum(["Debug", "Release"]), platform: z.enum(["TwinCAT RT (x86)", "TwinCAT RT (x64)"]) }).strict();
const targetInput = z.object({ targetOperationId: uuid }).strict();
const sourceInput = z.object({ objectId: z.string().min(1).max(1024), section: z.enum(["declaration", "implementation"]) }).strict();
const previewInput = sourceInput.extend({ proposedText: z.string().max(16384) }).strict();
const digest = z.string().regex(/^[0-9a-f]{64}$/);
const sourceApprovalInput = z.object({ baselineDigest: digest, proposedDigest: digest, projectRevision: digest }).strict();
const applyInput = sourceApprovalInput.extend({ previewId: uuid }).strict();
const rollbackInput = sourceApprovalInput.extend({ journalId: uuid }).strict();
const journalInput = z.object({ journalId: uuid }).strict();
const sourceTargetsInput = z.object({ moniker: canonicalPath }).strict();
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
      const discovery = operation === "session.describe" || operation === "project.association" || operation.startsWith("source.");
      if (discovery && hasEvidence) throw new Error("Unexpected build evidence");
      if (!discovery && (hasEvidence || ["accepted", "running", "succeeded", "failed", "cancelled"].includes(response.status)) &&
          provenanceBuildId !== target) throw new Error("Missing build ownership");
      return response;
    } catch {
      // Do not expose transport errors, which may contain connection credentials.
      return {
        protocolVersion: 1, sessionId, operationId, status: "unknown",
        provenance: { context, observedAt: new Date().toISOString(), source: "unknown", dirtyState: "unknown", ...(operation.startsWith("source.") ? {} : { buildOperationId: target }) },
        error: operation.startsWith("source.")
          ? "Source outcome could not be verified. Retain the operation ID and query its journal if submitted; do not retry a mutation."
          : operation === "session.describe" || operation === "project.association"
          ? "Host observation could not be verified."
          : "Host outcome could not be verified. Query this build operation before taking further action; do not automatically retry submission.",
      };
    }
  };

  const build = (name: string, title: string): McpToolDefinition => ({
    name, title,
    description: "Submit a build of the exact host-bound PLC project after explicit native approval, using the configuration/platform returned by tc_session_describe. Nonempty or unverifiable build dependencies are refused. Query tc_operation_get and read build-owned diagnostics/output. Does not save or switch configuration.",
    inputSchema: buildInput,
    annotations: { destructiveHint: false, idempotentHint: false, openWorldHint: false },
    execute: async (input: unknown) => { const selected = buildInput.parse(input); return invoke("build.start", { approvalExpiresUtc: new Date(Date.now() + 90_000).toISOString(), ...selected }); },
  });
  const read = (name: string, title: string, operation: string, description: string, cancel = false): McpToolDefinition => ({
    name, title, description,
    inputSchema: targetInput,
    annotations: cancel
      ? { destructiveHint: false, idempotentHint: false, openWorldHint: false }
      : { readOnlyHint: true, openWorldHint: false },
    execute: async (input: unknown) => invoke(operation, targetInput.parse(input)),
  });

  const source = (name: string, operation: string, schema: z.ZodType, description: string, mutation = false): McpToolDefinition => ({
    name, title: name, description, inputSchema: schema,
    annotations: mutation ? { destructiveHint: true, idempotentHint: false, openWorldHint: false } : { readOnlyHint: true, openWorldHint: false },
    execute: async (input: unknown) => {
      const args = schema.parse(input) as Record<string, unknown>;
      return invoke(operation, mutation ? { ...args, approvalExpiresUtc: new Date(Date.now() + 90_000).toISOString() } : args);
    },
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
    build("plc_build_project", "PLC Live Build Project"),
    build("tc_build_and_get_errors", "TwinCAT Live Build And Get Errors"),
    read("tc_error_list", "TwinCAT Live Build Diagnostics", "diagnostics.read", "Read bounded diagnostics belonging to the explicit build operation. Never reads unrelated IDE Error List entries or starts a build. Filters are unsupported."),
    read("tc_output_read", "TwinCAT Live Build Output", "output.read", "Read bounded output belonging to the explicit build operation, preserving provider provenance and truncation indicators. Filters are unsupported."),
    read("tc_operation_get", "TwinCAT Live Operation Status", "operation.get", "Query the explicit build operation without waiting for completion or submitting another build."),
    read("tc_operation_cancel", "TwinCAT Live Operation Cancel", "operation.cancel", "Request best-effort cancellation of the explicit build operation. An unknown outcome does not prove the IDE stopped; query the same operation to resolve it.", true),
    source("plc_source_targets", "source.targets", sourceTargetsInput, "Discover existing POU/method/action IDs and sections verified in the exact already-open TcPOU XML buffer or attached TwinCAT ST editor. Pass the canonical physical TcPOU filename. Does not open or modify a document."),
    source("plc_source_read", "source.read", sourceInput, "Read an exact supported ST/declaration section from its already-open XML buffer or attached TwinCAT ST editor, preserving live text, dirty state and digests."),
    source("plc_source_preview", "source.preview", previewInput, "Prepare an exact before/proposed section diff without changing source or granting approval. XML buffers may return a mutation-ready preview; customStReadOnly results never authorize apply and return no mutation preview ID."),
    source("plc_source_apply", "source.apply", applyInput, "Apply one exact preview after separate single-use native target/diff approval and current baseline recheck. Does not save. Unknown outcomes must not be retried.", true),
    source("plc_source_rollback", "source.rollback", rollbackInput, "Restore a journaled pre-image after separate native approval, only if the current whole buffer equals its exact post-image. Does not save.", true),
    source("plc_source_journal", "source.journal", journalInput, "Read the retained session-memory journal, including unknown outcomes. Journals do not survive provider disposal or restart."),
  ];
}
