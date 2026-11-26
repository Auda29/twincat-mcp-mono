import { createHash } from "node:crypto";
import { zodToJsonSchema } from "zod-to-json-schema";
import { describe, expect, it, vi } from "vitest";

import {
  createLiveEngineeringToolDefinitions,
  type LiveEngineeringContext,
} from "../src/engineering-live-tools.js";

const context: LiveEngineeringContext = {
  sessionId: "b476ad59-d083-45b7-bcf6-9e77eb2877c9",
  idePid: 1234,
  ideStartedUtc: "2026-11-12T08:00:00Z",
  solutionFile: "C:\\fixture\\a.sln",
  projectFile: "C:\\fixture\\a.plcproj",
  contextEpoch: "bound-1",
};
const targetOperationId = "c723bb55-c04b-437b-98f8-88d1737b9ad7";
const selectedBuild = { configuration: "Debug", platform: "TwinCAT RT (x86)" };

function setup(respond?: (request: Record<string, unknown>) => unknown) {
  const dispatch = vi.fn(async (text: string, _timeoutMs: number) => {
    const request = JSON.parse(text) as Record<string, unknown>;
    const args = request.arguments as Record<string, unknown>;
    const owner = args.targetOperationId ?? request.operationId;
    return JSON.stringify(respond ? respond(request) : {
      protocolVersion: 1, sessionId: request.sessionId, operationId: request.operationId,
      status: request.operation === "build.start" ? "accepted" : "succeeded",
      provenance: { source: "unknown", dirtyState: "clean", buildOperationId: owner, observedAt: "2026-11-12T09:00:00Z" },
      result: { buildOperationId: owner, outputTruncated: true, diagnosticsTruncated: true },
      output: "build output", diagnostics: [{ File: "Main.TcPOU", Severity: "error", Message: "Example" }],
    });
  });
  const tools = createLiveEngineeringToolDefinitions({ context, dispatch }, { enableDevelopmentSourceTools: true });
  return { dispatch, tool: (name: string) => tools.find((tool) => tool.name === name)! };
}

