import json
import sqlite3
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

PARSE = r'''const BASE_URL = 'https://news-d.vercel.app';
const BUSINESS = '923439798418@c.us';
const LIMIT = 2;

const root = $input.first()?.json || {};
// n8n webhook payloads vary: body may be nested
const body = root.body && typeof root.body === 'object' ? root.body : root;
const event = String(body.event || root.event || '');
const payload = (body.payload && typeof body.payload === 'object')
  ? body.payload
  : ((root.payload && typeof root.payload === 'object') ? root.payload : body);

if (event && event !== 'message' && event !== 'message.any') return [];
if (!payload || typeof payload !== 'object') return [];

// Never answer our own outbound messages (prevents loops / business self-chat noise)
if (payload.fromMe === true) return [];

const text = String(payload.body || payload.caption || '').trim();
if (!text) return [];
if (text.startsWith('NewsDash') || text.startsWith('*NewsDash') || text.startsWith('📰')) return [];
const lower = text.toLowerCase();
if (lower === 'hello' || lower === 'hi' || lower === 'ok' || lower === 'thanks' || lower === 'thank you') return [];

// Always reply to the SENDER (user). WhatsApp may use @lid or @c.us.
let chatId = String(payload.from || '').trim();
if (!chatId) return [];
if (chatId === BUSINESS) return [];

const msgId = typeof payload.id === 'string'
  ? payload.id
  : String((payload.id && (payload.id._serialized || payload.id.id)) || `${payload.timestamp || Date.now()}:${text.slice(0, 40)}`);

// Deduplicate rapid double-delivery from WAHA
try {
  const staticData = $getWorkflowStaticData('global');
  if (!staticData.seen) staticData.seen = {};
  const now = Date.now();
  if (staticData.seen[msgId] && now - Number(staticData.seen[msgId]) < 120000) return [];
  staticData.seen[msgId] = now;
  for (const k of Object.keys(staticData.seen)) {
    if (now - Number(staticData.seen[k]) > 6 * 60 * 60 * 1000) delete staticData.seen[k];
  }
} catch (e) {}

return [{
  json: {
    q: text,
    chatId,
    baseUrl: BASE_URL,
    limit: LIMIT,
    messageId: msgId,
  },
}];
'''

FIXED_ID = "import-ask-dm-1783678000000"
ACTIVE_VERSION = "d5487e7f-69d5-4782-8825-544db4147cfb"

db_path = Path(r"d:\News_Dashboard\_n8n_chk.sqlite")
# refresh from container if missing large - assume present from earlier copy; re-copy done by shell before

db = sqlite3.connect(str(db_path))


def patch_nodes(nodes):
    changed = False
    for n in nodes:
        if n.get("name") == "Parse Incoming Message":
            n.setdefault("parameters", {})["jsCode"] = PARSE
            changed = True
        if n.get("name") == "Query NewsDash":
            # faster timeout for snappy UX
            opts = n.setdefault("parameters", {}).setdefault("options", {})
            opts["timeout"] = 25000
            changed = True
    return changed


raw = db.execute("SELECT nodes FROM workflow_entity WHERE id=?", (FIXED_ID,)).fetchone()[0]
nodes = json.loads(raw)
if patch_nodes(nodes):
    db.execute(
        "UPDATE workflow_entity SET nodes=? WHERE id=?",
        (json.dumps(nodes, ensure_ascii=False), FIXED_ID),
    )
    print("entity patched")

h = db.execute("SELECT nodes FROM workflow_history WHERE versionId=?", (ACTIVE_VERSION,)).fetchone()
if h:
    hnodes = json.loads(h[0])
    if patch_nodes(hnodes):
        db.execute(
            "UPDATE workflow_history SET nodes=? WHERE versionId=?",
            (json.dumps(hnodes, ensure_ascii=False), ACTIVE_VERSION),
        )
        print("history patched")

db.commit()
db.close()
print("ok")
