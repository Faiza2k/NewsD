import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(__dirname, '..', 'ask_agent_dm_dual_channel.n8n.json');

const parseCode = `const BASE_URL = 'https://news-d.vercel.app';
const BUSINESS = '923439798418@c.us';
const LIMIT = 3;

const ALLOWED = new Set([
  '923138308265@c.us',
  '193277873631353@lid',
]);

const root = $input.first()?.json || {};
const body = root.body || root;
const event = String(body.event || root.event || '');
const payload = body.payload || root.payload || body;

if (event && event !== 'message') return [];
if (!payload || typeof payload !== 'object') return [];
if (payload.fromMe) return [];

const from = String(payload.from || '').trim();
if (!from || from === BUSINESS) return [];

if (ALLOWED.size > 0 && !ALLOWED.has(from)) {
  const digits = from.replace(/\\D/g, '');
  const ok = [...ALLOWED].some((a) => {
    const ad = a.replace(/\\D/g, '');
    return ad && digits && (digits.includes(ad) || ad.includes(digits));
  });
  if (!ok) return [];
}

const text = String(payload.body || payload.caption || '').trim();
const media = payload.media || payload._data?.media || null;
const mime = String(
  (media && (media.mimetype || media.mime_type || media.mimeType)) ||
  payload.mimetype ||
  payload._data?.mimetype ||
  ''
).toLowerCase();
const msgType = String(payload.type || payload._data?.type || payload.message?.type || '').toLowerCase();
const hasMedia = Boolean(payload.hasMedia || media?.url || media?.link);
const isVoice =
  msgType === 'ptt' ||
  msgType === 'audio' ||
  msgType === 'voice' ||
  mime.startsWith('audio/') ||
  /\\b(ptt|audio|ogg|opus)\\b/i.test(mime);

let mediaUrl = '';
if (isVoice && hasMedia) {
  mediaUrl = String(
    media?.url ||
    media?.link ||
    media?.path ||
    payload.mediaUrl ||
    payload._data?.deprecatedMms3Url ||
    ''
  ).trim();
  if (mediaUrl && mediaUrl.startsWith('/')) {
    mediaUrl = 'http://waha:3000' + mediaUrl;
  } else if (mediaUrl && /^https?:\\/\\/(localhost|127\\.0\\.0\\.1)(:\\d+)?/i.test(mediaUrl)) {
    mediaUrl = mediaUrl.replace(/^https?:\\/\\/(localhost|127\\.0\\.0\\.1)(:\\d+)?/i, 'http://waha:3000');
  }
}

if (!text && !mediaUrl) return [];
if (text && (text.startsWith('NewsDash') || text.startsWith('*NewsDash'))) return [];

const msgId = typeof payload.id === 'string'
  ? payload.id
  : String((payload.id && (payload.id._serialized || payload.id.id)) || (payload.timestamp + ':' + (text || mediaUrl).slice(0, 40)));

try {
  const staticData = $getWorkflowStaticData('global');
  if (!staticData.seen) staticData.seen = {};
  if (staticData.seen[msgId]) return [];
  staticData.seen[msgId] = Date.now();
  const cutoff = Date.now() - 6 * 60 * 60 * 1000;
  for (const k of Object.keys(staticData.seen)) {
    if (staticData.seen[k] < cutoff) delete staticData.seen[k];
  }
} catch (e) {}

return [{
  json: {
    q: text,
    mediaUrl,
    mimeType: mime || (mediaUrl ? 'audio/ogg' : ''),
    needsTranscribe: Boolean(mediaUrl && !text),
    chatId: from,
    baseUrl: BASE_URL,
    limit: LIMIT,
    messageId: msgId,
  },
}];`;

const resolveCode = `const item = $input.first()?.json || {};
let q = String(item.q || '').trim();
let chatId = String(item.chatId || '');
const baseUrl = String(item.baseUrl || 'https://news-d.vercel.app');
const limit = item.limit || 3;
const mediaUrl = String(item.mediaUrl || '').trim();
const mimeType = String(item.mimeType || 'audio/ogg').split(';')[0].trim() || 'audio/ogg';

const LID_TO_CUS = {
  '193277873631353@lid': '923138308265@c.us',
};
if (LID_TO_CUS[chatId]) chatId = LID_TO_CUS[chatId];

const failHear = () => ([{
  json: {
    chatId,
    baseUrl,
    limit,
    q: '',
    skipQuery: true,
    whatsappText: '*NewsDash Analyst*\\n\\nCould not hear that - please retry or type your question.',
  },
}]);

let voiceLang = '';
if ((!q || item.needsTranscribe) && mediaUrl) {
  try {
    const audio = await this.helpers.httpRequest({
      method: 'GET',
      url: mediaUrl,
      encoding: 'arraybuffer',
      returnFullResponse: false,
      json: false,
      timeout: 30000,
    });
    const buf = Buffer.isBuffer(audio)
      ? audio
      : Buffer.from(audio?.data || audio || []);
    if (!buf.length) return failHear();

    const ext = mimeType.includes('mpeg') || mimeType.includes('mp3')
      ? 'mp3'
      : mimeType.includes('mp4') || mimeType.includes('m4a')
        ? 'm4a'
        : mimeType.includes('wav')
          ? 'wav'
          : 'ogg';

    const resp = await this.helpers.httpRequest({
      method: 'POST',
      url: baseUrl + '/api/transcribe',
      headers: {},
      formData: {
        file: {
          value: buf,
          options: { filename: 'voice.' + ext, contentType: mimeType },
        },
      },
      json: true,
      timeout: 60000,
    });
    q = String(resp?.text || '').trim();
    voiceLang = String(resp?.language || '').trim();
    if (!q) return failHear();
  } catch (e) {
    return failHear();
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
      whatsappText: '*NewsDash Analyst*\\n\\nPlease send a short text or voice question.',
    },
  }];
}

let previousQ = '';
let previousIntent = '';
let historyTurns = [];
try {
  const staticData = $getWorkflowStaticData('global');
  if (!staticData.lastQ) staticData.lastQ = {};
  if (!staticData.lastIntent) staticData.lastIntent = {};
  if (!staticData.history) staticData.history = {};
  previousQ = String(staticData.lastQ[chatId] || '');
  previousIntent = String(staticData.lastIntent[chatId] || '');
  historyTurns = Array.isArray(staticData.history[chatId]) ? staticData.history[chatId].slice(-8) : [];
} catch (e) {}

return [{ json: { q, chatId, baseUrl, limit, previousQ, previousIntent, history: historyTurns, skipQuery: false, voiceLang } }];`;

