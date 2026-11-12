import { createHash, createHmac } from "node:crypto";
import { createServer } from "node:net";
import { randomUUID } from "node:crypto";
import { PassThrough } from "node:stream";
import { describe, expect, it } from "vitest";
import { bootstrapEngineeringHost } from "../src/engineering-bootstrap.js";

describe("engineering child host handshake", () => {
  it.skipIf(process.platform !== "win32")("authenticates a synthetic pipe and validates the bound ping", async () => {
    const sessionId = randomUUID();
    const pipeName = `\\\\.\\pipe\\tcmcp-test-${randomUUID()}`;
    const key = Buffer.alloc(32, 42);
    const serverNonce = "12".repeat(32);
    const mac = (domain: string, clientNonce: string, payload?: string) => createHmac("sha256", key).update(
      `TCMCP1\n${domain}\n${sessionId}\n${serverNonce}\n${clientNonce}${payload === undefined ? "" : `\n${createHash("sha256").update(payload).digest("hex")}`}`,
    ).digest("hex");
    const server = createServer((socket) => {
      socket.write(JSON.stringify({ protocolVersion: 1, sessionId, serverNonce }) + "\n");
      let buffer = ""; let clientNonce = ""; let stage = 0;
      socket.on("data", (chunk) => {
        buffer += chunk.toString("utf8");
        let end: number;
        while ((end = buffer.indexOf("\n")) >= 0) {
          const frame = JSON.parse(buffer.slice(0, end)); buffer = buffer.slice(end + 1);
          if (stage++ === 0) {
            clientNonce = frame.clientNonce;
            if (frame.proof !== mac("client", clientNonce)) { socket.destroy(); return; }
            socket.write(JSON.stringify({ proof: mac("server", clientNonce) }) + "\n");
          } else {
            if (frame.proof !== mac("request", clientNonce, frame.request)) { socket.destroy(); return; }
            const request = JSON.parse(frame.request);
            const response = JSON.stringify({ protocolVersion: 1, sessionId, operationId: request.operationId, status: "succeeded", provenance: {},
              result: { contextValidated: true, capabilities: { plcBuild: "unsupported" } } });
            socket.end(JSON.stringify({ response, proof: mac("response", clientNonce, response) }) + "\n");
          }
        }
      });
    });
    await new Promise<void>((resolve) => server.listen(pipeName, resolve));
    try {
      const input = new PassThrough();
      input.write(JSON.stringify({ kind: "twincat-assistant-engineering-bootstrap", protocolVersion: 1, pipeName, sessionId,
        capability: key.toString("hex"), expected: { idePid: 123, ideStartedUtc: "2026-01-01T00:00:00Z",
          solutionFile: "C:\\fixture\\a.sln", projectFile: "C:\\fixture\\a.plcproj", contextEpoch: "1" } }) + "\n");
      const binding = await bootstrapEngineeringHost(input);
      expect(binding.sessionId).toBe(sessionId);
      binding.client.dispose();
    } finally { server.close(); }
  });
});
