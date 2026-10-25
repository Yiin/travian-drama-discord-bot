import { mkdtempSync, mkdirSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ActionContext } from "../types";

const accounts: Record<string, string> = { user: "John", other: "Mary" };
vi.mock("../push-validation", () => ({
  validateUserHasAccount: (_guildId: string, userId: string) =>
    accounts[userId] ? { valid: true, accountName: accounts[userId] } : { valid: false, error: "not linked" },
}));
vi.mock("../../services/def-calls-message", () => ({
  updateDefCallCard: vi.fn(),
  refreshHubChannel: vi.fn(),
}));

const originalCwd = process.cwd();
const context = {
  guildId: "guild", scope: { guildId: "guild" }, userId: "user", client: {}, roleIds: [], isAdministrator: false,
  config: { serverKey: "ts33.x3.international" },
} as unknown as ActionContext;

beforeEach(() => {
  const dir = mkdtempSync(join(tmpdir(), "drama-edit-"));
  mkdirSync(join(dir, "data"));
  process.chdir(dir);
  vi.resetModules();
  vi.clearAllMocks();
});
afterEach(() => {
  process.chdir(originalCwd);
});

async function setup() {
  const store = await import("../../services/def-calls");
  const stats = await import("../../services/stats");
  const { executeDefCallEditAction } = await import("../def-call-edit.action");
  const { executeUndoAction } = await import("../undo.action");
  const { request } = store.addRequest(context.scope, 1, 2, 2000000000, "req", "Req", undefined, 10000);
  store.reportTroopsSent(context.scope, request.id, "John", 5000);
  stats.recordContribution(context.scope, "user", 1, 2, 5000);
  store.reportTroopsSent(context.scope, request.id, "Mary", 1000);
  return { store, stats, executeDefCallEditAction, executeUndoAction, id: request.id };
}

it("sets your own total, fixes stats, and undo restores both", async () => {
  const { store, stats, executeDefCallEditAction, executeUndoAction, id } = await setup();

  const result = await executeDefCallEditAction(context, { requestId: id, troops: 2000 });
  expect(result).toMatchObject({ success: true, oldTroops: 5000, newTroops: 2000, totalTroops: 3000 });
  expect(store.getRequestById(context.scope, id)?.contributors).toEqual([
    { accountName: "John", troops: 2000 },
    { accountName: "Mary", troops: 1000 },
  ]);
  expect(stats.getUserStats(context.scope, "user")?.totalTroops).toBe(2000);

  // A report after the edit must survive the undo
  store.reportTroopsSent(context.scope, id, "John", 500);
  if (!result.success) throw new Error("edit failed");
  expect((await executeUndoAction(context, { actionId: result.actionId })).success).toBe(true);
  const after = store.getRequestById(context.scope, id)!;
  expect(after.contributors.find((c) => c.accountName === "John")?.troops).toBe(5500);
  expect(after.troopsSent).toBe(6500);
  expect(stats.getUserStats(context.scope, "user")?.totalTroops).toBe(5000);
});

it("removes the account at 0 and undo puts it back", async () => {
  const { store, executeDefCallEditAction, executeUndoAction, id } = await setup();
  const result = await executeDefCallEditAction(context, { requestId: id, troops: 0 });
  expect(store.getRequestById(context.scope, id)?.contributors.map((c) => c.accountName)).toEqual(["Mary"]);
  if (!result.success) throw new Error("edit failed");
  await executeUndoAction(context, { actionId: result.actionId });
  expect(store.getRequestById(context.scope, id)?.troopsSent).toBe(6000);
});

it("needs manage to fix another member's total", async () => {
  const { executeDefCallEditAction, id } = await setup();
  const denied = await executeDefCallEditAction(context, { requestId: id, troops: 10, creditUserId: "other" });
  expect(denied.success).toBe(false);
  const admin = { ...context, isAdministrator: true } as ActionContext;
  expect(await executeDefCallEditAction(admin, { requestId: id, troops: 10, creditUserId: "other" })).toMatchObject({
    success: true, accountName: "Mary", oldTroops: 1000,
  });
});

it("refuses an account with no report on the call", async () => {
  const { store, executeDefCallEditAction } = await setup();
  const { request } = store.addRequest(context.scope, 3, 4, 2000000000, "req", "Req");
  const result = await executeDefCallEditAction(context, { requestId: request.id, troops: 10 });
  expect(result).toMatchObject({ success: false });
});
