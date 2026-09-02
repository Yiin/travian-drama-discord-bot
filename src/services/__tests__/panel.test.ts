import { describe, expect, it, vi } from "vitest";
import { ContainerBuilder, MessageFlags, TextDisplayBuilder } from "discord.js";
import { isLastMessage, upsertPanel } from "../panel";

function panel() {
  return new ContainerBuilder().addTextDisplayComponents(new TextDisplayBuilder().setContent("hi"));
}

function fakeChannel(lastMessageId: string | null, stored?: { id: string }) {
  const edited = vi.fn(async (body: unknown) => ({ id: stored?.id, body }));
  const deleted = vi.fn(async () => undefined);
  const existing = stored ? { id: stored.id, edit: edited, delete: deleted } : null;
  const sent = vi.fn(async (body: unknown) => ({ id: "new", body }));
  return {
    channel: {
      lastMessageId,
      messages: { fetch: vi.fn(async (id: string) => (existing && id === existing.id ? existing : Promise.reject(new Error("unknown")))) },
      send: sent,
    } as any,
    edited,
    deleted,
    sent,
  };
}

describe("isLastMessage", () => {
  it("is true only when nothing was posted after the panel", () => {
    expect(isLastMessage({ lastMessageId: "p" }, { id: "p" })).toBe(true);
    expect(isLastMessage({ lastMessageId: "later" }, { id: "p" })).toBe(false);
    expect(isLastMessage({ lastMessageId: null }, { id: "p" })).toBe(true);
  });
});

describe("upsertPanel", () => {
  it("edits in place while the panel is the last message", async () => {
    const { channel, edited, sent, deleted } = fakeChannel("p", { id: "p" });
    const save = vi.fn();
    const result = await upsertPanel({ channel, storedMessageId: "p", payload: { components: [panel()] }, save });
    expect(result.edited).toBe(true);
    expect(edited).toHaveBeenCalledOnce();
    expect(edited.mock.calls[0][0]).toMatchObject({ flags: MessageFlags.IsComponentsV2 });
    expect(sent).not.toHaveBeenCalled();
    expect(deleted).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
  });

  it("deletes and re-posts when chat moved on", async () => {
    const { channel, edited, sent, deleted } = fakeChannel("later", { id: "p" });
    const save = vi.fn();
    const result = await upsertPanel({ channel, storedMessageId: "p", payload: { components: [panel()] }, save });
    expect(result.edited).toBe(false);
    expect(edited).not.toHaveBeenCalled();
    expect(deleted).toHaveBeenCalledOnce();
    expect(sent).toHaveBeenCalledOnce();
    expect(save).toHaveBeenCalledWith("new");
  });

  it("posts a fresh panel when the stored one is gone", async () => {
    const { channel, sent } = fakeChannel("later");
    const save = vi.fn();
    const result = await upsertPanel({ channel, storedMessageId: "missing", payload: { components: [panel()] }, save });
    expect(result.edited).toBe(false);
    expect(sent).toHaveBeenCalledOnce();
    expect(save).toHaveBeenCalledWith("new");
  });
});