const formatCode = `const resolved = $('Resolve Text Query').first().json || {};
const resp = $('Query NewsDash').first()?.json || {};
const chatId = String(resolved.chatId || '');
const q = String(resolved.q || '');

if (resolved.skipQuery && resolved.whatsappText) {
  return [{ json: { chatId, text: String(resolved.whatsappText) } }];
}

let text = String(resp?.whatsappText || '').trim();
if (!text) {
  text = '*NewsDash Analyst*\\n\\nSorry, could not get a response right now. Please try again.';
}

try {
  const staticData = $getWorkflowStaticData('global');
  if (!staticData.lastQ) staticData.lastQ = {};
  if (!staticData.lastIntent) staticData.lastIntent = {};
  if (!staticData.history) staticData.history = {};
  const remember = String(resp.effectiveQuery || resp.rawQuery || q || '').trim();
  if (chatId && remember && resp.intent !== 'clarify' && resp.intent !== 'greeting') {
    staticData.lastQ[chatId] = remember.slice(0, 400);
    staticData.lastIntent[chatId] = String(resp.intent || '').slice(0, 40);
    const hist = Array.isArray(staticData.history[chatId]) ? staticData.history[chatId] : [];
    hist.push({ role: 'user', content: q.slice(0, 400) });
    hist.push({ role: 'assistant', content: text.slice(0, 500) });
    staticData.history[chatId] = hist.slice(-8);
  }
} catch (e) {}

return [{ json: { chatId, text } }];`;

const wf = {
  id: 'import-ask-dm-dual-channel',
  name: 'NewsDash Ask (WhatsApp DM — dual channel)',
  nodes: [
    {
      id: 'webhook',
      name: 'WAHA Message Webhook',
      type: 'n8n-nodes-base.webhook',
      typeVersion: 2,
      position: [0, 300],
      webhookId: 'newsdash-ask',
      parameters: { httpMethod: 'POST', path: 'newsdash-ask', responseMode: 'onReceived', options: {} },
    },
    {
      id: 'parse',
      name: 'Parse Incoming Message',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [240, 300],
      parameters: { mode: 'runOnceForAllItems', jsCode: parseCode },
    },
    {
      id: 'resolve',
      name: 'Resolve Text Query',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [500, 300],
      parameters: { mode: 'runOnceForAllItems', jsCode: resolveCode },
    },
    {
      id: 'query',
      name: 'Query NewsDash',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.2,
      position: [760, 300],
      continueOnFail: true,
      retryOnFail: true,
      maxTries: 2,
      waitBetweenTries: 2000,
      parameters: {
        method: 'POST',
        url: '={{ $json.baseUrl + "/api/query" }}',
        sendBody: true,
        specifyBody: 'json',
        jsonBody:
          '={{ JSON.stringify({ q: $json.q, limit: $json.limit || 3, chatId: $json.chatId || "", previousQ: $json.previousQ || "", previousIntent: $json.previousIntent || "", history: $json.history || [], lang: $json.voiceLang || "" }) }}',
        options: { timeout: 90000 },
      },
    },
    {
      id: 'format',
      name: 'Format Reply',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [1020, 300],
      parameters: { mode: 'runOnceForAllItems', jsCode: formatCode },
    },
    {
      id: 'send',
      name: 'Send Reply',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.2,
      position: [1280, 300],
      continueOnFail: true,
      parameters: {
        method: 'POST',
        url: 'http://waha:3000/api/sendText',
        sendBody: true,
        specifyBody: 'json',
        jsonBody:
          '={{ JSON.stringify({ session: "default", chatId: $json.chatId, text: $json.text, linkPreview: true }) }}',
        options: { timeout: 30000 },
      },
    },
  ],
  connections: {
    'WAHA Message Webhook': { main: [[{ node: 'Parse Incoming Message', type: 'main', index: 0 }]] },
    'Parse Incoming Message': { main: [[{ node: 'Resolve Text Query', type: 'main', index: 0 }]] },
    'Resolve Text Query': { main: [[{ node: 'Query NewsDash', type: 'main', index: 0 }]] },
    'Query NewsDash': { main: [[{ node: 'Format Reply', type: 'main', index: 0 }]] },
    'Format Reply': { main: [[{ node: 'Send Reply', type: 'main', index: 0 }]] },
  },
  settings: { executionTimeout: 180, timezone: 'Asia/Karachi', executionOrder: 'v1', binaryMode: 'separate' },
  pinData: {},
};

fs.writeFileSync(out, JSON.stringify(wf, null, 2));
console.log('wrote', out);
