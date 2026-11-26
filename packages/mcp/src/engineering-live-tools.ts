import { randomUUID } from "node:crypto";
import { win32 } from "node:path";
import { z } from "zod";

import type { McpToolDefinition } from "./index.js";
import { createDebugLiveTools } from "./debug-live-tools.js";

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
  readonly dispatch: (requestJson: string, timeoutMs: number) => Promise<string>;
}

const startInput = z.object({}).strict();
const buildInput = z.object({ configuration: z.enum(["Debug", "Release"]), platform: z.enum(["TwinCAT RT (x86)", "TwinCAT RT (x64)"]) }).strict();
const targetInput = z.object({ targetOperationId: uuid }).strict();
const sourceInput = z.object({ objectId: z.string().min(1).max(1024), section: z.enum(["declaration", "implementation"]) }).strict();
const sourceText = z.string().max(65536);
const previewInput = sourceInput.extend({ proposedText: sourceText }).strict();
const digest = z.string().regex(/^[0-9a-f]{64}$/);
const sourceApprovalInput = z.object({ baselineDigest: digest, proposedDigest: digest, projectRevision: digest }).strict();
const applyInput = sourceApprovalInput.extend({ previewId: uuid }).strict();
const rollbackInput = sourceApprovalInput.extend({ journalId: uuid }).strict();
const journalInput = z.object({ journalId: uuid }).strict();
const sourceTargetsInput = z.object({ moniker: canonicalPath.optional() }).strict();
const iecIdentifier = z.string().regex(/^[A-Za-z_][A-Za-z0-9_]{0,63}$/);
// Keep these IEC and TwinCAT keywords aligned with AutomationSourceCreation.
const iecElementaryTypes = new Set(`BIT BOOL BYTE WORD DWORD LWORD SINT USINT INT UINT DINT UDINT LINT ULINT REAL LREAL
STRING WSTRING TIME LTIME DATE DATE_AND_TIME DT TIME_OF_DAY TOD PVOID UXINT XINT XWORD
LDATE LDATE_AND_TIME LDT LTIME_OF_DAY LTOD`.trim().split(/\s+/));
const iecKeywords = new Set([...iecElementaryTypes, ...`ABS ABSTRACT ACOS ACTION ADD ADR AND AND_THEN ANDN ANY ANY_BIT ANY_DATE ANY_DERIVED ANY_ELEMENTARY ANY_INT
ANY_MAGNITUDE ANY_NUM ANY_REAL ANY_SIGNED ANY_STRING ANY_UNSIGNED ARRAY ASIN AT ATAN BITADR BY
CAL CALC CALCN CASE CLASS CONFIGURATION CONSTANT CONTINUE COS CYCLE DELETE DIV DO ELSE ELSIF
END_ACTION END_CASE END_CLASS END_CONFIGURATION END_FOR END_FUNCTION END_FUNCTION_BLOCK
END_IF END_INTERFACE END_METHOD END_NAMESPACE END_PROGRAM END_PROPERTY END_REPEAT END_RESOURCE
END_STEP END_STRUCT END_TRANSITION END_TYPE END_UNION END_VAR END_WHILE EQ EXIT EXP EXPT
EXTENDS FALSE FINAL FOR FUNCTION FUNCTION_BLOCK GE GT IF IMPLEMENTS INDEXOF INITIAL_STEP
INTERFACE INTERNAL JMP JMPC JMPCN LD LDN LE LN LOG LT MAX METHOD MIN MOD MOVE MUL MUX NAMESPACE
NE NEW NON_RETAIN NOT NULL OF ON OR OR_ELSE ORN OVERRIDE PARAMS PERSISTENT POINTER PRIVATE PROGRAM
PROPERTY PROTECTED PUBLIC R READ_ONLY READ_WRITE REFERENCE REPEAT RESOURCE RET RETAIN RETC
RETCN RETURN ROL ROR S SEL SHL SHR SIN SIZEOF SQRT ST STEP STN STRUCT SUB SUPER TAN TASK
THEN THIS TO TRANSITION TRUE TRUNC TYPE UNION UNTIL VAR VAR_ACCESS VAR_CONFIG VAR_EXTERNAL
VAR_GLOBAL VAR_INST VAR_IN_OUT VAR_INPUT VAR_OUTPUT VAR_STAT VAR_TEMP WHILE WITH XOR XORN
__CATCH __DELETE __ENDTRY __FINALLY __ISVALIDREF __NEW __QUERYINTERFACE __QUERYPOINTER __TRY __UXINT __XINT __XWORD`.trim().split(/\s+/)]);
const parentPath = z.string().min(1).max(512).regex(/^[^^\\/:\u0000-\u001f\u007f-\u009f|]+(?:\^[^^\\/:\u0000-\u001f\u007f-\u009f|]+)*$/)
  .refine((value) => value.split("^").every((part) => part === part.trim() && part !== "." && part !== ".."));
