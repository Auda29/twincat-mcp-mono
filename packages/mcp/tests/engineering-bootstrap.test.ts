import { PassThrough } from "node:stream";
import { describe, expect, it, vi } from "vitest";

vi.mock("twincat-mcp-core", () => ({
  EngineeringHostClient: class {
    async dispatch(text: string) {
      const request = JSON.parse(text);
      return JSON.stringify({ protocolVersion: 1, sessionId: request.sessionId, operationId: request.operationId,
        status: "succeeded", provenance: {}, result: { contextValidated: true, capabilities: {} } });
    }
    dispose() {}
  },
}));
import { bootstrapEngineeringHost } from "../src/engineering-bootstrap.js";

const binding = {
  kind: "twincat-assistant-engineering-bootstrap", protocolVersion: 1,
  pipeName: "\\\\.\\pipe\\tcmcp-test", sessionId: "a22ce004-6380-4416-8b1d-28c3da8fc082",
  capability: "ab".repeat(32), expected: { idePid: 123, ideStartedUtc: "2026-01-01T00:00:00Z",
    solutionFile: "C:\\test\\test.sln", projectFile: "C:\\test\\test.plcproj", contextEpoch: "1" },
};

describe("dedicated engineering bootstrap", () => {
  it("consumes only the first line and binds the expected identity", async () => {
    const input = new PassThrough();
    input.write(JSON.stringify(binding) + "\n" + '{"jsonrpc":"2.0"}\n');
    const result = await bootstrapEngineeringHost(input);
    expect(result.sessionId).toBe(binding.sessionId);
    expect(result.expected).toEqual(binding.expected);
    expect(input.read()?.toString()).toBe('{"jsonrpc":"2.0"}\n');
  });

  it("rejects duplicate identity keys", async () => {
    const input = new PassThrough();
    const json = JSON.stringify(binding).replace('"idePid":123', '"idePid":123,"idePid":456');
    input.write(json + "\n");
    await expect(bootstrapEngineeringHost(input)).rejects.toThrow("Duplicate bootstrap key");
  });
});
