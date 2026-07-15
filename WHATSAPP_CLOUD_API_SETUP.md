# WhatsApp Cloud API — live path (not your business WhatsApp)

Users message a **Meta bot number**. Your personal/business WhatsApp is **never** linked.

Webhook (already deployed):

```text
https://news-d.vercel.app/api/whatsapp/webhook
```

Pre-chosen verify token (use exactly this in Meta + Vercel):

```text
newsdash_cloud_verify_x9k2m
```

---

## A) What I already did in code

- Webhook route: `GET` (Meta verify + health) + `POST` (inbound → `/api/query` → reply)
- Session memory via `chatId` (user phone)
- Read receipts, media soft-reject (“send text for now”)
- Health check: open the webhook URL in a browser — JSON shows which env vars are set

---

## B) What only you can click (≈10 minutes)

I cannot log into your Facebook/Meta account. Do this once:

### 1. Add WhatsApp product
1. Open [developers.facebook.com](https://developers.facebook.com/) → app **NewsDash**
2. **Use cases** → **Connect with customers through WhatsApp** → continue until **API Setup**
3. Create/select a **Meta Business** portfolio if asked  
   (**Do not** add your current business WhatsApp number)

### 2. Copy Meta credentials (test number)
On **WhatsApp → API Setup**:

| Field in Meta | Env name on Vercel |
|---------------|--------------------|
| Temporary access token | `WHATSAPP_ACCESS_TOKEN` |
| Phone number ID | `WHATSAPP_PHONE_NUMBER_ID` |
| WhatsApp Business Account ID (optional) | `WHATSAPP_WABA_ID` |

Also: **App settings → Basic → App secret** → `WHATSAPP_APP_SECRET`

### 3. Allowlist your phone
On API Setup → **To** / test recipients: add **your personal WhatsApp** and confirm OTP.  
(This is only who may message the *test* bot — not registering your business number.)

### 4. Webhook
**WhatsApp → Configuration** → Webhooks → Edit:

- Callback URL: `https://news-d.vercel.app/api/whatsapp/webhook`
- Verify token: `newsdash_cloud_verify_x9k2m`
- Subscribe: **messages**
- Click **Verify and save** (must go green)

### 5. Vercel env vars
Vercel → NewsDash project → Settings → Environment Variables → Production:

```text
WHATSAPP_VERIFY_TOKEN=newsdash_cloud_verify_x9k2m
WHATSAPP_ACCESS_TOKEN=<paste from Meta>
WHATSAPP_PHONE_NUMBER_ID=<paste from Meta>
WHATSAPP_APP_SECRET=<paste from Meta App settings>
```

Redeploy (Deployments → … → Redeploy) after saving.

### 6. Test
1. Browser: `https://news-d.vercel.app/api/whatsapp/webhook` → `"configured": true`
2. WhatsApp: message Meta’s **test** number (shown on API Setup), e.g. `bitcoin price`
3. Reply comes from the **test** number — your business WhatsApp inbox stays empty

---

## C) Later (public users)

- Replace temporary token with a **System User** permanent token
- Add a **new** phone number (new SIM) — still never your current business WhatsApp
- App Review / publish when ready

---

## D) Stop WAHA when Cloud works

Once Cloud replies reliably, stop linking WAHA to your business phone so users only use the Meta bot number.
