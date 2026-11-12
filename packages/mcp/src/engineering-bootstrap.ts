import { randomUUID } from "node:crypto";
import type { Readable } from "node:stream";
import { TextDecoder } from "node:util";
import { z } from "zod";
import { EngineeringHostClient } from "twincat-mcp-core";

const uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
const bootstrapSchema = z.object({
  kind: z.literal("twincat-assistant-engineering-bootstrap"), protocolVersion: z.literal(1),
  pipeName: z.string().min(1).max(512).regex(/^\\\\\.\\pipe\\[a-zA-Z0-9._-]+$/),
  sessionId: uuid, capability: z.string().regex(/^[0-9a-f]{64}$/),
  expected: z.object({ idePid: z.number().int().positive(), ideStartedUtc: z.string().datetime(),
    solutionFile: z.string().min(1).max(4096), projectFile: z.string().min(1).max(4096),
    contextEpoch: z.string().min(1).max(256) }).strict(),
}).strict();

export interface BoundEngineeringHost {
  readonly client: EngineeringHostClient;
  readonly sessionId: string;
  readonly expected: z.infer<typeof bootstrapSchema>["expected"];
}

function rejectDuplicateKeys(text: string): void {
  let i = 0;
  const whitespace = () => { while (i < text.length && " \t\r\n".includes(text[i]!)) i++; };
  const readString = (): string => {
    if (text[i] !== '"') throw new Error("Invalid bootstrap JSON");
    const start = i++;
    while (i < text.length) {
      if (text[i] === "\\") { i += 2; continue; }
      if (text[i++] === '"') return JSON.parse(text.slice(start, i)) as string;
    }
    throw new Error("Invalid bootstrap JSON");
  };
  const value = (depth: number): void => {
    if (depth > 16) throw new Error("Invalid bootstrap JSON");
    whitespace();
    if (text[i] === "{") {
      i++; whitespace(); const keys = new Set<string>();
      if (text[i] === "}") { i++; return; }
      for (;;) {
        whitespace(); const key = readString();
        if (keys.has(key)) throw new Error("Duplicate bootstrap key");
        keys.add(key); whitespace(); if (text[i++] !== ":") throw new Error("Invalid bootstrap JSON");
        value(depth + 1); whitespace();
        const next = text[i++]; if (next === "}") return;
        if (next !== ",") throw new Error("Invalid bootstrap JSON");
      }
    }
    if (text[i] === "[") {
      i++; whitespace(); if (text[i] === "]") { i++; return; }
      for (;;) { value(depth + 1); whitespace(); const next = text[i++]; if (next === "]") return; if (next !== ",") throw new Error("Invalid bootstrap JSON"); }
    }
    if (text[i] === '"') { readString(); return; }
    const start = i; while (i < text.length && !",]} \t\r\n".includes(text[i]!)) i++;
    if (i === start) throw new Error("Invalid bootstrap JSON");
  };
  value(0); whitespace(); if (i !== text.length) throw new Error("Invalid bootstrap JSON");
}

/** Called only for the dedicated Assistant-owned child before MCP takes stdin. */
export async function bootstrapEngineeringHost(input: Readable): Promise<BoundEngineeringHost> {
  const bytes: number[] = [];
  const deadline = setTimeout(() => input.destroy(new Error("Engineering bootstrap timed out")), 30_000);
  try {
    for (;;) {
      let value = input.read(1) as Buffer | null;
      if (value === null) {
        await new Promise<void>((resolve, reject) => {
          const clear = () => { input.off("readable", ready); input.off("error", failed); input.off("end", ended); };
          const ready = () => { clear(); resolve(); };
          const failed = () => { clear(); reject(new Error("Engineering bootstrap failed")); };
          const ended = () => { clear(); reject(new Error("Engineering bootstrap ended")); };
          input.once("readable", ready); input.once("error", failed); input.once("end", ended);
        });
        value = input.read(1) as Buffer | null;
        if (value === null) continue;
      }
      if (value[0] === 10) { clearTimeout(deadline); break; }
      bytes.push(value[0]!);
      if (bytes.length >= 4096) throw new Error("Engineering bootstrap too large");
    }
    const raw = new TextDecoder("utf-8", { fatal: true }).decode(Uint8Array.from(bytes));
    rejectDuplicateKeys(raw);
    const parsed: unknown = JSON.parse(raw);
    const binding = bootstrapSchema.parse(parsed);
    const secret = Buffer.from(binding.capability, "hex");
    const client = new EngineeringHostClient(binding.pipeName, binding.sessionId, secret);
    secret.fill(0);
    try {
      const operationId = randomUUID();
      const request = JSON.stringify({ protocolVersion: 1, sessionId: binding.sessionId, operationId,
        operation: "session.ping", expected: binding.expected, arguments: {} });
      const response: unknown = JSON.parse(await client.dispatch(request));
      const verified = z.object({ protocolVersion: z.literal(1), sessionId: z.literal(binding.sessionId),
        operationId: z.literal(operationId), status: z.literal("succeeded"), provenance: z.unknown(), result: z.object({
          contextValidated: z.literal(true), capabilities: z.unknown(),
        }).strict() }).strict().safeParse(response);
      if (!verified.success) throw new Error("Engineering session verification failed");
      return { client, sessionId: binding.sessionId, expected: Object.freeze({ ...binding.expected }) };
    } catch (error) { client.dispose(); throw error; }
  } finally { clearTimeout(deadline); bytes.fill(0); }
}
