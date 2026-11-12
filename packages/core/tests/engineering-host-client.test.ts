import { createHash, createHmac, randomBytes } from "node:crypto";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { EngineeringHostClient } from "../src/engineering-host-client.js";

const session = "a22ce004-6380-4416-8b1d-28c3da8fc082";
const key = Buffer.alloc(32, 7);
const nonce = "ab".repeat(32);
const path = () => process.platform === "win32" ? `\\\\.\\pipe\\tcmcp-${randomBytes(8).toString("hex")}` : join(tmpdir(), `tcmcp-${randomBytes(8).toString("hex")}.sock`);
const mac = (domain: string, client: string, content?: string) => createHmac("sha256", key).update(`TCMCP1\n${domain}\n${session}\n${nonce}\n${client}${content === undefined ? "" : `\n${createHash("sha256").update(content).digest("hex")}`}`).digest("hex");
const servers: ReturnType<typeof createServer>[] = [];
afterEach(() => { for (const server of servers.splice(0)) server.close(); });

describe("engineering host pipe authentication", () => {
  it("authenticates both sides and the exact request and response", async () => {
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
            expect(frame.proof).toBe(mac("request", client, frame.request));
            const response = '{"status":"unsupported"}';
            socket.end(JSON.stringify({ response, proof: mac("response", client, response) }) + "\n");
          }
        }
      });
    });
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(endpoint, resolve));
    const client = new EngineeringHostClient(endpoint, session, key);
    await expect(client.dispatch('{"operation":"source.read"}')).resolves.toBe('{"status":"unsupported"}');
    client.dispose();
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
