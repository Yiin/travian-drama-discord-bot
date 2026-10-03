import type { Client } from "discord.js";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { DefCallRequest } from "../def-calls";

vi.mock("../../config/guild-config", () => ({
  getGuildConfig: () => ({ defCallsChannelId: "parent", serverKey: "ts33.x3.international" }),
}));
vi.mock("../map-data", () => ({
  getVillageAt: vi.fn().mockResolvedValue(null),
  getMapLink: () => "https://example.com/map",
}));
vi.mock("../def-calls", () => ({
  updateChannelInfo: vi.fn(),
  updateSummaryMessageId: vi.fn(),
}));

import { createDefCallThread } from "../def-calls-message";
import { updateChannelInfo, updateSummaryMessageId } from "../def-calls";

const request = {
  id: 1, x: 0, y: 0, landingAt: 2000000000, createdAt: Date.now(),
  requesterId: "user", requesterAccount: "User", troopsSent: 0, contributors: [], closed: false,
} as DefCallRequest;

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

function setup() {
  const thread = { id: "thread", send: vi.fn(), delete: vi.fn().mockResolvedValue(undefined) };
  const starter = {
    id: "starter", startThread: vi.fn().mockResolvedValue(thread), delete: vi.fn().mockResolvedValue(undefined),
  };
  const parent = { send: vi.fn().mockResolvedValue(starter) };
  const client = { channels: { fetch: vi.fn().mockResolvedValue(parent) } } as unknown as Client;
  return { client, parent, starter, thread };
}

it("removes the starter when thread creation fails", async () => {
  const { client, starter, thread } = setup();
  const error = new Error("Missing Access");
  starter.startThread.mockRejectedValue(error);
  await expect(createDefCallThread(client, "guild", request, 1)).rejects.toBe(error);
  expect(starter.delete).toHaveBeenCalledOnce();
  expect(thread.delete).not.toHaveBeenCalled();
  expect(updateChannelInfo).not.toHaveBeenCalled();
  expect(updateSummaryMessageId).not.toHaveBeenCalled();
});

it("removes both the thread and starter when card sending fails", async () => {
  const { client, starter, thread } = setup();
  const error = new Error("Cannot send card");
  thread.send.mockRejectedValue(error);
  await expect(createDefCallThread(client, "guild", request, 1)).rejects.toBe(error);
  expect(thread.delete).toHaveBeenCalledOnce();
  expect(starter.delete).toHaveBeenCalledOnce();
  expect(updateChannelInfo).not.toHaveBeenCalled();
});

it("tries both deletions and preserves the creation error when cleanup fails", async () => {
  const { client, starter, thread } = setup();
  const error = new Error("Cannot send card");
  const threadError = new Error("Cannot delete thread");
  const starterError = new Error("Cannot delete starter");
  thread.send.mockRejectedValue(error);
  thread.delete.mockRejectedValue(threadError);
  starter.delete.mockRejectedValue(starterError);
  await expect(createDefCallThread(client, "guild", request, 1)).rejects.toBe(error);
  expect(thread.delete).toHaveBeenCalledOnce();
  expect(starter.delete).toHaveBeenCalledOnce();
  expect(console.error).toHaveBeenCalledWith(expect.any(String), threadError);
  expect(console.error).toHaveBeenCalledWith(expect.any(String), starterError);
});
