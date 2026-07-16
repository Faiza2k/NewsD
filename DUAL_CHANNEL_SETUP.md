# NewsDash Ask — WhatsApp + Discord (dual channel)

Both channels use the **same brain**: `POST /api/query` on Vercel.

| Channel | Where it runs | User entry |
|---------|---------------|------------|
| **WhatsApp** | Local WAHA + n8n | DM business number |
| **Discord** | Vercel | `/ask question: …` in server |

Memory is **per channel** (WhatsApp phone JID vs `discord:guild:channel:user`).

---

## Architecture

```text
                    ┌─────────────────────────┐
                    │   POST /api/query       │
                    │   (Vercel — shared brain)│
                    └───────────┬─────────────┘
                                │
           ┌────────────────────┼────────────────────┐
           │                    │                    │
           ▼                    ▼                    ▼
   WhatsApp (WAHA)        Discord (Vercel)    Optional Cloud API
   n8n → sendText         /api/discord/...    /api/whatsapp/webhook
```

Health check (after deploy):

```text
https://news-d.vercel.app/api/ask/status
```

---

## Part A — Discord (Vercel)

### 1. Create Discord app + bot
[Discord Developer Portal](https://discord.com/developers/applications) → New Application → Add Bot.

Copy:
- Application ID → `DISCORD_APPLICATION_ID`
- Public Key → `DISCORD_PUBLIC_KEY`
- Bot Token → `DISCORD_BOT_TOKEN`

### 2. Vercel env vars
Add on Vercel (and `.env.local` for local dev):

```env
DISCORD_PUBLIC_KEY=
DISCORD_BOT_TOKEN=
DISCORD_APPLICATION_ID=
DISCORD_ALLOWED_GUILD_IDS=   # optional, comma-separated
```

### 3. Deploy code
Push latest repo to Vercel (`news-d.vercel.app`).

### 4. Interactions Endpoint URL
Developer Portal → General Information:

```text
https://news-d.vercel.app/api/discord/interactions
```

Save — Discord verifies with PING/PONG.

### 5. Register `/ask`
```bash
curl -X POST "https://news-d.vercel.app/api/discord/register" -H "Authorization: Bearer YOUR_BOT_TOKEN"
```

### 6. Invite bot
OAuth2 → scopes: `bot`, `applications.commands` → permissions: Send Messages, Embed Links.

### 7. Test Discord
```text
/ask question: bitcoin price
/ask question: aur batao
```

Full details: [DISCORD_SETUP.md](./DISCORD_SETUP.md)

---

## Part B — WhatsApp (WAHA + n8n)

### 1. WhatsApp Business on business number
Install WhatsApp Business on `03439798418` (+92 343 9798418) and complete login.

### 2. Start Docker stack
From repo root:

```powershell
cd D:\News_Dashboard
docker compose -f docker-compose.ask.yml up -d
docker ps
```

Expect: `newsdash-n8n` (5678), `newsdash-waha` (3001).

### 3. Pair WAHA with WhatsApp
1. Open `http://localhost:3001`
2. Create/start session `default`
3. Scan QR with WhatsApp Business until status **WORKING**

### 4. Import n8n Ask workflow
1. Open `http://localhost:5678`
2. **Workflows** → **Import from File**
3. Choose `ask_agent_dm_dual_channel.n8n.json`
4. **Activate** the workflow

Webhook path: `POST http://localhost:5678/webhook/newsdash-ask`

### 5. Point WAHA webhook to n8n
In WAHA dashboard (session `default`):

- Event: `message`
- URL: `http://n8n:5678/webhook/newsdash-ask` (from inside Docker network)

If configuring from host UI, use:

```text
http://host.docker.internal:5678/webhook/newsdash-ask
```

### 6. Allowlist testers (optional)
Edit **Parse Incoming Message** node in n8n — `ALLOWED` set. Empty set = allow all DMs.

Default allows:
- `923138308265@c.us` (personal tester)

### 7. Test WhatsApp
Send DM to business number:

```text
bitcoin price
gold price
aur batao
```

Voice notes: workflow transcribes via `/api/transcribe` then queries.

---

## Part C — Run both together

| Step | WhatsApp | Discord |
|------|----------|---------|
| Brain | `/api/query` on Vercel | same |
| Keep running | WAHA + n8n containers | Vercel only |
| User says | text/voice DM | `/ask question: …` |
| Memory key | `923…@c.us` | `discord:guild:channel:user` |

**Do not** stop WAHA if you want WhatsApp users. **Do not** remove Discord env vars if you want Discord users.

Check status:

```text
GET https://news-d.vercel.app/api/ask/status
```

---

## Troubleshooting

### WhatsApp: no reply
- WAHA session not WORKING → rescan QR
- n8n workflow inactive → activate
- WAHA webhook URL wrong → fix to n8n webhook
- User not in ALLOWED set → add JID or clear allowlist

### Discord: command missing
- Run `/api/discord/register` again
- Global commands can take ~1 hour; use guild command for instant test

### Discord: invalid signature
- `DISCORD_PUBLIC_KEY` must match Developer Portal exactly
- Redeploy Vercel after env change

### Follow-ups not working
- Same user + same channel required
- Memory TTL is 45 minutes on Vercel

---

## Files

| File | Purpose |
|------|---------|
| `docker-compose.ask.yml` | WAHA + n8n local stack |
| `ask_agent_dm_dual_channel.n8n.json` | WhatsApp Ask workflow (import into n8n) |
| `src/lib/ask/*` | Shared brain helpers |
| `src/app/api/discord/*` | Discord channel |
| `src/app/api/ask/status` | Dual-channel health |
| `DISCORD_SETUP.md` | Discord-only deep dive |

---

## Optional: Meta Cloud API (third WhatsApp path)

Not required for dual-channel. Only if you later want official Meta API instead of WAHA. See `WHATSAPP_CLOUD_API_SETUP.md`.
