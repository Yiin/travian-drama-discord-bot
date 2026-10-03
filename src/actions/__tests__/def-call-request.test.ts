import { mkdtempSync, mkdirSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ActionContext } from "../types";

vi.mock("../../services/map-data", () => ({
  ensureMapData: vi.fn().mockResolvedValue(true),
  getVillageAt: vi.fn().mockResolvedValue(null),
  formatVillageDisplay: vi.fn(),
}));
vi.mock("../push-validation", () => ({
  validateUserHasAccount: () => ({ valid: true, accountName: "John" }),
}));
vi.mock("../../services/def-calls-message", () => ({
  createDefCallThread: vi.fn(),
  refreshHubChannel: vi.fn(),
}));
vi.mock("../../services/landing-scheduler", () => ({ scheduleLanding: vi.fn() }));
vi.mock("../../services/action-history", () => ({ recordAction: vi.fn().mockReturnValue(1) }));

const originalCwd = process.cwd();
const context = {
  guildId: "guild", userId: "user", client: {},
  config: { serverKey: "ts33.x3.international", defCallsChannelId: "parent" },
} as ActionContext;
const input = { coords: "0|0", landing: "23:59:59", comment: "testing" };

beforeEach(() => {
  const dir = mkdtempSync(join(tmpdir(), "drama-create-"));
  mkdirSync(join(dir, "data"));
  process.chdir(dir);
  vi.resetModules();
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  process.chdir(originalCwd);
  vi.restoreAllMocks();
});

it("discards failed calls and keeps the successful retry with a fresh id", async () => {
  const store = await import("../../services/def-calls");
  const messages = await import("../../services/def-calls-message");
  const scheduler = await import("../../services/landing-scheduler");
  const history = await import("../../services/action-history");
  const { executeDefCallRequestAction } = await import("../def-call-request.action");
  vi.mocked(messages.createDefCallThread)
    .mockRejectedValueOnce(new Error("Missing Access"))
    .mockRejectedValueOnce(new Error("Missing Access"))
    .mockResolvedValueOnce({ channelId: "thread", messageId: "card" });

  expect((await executeDefCallRequestAction(context, input)).success).toBe(false);
  expect((await executeDefCallRequestAction(context, input)).success).toBe(false);
  expect(store.getActiveRequests(context.guildId)).toHaveLength(0);
  expect(scheduler.scheduleLanding).not.toHaveBeenCalled();
  expect(history.recordAction).not.toHaveBeenCalled();

  const result = await executeDefCallRequestAction(context, input);
  expect(result).toMatchObject({ success: true, requestId: 3 });
  expect(store.getActiveRequests(context.guildId).map((r) => r.requestId)).toEqual([3]);
  expect(scheduler.scheduleLanding).toHaveBeenCalledTimes(1);
  expect(history.recordAction).toHaveBeenCalledTimes(1);
});

it("keeps another call created while thread creation is pending", async () => {
  const store = await import("../../services/def-calls");
  const messages = await import("../../services/def-calls-message");
  const { executeDefCallRequestAction } = await import("../def-call-request.action");
  vi.mocked(messages.createDefCallThread).mockImplementationOnce(async () => {
    store.addRequest(context.guildId, 1, 2, 2000000000, "other", "Other");
    throw new Error("Missing Access");
  });
  expect((await executeDefCallRequestAction(context, input)).success).toBe(false);
  expect(store.getActiveRequests(context.guildId).map((r) => r.requestId)).toEqual([2]);
  expect(store.getRequestById(context.guildId, 2)?.requesterAccount).toBe("Other");
});
