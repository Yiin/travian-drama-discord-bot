import { beforeEach, describe, expect, it } from "vitest";
import {
  buildSetupFooter,
  buildSetupPanel,
  resetAdminPingsForTests,
  setupStatus,
  shouldPingAdmin,
} from "../setup-panel";
import type { GuildConfig } from "../../config/guild-config";

function finishButton(config: GuildConfig) {
  const json = buildSetupPanel(config, { guildId: "g1" }).toJSON() as any;
  for (const component of json.components) {
    if (component.type !== 1) continue; // action row
    const button = component.components.find((c: any) => c.custom_id === "setup_finish_button");
    if (button) return button;
  }
  throw new Error("finish button not found");
}

describe("setup status and footer", () => {
  it("marks nothing when the config is empty", () => {
    const status = setupStatus({});
    expect(status.server).toBe(false);
    expect(status.channelCount).toBe(0);
    expect(status.canFinish).toBe(false);
    expect(status.complete).toBe(false);
    expect(buildSetupFooter({})).toBe("⬜ Server not set · ⬜ 0 of 4 channels · ⬜ Timezone (defaults to UTC)");
  });

  it("counts channels and shows the timezone as set", () => {
    const config: GuildConfig = {
      serverKey: "ts31.x3.europe",
      defenseChannelId: "1",
      pushChannelId: "2",
      serverTimezone: "Europe/Vilnius",
    };
    const status = setupStatus(config);
    expect(status.channels).toEqual({ defense: true, defcalls: false, scout: false, push: true });
    expect(status.channelCount).toBe(2);
    expect(status.complete).toBe(false);
    expect(buildSetupFooter(config)).toBe("✅ Server set · ✅ 2 of 4 channels · ✅ Timezone");
  });

  it("is complete only when every channel is set", () => {
    const status = setupStatus({
      serverKey: "ts31.x3.europe",
      defenseChannelId: "1",
      defCallsChannelId: "2",
      scoutChannelId: "3",
      pushChannelId: "4",
    });
    expect(status.complete).toBe(true);
  });
});

describe("finish setup gating", () => {
  it("is disabled until the server and one channel are set", () => {
    expect(finishButton({}).disabled).toBe(true);
    expect(finishButton({ serverKey: "ts31.x3.europe" }).disabled).toBe(true);
    expect(finishButton({ defenseChannelId: "1" }).disabled).toBe(true);
    expect(finishButton({ serverKey: "ts31.x3.europe", scoutChannelId: "3" }).disabled).toBe(false);
  });

  it("preselects the configured channels", () => {
    const json = buildSetupPanel({ defenseChannelId: "42" }, { guildId: "g1" }).toJSON() as any;
    const selects = json.components
      .filter((c: any) => c.type === 1)
      .flatMap((row: any) => row.components)
      .filter((c: any) => typeof c.custom_id === "string" && c.custom_id.startsWith("setup_channel:"));
    expect(selects).toHaveLength(4);
    const stack = selects.find((c: any) => c.custom_id === "setup_channel:defense");
    expect(stack.default_values).toEqual([{ id: "42", type: "channel" }]);
    const scout = selects.find((c: any) => c.custom_id === "setup_channel:scout");
    expect(scout.default_values ?? []).toEqual([]);
  });
});

describe("ping-admin throttle", () => {
  beforeEach(() => resetAdminPingsForTests());

  it("allows one ping per guild per 10 minutes", () => {
    const t0 = 1_000_000;
    expect(shouldPingAdmin("g1", t0)).toBe(true);
    expect(shouldPingAdmin("g1", t0 + 5 * 60 * 1000)).toBe(false);
    expect(shouldPingAdmin("g2", t0 + 5 * 60 * 1000)).toBe(true);
    expect(shouldPingAdmin("g1", t0 + 10 * 60 * 1000)).toBe(true);
  });
});
