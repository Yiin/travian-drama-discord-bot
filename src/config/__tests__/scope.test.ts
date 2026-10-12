import { mkdtempSync, mkdirSync, readFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import type { Client } from "discord.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** Config and stores resolve `data/` from cwd at import time: fresh temp cwd and module registry per test. */
const originalCwd = process.cwd();
let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "drama-scope-"));
  mkdirSync(join(dir, "data"));
  process.chdir(dir);
  vi.resetModules();
});

afterEach(() => {
  process.chdir(originalCwd);
});

const GUILD = "g1";

/**
 * Fake client. Channels map to their category (text channels) or their parent
 * channel (threads, marked with `thread:`).
 */
function fakeClient(layout: Record<string, string | null>): Client {
  const channel = (id: string) => {
    const parent = layout[id];
    if (parent === undefined) return null;
    const isThread = id.startsWith("thread:");
    return { id, parentId: parent, isDMBased: () => false, isThread: () => isThread };
  };
  return {
    channels: {
      cache: { get: (id: string) => channel(id) ?? undefined },
      fetch: async (id: string) => channel(id),
    },
  } as unknown as Client;
}

describe("confed scopes", () => {
  it("resolves a channel, and a thread in it, to the confed of its category", async () => {
    const config = await import("../guild-config");
    const { scopeOfChannel } = await import("../scope");
    const bbctm = config.addConfed(GUILD, "BBCTM", "cat-b");
    const client = fakeClient({ "main-stack": "cat-a", "b-defcalls": "cat-b", "thread:b1": "b-defcalls", loose: null });

    expect(await scopeOfChannel(client, GUILD, "b-defcalls")).toEqual({ guildId: GUILD, confedId: bbctm.id });
    expect(await scopeOfChannel(client, GUILD, "thread:b1")).toEqual({ guildId: GUILD, confedId: bbctm.id });
    expect(await scopeOfChannel(client, GUILD, "main-stack")).toEqual({ guildId: GUILD });
    expect(await scopeOfChannel(client, GUILD, "loose")).toEqual({ guildId: GUILD });
  });

  it("gives a confed its own channels and never the main confed's", async () => {
    const config = await import("../guild-config");
    config.setServerKey(GUILD, "ts31.x3.europe");
    config.setConfedSetting({ guildId: GUILD }, "defenseChannelId", "main-stack");
    const confed = config.addConfed(GUILD, "BBCTM", "cat-b");
    const scope = { guildId: GUILD, confedId: confed.id };

    expect(config.getScopeConfig(scope).defenseChannelId).toBeUndefined();
    expect(config.getScopeConfig(scope).serverKey).toBe("ts31.x3.europe");

    config.setConfedSetting(scope, "defenseChannelId", "b-stack");
    expect(config.getScopeConfig(scope).defenseChannelId).toBe("b-stack");
    expect(config.getScopeConfig({ guildId: GUILD }).defenseChannelId).toBe("main-stack");
  });

  it("keeps request ids and data apart per confed; the main confed keeps the plain guild key", async () => {
    const config = await import("../guild-config");
    const store = await import("../../services/defense-requests");
    const confed = config.addConfed(GUILD, "BBCTM", "cat-b");
    const main = { guildId: GUILD };
    const other = { guildId: GUILD, confedId: confed.id };

    store.addRequest(main, 1, 1, 100, "", "u");
    store.addRequest(main, 2, 2, 100, "", "u");
    const first = store.addRequest(other, 3, 3, 100, "", "u");

    expect("requestId" in first && first.requestId).toBe(1);
    expect(store.getAllRequests(main).map((r) => r.x)).toEqual([1, 2]);
    expect(store.getAllRequests(other).map((r) => r.x)).toEqual([3]);

    const onDisk = JSON.parse(readFileSync(join(dir, "data", "defense-requests.json"), "utf-8"));
    expect(Object.keys(onDisk).sort()).toEqual([GUILD, `${GUILD}:${confed.id}`]);
  });
});

describe("confed setup", () => {
  it("rejects a confed channel outside its category and a main channel inside a confed category", async () => {
    const config = await import("../guild-config");
    const { applyChannel } = await import("../../actions/setup.action");
    const confed = config.addConfed(GUILD, "BBCTM", "cat-b");
    const client = fakeClient({ "a-stack": "cat-a", "b-stack": "cat-b" });

    const outside = await applyChannel(client, { guildId: GUILD, confedId: confed.id }, "defense", "a-stack");
    expect(outside.ok).toBe(false);
    const intoConfed = await applyChannel(client, { guildId: GUILD }, "defense", "b-stack");
    expect(intoConfed.ok).toBe(false);

    expect((await applyChannel(client, { guildId: GUILD, confedId: confed.id }, "defense", "b-stack")).ok).toBe(true);
    expect(config.getGuildConfig(GUILD).defenseChannelId).toBeUndefined();
  });

  it("refuses a category that already has a confed or holds the main confed's channels", async () => {
    const config = await import("../guild-config");
    const { applyAddConfed } = await import("../../actions/setup.action");
    config.setConfedSetting({ guildId: GUILD }, "defenseChannelId", "a-stack");
    const client = fakeClient({ "a-stack": "cat-a" });

    expect((await applyAddConfed(client, GUILD, "Main", "cat-a")).ok).toBe(false);
    expect((await applyAddConfed(client, GUILD, "BBCTM", "cat-b")).ok).toBe(true);
    expect((await applyAddConfed(client, GUILD, "Other", "cat-b")).ok).toBe(false);
    expect((await applyAddConfed(client, GUILD, "bbctm", "cat-c")).ok).toBe(false);
  });
});
