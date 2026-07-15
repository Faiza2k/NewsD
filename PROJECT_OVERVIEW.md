# NewsDash — Project Overview (Easy Explainer)

A short guide to explain **what this project is**, **how it works**, and **how WhatsApp asks become answers**.

---

## What is NewsDash?

- A **news dashboard** (web app) that collects headlines from many publishers via **RSS**.
- A **WhatsApp ask bot** that answers user questions (text or voice) using that same news + live data.
- Live on WhatsApp through: **WAHA** (WhatsApp API) → **n8n** (automation) → **NewsDash API** on Vercel.

**One-line pitch:**  
*Users ask on WhatsApp; the bot searches NewsDash feeds (and live price/weather APIs when needed) and replies with a short grounded answer plus source links.*

---

## Is this RAG?

- **No — not classic RAG.**
- There is **no embedding model** and **no vector database**.
- Flow is: **RSS fetch → cache → keyword ranking → grounded answer (optional LLM)**.
- Sources are real article URLs (shortened) so the user can open the publisher page.

---

## Main pieces of the system

### 1) NewsDash web app (Next.js)
- Framework: **Next.js** + **React** + **TypeScript**.
- Pulls news from many **RSS feeds** (BBC, CNBC, Google AI blog, FT, Reddit, etc.).
- Caches feed items ~**5 minutes** so WhatsApp replies stay fast.
- Dashboard APIs also serve the web UI (`/api/feeds`, etc.).

### 2) Brain API — `POST /api/query`
- The WhatsApp “brain”.
- Input: user question `q` (+ limit).
- Output: WhatsApp-ready text (`whatsappText`), sources, and optional live data.
- Routes by intent:
  - **Greeting** → help text
  - **Weather** → live weather API (geocoded city)
  - **Gold / BTC / ETH / SOL price** → live market APIs
  - **News (default)** → search feed cache → rank → grounded answer + sources

### 3) Voice transcription — `POST /api/transcribe`
- Accepts audio (multipart, `mediaUrl`, or **`audioBase64`**).
- Uses **Groq Whisper** to turn voice into text.
- That text is then sent to `/api/query` like a normal question.

### 4) WAHA (WhatsApp HTTP API)
- Self-hosted WhatsApp bridge (Docker).
- Engine: **NOWEB** (needed for some interactive features).
- Receives inbound DMs and can send replies (`sendText`).
- Forwards each new message to n8n via webhook.
- Dashboard (typical local): `http://localhost:3001/dashboard/`
- Needs QR scan once (or after session recreate) until status is **WORKING**.

### 5) n8n (automation)
- Docker workflow: **NewsDash → Ask Agent (DM)**.
- Path roughly:
  1. **Webhook** receives WAHA `message` event  
  2. **Parse** extracts text / voice media, chat id  
  3. **Resolve** downloads voice → base64 → `/api/transcribe` if needed  
  4. **Query** calls `https://news-d.vercel.app/api/query`  
  5. **Format** builds final WhatsApp text  
  6. **Send** replies via WAHA `sendText`
- Important: replies go to the user’s **phone JID (`@c.us`)**, not only `@lid` (or messages may not appear).

---

## How news is fetched (not embeddings)

- Publishers expose **RSS** files (lists of latest stories: title, link, summary, time).
- NewsDash periodically fetches those feeds and stores items in an **in-memory cache**.
- When a user asks something:
  1. Question is cleaned / tokenized  
  2. Stories are **scored** by keyword match + freshness + quality  
  3. Top stories are selected  
  4. Optional article-body fetch improves the brief  
  5. LLM writes a short **grounded** answer from those sources only  

**Refresh timing**
- App cache: about **every 5 minutes**
- Publishers update their RSS on their own schedule (seconds → hours)

---

## Models & AI used

| Job | Model / service |
|-----|------------------|
| Grounded WhatsApp answers | **Groq** — `llama-3.3-70b-versatile` |
| Voice → text | **Groq Whisper** — `whisper-large-v3` |
| Embeddings / vector RAG | **Not used** |
| Live weather | Open-Meteo (+ geocoding) |
| Live crypto / FX helpers | Public market / FX APIs |
| Live gold | Live spot quote APIs |

Env needed: **`GROQ_API_KEY`** (Vercel + local if testing).

---

## How a WhatsApp question becomes a reply

