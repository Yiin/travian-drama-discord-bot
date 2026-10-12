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
const SCOPE = { guildId: GUILD };

describe("def-call close and reopen", () => {
  it("keeps the data, flips the card state, and reopens on undo", async () => {
    const store = await import("../def-calls");
    const { defCallState } = await import("../def-calls-message");
    const future = Math.floor(Date.now() / 1000) + 3600;
    const { request } = store.addRequest(SCOPE, 1, 2, future, "u1", "Acc1", "note", 1000);

    expect(defCallState(request)).toBe("open");
    store.reportTroopsSent(SCOPE, request.id, "Acc2", 1000);
    expect(defCallState(store.getRequestById(SCOPE, request.id)!)).toBe("fulfilled");

    const closed = store.closeRequest(SCOPE, request.id);
    expect("error" in closed).toBe(false);
    const afterClose = store.getRequestById(SCOPE, request.id)!;
    expect(afterClose.closed).toBe(true);
    expect(afterClose.troopsSent).toBe(1000);
    expect(defCallState(afterClose)).toBe("closed");
    expect(store.getActiveRequests(SCOPE)).toHaveLength(0);

    const reopened = store.reopenRequest(SCOPE, request.id);
    expect("error" in reopened).toBe(false);
    expect(store.getActiveRequests(SCOPE)).toHaveLength(1);
    expect(defCallState(store.getRequestById(SCOPE, request.id)!)).toBe("fulfilled");
  });

  it("shows landed once the landing time passed or the scheduler flagged it", async () => {
    const store = await import("../def-calls");
    const { defCallState } = await import("../def-calls-message");
    const past = Math.floor(Date.now() / 1000) - 60;
    const { request } = store.addRequest(SCOPE, 1, 2, past, "u1", "Acc1");
    expect(defCallState(request)).toBe("landed");

    const future = Math.floor(Date.now() / 1000) + 3600;
    const soon = store.addRequest(SCOPE, 3, 4, future, "u1", "Acc1").request;
    expect(defCallState(soon)).toBe("open");
    store.setLanded(SCOPE, soon.id, true);
    expect(defCallState(store.getRequestById(SCOPE, soon.id)!)).toBe("landed");
  });
});

describe("push close and reopen", () => {
  it("keeps contributions and toggles the closed flag", async () => {
    const store = await import("../push-requests");
    const added = store.addPushRequest(SCOPE, 1, 2, 500000, "u1", "Acc1");
    if ("error" in added) throw new Error(added.error);
    const { request } = added;
    store.reportResourcesSent(SCOPE, request.id, "Acc2", 100000);

    expect(store.setPushRequestClosed(SCOPE, request.id, true)?.closed).toBe(true);
    const closed = store.getPushRequestById(SCOPE, request.id)!;
    expect(closed.resourcesSent).toBe(100000);
    expect(closed.contributors).toHaveLength(1);

    expect(store.setPushRequestClosed(SCOPE, request.id, false)?.closed).toBe(false);
    expect(store.setPushRequestClosed(SCOPE, 999, true)).toBeNull();
  });

  it("undoing a close reopens through action history", async () => {
    const store = await import("../push-requests");
    const history = await import("../action-history");
    const added = store.addPushRequest(SCOPE, 1, 2, 500000, "u1", "Acc1");
    if ("error" in added) throw new Error(added.error);
    const { request } = added;
    store.setPushRequestClosed(SCOPE, request.id, true);
    const actionId = history.recordAction(SCOPE, {
      type: "PUSH_REQUEST_CLOSED",
      userId: "u1",
      coords: { x: 1, y: 2 },
      requestId: request.id,
      previousPushState: { ...request, contributors: [] },
      data: {},
    });

    const result = history.undoAction(SCOPE, actionId);
    expect(result.success).toBe(true);
    expect(store.getPushRequestById(SCOPE, request.id)?.closed).toBe(false);
  });
});
