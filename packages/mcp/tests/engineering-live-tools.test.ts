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

function setup(respond?: (request: Record<string, unknown>) => unknown) {
  const dispatch = vi.fn(async (text: string) => {
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
  const tools = createLiveEngineeringToolDefinitions({ context, dispatch });
  return { dispatch, tool: (name: string) => tools.find((tool) => tool.name === name)! };
}

describe("explicit live engineering tools", () => {
  it("does not substitute a TwinCAT project build for a PLC-only build", async () => {
    const { dispatch, tool } = setup();
    expect(await tool("plc_build_project").execute({})).toMatchObject({ status: "unsupported" });
    expect(dispatch).not.toHaveBeenCalled();
  });
  it.each(["tc_build_project", "tc_build_and_get_errors"])("submits %s exactly once without polling", async (name) => {
    const { dispatch, tool } = setup();
    const response = await tool(name).execute({}) as Record<string, unknown>;
    expect(response.status).toBe("accepted");
    expect(dispatch).toHaveBeenCalledTimes(1);
    const request = JSON.parse(dispatch.mock.calls[0]![0]);
    expect(request).toMatchObject({ protocolVersion: 1, sessionId: context.sessionId, operation: "build.start", arguments: {}, expected: { idePid: 1234, projectFile: context.projectFile } });
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
    expect(await tool("tc_build_project").execute({})).toMatchObject({ status: "refused", error: "approval_denied" });
  });

  it("does not return unowned evidence even for an unknown status", async () => {
    const { tool } = setup((request) => ({ protocolVersion: 1, sessionId: request.sessionId, operationId: request.operationId, status: "unknown", provenance: { source: "unknown" }, output: "unrelated stale output" }));
    const response = await tool("tc_output_read").execute({ targetOperationId });
    expect(response).toMatchObject({ status: "unknown" });
    expect(response).not.toHaveProperty("output");
  });
});
