import { createHash, createHmac } from "node:crypto";
import { createServer } from "node:net";
import { randomUUID } from "node:crypto";
import { PassThrough } from "node:stream";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
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
    const bootstrap = JSON.stringify({ kind: "twincat-assistant-engineering-bootstrap", protocolVersion: 1, pipeName, sessionId,
        capability: key.toString("hex"), expected: { idePid: 123, ideStartedUtc: "2026-01-01T00:00:00Z",
          solutionFile: "C:\\fixture\\a.sln", projectFile: "C:\\fixture\\a.plcproj", contextEpoch: "1" } }) + "\n";
    try {
      const input = new PassThrough();
      input.write(bootstrap);
      const binding = await bootstrapEngineeringHost(input);
      expect(binding.sessionId).toBe(sessionId);
      binding.client.dispose();

      const releaseRuntime = process.env.TWINCAT_MCP_RELEASE_RUNTIME;
      const entry = releaseRuntime === undefined ? fileURLToPath(new URL("../dist/index.js", import.meta.url))
        : join(releaseRuntime, "packages/mcp/dist/index.js");
      const releaseVersion = releaseRuntime === undefined ? undefined
        : JSON.parse(await readFile(join(releaseRuntime, "packages/mcp/package.json"), "utf8")).version;
      for (const [arg, count, catalog] of [
        ["--host-bootstrap-stdin", 9, "engineering-catalog.json"],
        ["--host-editor-bootstrap-stdin", 16, "engineering-editor-catalog.json"],
        ["--host-debug-bootstrap-stdin", 11, "engineering-debug-catalog.json"],
      ] as const) {
        const child = spawn(process.execPath, [entry, arg], { stdio: ["pipe", "pipe", "ignore"], windowsHide: true });
        const terminated = once(child, "exit");
        const lines = createInterface({ input: child.stdout })[Symbol.asyncIterator]();
        const timer = setTimeout(() => child.kill(), 5000);
        const next = async () => {
          const frame = await lines.next();
          if (frame.done) throw new Error("Host child exited before replying");
          return JSON.parse(frame.value);
        };
        try {
          child.stdin.write(bootstrap);
          expect(await next()).toMatchObject({ kind: "twincat-assistant-engineering-ready", sessionId });
          child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize",
            params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "fixture", version: "1" } } }) + "\n");
          const initialized = await next();
          expect(initialized).toMatchObject({ id: 1, result: { protocolVersion: "2024-11-05" } });
          if (releaseVersion !== undefined) expect(initialized.result.serverInfo.version).toBe(releaseVersion);
          child.stdin.write('{"jsonrpc":"2.0","method":"notifications/initialized"}\n');
          child.stdin.write('{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}\n');
          const tools = (await next()).result.tools;
          if (releaseRuntime !== undefined) {
            const expected = JSON.parse(await readFile(join(releaseRuntime, catalog), "utf8"));
            expect(expected.schemaVersion).toBe(1);
            expect(tools).toEqual(expected.tools);
          }
          const names = tools.map((tool: { name: string }) => tool.name);
          expect(new Set(names).size).toBe(count);
          expect(names.includes("plc_source_apply")).toBe(count === 16);
          expect(names.includes("plc_source_create")).toBe(count === 16);
          expect(names.includes("plc_debug_read")).toBe(count === 11);
          expect(names).not.toContain("plc_write");
          expect(names).not.toContain("plc_read");
        } finally {
          clearTimeout(timer);
          child.stdin.end();
          child.kill();
          await terminated;
        }
      }
    } finally { server.close(); }
  }, 15000);
});