const createInput = z.object({
  parentPath: parentPath.describe("Relative path in the bound PLC tree, with ^ between segments."),
  name: iecIdentifier.refine((value) => !iecKeywords.has(value.toUpperCase()), "Use a non-reserved IEC identifier.")
    .describe("Non-reserved IEC identifier."),
  kind: z.enum(["fb", "prg", "fun", "method", "action", "property", "dut_struct", "gvl"]),
  returnType: iecIdentifier.refine((value) => !iecKeywords.has(value.toUpperCase()) || iecElementaryTypes.has(value.toUpperCase()),
    "Use an IEC elementary type or a non-reserved type identifier.")
    .optional().describe("IEC elementary type or user-defined type identifier. Required for fun and property, optional for method. Omit for other kinds."),
  access: z.enum(["PUBLIC", "PRIVATE", "PROTECTED", "INTERNAL"]).optional().describe("Method or property access. The provider defaults to PUBLIC."),
  createGet: z.boolean().optional().describe("Create the property Get accessor."),
  createSet: z.boolean().optional().describe("Create the property Set accessor."),
  declarationText: sourceText.optional().describe("Initial declaration. Omit for actions."),
  implementationText: sourceText.optional().describe("Initial implementation. Omit for properties, DUT structs and GVLs."),
}).strict().superRefine((args, ctx) => {
  const issue = (field: string, message: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, path: [field], message });
  const memberWithType = args.kind === "method" || args.kind === "property";
  const requiresReturnType = args.kind === "fun" || args.kind === "property";
  if (requiresReturnType && args.returnType === undefined) issue("returnType", "Return type is required for fun and property.");
  if (!requiresReturnType && args.kind !== "method" && args.returnType !== undefined)
    issue("returnType", "Return type is valid only for fun, method and property.");
  if (!memberWithType && args.access !== undefined) issue("access", "Access is valid only for method and property.");
  if (args.kind !== "property") {
    if (args.createGet !== undefined) issue("createGet", "Get is valid only for properties.");
    if (args.createSet !== undefined) issue("createSet", "Set is valid only for properties.");
  }
  if (args.kind === "action" && args.declarationText !== undefined) issue("declarationText", "Actions have no declaration section.");
  if (["dut_struct", "gvl", "property"].includes(args.kind) && args.implementationText !== undefined)
    issue("implementationText", "This kind has no implementation section.");
});
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
  options: { readonly enableDevelopmentSourceTools?: boolean; readonly enableDebugTools?: boolean } = {},
): McpToolDefinition[] {
  if (options.enableDevelopmentSourceTools && options.enableDebugTools) throw new Error("Conflicting host profile");
  const context = Object.freeze(contextSchema.parse(binding.context));
  const dispatch = binding.dispatch;
  if (typeof dispatch !== "function") throw new Error("An authenticated host dispatch function is required.");
  const { sessionId, ...identity } = context;
  const expected = Object.freeze(identity);

  const invoke = async (operation: string, args: Record<string, unknown>, approval = false): Promise<unknown> => {
    const operationId = randomUUID();
    const target = typeof args.targetOperationId === "string" ? args.targetOperationId : operationId;
    const request = JSON.stringify({ protocolVersion: 1, sessionId, operationId, operation, expected, arguments: args });
    try {
      // Exactly one dispatch. In particular, an unknown submission is not retried.
      const text = await dispatch(request, approval ? 125_000 : 30_000);
      if (Buffer.byteLength(text, "utf8") > (operation.startsWith("source.") ? 1024 : 512) * 1024) throw new Error("Oversized response");
      const response = responseSchema.parse(JSON.parse(text));
      if (response.sessionId !== sessionId || response.operationId !== operationId) throw new Error("Response binding mismatch");
      const result = response.result;
      const resultBuildId = result !== null && typeof result === "object" && !Array.isArray(result)
        ? (result as Record<string, unknown>).buildOperationId : undefined;
      const provenanceBuildId = response.provenance.buildOperationId;
      if ((resultBuildId != null && resultBuildId !== target) ||
          (provenanceBuildId != null && provenanceBuildId !== target)) throw new Error("Build ownership mismatch");
      const hasEvidence = response.output != null || (response.diagnostics?.length ?? 0) > 0;
      const discovery = operation === "session.describe" || operation === "project.association"
        || operation === "debug.context" || operation.startsWith("source.");
      if (discovery && hasEvidence) throw new Error("Unexpected build evidence");
      if (!discovery && (hasEvidence || ["accepted", "running", "succeeded", "failed", "cancelled"].includes(response.status)) &&
          provenanceBuildId !== target) throw new Error("Missing build ownership");
      return response;
    } catch {
      // Do not expose transport errors, which may contain connection credentials.
      return {
        protocolVersion: 1, sessionId, operationId, status: "unknown",
        provenance: { context, observedAt: new Date().toISOString(), source: "unknown", dirtyState: "unknown", ...(operation.startsWith("source.") ? {} : { buildOperationId: target }) },
        error: operation === "source.create"
          ? "Creation outcome could not be verified. Inspect source targets before taking further action. Do not retry the submission."
          : operation.startsWith("source.")
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
    execute: async (input: unknown) => { const selected = buildInput.parse(input); return invoke("build.start", { approvalExpiresUtc: new Date(Date.now() + 90_000).toISOString(), ...selected }, true); },
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
      return invoke(operation, mutation ? { ...args, approvalExpiresUtc: new Date(Date.now() + 90_000).toISOString() } : args, mutation);
    },
  });

  const tools = [
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
    source("plc_source_targets", "source.targets", sourceTargetsInput, "Discover supported Structured Text targets across the bound PLC project. Omit moniker to list up to 512 targets, or pass a canonical physical filename to filter and prefer its open XML buffer."),
    source("plc_source_read", "source.read", sourceInput, "Read a section by target ID. Automation Interface text uses LF line endings. Open XML buffers and attached read-only TwinCAT text editors report their own live text."),
    source("plc_source_preview", "source.preview", previewInput, "Prepare exact before and proposed ST source for native approval without changing any text. Automation Interface and open XML previews can authorize apply. Attached read-only editor results have no mutation preview ID."),
    source("plc_source_apply", "source.apply", applyInput, "Apply a single-use preview after native approval and an exact baseline check. Automation Interface edits may persist to disk and refuse unverified unsaved editor changes. Open XML edits stay in the buffer. Do not retry unknown outcomes.", true),
    source("plc_source_rollback", "source.rollback", rollbackInput, "Restore a journaled pre-image after native approval and an exact post-image check. Automation Interface rollback may persist to disk. Open XML rollback stays in the buffer.", true),
    source("plc_source_journal", "source.journal", journalInput, "Read the retained session-memory journal, including unknown apply outcomes. Journals do not survive provider disposal or restart."),
    source("plc_source_create", "source.create", createInput, "Create an ST PLC object in the bound project after native approval. TwinCAT writes the object file, or changes its owning POU file, while project changes remain pending in the IDE. Do not retry unknown outcomes.", true),
  ];
  // Build-mode callers retain the nine-tool catalog. The authenticated Editor
  // child can publish source definitions. The host still authorizes operations
  // and validates the source adapter and native approval before a mutation.
  const buildTools = tools.filter((tool) => !tool.name.startsWith("plc_source_"));
  if (options.enableDebugTools) return [...buildTools, ...createDebugLiveTools(invoke)];
  return options.enableDevelopmentSourceTools === true ? tools : buildTools;
}
