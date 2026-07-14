import json
from pathlib import Path

RESOLVE_JS = r"""const item = $input.first()?.json || {};
let q = String(item.q || '').trim();
const chatId = String(item.chatId || '');
const baseUrl = String(item.baseUrl || 'https://news-d.vercel.app');
const limit = item.limit || 2;
let mediaUrl = String(item.mediaUrl || '').trim();
const mimeType = String(item.mimeType || 'audio/ogg').split(';')[0].trim() || 'audio/ogg';
const wahaKey = String($env.WAHA_API_KEY || '');

// Always rewrite host-local WAHA media URLs so n8n (Docker) can download them.
if (mediaUrl.startsWith('/')) mediaUrl = 'http://waha:3000' + mediaUrl;
mediaUrl = mediaUrl.replace(/https?:\/\/(localhost|127\.0\.0\.1):(3000|3001)/gi, 'http://waha:3000');

const failHear = (reason) => ([{
  json: {
    chatId,
    baseUrl,
    limit,
    q: '',
    skipQuery: true,
    whatsappText: '*NewsDash Analyst*\n\nCouldn’t hear that—please retry or type your question.',
    voiceError: String(reason || ''),
  },
}]);

if ((!q || item.needsTranscribe) && mediaUrl) {
  try {
    const audioResp = await this.helpers.httpRequest({
      method: 'GET',
      url: mediaUrl,
      headers: wahaKey ? { 'X-Api-Key': wahaKey } : {},
      encoding: 'arraybuffer',
      returnFullResponse: true,
      json: false,
      timeout: 30000,
    });
    const raw = audioResp?.body ?? audioResp;
    let buf;
    if (Buffer.isBuffer(raw)) buf = raw;
    else if (raw instanceof ArrayBuffer) buf = Buffer.from(raw);
    else if (ArrayBuffer.isView(raw)) buf = Buffer.from(raw.buffer);
    else if (typeof raw === 'string') buf = Buffer.from(raw, 'binary');
    else if (raw?.data) buf = Buffer.from(raw.data);
    else buf = Buffer.from([]);

    if (!buf.length) return failHear('empty-audio from ' + mediaUrl);

    const ext = mimeType.includes('mpeg') || mimeType.includes('mp3')
      ? 'mp3'
      : mimeType.includes('mp4') || mimeType.includes('m4a')
        ? 'm4a'
        : mimeType.includes('wav')
          ? 'wav'
          : 'ogg';

    // Prefer JSON base64 (reliable). Avoid n8n formData quirks.
    const resp = await this.helpers.httpRequest({
      method: 'POST',
      url: baseUrl + '/api/transcribe',
      headers: { 'Content-Type': 'application/json' },
      body: {
        audioBase64: buf.toString('base64'),
        mimeType,
        filename: 'voice.' + ext,
      },
      json: true,
      timeout: 60000,
    });
    q = String(resp?.text || '').trim();
    if (!q) return failHear('empty-transcript');
  } catch (e) {
    return failHear((e && (e.message || e.statusCode || e)) || 'transcribe-failed');
  }
}

if (!q || q.length < 2) {
  return [{
    json: {
      chatId,
      baseUrl,
      limit,
      q: '',
      skipQuery: true,
      whatsappText: '*NewsDash Analyst*\n\nPlease send a short text or voice question.',
    },
  }];
}

return [{ json: { q, chatId, baseUrl, limit, skipQuery: false } }];
"""

wf_path = Path(r"D:/n8n/NewsDash_Ask_Agent_DM.json")
data = json.loads(wf_path.read_text(encoding="utf-8"))
for n in data[0]["nodes"]:
    if n["name"] == "Resolve Text Query":
        n["parameters"]["jsCode"] = RESOLVE_JS
    if n["name"] == "Send Reply":
        n["parameters"]["sendHeaders"] = True
        n["parameters"]["specifyHeaders"] = "keypair"
        n["parameters"]["headerParameters"] = {
            "parameters": [{"name": "X-Api-Key", "value": "={{ $env.WAHA_API_KEY }}"}]
        }
wf_path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
print("workflow resolve updated to audioBase64")
