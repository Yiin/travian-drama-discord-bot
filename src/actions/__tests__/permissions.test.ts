import { mkdtempSync, mkdirSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PermissionFlagsBits, PermissionsBitField } from "discord.js";
import type { BaseInteraction } from "discord.js";
import type { GuildConfig } from "../../config/guild-config";
import type { ActionContext } from "../types";
import { checkPermission, checkUndoPermission, hasPermission } from "../permissions";
import { buildActionContext } from "../context";
import { BOT_OWNER_IDS } from "../../config/owners";

const GUILD = "g1";
const MANAGER_ROLE = "r-manager";
const CALLER_ROLE = "r-caller";

function actor(overrides: Partial<ActionContext> = {}, config: GuildConfig = {}) {
  return { userId: "u1", roleIds: [GUILD], isAdministrator: false, config, ...overrides };
}

const restricted: GuildConfig = { permissions: { request: [CALLER_ROLE], manage: [MANAGER_ROLE] } };

/** The parts of an interaction `buildActionContext` reads. */
function fakeInteraction(userId: string, permissions: bigint[], roles: string[] = []): BaseInteraction {
  return {
    client: {},
    user: { id: userId },
    member: { roles },
    memberPermissions: new PermissionsBitField(permissions),
  } as unknown as BaseInteraction;
}

describe("empty lists", () => {
  it("lets everyone create requests", () => {
    expect(checkPermission(actor(), "request")).toBeNull();
  });

  it("keeps manage for admins only", () => {
    const denied = checkPermission(actor(), "manage");
    expect(denied).toMatch(/^⚠️ \*\*Only an admin can do this\.\*\*/);
  });
});

describe("role lists", () => {
  it("allows a member with a listed role", () => {
    expect(checkPermission(actor({ roleIds: [GUILD, CALLER_ROLE] }, restricted), "request")).toBeNull();
    expect(checkPermission(actor({ roleIds: [GUILD, MANAGER_ROLE] }, restricted), "manage")).toBeNull();
  });

  it("refuses a member without one and names the roles", () => {
    const denied = checkPermission(actor({}, restricted), "request");
    expect(denied).toContain("**You can't create requests.**");
    expect(denied).toContain(`<@&${CALLER_ROLE}>`);
    expect(checkPermission(actor({}, restricted), "manage")).toContain(`<@&${MANAGER_ROLE}>`);
  });

  it("does not let request imply manage", () => {
    expect(hasPermission(actor({ roleIds: [GUILD, CALLER_ROLE] }, restricted), "manage")).toBe(false);
  });

  it("matches @everyone through the guild id", () => {
    const everyone: GuildConfig = { permissions: { request: [GUILD], manage: [] } };
    expect(checkPermission(actor({}, everyone), "request")).toBeNull();
  });
});

describe("the requester owns their request", () => {
  it("may change it without manage", () => {
    expect(checkPermission(actor({}, restricted), "manage", "u1")).toBeNull();
  });

  it("does not cover someone else's request", () => {
    const denied = checkPermission(actor({}, restricted), "manage", "u2");
    expect(denied).toContain("**Only the requester or a manager can do this.**");
  });

  it("names the requester or an admin when manage is empty", () => {
    expect(checkPermission(actor(), "manage", "u2")).toContain("**Only the requester or an admin can do this.**");
  });
});

describe("administrator and bot owner bypass", () => {
  it("passes both checks for Administrator", () => {
    const context = buildActionContext(fakeInteraction("u9", [PermissionFlagsBits.Administrator]), GUILD, restricted);
    expect(context.isAdministrator).toBe(true);
    expect(checkPermission(context, "request")).toBeNull();
    expect(checkPermission(context, "manage", "someone-else")).toBeNull();
  });

  it("passes both checks for the bot owner without any permission", () => {
    const context = buildActionContext(fakeInteraction(BOT_OWNER_IDS[0], []), GUILD, restricted);
    expect(context.isAdministrator).toBe(true);
    expect(checkPermission(context, "manage")).toBeNull();
  });

  it("does not treat Manage Channels as Administrator", () => {
    const context = buildActionContext(fakeInteraction("u9", [PermissionFlagsBits.ManageChannels]), GUILD, restricted);
    expect(context.isAdministrator).toBe(false);
    expect(checkPermission(context, "manage")).not.toBeNull();
  });

  it("reads role ids from an uncached member and adds @everyone", () => {
    const context = buildActionContext(fakeInteraction("u9", [], [MANAGER_ROLE]), GUILD, restricted);
    expect(context.roleIds).toEqual([MANAGER_ROLE, GUILD]);
    expect(checkPermission(context, "manage")).toBeNull();
  });
});

