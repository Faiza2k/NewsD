# NewsDash Discord Ask (works alongside WhatsApp WAHA)

Users ask via the **`/ask`** slash command in Discord. NewsDash answers with the same brain as WhatsApp (`POST /api/query`).

For **both channels**, see [DUAL_CHANNEL_SETUP.md](./DUAL_CHANNEL_SETUP.md).

## Architecture

```text
Discord user → /ask question: …
       │
       ▼
POST /api/discord/interactions   (Vercel)
       │  verify Ed25519
       │  defer (type 5) within 3s
       ▼
POST /api/query  { q, chatId: discord:guild:channel:user }
       ▼
Edit interaction message (Discord markdown + source link buttons)
```

No WAHA, n8n, or Meta Cloud API required for Ask.

## 1. Create a Discord application

1. Open [Discord Developer Portal](https://discord.com/developers/applications) → **New Application** → name it e.g. `NewsDash Ask`.
2. **General Information** → copy **Application ID** → `DISCORD_APPLICATION_ID`.
3. Copy **Public Key** → `DISCORD_PUBLIC_KEY`.
4. **Bot** → **Add Bot** → **Reset Token** → copy → `DISCORD_BOT_TOKEN` (keep secret).
5. Under Bot settings, you can leave Message Content Intent **off** (slash commands only).

## 2. Invite the bot to your server

OAuth2 → URL Generator:

- Scopes: `bot`, `applications.commands`
- Bot permissions: `Send Messages`, `Embed Links`, `Read Message History` (optional)

Open the generated URL, pick your server, authorize.

## 3. Vercel environment variables

| Variable | Required | Notes |
|----------|----------|--------|
| `DISCORD_PUBLIC_KEY` | yes | App Public Key (hex) |
| `DISCORD_BOT_TOKEN` | yes | Bot token |
| `DISCORD_APPLICATION_ID` | yes | Application ID |
| `DISCORD_ALLOWED_GUILD_IDS` | no | Comma-separated server IDs; empty = all |

Redeploy after saving env vars.

## 4. Set Interactions Endpoint URL

In the Developer Portal → your app → **General Information**:

**Interactions Endpoint URL:**

```text
https://news-d.vercel.app/api/discord/interactions
```

Click **Save**. Discord sends a `PING`; the route must return `PONG` with a valid signature (needs `DISCORD_PUBLIC_KEY` live on Vercel).

Health check (browser):

```text
https://news-d.vercel.app/api/discord/interactions
```

Expect `"configured": true`.

## 5. Register the `/ask` command

After env is live:

```bash
curl -X POST "https://news-d.vercel.app/api/discord/register" ^
  -H "Authorization: Bearer YOUR_BOT_TOKEN"
```

Global commands can take up to ~1 hour to appear; for instant testing you can also create a guild command in the Portal (same name/options).

## 6. Use it

In your Discord server:

```text
/ask question: bitcoin price
/ask question: gold price
/ask question: diesel price
/ask question: US Iran war
```

Follow-ups in the same channel from the same user reuse session memory (`chatId`).

## Local testing

Put the same vars in `.env.local`. Discord requires a **public HTTPS** URL for Interactions — use a tunnel (ngrok / Cloudflare Tunnel) pointed at `localhost:3000` if you need to debug the webhook locally.

## WhatsApp

WhatsApp Ask runs in parallel via **WAHA + n8n** — see [DUAL_CHANNEL_SETUP.md](./DUAL_CHANNEL_SETUP.md). Both channels share `/api/query` but use separate session memory keys.
