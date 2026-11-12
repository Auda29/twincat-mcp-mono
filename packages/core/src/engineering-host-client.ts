import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { createConnection, type Socket } from "node:net";
import { TextDecoder } from "node:util";

const HEX = /^[0-9a-f]{64}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const HANDSHAKE_LIMIT = 4096;
const REQUEST_LIMIT = 256 * 1024;
const RESPONSE_LIMIT = 512 * 1024;

function exact(value: unknown, keys: string[]): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid host frame");
  const object = value as Record<string, unknown>;
  const actual = Object.keys(object).sort();
  if (actual.length !== keys.length || actual.some((key, i) => key !== [...keys].sort()[i])) throw new Error("Invalid host frame");
  return object;
}

function digest(text: string): string { return createHash("sha256").update(text, "utf8").digest("hex"); }

// Frames are flat objects containing only JSON strings and protocolVersion 1.
// Parse explicitly so duplicate keys cannot be silently accepted by JSON.parse.
function parseFrame(text: string): Record<string, unknown> {
  let i = 0;
  const skip = () => { while (i < text.length && " \t\r\n".includes(text[i]!)) i++; };
  const string = (): string => {
    if (text[i] !== '"') throw new Error("Invalid host frame");
    const start = i++;
    while (i < text.length) {
      if (text[i] === "\\") { i += 2; continue; }
      if (text[i++] === '"') return JSON.parse(text.slice(start, i)) as string;
    }
    throw new Error("Invalid host frame");
  };
  const result: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  skip(); if (text[i++] !== "{") throw new Error("Invalid host frame"); skip();
  if (text[i] === "}") { i++; skip(); if (i !== text.length) throw new Error("Invalid host frame"); return result; }
  for (;;) {
    skip(); const key = string(); skip();
    if (Object.prototype.hasOwnProperty.call(result, key) || text[i++] !== ":") throw new Error("Invalid host frame");
    skip();
    if (text[i] === '"') result[key] = string();
    else if (text[i] === "1") { result[key] = 1; i++; }
    else throw new Error("Invalid host frame");
    skip(); const separator = text[i++];
    if (separator === "}") break;
    if (separator !== ",") throw new Error("Invalid host frame");
  }
  skip(); if (i !== text.length) throw new Error("Invalid host frame");
  return result;
}

/** A capability-scoped, single-request pipe client. Never retries a request. */
export class EngineeringHostClient {
  readonly #pipe: string;
  readonly #session: string;
  readonly #key: Buffer;
  #disposed = false;

  constructor(pipe: string, sessionId: string, secret: Uint8Array) {
    if (!pipe || !UUID.test(sessionId) || secret.byteLength !== 32) throw new Error("Invalid host binding");
    this.#pipe = pipe;
    this.#session = sessionId;
    this.#key = Buffer.from(secret);
  }

  dispose(): void { this.#disposed = true; this.#key.fill(0); }

  async dispatch(request: string): Promise<string> {
    if (this.#disposed) throw new Error("Host client disposed");
    const socket = createConnection(this.#pipe);
    let pending = Buffer.alloc(0);
    let wake: (() => void) | undefined;
    let failure: Error | undefined;
    const signal = () => { const callback = wake; wake = undefined; callback?.(); };
    socket.on("data", (chunk: Buffer) => { pending = Buffer.concat([pending, chunk]); if (pending.length > RESPONSE_LIMIT + 1) failure = new Error("Host frame too large"); signal(); });
    socket.on("error", () => { failure = new Error("Host connection failed"); signal(); });
    socket.on("end", () => { failure = new Error("Host connection closed"); signal(); });
    socket.on("close", () => { failure ??= new Error("Host connection closed"); signal(); });
    const timer = setTimeout(() => { failure = new Error("Host request timed out; outcome may be unknown"); socket.destroy(); signal(); }, 30_000);
    const read = async (limit: number): Promise<unknown> => {
      for (;;) {
        const newline = pending.indexOf(10);
        if (newline >= 0) {
          if (newline + 1 > limit) throw new Error("Host frame too large");
          const frame = pending.subarray(0, newline);
          pending = pending.subarray(newline + 1);
          return parseFrame(new TextDecoder("utf-8", { fatal: true }).decode(frame));
        }
        if (failure) throw failure;
        if (pending.length >= limit) throw new Error("Host frame too large");
        await new Promise<void>((resolve) => { wake = resolve; });
      }
    };
    const send = (value: unknown, limit: number) => {
      const frame = Buffer.from(JSON.stringify(value) + "\n", "utf8");
      if (frame.length > limit) throw new Error("Host frame too large");
      socket.write(frame);
    };
    const proof = (domain: string, serverNonce: string, clientNonce: string, content?: string) =>
      createHmac("sha256", this.#key).update(`TCMCP1\n${domain}\n${this.#session}\n${serverNonce}\n${clientNonce}${content === undefined ? "" : `\n${digest(content)}`}`, "utf8").digest("hex");
    const verify = (actual: unknown, expected: string) => {
      if (typeof actual !== "string" || !HEX.test(actual) || !timingSafeEqual(Buffer.from(actual, "hex"), Buffer.from(expected, "hex"))) throw new Error("Host authentication failed");
    };
    try {
      const hello = exact(await read(HANDSHAKE_LIMIT), ["protocolVersion", "sessionId", "serverNonce"]);
      if (hello.protocolVersion !== 1 || hello.sessionId !== this.#session || typeof hello.serverNonce !== "string" || !HEX.test(hello.serverNonce)) throw new Error("Invalid host hello");
      const serverNonce = hello.serverNonce;
      const clientNonce = randomBytes(32).toString("hex");
      send({ clientNonce, proof: proof("client", serverNonce, clientNonce) }, HANDSHAKE_LIMIT);
      const ack = exact(await read(HANDSHAKE_LIMIT), ["proof"]);
      verify(ack.proof, proof("server", serverNonce, clientNonce));
      send({ protocolVersion: 1, request, proof: proof("request", serverNonce, clientNonce, request) }, REQUEST_LIMIT);
      const response = exact(await read(RESPONSE_LIMIT), ["response", "proof"]);
      if (typeof response.response !== "string") throw new Error("Invalid host response");
      verify(response.proof, proof("response", serverNonce, clientNonce, response.response));
      if (pending.length !== 0) throw new Error("Unexpected host data");
      return response.response;
    } finally { clearTimeout(timer); socket.destroy(); }
  }
}
