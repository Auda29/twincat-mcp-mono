import { describe, expect, it, vi } from "vitest";

import piTwinCatAdsExtension, { formatToolSuccess } from "../src/pi-extension.js";

describe("Pi host extension", () => {
  it("registers NC and IO tools with the actual Pi host adapter", () => {
    const registeredTools: Array<{ name: string }> = [];
    const pi = {
      registerFlag: vi.fn(),
      getFlag: vi.fn(() => undefined),
      registerTool: vi.fn((tool: { name: string }) => {
        registeredTools.push(tool);
      }),
      on: vi.fn(),
    };

    piTwinCatAdsExtension(pi as never);

    expect(registeredTools.map((tool) => tool.name)).toEqual(
      expect.arrayContaining([
        "nc_state",
        "nc_list_axes",
        "nc_read_axis",
        "nc_read_axis_position",
        "nc_read_axis_status",
        "nc_read_axis_many",
        "nc_read_error",
        "io_list_groups",
        "io_read",
        "io_read_many",
        "io_read_group",
        "tc_state",
        "tc_event_list",
        "tc_runtime_error_list",
        "tc_log_read",
        "tc_diagnose_errors",
        "tc_diagnose_runtime",
        "tc_list_workbenches",
        "tc_list_projects",
        "tc_project_state",
        "tc_build_project",
        "plc_build_project",
        "tc_build_and_get_errors",
        "tc_error_list",
        "tc_error_context",
        "tc_output_read",
        "tc_resource_read",
        "hmi_state",
        "hmi_list_projects",
        "hmi_preview_info",
        "hmi_list_controls",
        "tc_tree_read",
        "tc_tree_search",
        "tc_tree_describe_item",
        "io_list_topology",
        "io_describe_device",
        "io_describe_terminal",
        "plc_list_pous",
        "plc_read_pou",
        "plc_search_code",
        "plc_describe_pou",
        "plc_list_libraries",
        "plc_describe_library",
      ]),
    );
  });

  it("formats configured NC axes in the Pi host response text", () => {
    expect(
      formatToolSuccess("nc_list_axes", {
        count: 2,
        axes: [
          { name: "X1-TRAV", id: 1, targetAdsPort: 500 },
          {
            name: "Y1-BAB",
            id: 2,
            targetAdsPort: 500,
            description: "Y axis",
          },
        ],
      }),
    ).toBe(
      "Listed 2 configured NC axes: X1-TRAV (id 1, port 500); Y1-BAB (id 2, port 500, Y axis).",
    );
  });

  it("formats unavailable NC axis status without claiming inactive flags", () => {
    expect(
      formatToolSuccess("nc_read_axis_status", {
        status: {
          axis: { name: "Y1-BAB", id: 2 },
          timestamp: "2026-05-11T12:32:40.577Z",
          status: {
            ready: false,
            referenced: false,
          },
          warnings: [
            {
              section: "status",
              message: "NC axis status flag ready at offset 130 could not be read.",
            },
            {
              section: "status",
              message:
                "NC axis status flag referenced at offset 131 could not be read.",
            },
          ],
        },
      }),
    ).toBe(
      "NC axis Y1-BAB (id 2) status=unavailable, warnings=2: NC axis status flag ready at offset 130 could not be read. NC axis status flag referenced at offset 131 could not be read. @ 2026-05-11T12:32:40.577Z",
    );
  });
});
