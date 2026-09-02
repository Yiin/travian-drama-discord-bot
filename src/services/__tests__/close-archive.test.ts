import { mkdtempSync, mkdirSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** Stores resolve `data/` from cwd at import time: fresh temp cwd and module registry per test. */
const originalCwd = process.cwd();
let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "drama-close-"));
  mkdirSync(join(dir, "data"));
  process.chdir(dir);
  vi.resetModules();
});

afterEach(() => {
  process.chdir(originalCwd);
});

const GUILD = "g1";

describe("def-call close and reopen", () => {
  it("keeps the data, flips the card state, and reopens on undo", async () => {
    const store = await import("../def-calls");
    const { defCallState } = await import("../def-calls-message");
    const future = Math.floor(Date.now() / 1000) + 3600;
    const { request } = store.addRequest(GUILD, 1, 2, future, "u1", "Acc1", "note", 1000);

    expect(defCallState(request)).toBe("open");
    store.reportTroopsSent(GUILD, request.id, "Acc2", 1000);
    expect(defCallState(store.getRequestById(GUILD, request.id)!)).toBe("fulfilled");

    const closed = store.closeRequest(GUILD, request.id);
    expect("error" in closed).toBe(false);
    const afterClose = store.getRequestById(GUILD, request.id)!;
    expect(afterClose.closed).toBe(true);
    expect(afterClose.troopsSent).toBe(1000);
    expect(defCallState(afterClose)).toBe("closed");
    expect(store.getActiveRequests(GUILD)).toHaveLength(0);

    const reopened = store.reopenRequest(GUILD, request.id);
    expect("error" in reopened).toBe(false);
    expect(store.getActiveRequests(GUILD)).toHaveLength(1);
    expect(defCallState(store.getRequestById(GUILD, request.id)!)).toBe("fulfilled");
  });

  it("shows landed once the landing time passed or the scheduler flagged it", async () => {
    const store = await import("../def-calls");
    const { defCallState } = await import("../def-calls-message");
    const past = Math.floor(Date.now() / 1000) - 60;
    const { request } = store.addRequest(GUILD, 1, 2, past, "u1", "Acc1");
    expect(defCallState(request)).toBe("landed");

    const future = Math.floor(Date.now() / 1000) + 3600;
    const soon = store.addRequest(GUILD, 3, 4, future, "u1", "Acc1").request;
    expect(defCallState(soon)).toBe("open");
    store.setLanded(GUILD, soon.id, true);
    expect(defCallState(store.getRequestById(GUILD, soon.id)!)).toBe("landed");
  });
});

describe("push close and reopen", () => {
  it("keeps contributions and toggles the closed flag", async () => {
    const store = await import("../push-requests");
    const added = store.addPushRequest(GUILD, 1, 2, 500000, "u1", "Acc1");
    if ("error" in added) throw new Error(added.error);
    const { request } = added;
    store.reportResourcesSent(GUILD, request.id, "Acc2", 100000);

    expect(store.setPushRequestClosed(GUILD, request.id, true)?.closed).toBe(true);
    const closed = store.getPushRequestById(GUILD, request.id)!;
    expect(closed.resourcesSent).toBe(100000);
    expect(closed.contributors).toHaveLength(1);

    expect(store.setPushRequestClosed(GUILD, request.id, false)?.closed).toBe(false);
    expect(store.setPushRequestClosed(GUILD, 999, true)).toBeNull();
  });

  it("undoing a close reopens through action history", async () => {
    const store = await import("../push-requests");
    const history = await import("../action-history");
    const added = store.addPushRequest(GUILD, 1, 2, 500000, "u1", "Acc1");
    if ("error" in added) throw new Error(added.error);
    const { request } = added;
    store.setPushRequestClosed(GUILD, request.id, true);
    const actionId = history.recordAction(GUILD, {
      type: "PUSH_REQUEST_CLOSED",
      userId: "u1",
      coords: { x: 1, y: 2 },
      requestId: request.id,
      previousPushState: { ...request, contributors: [] },
      data: {},
    });

    const result = history.undoAction(GUILD, actionId);
    expect(result.success).toBe(true);
    expect(store.getPushRequestById(GUILD, request.id)?.closed).toBe(false);
  });
});