### Text question
1. User sends DM to business WhatsApp  
2. WAHA webhook → n8n  
3. n8n → `POST /api/query` with `{ q: "..." }`  
4. API detects intent (weather / price / news)  
5. Builds `whatsappText`  
6. n8n → WAHA `sendText` back to user  

### Voice question
1. User sends voice note  
2. n8n downloads audio from WAHA (Docker network URL, with API key)  
3. n8n posts **base64 JSON** to `/api/transcribe`  
4. Whisper returns transcript text  
5. Same `/api/query` path as text  
6. Reply in the user’s language when possible  

### Language (Urdu / English)
- Detects **Nastaliq Urdu**, **Roman Urdu**, or **English** from the question (including voice transcripts).
- **Answer body** matches that language (`*جواب:*` / `*Answer:*`).
- **Sources** stay in English (title + short URL) so the user can open the publisher page.

---

## What the bot reply looks like

Typical news reply:

- `*NewsDash Analyst*`
- `*Topic:* …`
- `*Answer:*` / `*جواب:*` — short factual brief grounded in feeds  
- `*Sources*` / `*ذرائع:*` — story titles + **short clickable `https://` links**  
  - Links are shortened (e.g. TinyURL / is.gd / v.gd) when possible  
  - Tap opens the **real publisher article**

WhatsApp note:
- True “name-only underlined hyperlinks” (like a website `<a>` tag) are **not supported** in normal WhatsApp text.
- A visible short `https://…` link is what WhatsApp reliably makes blue/tappable.

---

## Live data plugins (not RSS)

- **Weather** (e.g. Peshawar) → live forecast for that city  
- **Gold price** → live spot (USD; PKR/tola may be shown as conversion)  
- **Bitcoin / Ethereum / Solana** → live price (+ simple follow-ups like `62899 or 62829?`)  
- Petrol pump price (Pakistan live) → may be marked unsupported; related oil news can still be shown  

---

## Deploy & local infra (typical)

| Component | Where |
|-----------|--------|
| NewsDash app / APIs | **Vercel** (`https://news-d.vercel.app`) |
| Code remote used for deploy | GitHub `NewsD` / `newsd` remote |
| WAHA | Docker on machine (`:3001`) |
| n8n | Docker on machine (`:5678`) |
| Workflow name | NewsDash → Ask Agent (DM) FIXED |

---

## Important design choices (explain these)

- **RSS + keyword rank** instead of RAG → faster, cheaper, fresher for breaking news.  
- **Same feed pool** for dashboard and WhatsApp → one source of truth.  
- **Grounded LLM** → answer from retrieved stories; don’t invent headlines.  
- **Voice via Groq Whisper** → WhatsApp PTT / ogg audio → text.  
- **Short URLs in Sources** → clickable without huge messy links.  
- **Language match** → Urdu question → Urdu answer; English → English.  

---

## Quick FAQ to tell someone

**“Where does the news come from?”**  
RSS feeds configured in NewsDash (not Google search, not a vector DB).

**“Which AI models?”**  
Groq Llama 3.3 for answers; Groq Whisper Large V3 for voice. No embeddings.

**“How does WhatsApp connect?”**  
WAHA listens to WhatsApp → n8n workflow → NewsDash `/api/query` → reply via WAHA.

**“Why do I still see a URL?”**  
WhatsApp text can’t hide the link and keep it tappable; short `https://` is the reliable click path.

**“How fresh is it?”**  
Feeds refresh about every 5 minutes on the app side; publishers update their RSS independently.

---

## Simple architecture diagram

```text
User (WhatsApp)
    │
    ▼
WAHA (NOWEB)  ──webhook──►  n8n Ask workflow
                                │
                    voice? ──► /api/transcribe (Whisper)
                                │
                                ▼
                         /api/query (NewsDash on Vercel)
                           │      │
                 live APIs ◄┘      └► RSS cache → rank → grounded answer
                                │
                                ▼
                         WAHA sendText → User
```

---

## What “done well” looks like

- User asks (text or voice) → **one clear reply**  
- Correct intent (weather/price/news)  
- Answer language matches the ask  
- Sources open the real article via short link  
- Dashboard and WhatsApp share the same news brain  

---

*This file is a product/tech explainer for demos and onboarding. Implementation details live in `src/app/api/query`, `src/app/api/transcribe`, `src/lib/feeds`, `src/lib/groq`, and the n8n Ask DM workflow.*
