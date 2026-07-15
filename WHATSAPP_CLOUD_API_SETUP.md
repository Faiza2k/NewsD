# WhatsApp Cloud API setup (Meta test number)

Use Meta’s **free test number** so your personal/business WhatsApp number is **never** registered.

Webhook URL (after deploy):

`https://news-d.vercel.app/api/whatsapp/webhook`

## 1) Meta console (you must do this)

1. Open [Meta for Developers](https://developers.facebook.com/) and sign in.
2. **My Apps** → **Create App** (or open an existing app) → type **Business**.
3. Add product **WhatsApp** → **API Setup**.
4. Meta shows a **test From number** (`+1 555 …`). Copy:
   - **Phone number ID** → `WHATSAPP_PHONE_NUMBER_ID`
   - **WhatsApp Business Account ID** (optional to store) → `WHATSAPP_WABA_ID`
   - **Temporary access token** → `WHATSAPP_ACCESS_TOKEN`  
     (replace later with a System User permanent token)
5. Under **To**, add your **personal** tester WhatsApp number(s) (allowlist, usually up to 5).
6. App → **WhatsApp** → **Configuration** (or App → Webhooks):
   - Callback URL: `https://news-d.vercel.app/api/whatsapp/webhook`
   - Verify token: any secret string you invent → same value as `WHATSAPP_VERIFY_TOKEN`
   - Subscribe to field: **messages**
7. (Recommended) App → Settings → Basic → copy **App Secret** → `WHATSAPP_APP_SECRET`

Official docs: [Get started](https://developers.facebook.com/docs/whatsapp/cloud-api/get-started), [Phone numbers](https://developers.facebook.com/docs/whatsapp/cloud-api/phone-numbers).

## 2) Vercel env vars

In the NewsDash Vercel project → Settings → Environment Variables:

| Name | Required | Notes |
|------|----------|--------|
| `WHATSAPP_VERIFY_TOKEN` | yes | Same string as Meta webhook verify token |
| `WHATSAPP_ACCESS_TOKEN` | yes | Graph API token |
| `WHATSAPP_PHONE_NUMBER_ID` | yes | Test (or later production) phone number ID |
| `WHATSAPP_APP_SECRET` | recommended | Validates `X-Hub-Signature-256` |
| `WHATSAPP_WABA_ID` | no | Handy for dashboard reference |
| `GROQ_API_KEY` | yes | Already used by `/api/query` |

Redeploy after saving env vars.

## 3) Test

1. Save webhook in Meta — verification `GET` must succeed.
2. From an **allowlisted** phone, message the Meta test number (e.g. `bitcoin price`).
3. NewsDash replies automatically via Cloud API (text only in phase 1).

## Later (many users)

Add a **second real number** (new SIM / VoIP that can receive Meta OTP) under WhatsApp → Phone numbers. Do **not** use your current business WhatsApp number if you want that inbox left alone.
