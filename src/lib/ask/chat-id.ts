/** Discord session key — separate from WhatsApp memory. */
export function discordChatId(parts: {
  guildId?: string | null;
  channelId?: string | null;
  userId?: string | null;
}): string {
  const userId = parts.userId || 'unknown';
  const guild = parts.guildId || 'dm';
  const channel = parts.channelId || 'none';
  return `discord:${guild}:${channel}:${userId}`;
}

/** WhatsApp session key — phone JID from WAHA (e.g. 923138308265@c.us). */
export function whatsappChatId(from: string): string {
  return String(from || '').trim();
}
