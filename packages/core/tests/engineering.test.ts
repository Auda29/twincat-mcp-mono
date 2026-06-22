import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { EngineeringService } from "../src/index.js";

describe("engineering project context", () => {
  it("reports unavailable read capabilities when engineering is disabled", () => {
    const engineering = new EngineeringService({
      enabled: false,
      backend: "configuredProjectFiles",
      projectFiles: [],
    });

    const workbenches = engineering.listWorkbenches();

    expect(workbenches.count).toBe(0);
    expect(workbenches.backendCapabilities[0]).toMatchObject({
      backend: "configuredProjectFiles",
      available: false,
      capabilities: {
        runtimeOnly: true,
        engineeringRead: false,
        engineeringWrite: false,
      },
    });
  });

  it("discovers configured project files and TwinCAT references in solutions", () => {
    const root = mkdtempSync(join(tmpdir(), "twincat-engineering-"));
    mkdirSync(join(root, "PlcProject"), { recursive: true });
    mkdirSync(join(root, "HmiProject"), { recursive: true });

    const solutionPath = join(root, "Machine.sln");
    const plcProjectPath = join(root, "PlcProject", "PlcProject.plcproj");
    const hmiProjectPath = join(root, "HmiProject", "HmiProject.hmiproj");
    writeFileSync(
      solutionPath,
      [
        'Project("{00000000-0000-0000-0000-000000000000}") = "PlcProject", "PlcProject\\PlcProject.plcproj", "{11111111-1111-1111-1111-111111111111}"',
        "EndProject",
        'Project("{00000000-0000-0000-0000-000000000000}") = "HmiProject", "HmiProject\\HmiProject.hmiproj", "{22222222-2222-2222-2222-222222222222}"',
        "EndProject",
      ].join("\n"),
    );
    writeFileSync(plcProjectPath, "<Project />");
    writeFileSync(hmiProjectPath, "<Project />");

    const engineering = new EngineeringService({
      enabled: true,
      backend: "configuredProjectFiles",
      workbenchName: "Machine",
      projectFiles: [{ path: solutionPath, type: "solution" }],
    });

    try {
      const workbenches = engineering.listWorkbenches();
      expect(workbenches.workbenches[0]).toMatchObject({
        name: "Machine",
        available: true,
        projectCount: 3,
      });

      const projects = engineering.listProjects();
      expect(projects.projects.map((project) => project.type).sort()).toEqual([
        "hmi",
        "plc",
        "solution",
      ]);

      const plcState = engineering.projectState({ project: "PlcProject" });
      expect(plcState.projects[0]).toMatchObject({
        project: {
          name: "PlcProject",
          type: "plc",
          exists: true,
          source: "solutionReference",
        },
        activeConnection: {
          available: false,
          source: "none",
        },
      });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("reads SysManager tree items and I/O topology from project XML", () => {
    const root = mkdtempSync(join(tmpdir(), "twincat-engineering-tree-"));
    const projectPath = join(root, "Machine.tsproj");
    const xtiPath = join(root, "Machine.xti");

    writeFileSync(
      projectPath,
      [
        '<Project Name="Machine">',
        "  <ItemGroup>",
        '    <TcSmProject Include="Machine.xti" />',
        "  </ItemGroup>",
        "</Project>",
      ].join("\n"),
    );
    writeFileSync(
      xtiPath,
      [
        '<TcSmProject Name="Machine">',
        '  <IoTree Name="I/O">',
        '    <Device Name="Device 1 (EtherCAT)" Type="EtherCAT Master" Comment="Main bus">',
        '      <Box Name="EK1100" Type="Box">',
        '        <Box Name="Term 2 (EL1008)" Type="EtherCAT Slave" Comment="Digital inputs">',
        '          <Channel Name="Input 1" />',
        "        </Box>",
        "      </Box>",
        "    </Device>",
        "  </IoTree>",
        "</TcSmProject>",
      ].join("\n"),
    );

    const engineering = new EngineeringService({
      enabled: true,
      backend: "configuredProjectFiles",
      workbenchName: "Machine",
      projectFiles: [{ path: projectPath, type: "sysManager" }],
    });

    try {
      const terminals = engineering.treeSearch({ type: "terminal" });
      expect(terminals.items).toHaveLength(1);
      expect(terminals.items[0]).toMatchObject({
        name: "Term 2 (EL1008)",
        type: "terminal",
        comment: "Digital inputs",
      });

      const terminal = engineering.treeRead({ path: "Term 2 (EL1008)" });
      expect(terminal.item.settings).toMatchObject({
        Name: "Term 2 (EL1008)",
        Type: "EtherCAT Slave",
      });
      expect(terminal.item.children[0]).toMatchObject({
        name: "Input 1",
      });

      const topology = engineering.ioListTopology();
      expect(topology.devices[0]).toMatchObject({
        name: "Device 1 (EtherCAT)",
        type: "device",
        boxCount: 1,
        terminalCount: 1,
      });

      const device = engineering.ioDescribeDevice({
        device: "Device 1 (EtherCAT)",
      });
      expect(device.device.terminals[0]?.name).toBe("Term 2 (EL1008)");

      const describedTerminal = engineering.ioDescribeTerminal({
        terminal: "Term 2 (EL1008)",
      });
      expect(describedTerminal.terminal.comment).toBe("Digital inputs");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("reads PLC POUs, code text, and library references from PLC project files", () => {
    const root = mkdtempSync(join(tmpdir(), "twincat-engineering-plc-"));
    mkdirSync(join(root, "POUs"), { recursive: true });
    mkdirSync(join(root, "GVLs"), { recursive: true });
    mkdirSync(join(root, "DUTs"), { recursive: true });

    const projectPath = join(root, "PlcProject.plcproj");
    const mainPath = join(root, "POUs", "MAIN.TcPOU");
    const fbPath = join(root, "POUs", "FB_Valve.TcPOU");
    const functionPath = join(root, "POUs", "F_Calc.TcPOU");
    const gvlPath = join(root, "GVLs", "GVL_Machine.TcGVL");
    const dutPath = join(root, "DUTs", "ST_Status.TcDUT");

    writeFileSync(
      projectPath,
      [
        "<Project>",
        "  <ItemGroup>",
        '    <Compile Include="POUs\\MAIN.TcPOU" />',
        '    <Compile Include="POUs\\FB_Valve.TcPOU" />',
        '    <Compile Include="POUs\\F_Calc.TcPOU" />',
        '    <Compile Include="GVLs\\GVL_Machine.TcGVL" />',
        '    <Compile Include="DUTs\\ST_Status.TcDUT" />',
        '    <PlaceholderReference Include="Tc2_Standard" Version="3.3.3.0" Namespace="Tc2_Standard" />',
        "  </ItemGroup>",
        "</Project>",
      ].join("\n"),
    );
    writeFileSync(
      fbPath,
      [
        "<TcPlcObject>",
        '  <POU Name="FB_Valve" SpecialFunc="None">',
        "    <Declaration><![CDATA[FUNCTION_BLOCK FB_Valve",
        "VAR_INPUT",
        "  bOpen : BOOL;",
        "END_VAR]]></Declaration>",
        "    <Implementation>",
        "      <ST><![CDATA[]]></ST>",
        "    </Implementation>",
        '    <Method Name="Reset">',
        "      <Declaration><![CDATA[METHOD Reset : BOOL",
        "VAR_INPUT",
        "  bForce : BOOL;",
        "END_VAR]]></Declaration>",
        "      <Implementation>",
        "        <ST><![CDATA[Reset := bForce;]]></ST>",
        "      </Implementation>",
        "    </Method>",
        "  </POU>",
        "</TcPlcObject>",
      ].join("\n"),
    );
    writeFileSync(
      functionPath,
      [
        "<TcPlcObject>",
        '  <POU Name="F_Calc" SpecialFunc="None">',
        "    <Declaration><![CDATA[FUNCTION F_Calc : INT",
        "VAR_INPUT",
        "  nValue : INT;",
        "END_VAR]]></Declaration>",
        "    <Implementation>",
        "      <ST><![CDATA[F_Calc := nValue + 1;]]></ST>",
        "    </Implementation>",
        "  </POU>",
        "</TcPlcObject>",
      ].join("\n"),
    );
    writeFileSync(
      mainPath,
      [
        "<TcPlcObject>",
        '  <POU Name="MAIN" SpecialFunc="PROGRAM">',
        "    <Declaration><![CDATA[PROGRAM MAIN",
        "VAR",
        "  fbValve : FB_Valve;",
        "END_VAR]]></Declaration>",
        "    <Implementation>",
        "      <ST><![CDATA[fbValve.Open();]]></ST>",
        "    </Implementation>",
        "  </POU>",
        "</TcPlcObject>",
      ].join("\n"),
    );
    writeFileSync(
      gvlPath,
      [
        "<TcPlcObject>",
        '  <GVL Name="GVL_Machine">',
        "    <Declaration><![CDATA[VAR_GLOBAL",
        "  bReady : BOOL;",
        "END_VAR]]></Declaration>",
        "  </GVL>",
        "</TcPlcObject>",
      ].join("\n"),
    );
    writeFileSync(
      dutPath,
      [
        "<TcPlcObject>",
        '  <DUT Name="ST_Status">',
        "    <Declaration><![CDATA[TYPE ST_Status :",
        "STRUCT",
        "  nCode : INT;",
        "END_STRUCT",
        "END_TYPE]]></Declaration>",
        "  </DUT>",
        "</TcPlcObject>",
      ].join("\n"),
    );

    const engineering = new EngineeringService({
      enabled: true,
      backend: "configuredProjectFiles",
      workbenchName: "Machine",
      projectFiles: [{ path: projectPath, type: "plc" }],
    });

    try {
      const pous = engineering.plcListPous();
      expect(pous.pous.map((pou) => pou.name).sort()).toEqual([
        "FB_Valve",
        "F_Calc",
        "GVL_Machine",
        "MAIN",
        "Reset",
        "ST_Status",
      ]);
      expect(pous.pous.find((pou) => pou.name === "MAIN")).toMatchObject({
        kind: "program",
      });
      expect(pous.pous.find((pou) => pou.name === "FB_Valve")).toMatchObject({
        kind: "functionBlock",
      });
      expect(pous.pous.find((pou) => pou.name === "F_Calc")).toMatchObject({
        kind: "function",
      });
      expect(pous.pous.find((pou) => pou.name === "Reset")).toMatchObject({
        qualifiedName: "FB_Valve.Reset",
        kind: "method",
      });

      const functionBlocks = engineering.plcListPous({
        kind: "functionBlock",
      });
      expect(functionBlocks.pous.map((pou) => pou.name)).toEqual(["FB_Valve"]);

      const methods = engineering.plcListPous({ kind: "method" });
      expect(methods.pous.map((pou) => pou.qualifiedName)).toEqual([
        "FB_Valve.Reset",
      ]);

      const main = engineering.plcReadPou({ pou: "MAIN" });
      expect(main.pou.declaration).toContain("PROGRAM MAIN");
      expect(main.pou.implementation).toContain("fbValve.Open");

      const reset = engineering.plcReadPou({ pou: "FB_Valve.Reset" });
      expect(reset.pou.declaration).toContain("METHOD Reset");
      expect(reset.pou.implementation).toContain("Reset := bForce");

      const matches = engineering.plcSearchCode({ query: "fbValve" });
      expect(matches.matches[0]).toMatchObject({
        pou: { name: "MAIN" },
        section: "declaration",
      });

      const limitedMatches = engineering.plcSearchCode({
        query: "fbValve.Open",
        limit: 1,
      });
      expect(limitedMatches).toMatchObject({
        count: 1,
        truncated: false,
      });

      const fbMatches = engineering.plcSearchCode({
        query: "bOpen",
        kind: "functionBlock",
      });
      expect(fbMatches.matches[0]).toMatchObject({
        pou: { name: "FB_Valve", kind: "functionBlock" },
      });

      const methodMatches = engineering.plcSearchCode({
        query: "bForce",
        kind: "method",
      });
      expect(methodMatches.matches[0]).toMatchObject({
        pou: { qualifiedName: "FB_Valve.Reset", kind: "method" },
      });

      const description = engineering.plcDescribePou({ pou: "GVL_Machine" });
      expect(description).toMatchObject({
        pou: { kind: "gvl" },
        declarationLineCount: 3,
      });

      const libraries = engineering.plcListLibraries();
      expect(libraries.libraries[0]).toMatchObject({
        name: "Tc2_Standard",
        version: "3.3.3.0",
        namespace: "Tc2_Standard",
      });

      const library = engineering.plcDescribeLibrary({
        library: "Tc2_Standard",
      });
      expect(library.library.name).toBe("Tc2_Standard");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("reports bounded unavailable build and engineering error surfaces", () => {
    const root = mkdtempSync(join(tmpdir(), "twincat-engineering-build-"));
    const projectPath = join(root, "Machine.tsproj");
    writeFileSync(
      projectPath,
      [
        '<Project Name="Machine">',
        "  <ItemGroup>",
        '    <TcSmProject Include="Machine.xti" />',
        "  </ItemGroup>",
        "</Project>",
      ].join("\n"),
    );

    const engineering = new EngineeringService({
      enabled: true,
      backend: "configuredProjectFiles",
      workbenchName: "Machine",
      projectFiles: [{ path: projectPath, type: "sysManager" }],
    });

    try {
      const build = engineering.tcBuildProject({ project: "Machine" });
      expect(build).toMatchObject({
        scope: "twinCatProject",
        status: "unavailable",
        available: false,
        project: { name: "Machine" },
        safetyBoundary: {
          activateConfiguration: false,
          download: false,
          login: false,
          run: false,
          stop: false,
        },
      });
      expect(build.output.text).toContain("No Activate Configuration");

      const buildAndErrors = engineering.tcBuildAndGetErrors({ limit: 5 });
      expect(buildAndErrors).toMatchObject({
        build: { status: "unavailable" },
        errors: [],
        warnings: [],
        count: 0,
        truncated: false,
      });

      const errors = engineering.tcErrorList({
        severity: ["error", "warning"],
        limit: 5,
      });
      expect(errors).toMatchObject({
        available: false,
        issues: [],
        count: 0,
        truncated: false,
      });

      const output = engineering.tcOutputRead({
        channel: "build",
        limitBytes: 1024,
      });
      expect(output).toMatchObject({
        available: false,
        channel: "build",
        bytesRead: 0,
        truncated: false,
      });

      const context = engineering.tcErrorContext({
        file: projectPath,
        line: 2,
        contextLines: 1,
      });
      expect(context).toMatchObject({
        available: true,
        file: projectPath,
        line: 2,
        context: {
          startLine: 1,
          endLine: 3,
        },
      });
      expect(context.context?.text).toContain("<ItemGroup>");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
