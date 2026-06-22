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
});
