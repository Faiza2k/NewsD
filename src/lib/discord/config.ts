export function getDiscordConfig() {
  return {
    publicKey: process.env.DISCORD_PUBLIC_KEY?.trim() || '',
    botToken: process.env.DISCORD_BOT_TOKEN?.trim() || '',
    applicationId: process.env.DISCORD_APPLICATION_ID?.trim() || '',
    /** Optional comma-separated guild IDs. Empty = allow all. */
    allowedGuildIds: (process.env.DISCORD_ALLOWED_GUILD_IDS || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  };
}

/** Public key is enough to verify interactions; token+app id needed to reply. */
export function isDiscordConfigured(): boolean {
  const c = getDiscordConfig();
  return Boolean(c.publicKey && c.botToken && c.applicationId);
}

export function isGuildAllowed(guildId: string | null | undefined): boolean {
  const { allowedGuildIds } = getDiscordConfig();
  if (!allowedGuildIds.length) return true;
  if (!guildId) return true; // DMs
  return allowedGuildIds.includes(guildId);
}
