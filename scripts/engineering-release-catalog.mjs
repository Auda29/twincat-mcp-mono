import { copyFileSync, lstatSync, mkdirSync, readdirSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

const [action, ...args] = process.argv.slice(2);
if (action === "catalog") {
  const [repository, output] = args;
  const { createLiveEngineeringToolDefinitions } = await import(pathToFileURL(join(repository, "packages/mcp/dist/engineering-live-tools.js")));
  const { zodToJsonSchema } = await import(pathToFileURL(join(repository, "node_modules/zod-to-json-schema/dist/esm/index.js")));
  const definitions = createLiveEngineeringToolDefinitions({
    context: { sessionId: "11111111-1111-4111-8111-111111111111", idePid: 1, ideStartedUtc: "2024-01-01T00:00:00.000Z", solutionFile: "C:\\fixture\\fixture.sln", projectFile: "C:\\fixture\\fixture.plcproj", contextEpoch: "fixture" },
    dispatch: async () => { throw new Error("Catalog generation cannot dispatch operations"); },
  });
  if (definitions.length !== 9 || definitions.some((tool) => tool.name.startsWith("plc_source_"))) throw new Error("Unexpected release catalog");
  const tools = definitions.map(({ name, title, description, inputSchema, annotations }) => {
    const { $schema, ...schema } = zodToJsonSchema(inputSchema, { $refStrategy: "none", target: "jsonSchema7" });
    if (schema.type !== "object") throw new Error(`Invalid input schema for ${name}`);
    return { name, title, description, inputSchema: schema, annotations };
  });
  writeFileSync(output, `${JSON.stringify({ schemaVersion: 1, tools }, null, 2)}\n`);
} else if (action === "copy-runtime") {
  const [sourceArg, destination] = args;
  const source = realpathSync(sourceArg);
  function copy(from, to, ancestors = new Set()) {
    const target = realpathSync(from);
    const rel = relative(source, target);
    if (rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) throw new Error(`Link escapes runtime stage: ${from}`);
    const stat = lstatSync(target);
    if (stat.isDirectory()) {
      if (ancestors.has(target)) throw new Error(`Directory link cycle: ${from}`);
      const next = new Set(ancestors).add(target);
      mkdirSync(to, { recursive: true });
      for (const name of readdirSync(target)) copy(join(target, name), join(to, name), next);
    } else if (stat.isFile()) {
      mkdirSync(dirname(to), { recursive: true });
      copyFileSync(target, to);
    } else throw new Error(`Unsupported runtime entry: ${from}`);
  }
  copy(source, resolve(destination));
} else {
  throw new Error("Expected catalog or copy-runtime");
}