describe("undo", () => {
  it("allows undoing your own action without manage", () => {
    expect(checkUndoPermission(actor({}, restricted), "u1")).toBeNull();
  });

  it("refuses someone else's action without manage", () => {
    expect(checkUndoPermission(actor({}, restricted), "u2")).toContain("**You can only undo your own actions.**");
  });

  it("allows someone else's action with manage", () => {
    expect(checkUndoPermission(actor({ roleIds: [GUILD, MANAGER_ROLE] }, restricted), "u2")).toBeNull();
  });
});

describe("actions that touch the data files", () => {
  const originalCwd = process.cwd();

  beforeEach(() => {
    const dir = mkdtempSync(join(tmpdir(), "drama-perms-"));
    mkdirSync(join(dir, "data"));
    process.chdir(dir);
    vi.resetModules();
  });
  afterEach(() => {
    process.chdir(originalCwd);
  });

  it("lets only Administrator or the owner change the lists, not Manage Channels", async () => {
    const { executePermissionChangeAction } = await import("../permissions.action");
    const { getGuildConfig } = await import("../../config/guild-config");

    const manageChannels = buildActionContext(fakeInteraction("u9", [PermissionFlagsBits.ManageChannels]), GUILD, {});
    const refused = executePermissionChangeAction(manageChannels, { permission: "manage", add: MANAGER_ROLE });
    expect(refused).toEqual({ success: false, error: expect.stringContaining("Manage Channels is not enough") });
    expect(getGuildConfig(GUILD).permissions).toBeUndefined();

    const admin = buildActionContext(fakeInteraction("u9", [PermissionFlagsBits.Administrator]), GUILD, {});
    expect(executePermissionChangeAction(admin, { permission: "manage", add: MANAGER_ROLE }).success).toBe(true);
    expect(getGuildConfig(GUILD).permissions).toEqual({ request: [], manage: [MANAGER_ROLE] });

    const owner = buildActionContext(fakeInteraction(BOT_OWNER_IDS[0], []), GUILD, getGuildConfig(GUILD));
    expect(executePermissionChangeAction(owner, { permission: "manage", remove: MANAGER_ROLE }).success).toBe(true);
    expect(getGuildConfig(GUILD).permissions?.manage).toEqual([]);
  });

  it("refuses adding a listed role and removing a missing one", async () => {
    const { executePermissionChangeAction } = await import("../permissions.action");
    const admin = actor({ isAdministrator: true }, restricted);
    const context = { ...admin, guildId: GUILD };
    expect(executePermissionChangeAction(context, { permission: "request", add: CALLER_ROLE }).success).toBe(false);
    expect(executePermissionChangeAction(context, { permission: "request", remove: "r-other" }).success).toBe(false);
  });

  it("undo refuses someone else's action and leaves it in place", async () => {
    const history = await import("../../services/action-history");
    const { executeUndoAction } = await import("../undo.action");
    const actionId = history.recordAction(GUILD, {
      type: "STATS_ADJUST",
      userId: "u2",
      coords: { x: 1, y: 2 },
      requestId: 0,
      data: { troops: 100, contributorId: "u2" },
    });
    const context = { ...actor({}, restricted), guildId: GUILD, client: {} } as ActionContext;

    const refused = await executeUndoAction(context, { actionId });
    expect(refused.success).toBe(false);
    expect(history.getAction(GUILD, actionId)?.undone).toBe(false);

    const own = await executeUndoAction({ ...context, userId: "u2" }, { actionId });
    expect(own.success).toBe(true);
    expect(history.getAction(GUILD, actionId)?.undone).toBe(true);
  });

  it("refuses a stack edit by someone who neither owns the request nor manages", async () => {
    vi.doMock("../../services/defense-message", () => ({ updateGlobalMessage: vi.fn() }));
    const store = await import("../../services/defense-requests");
    const { executeUpdateDefAction } = await import("../updatedef.action");
    const added = store.addRequest(GUILD, 1, 2, 1000, "", "owner");
    if ("error" in added) throw new Error(added.error);
    const base = { ...actor({}, restricted), guildId: GUILD, client: {} } as ActionContext;

    const refused = await executeUpdateDefAction(base, { requestId: added.requestId, troopsNeeded: 500 });
    expect(refused.success).toBe(false);
    expect(store.getRequestById(GUILD, added.requestId)?.troopsNeeded).toBe(1000);

    const byOwner = await executeUpdateDefAction({ ...base, userId: "owner" }, { requestId: added.requestId, troopsNeeded: 500 });
    expect(byOwner.success).toBe(true);
    expect(store.getRequestById(GUILD, added.requestId)?.troopsNeeded).toBe(500);
  });
});
