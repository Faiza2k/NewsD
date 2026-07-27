import { getDiscordConfig, isDiscordConfigured } from '@/lib/discord/config';
import { isVectorConfigured } from '@/lib/rag/vector';
import { getRedisClient, isMemoryDurable } from '@/lib/kv/redis';
import { isWhatsAppCloudConfigured } from '@/lib/whatsapp/cloud';

export type ChannelStatus = {
  id: 'whatsapp_waha' | 'whatsapp_cloud' | 'discord';
  label: string;
  transport: string;
  configured: boolean;
  endpoint?: string;
  hint: string;
};

/** Status of all Ask channels (WhatsApp WAHA is local — reported as manual). */
export function getAskChannelStatus(): {
  brain: string;
  channels: ChannelStatus[];
  dualChannelReady: boolean;
  discord: { allowedGuilds: string | number };
  /** True when Redis/KV is configured so chat memory survives cold starts. */
  memoryDurable: boolean;
  rag: {
    vectorConfigured: boolean;
    redisConfigured: boolean;
    groqConfigured: boolean;
  };
} {
  const discord = getDiscordConfig();
  const channels: ChannelStatus[] = [
    {
      id: 'whatsapp_waha',
      label: 'WhatsApp (Business + WAHA + n8n)',
      transport: 'local',
      configured: true, // enabled when user runs docker + imports workflow
      endpoint: 'n8n webhook → /api/query → WAHA sendText',
      hint: 'Start docker-compose.ask.yml, scan WAHA QR, activate n8n Ask workflow.',
    },
    {
      id: 'whatsapp_cloud',
      label: 'WhatsApp (Meta Cloud API)',
      transport: 'coolify',
      configured: isWhatsAppCloudConfigured(),
      endpoint: '/api/whatsapp/webhook',
      hint: isWhatsAppCloudConfigured()
        ? 'Optional second WhatsApp path on Coolify.'
        : 'Optional. Set WHATSAPP_* env vars if you want Cloud API too.',
    },
    {
      id: 'discord',
      label: 'Discord (/ask)',
      transport: 'coolify',
      configured: isDiscordConfigured(),
      endpoint: '/api/discord/interactions',
      hint: isDiscordConfigured()
        ? 'Set Interactions URL in Discord Developer Portal to your Coolify HTTPS URL.'
        : 'Add DISCORD_PUBLIC_KEY, DISCORD_BOT_TOKEN, DISCORD_APPLICATION_ID.',
    },
  ];

  const wahaReady = true; // operational checklist item
  const discordReady = isDiscordConfigured();
  const dualChannelReady = wahaReady && discordReady;

  return {
    brain: 'POST /api/query',
    channels,
    dualChannelReady,
    discord: {
      allowedGuilds: discord.allowedGuildIds.length || 'all',
    },
    memoryDurable: isMemoryDurable(),
    rag: {
      vectorConfigured: isVectorConfigured(),
      redisConfigured: Boolean(getRedisClient()),
      groqConfigured: Boolean(process.env.GROQ_API_KEY?.trim()),
    },
  };
}
