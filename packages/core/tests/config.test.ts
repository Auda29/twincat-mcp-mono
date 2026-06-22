import { describe, expect, it } from "vitest";

import {
  LOOPBACK_AMS_NET_ID,
  isWriteAllowed,
  normalizeTwinCatAdsConfig,
} from "../src/index.js";

describe("core config contract", () => {
  it("normalizes router-mode defaults", () => {
    const config = normalizeTwinCatAdsConfig({
      targetAmsNetId: "localhost",
    });

    expect(config.connectionMode).toBe("router");
    expect(config.targetAmsNetId).toBe(LOOPBACK_AMS_NET_ID);
    expect(config.targetAdsPort).toBe(851);
    expect(config.services.plc.targetAdsPort).toBe(851);
    expect(config.services.nc.targetAdsPort).toBe(500);
    expect(config.services.io.targetAdsPort).toBe(300);
    expect(config.diagnostics.eventSources[0]).toMatchObject({
      id: "local-windows-application",
      kind: "windowsEventLog",
      logName: "Application",
      commandTimeoutMs: 15000,
    });
    expect(config.diagnostics.logSources[0]).toMatchObject({
      id: "local-windows-application-log",
      kind: "windowsEventLog",
      logName: "Application",
      commandTimeoutMs: 15000,
    });
    expect(config.engineering).toEqual({
      enabled: false,
      backend: "configuredProjectFiles",
      projectFiles: [],
    });
    expect(config.readOnly).toBe(true);
  });

  it("normalizes named ADS services and PLC symbol groups", () => {
    const config = normalizeTwinCatAdsConfig({
      targetAmsNetId: "localhost",
      services: {
        plc: {
          targetAdsPort: 852,
          symbolGroups: {
            status: ["MAIN.ready", "MAIN.error"],
          },
        },
        nc: {
          targetAdsPort: 501,
          axes: [
            {
              name: "X",
              id: 1,
              description: "X axis",
            },
          ],
        },
        io: {
          targetAdsPort: 301,
          dataPoints: [
            {
              name: "Input1",
              indexGroup: 0xf020,
              indexOffset: 0x1f400,
              type: "bool",
            },
          ],
          groups: {
            inputs: ["Input1"],
          },
        },
      },
      diagnostics: {
        maxEvents: 20,
        maxLogBytes: 4096,
        eventSources: [
          {
            id: "events",
            kind: "windowsEventLog",
            logName: "Application",
            providerNames: ["TcSysSrv"],
            commandTimeoutMs: 2000,
          },
        ],
        logSources: [
          {
            id: "runtime-file",
            kind: "file",
            path: "C:/TwinCAT/3.1/Boot/runtime.log",
            encoding: "utf8",
          },
        ],
      },
      engineering: {
        enabled: true,
        workbenchName: "Local XAE",
        projectFiles: [
          {
            path: "C:/TwinCAT/Sample/Sample.sln",
            type: "solution",
          },
        ],
      },
    });

    expect(config.targetAdsPort).toBe(852);
    expect(config.services.plc).toEqual({
      targetAdsPort: 852,
      symbolGroups: {
        status: ["MAIN.ready", "MAIN.error"],
      },
    });
    expect(config.services.nc).toEqual({
      targetAdsPort: 501,
      axes: [
        {
          name: "X",
          id: 1,
          description: "X axis",
        },
      ],
    });
    expect(config.services.io).toEqual({
      targetAdsPort: 301,
      dataPoints: [
        {
          name: "Input1",
          indexGroup: 0xf020,
          indexOffset: 0x1f400,
          type: "BOOL",
        },
      ],
      groups: {
        inputs: ["Input1"],
      },
    });
    expect(config.diagnostics.maxEvents).toBe(20);
    expect(config.diagnostics.eventSources[0]).toMatchObject({
      id: "events",
      providerNames: ["TcSysSrv"],
    });
    expect(config.diagnostics.logSources[0]).toMatchObject({
      id: "runtime-file",
      kind: "file",
    });
    expect(config.engineering).toEqual({
      enabled: true,
      backend: "configuredProjectFiles",
      workbenchName: "Local XAE",
      projectFiles: [
        {
          path: "C:/TwinCAT/Sample/Sample.sln",
          type: "solution",
        },
      ],
    });
  });

  it("keeps writes behind readOnly and exact allowlist checks", () => {
    expect(
      isWriteAllowed(
        {
          readOnly: true,
          writeAllowlist: ["MAIN.xEnable"],
        },
        "MAIN.xEnable",
      ),
    ).toBe(false);

    expect(
      isWriteAllowed(
        {
          readOnly: false,
          writeAllowlist: ["MAIN.xEnable"],
        },
        "MAIN.xEnable",
      ),
    ).toBe(true);
  });
});
