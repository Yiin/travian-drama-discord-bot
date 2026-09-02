import {
  Message,
  MessageFlags,
  TextBasedChannel,
  ContainerBuilder,
} from "discord.js";

/**
 * Live panels: one Components V2 message per topic, edited in place.
 *
 * A panel must stay readable, so it also has to stay near the bottom of the
 * channel. `upsertPanel` edits the stored message when it is still the last
 * message in the channel, and otherwise deletes it and posts a fresh copy.
 */

export interface PanelPayload {
  components: ContainerBuilder[];
  allowedMentions?: { parse?: ("users" | "roles" | "everyone")[]; users?: string[]; roles?: string[] };
}

export interface UpsertPanelOptions {
  channel: Pick<TextBasedChannel, "messages" | "lastMessageId"> & { send: (options: any) => Promise<Message> };
  storedMessageId?: string;
  payload: PanelPayload;
  /** Called with the new message id when a fresh message was posted. */
  save: (messageId: string) => void;
}

export interface UpsertPanelResult {
  message: Message;
  /** true when the stored message was edited in place. */
  edited: boolean;
}

/** Wire flags onto a V2 payload. Exported so callers that send directly stay consistent. */
export function v2(payload: PanelPayload): PanelPayload & { flags: number } {
  return { ...payload, flags: MessageFlags.IsComponentsV2 };
}

export async function upsertPanel(options: UpsertPanelOptions): Promise<UpsertPanelResult> {
  const { channel, storedMessageId, payload, save } = options;
  const body = v2(payload);

  if (storedMessageId) {
    let existing: Message | null = null;
    try {
      existing = await channel.messages.fetch(storedMessageId);
    } catch {
      existing = null;
    }

    if (existing) {
      if (isLastMessage(channel, existing)) {
        try {
          // Older panels were embeds; the V2 flag needs content and embeds cleared in the same edit
          const message = await existing.edit({ ...body, content: null, embeds: [] });
          return { message, edited: true };
        } catch (error) {
          console.warn("[Panel] Edit failed, re-posting the panel:", error);
        }
      }
      try {
        await existing.delete();
      } catch {
        // already gone
      }
    }
  }

  const message = await channel.send(body);
  save(message.id);
  return { message, edited: false };
}

/** The panel stays in place only while nothing was posted after it. */
export function isLastMessage(
  channel: Pick<TextBasedChannel, "lastMessageId">,
  message: Pick<Message, "id">,
): boolean {
  return channel.lastMessageId === null || channel.lastMessageId === message.id;
}
