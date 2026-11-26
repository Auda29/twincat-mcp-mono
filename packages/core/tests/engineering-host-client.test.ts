import { createHash, createHmac, randomBytes } from "node:crypto";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EngineeringHostClient } from "../src/engineering-host-client.js";

const session = "a22ce004-6380-4416-8b1d-28c3da8fc082";
const key = Buffer.alloc(32, 7);
const nonce = "ab".repeat(32);
const path = () => process.platform === "win32" ? `\\\\.\\pipe\\tcmcp-${randomBytes(8).toString("hex")}` : join(tmpdir(), `tcmcp-${randomBytes(8).toString("hex")}.sock`);
const mac = (domain: string, client: string, content?: string) => createHmac("sha256", key).update(`TCMCP1\n${domain}\n${session}\n${nonce}\n${client}${content === undefined ? "" : `\n${createHash("sha256").update(content).digest("hex")}`}`).digest("hex");
const servers: ReturnType<typeof createServer>[] = [];
afterEach(() => { for (const server of servers.splice(0)) server.close(); });

describe("engineering host pipe authentication", () => {
  it.each([
    ['{"operation":"source.read"}', '{"status":"unsupported"}'],
    [
      JSON.stringify({ operation: "source.create", arguments: { declarationText: "\u0001".repeat(65536), implementationText: "\u0002".repeat(65536) } }),
      JSON.stringify({ status: "succeeded", result: { beforeText: "\u0001".repeat(65536), proposedText: "\u0002".repeat(65536) } }),
    ],
  ])("authenticates both sides and the exact request and response (%#)", async (request, response) => {
    const endpoint = path();
    const server = createServer((socket) => {
      socket.write(JSON.stringify({ protocolVersion: 1, sessionId: session, serverNonce: nonce }) + "\n");
      let buffer = ""; let client = ""; let step = 0;
      socket.on("data", (chunk) => {
        buffer += chunk.toString();
        let end: number;
        while ((end = buffer.indexOf("\n")) >= 0) {
          const frame = JSON.parse(buffer.slice(0, end)); buffer = buffer.slice(end + 1);
          if (step++ === 0) {
            client = frame.clientNonce;
            expect(frame.proof).toBe(mac("client", client));
            socket.write(JSON.stringify({ proof: mac("server", client) }) + "\n");
          } else {
            expect(frame.request).toBe(request);
            expect(frame.proof).toBe(mac("request", client, frame.request));
            socket.end(JSON.stringify({ response, proof: mac("response", client, response) }) + "\n");
          }
        }
      });
    });
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(endpoint, resolve));
    const client = new EngineeringHostClient(endpoint, session, key);
    await expect(client.dispatch(request)).resolves.toBe(response);
    client.dispose();
  });

  it.each([999, 1_000.5, 130_001, NaN, Infinity])("rejects an invalid timeout (%s)", async (timeout) => {
    const client = new EngineeringHostClient(path(), session, key);
    try {
      await expect(client.dispatch("{}", timeout)).rejects.toThrow("Invalid host timeout");
    } finally {
      client.dispose();
    }
  });

  it.each([
    [undefined, 30_000], [1_000, 1_000], [125_000, 125_000], [130_000, 130_000],
  ])("enforces the pipe timeout for %s", async (timeout, expected) => {
    const endpoint = path();
    const server = createServer();
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(endpoint, resolve));
    const client = new EngineeringHostClient(endpoint, session, key);
    vi.useFakeTimers();
    try {
      const result = timeout === undefined ? client.dispatch("{}") : client.dispatch("{}", timeout);
      const settled = vi.fn();
      void result.catch(settled);
      const rejection = expect(result).rejects.toThrow("Host request timed out");
      await vi.advanceTimersByTimeAsync(expected - 1);
      expect(settled).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1);
      await rejection;
    } finally {
      vi.useRealTimers();
      client.dispose();
    }
  });

  it("rejects duplicate keys before sending credentials", async () => {
    const endpoint = path();
    const server = createServer((socket) => socket.write(`{"protocolVersion":1,"sessionId":"${session}","serverNonce":"${nonce}","serverNonce":"${nonce}"}\n`));
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(endpoint, resolve));
    const client = new EngineeringHostClient(endpoint, session, key);
    await expect(client.dispatch("{}" )).rejects.toThrow("Invalid host frame");
    client.dispose();
  });
});