describe("explicit live engineering tools", () => {
  it("defaults to the nine release tools while retaining explicit development definitions", () => {
    const binding = { context, dispatch: vi.fn(async () => { throw new Error("not called"); }) };
    const release = createLiveEngineeringToolDefinitions(binding);
    expect(release.map((tool) => tool.name)).toEqual([
      "tc_session_describe", "tc_project_association", "tc_build_project", "plc_build_project",
      "tc_build_and_get_errors", "tc_error_list", "tc_output_read", "tc_operation_get", "tc_operation_cancel",
    ]);
    expect(createLiveEngineeringToolDefinitions(binding, { enableDevelopmentSourceTools: true })).toHaveLength(16);
    expect(binding.dispatch).not.toHaveBeenCalled();
  });
  it("routes source preview and mutation through the bound manual lane", async () => {
    const { dispatch, tool } = setup((request) => ({ protocolVersion: 1, sessionId: request.sessionId, operationId: request.operationId,
      status: "succeeded", provenance: { source: "liveBuffer", dirtyState: "dirty", buildOperationId: null }, result: { previewOperationId: request.operationId } }));
    const objectId = "C:\\fixture\\Main.TcPOU|11111111-1111-1111-1111-111111111111|Main";
    const preview = await tool("plc_source_preview").execute({ objectId, section: "implementation", proposedText: "a := 2;" }) as Record<string, unknown>;
    expect(preview.status).toBe("succeeded");
    expect(JSON.parse(dispatch.mock.calls[0]![0])).toMatchObject({ operation: "source.preview", arguments: { objectId, section: "implementation", proposedText: "a := 2;" } });
    const args = { previewId: targetOperationId, baselineDigest: "a".repeat(64), proposedDigest: "b".repeat(64), projectRevision: "c".repeat(64) };
    expect(await tool("plc_source_apply").execute(args)).toMatchObject({ status: "succeeded" });
    const request = JSON.parse(dispatch.mock.calls[1]![0]);
    expect(request).toMatchObject({ operation: "source.apply", arguments: args, expected: { projectFile: context.projectFile } });
    expect(Date.parse(request.arguments.approvalExpiresUtc)).toBeGreaterThan(Date.now());
    expect(dispatch.mock.calls.map(([, timeoutMs]) => timeoutMs)).toEqual([30_000, 125_000]);
    await tool("plc_source_rollback").execute({
      journalId: targetOperationId,
      baselineDigest: args.baselineDigest,
      proposedDigest: args.proposedDigest,
      projectRevision: args.projectRevision,
    });
    const [rollbackRequest, rollbackTimeout] = dispatch.mock.calls[2]!;
    expect(JSON.parse(rollbackRequest)).toMatchObject({ operation: "source.rollback" });
    expect(rollbackTimeout).toBe(125_000);
    expect(tool("plc_source_apply").annotations?.destructiveHint).toBe(true);
    await expect(tool("plc_source_apply").execute({ ...args, sessionId: context.sessionId })).rejects.toThrow();
    expect(dispatch).toHaveBeenCalledTimes(3);
  });
  it("discovers a project without a moniker and can filter to one physical file", async () => {
    const { dispatch, tool } = setup((request) => ({
      protocolVersion: 1, sessionId: request.sessionId, operationId: request.operationId,
      status: "succeeded", provenance: { source: "automationInterface" },
    }));
    const targets = tool("plc_source_targets");
    expect(zodToJsonSchema(targets.inputSchema)).not.toHaveProperty("required");
    await targets.execute({});
    const moniker = "C:\\fixture\\Main.TcPOU";
    await targets.execute({ moniker });
    expect(dispatch.mock.calls.map(([request]) => JSON.parse(request).arguments)).toEqual([{}, { moniker }]);
    await expect(targets.execute({ moniker: "POUs\\Main.TcPOU" })).rejects.toThrow();
    await expect(targets.execute({ moniker: null })).rejects.toThrow();
  });

  it("publishes the create schema in Editor and sends only validated input with a host expiry", async () => {
    const { dispatch, tool } = setup((request) => ({
      protocolVersion: 1, sessionId: request.sessionId, operationId: request.operationId,
      status: "refused", error: "approval_required", provenance: {},
    }));
    const create = tool("plc_source_create");
    expect(zodToJsonSchema(create.inputSchema, { $refStrategy: "none", target: "jsonSchema7" })).toMatchObject({
      type: "object", required: ["parentPath", "name", "kind"], additionalProperties: false,
      properties: {
        kind: { enum: ["fb", "prg", "fun", "method", "action", "property", "dut_struct", "gvl"] },
        name: { description: "Non-reserved IEC identifier." },
        returnType: { description: expect.stringContaining("optional for method") },
        declarationText: { maxLength: 65536 }, implementationText: { maxLength: 65536 },
      },
    });
    expect(create.annotations).toMatchObject({ destructiveHint: true, idempotentHint: false });
    const args = { parentPath: "POUs^SubFolder^FB_Motor", name: "Speed", kind: "property",
      returnType: "DINT", access: "PROTECTED", createGet: true, createSet: false, declarationText: "PROPERTY Speed : DINT\r\n" };
    const before = Date.now();
    expect(await create.execute(args)).toMatchObject({ status: "refused", error: "approval_required" });
    const [createRequest, createTimeout] = dispatch.mock.calls[0]!;
    expect(createTimeout).toBe(125_000);
    const sent = JSON.parse(createRequest);
    expect(sent).toMatchObject({ operation: "source.create", arguments: args });
    const expiry = Date.parse(sent.arguments.approvalExpiresUtc);
    expect(expiry).toBeGreaterThan(before);
    expect(expiry).toBeLessThanOrEqual(Date.now() + 120_000);
    const method = { parentPath: args.parentPath, name: "M_Run", kind: "method" };
    for (const returnType of [undefined, "pVoId", "DATE_AND_TIME", "UDT_Result"]) {
      await expect(create.execute({ ...method, returnType })).resolves.toMatchObject({ status: "refused", error: "approval_required" });
      const methodArgs = JSON.parse(dispatch.mock.lastCall![0]).arguments;
      expect(methodArgs).toMatchObject(method);
      if (returnType === undefined) expect(methodArgs).not.toHaveProperty("returnType");
      else expect(methodArgs.returnType).toBe(returnType);
    }
    for (const reserved of ["END_IF", "whILe", "VAR", "TRUE", "FALSE", "PUBLIC", "VAR_INST", "READ_ONLY", "AND_THEN", "OR_ELSE"]) {
      await expect(create.execute({ ...method, returnType: reserved })).rejects.toThrow();
      await expect(create.execute({ ...method, name: reserved })).rejects.toThrow();
    }
    for (const invalid of [
      { ...args, parentPath: "POUs^^FB" }, { ...args, parentPath: "POUs^.." },
      { ...args, parentPath: "POUs^a/b" }, { ...args, parentPath: "POUs^\u0085a" },
      { ...args, name: "bad.name" }, { ...args, name: "ok\n" }, { ...args, name: "int" }, { ...args, returnType: undefined },
      { ...method, returnType: "" }, { ...method, returnType: null },
      { parentPath: "POUs", name: "F_Test", kind: "fun" },
      { ...args, returnType: "ARRAY[0..1] OF INT" }, { ...args, access: "private" }, { ...args, createSet: 1 },
      { ...args, implementationText: "a := 2;" }, { ...args, approvalExpiresUtc: sent.arguments.approvalExpiresUtc },
      { parentPath: "POUs", name: "FB", kind: "fb", returnType: "INT" },
      { parentPath: "POUs^FB", name: "M", kind: "method", returnType: "INT", createGet: false },
      { parentPath: "POUs^FB", name: "A", kind: "action", declarationText: "" },
      { parentPath: "GVLs", name: "G", kind: "gvl", access: "PUBLIC" },
      { parentPath: "DUTs", name: "D", kind: "dut_struct", implementationText: "" },
    ]) await expect(create.execute(invalid)).rejects.toThrow();
    expect(dispatch).toHaveBeenCalledTimes(5);
  });

  it("supports 65536-unit source text and expanded before/after JSON while maintaining a response cap", async () => {
    const value = "\u0001".repeat(65536);
    const { dispatch, tool } = setup((request) => ({
      protocolVersion: 1, sessionId: request.sessionId, operationId: request.operationId,
      status: "succeeded", provenance: {},
      result: (request.arguments as { proposedText: string }).proposedText === "oversized"
        ? { beforeText: "x".repeat(1024 * 1024) } : { beforeText: value, proposedText: value },
    }));
    const preview = tool("plc_source_preview");
    const target = { objectId: "C:\\fixture\\Main.TcPOU|POUs^Main", section: "implementation" };
    expect(await preview.execute({ ...target, proposedText: value })).toMatchObject({ status: "succeeded", result: { beforeText: value, proposedText: value } });
    await expect(preview.execute({ ...target, proposedText: value + "x" })).rejects.toThrow();
    await expect(tool("plc_source_create").execute({ parentPath: "POUs", name: "A", kind: "fb", declarationText: value + "x" })).rejects.toThrow();
    expect(await preview.execute({ ...target, proposedText: "oversized" })).toMatchObject({ status: "unknown" });
    expect(dispatch).toHaveBeenCalledTimes(2);
  });

  it.each([
    [false, "c0b0214a180d42bb8fb5359aec0f87d5a4326c472a2deadca8b5096ec274987a"],
    [true, "96a3e71a5e95707e8c20b993865ba67904ae8f38475ccf152185bd96d83e2fe6"],
  ] as const)("retains the exact 0.5.8 non-Editor catalog bytes (debug=%s)", (enableDebugTools, baseline) => {
    const definitions = createLiveEngineeringToolDefinitions({ context, dispatch: async () => "" }, { enableDebugTools });
    const tools = definitions.map(({ name, title, description, inputSchema, annotations }) => {
      const { $schema, ...schema } = zodToJsonSchema(inputSchema, { $refStrategy: "none", target: "jsonSchema7" });
      return { name, title, description, inputSchema: schema, annotations };
    });
    expect(createHash("sha256").update(JSON.stringify({ schemaVersion: 1, tools }, null, 2) + "\n").digest("hex")).toBe(baseline);
    expect(tools.map((tool) => tool.name)).not.toContain("plc_source_create");
  });

  it("returns association evidence without treating it as a build result", async () => {
    const { dispatch, tool } = setup((request) => ({
      protocolVersion: 1, sessionId: request.sessionId, operationId: request.operationId,
      status: "succeeded", provenance: { source: "unknown", dirtyState: "unknown", buildOperationId: null },
      result: { solutionFile: context.solutionFile, plcProjectFile: context.projectFile,
        twinCatProjectFile: "C:\\fixture\\a.tsproj", associationCount: 1, owningTwinCatPlcChildCount: 2,
        mappingDigest: "a".repeat(64), observedAtUtc: "2026-11-12T09:00:00Z", observationConsistency: "selectedMappingRechecked",
        buildScopeStatus: "unknown", captureKind: "automationSnapshot", editorState: "unknown", dirtyState: "unknown" },
    }));
    expect(await tool("tc_project_association").execute({})).toMatchObject({
      status: "succeeded", result: { associationCount: 1, owningTwinCatPlcChildCount: 2, buildScopeStatus: "unknown",
        mappingDigest: "a".repeat(64), observationConsistency: "selectedMappingRechecked" },
    });
    expect(JSON.parse(dispatch.mock.calls[0]![0])).toMatchObject({ operation: "project.association", arguments: {} });
    expect(dispatch).toHaveBeenCalledTimes(1);
  });
  it("requires an explicitly selected existing configuration", async () => {
    const { dispatch, tool } = setup();
    await expect(tool("plc_build_project").execute({})).rejects.toThrow();
    expect(dispatch).not.toHaveBeenCalled();
  });
  it.each(["tc_build_project", "plc_build_project", "tc_build_and_get_errors"])("submits %s exactly once without polling", async (name) => {
    const { dispatch, tool } = setup();
    const response = await tool(name).execute(selectedBuild) as Record<string, unknown>;
    expect(response.status).toBe("accepted");
    expect(dispatch).toHaveBeenCalledTimes(1);
    const request = JSON.parse(dispatch.mock.calls[0]![0]);
    expect(request).toMatchObject({ protocolVersion: 1, sessionId: context.sessionId, operation: "build.start", arguments: selectedBuild, expected: { idePid: 1234, projectFile: context.projectFile } });
    expect(dispatch.mock.calls[0]![1]).toBe(125_000);
    expect(request.operationId).toBe(response.operationId);
    expect(Date.parse(request.arguments.approvalExpiresUtc)).toBeGreaterThan(Date.now());
    expect(request.operationId).toMatch(/^[0-9a-f-]{36}$/);
    expect(tool(name).annotations?.idempotentHint).toBe(false);
  });

  it.each([
    ["tc_error_list", "diagnostics.read"], ["tc_output_read", "output.read"],
    ["tc_operation_get", "operation.get"], ["tc_operation_cancel", "operation.cancel"],
  ])("routes %s to its explicit owner", async (name, operation) => {
    const { dispatch, tool } = setup();
    const result = await tool(name!).execute({ targetOperationId }) as Record<string, unknown>;
    expect(JSON.parse(dispatch.mock.calls[0]![0])).toMatchObject({ operation, arguments: { targetOperationId } });
    expect(dispatch.mock.calls[0]![1]).toBe(30_000);
    expect(result.provenance).toMatchObject({ buildOperationId: targetOperationId, dirtyState: "clean" });
    expect(result.result).toMatchObject({ diagnosticsTruncated: true, outputTruncated: true });
    expect(result.output).toBe("build output");
    expect(result.diagnostics).toEqual([{ File: "Main.TcPOU", Severity: "error", Message: "Example" }]);
  });

  it("rejects identity overrides, legacy filters, and missing read owner before dispatch", async () => {
    const { dispatch, tool } = setup();
    for (const args of [{ project: "other" }, { target: "Release" }, { timeoutMs: 1000 }, { sessionId: context.sessionId }, { limit: 1 }, { approval: "token" }])
      await expect(tool("tc_build_project").execute(args)).rejects.toThrow();
    for (const args of [{}, { targetOperationId, severity: "error" }, { targetOperationId, channel: "engineering" }, { targetOperationId, contains: "needle" }])
      await expect(tool("tc_error_list").execute(args)).rejects.toThrow();
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("freezes a private context copy", async () => {
    const mutable = { ...context };
    const dispatch = vi.fn(async (_request: string): Promise<string> => { throw new Error("secret"); });
    const tools = createLiveEngineeringToolDefinitions({ context: mutable, dispatch });
    mutable.projectFile = "C:\\other\\other.plcproj";
    await tools[0]!.execute({});
    expect(JSON.parse(dispatch.mock.calls[0]![0]!).expected.projectFile).toBe(context.projectFile);
  });

  it("returns an unknown operation without retrying or leaking transport errors", async () => {
    const dispatch = vi.fn(async (_request: string): Promise<string> => { throw new Error("capability=secret"); });
    const tool = createLiveEngineeringToolDefinitions({ context, dispatch })[0]!;
    const response = await tool.execute({}) as Record<string, unknown>;
    expect(response).toMatchObject({ status: "unknown", sessionId: context.sessionId, provenance: { source: "unknown" } });
    expect(response.operationId).toBe(JSON.parse(dispatch.mock.calls[0]![0]).operationId);
    expect(JSON.stringify(response)).not.toContain("capability");
    expect(dispatch).toHaveBeenCalledTimes(1);
  });

  it.each(["session", "operation", "owner", "missing-owner", "version"])("rejects mismatched %s response", async (mismatch) => {
    const { tool } = setup((request) => ({
      protocolVersion: mismatch === "version" ? 2 : 1,
      sessionId: mismatch === "session" ? targetOperationId : request.sessionId,
      operationId: mismatch === "operation" ? targetOperationId : request.operationId,
      status: "succeeded", provenance: mismatch === "missing-owner" ? {} : { buildOperationId: mismatch === "owner" ? context.sessionId : targetOperationId },
    }));
    expect(await tool("tc_output_read").execute({ targetOperationId })).toMatchObject({ status: "unknown" });
  });

  it("preserves explicit provider refusals", async () => {
    const { tool } = setup((request) => ({ protocolVersion: 1, sessionId: request.sessionId, operationId: request.operationId, status: "refused", provenance: { source: "unknown", buildOperationId: null }, error: "approval_denied" }));
    expect(await tool("tc_build_project").execute(selectedBuild)).toMatchObject({ status: "refused", error: "approval_denied" });
  });

  it("does not return unowned evidence even for an unknown status", async () => {
    const { tool } = setup((request) => ({ protocolVersion: 1, sessionId: request.sessionId, operationId: request.operationId, status: "unknown", provenance: { source: "unknown" }, output: "unrelated stale output" }));
    const response = await tool("tc_output_read").execute({ targetOperationId });
    expect(response).toMatchObject({ status: "unknown" });
    expect(response).not.toHaveProperty("output");
  });
});
