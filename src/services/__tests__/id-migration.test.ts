import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Request services resolve `data/` from process.cwd() at import time, so each test
 * gets a fresh temp cwd and a fresh module registry.
 */
const originalCwd = process.cwd();
let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "drama-ids-"));
  mkdirSync(join(dir, "data"));
  process.chdir(dir);
  vi.resetModules();
});

afterEach(() => {
  process.chdir(originalCwd);
});

const GUILD = "g1";

describe("stable id migration", () => {
  it("assigns ids to stack requests written before ids existed and expires undo history", async () => {
    writeFileSync(
      join(dir, "data", "defense-requests.json"),
      JSON.stringify({
        [GUILD]: {
          requests: [
            { x: 1, y: 2, troopsSent: 0, troopsNeeded: 100, message: "", requesterId: "u", createdAt: 1, contributors: [] },
            { x: 3, y: 4, troopsSent: 0, troopsNeeded: 100, message: "", requesterId: "u", createdAt: 1, contributors: [] },
          ],
          recentlyCompleted: [],
        },
      })
    );
    writeFileSync(
      join(dir, "data", "action-history.json"),
      JSON.stringify({
        [GUILD]: {
          nextId: 3,
          actions: [
            { id: 1, type: "DEF_ADD", userId: "u", timestamp: 1, coords: { x: 1, y: 2 }, requestId: 1, data: {}, undone: false },
            { id: 2, type: "DEF_ADD", userId: "u", timestamp: 1, coords: { x: 3, y: 4 }, requestId: 2, data: {}, undone: true },
          ],
          messageActions: { m1: { content: "!stack 1|2 100", actionIds: [1] } },
        },
      })
    );

    const svc = await import("../defense-requests");
    const data = svc.getGuildDefenseData(GUILD);

    expect(data.requests.map((r) => r.id)).toEqual([1, 2]);
    expect(data.nextId).toBe(3);

    const added = svc.addRequest(GUILD, 5, 6, 100, "", "u");
    expect("requestId" in added && added.requestId).toBe(3);
    expect(svc.getRequestById(GUILD, 3)?.x).toBe(5);

    // ids stay stable when an earlier request is removed
    svc.removeRequest(GUILD, 1);
    expect(svc.getRequestById(GUILD, 3)?.x).toBe(5);
    expect(svc.getRequestPosition(GUILD, 3)).toBe(2);

    // the file was written back with ids
    const onDisk = JSON.parse(readFileSync(join(dir, "data", "defense-requests.json"), "utf8"));
    expect(onDisk[GUILD].nextId).toBe(4);

    // old undo entries cannot be trusted any more
    const history = JSON.parse(readFileSync(join(dir, "data", "action-history.json"), "utf8"));
    expect(history[GUILD].actions[0]).toMatchObject({ undone: true, expiredReason: "expired by id migration" });
    expect(history[GUILD].actions[1].expiredReason).toBeUndefined();
    expect(history[GUILD].messageActions.m1).toBeDefined();
  });

  it("keeps an existing id on restore and bumps the counter past it", async () => {
    const svc = await import("../defense-requests");
    const a = svc.addRequest(GUILD, 1, 1, 10, "", "u");
    const b = svc.addRequest(GUILD, 2, 2, 10, "", "u");
    if ("error" in a || "error" in b) throw new Error("setup failed");

    svc.removeRequest(GUILD, a.requestId);
    const restored = svc.restoreRequest(GUILD, a.request);
    expect(restored.requestId).toBe(a.requestId);
    expect(svc.getRequestPosition(GUILD, a.requestId)).toBe(2);

    // restoring something whose id is active again gets a fresh id
    const dup = svc.restoreRequest(GUILD, b.request);
    expect(dup.requestId).toBe(3);
  });

  it("migrates push and def-call requests the same way", async () => {
    writeFileSync(
      join(dir, "data", "push-requests.json"),
      JSON.stringify({ [GUILD]: { requests: [{ x: 1, y: 1, resourcesSent: 0, resourcesNeeded: 5, requesterId: "u", requesterAccount: "A", createdAt: 1, completed: false, contributors: [], channelId: "c1" }] } })
    );
    writeFileSync(
      join(dir, "data", "def-calls.json"),
      JSON.stringify({ [GUILD]: { requests: [{ x: 1, y: 1, landingAt: 1, requesterId: "u", requesterAccount: "A", troopsSent: 0, contributors: [], createdAt: 1, closed: false, channelId: "c2" }] } })
    );

    const push = await import("../push-requests");
    expect(push.getPushRequestByChannelId(GUILD, "c1")?.requestId).toBe(1);
    const added = push.addPushRequest(GUILD, 2, 2, 5, "u", "A");
    expect("requestId" in added && added.requestId).toBe(2);

    const defCalls = await import("../def-calls");
    expect(defCalls.getRequestByChannelId(GUILD, "c2")?.requestId).toBe(1);
    expect(defCalls.addRequest(GUILD, 2, 2, 1, "u", "A").requestId).toBe(2);
  });
});
