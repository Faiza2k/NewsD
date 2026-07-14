import sqlite3
import json
import uuid
from datetime import datetime, timezone

DB_HOST = r"d:\News_Dashboard\_n8n_fix_ask.sqlite"
# We'll patch a copy then docker cp into container

SRC = r"d:\News_Dashboard\_n8n_chk.sqlite"

import shutil

shutil.copy2(SRC, DB_HOST)

WF_ID = "import-ask-dm-1783678000000"
VERSION_ID = "d5487e7f-69d5-4782-8825-544db4147cfb"

FORMAT_CODE = r"""const q = String($('Parse Incoming Message').first().json.q || '');
const chatId = String($('Parse Incoming Message').first().json.chatId || '');
const resp = $input.first()?.json || {};

if (resp.error || resp.statusCode >= 400 || resp.code === 'ECONNABORTED' || String(resp.message || '').toLowerCase().includes('aborted')) {
  return [{ json: { chatId, text: '*NewsDash Analyst*\n\n*Topic:* ' + q + '\n\nNewsDash was busy. Please ask again in ~20 seconds.' } }];
}

const text = String(resp.whatsappText || '').trim();
if (text) {
  return [{ json: { chatId, text } }];
}

return [{ json: { chatId, text: '*NewsDash Analyst*\n\n*Topic:* ' + q + '\n\nNo matching headline in NewsDash right now.' } }];
"""

SEND_PARAMS = {
    "method": "POST",
    "url": "http://waha:3000/api/sendText",
    "sendBody": True,
    "specifyBody": "json",
    "jsonBody": "={{ JSON.stringify({ session: 'default', chatId: $json.chatId, text: $json.text, linkPreview: true }) }}",
    "options": {"timeout": 30000},
}


def patch_nodes(nodes):
    changed = False
    for n in nodes:
        name = n.get("name") or ""
        if name == "Format Reply":
            n.setdefault("parameters", {})["jsCode"] = FORMAT_CODE
            changed = True
        if name == "Send Reply":
            n["parameters"] = dict(SEND_PARAMS)
            changed = True
    return changed


db = sqlite3.connect(DB_HOST)
c = db.cursor()

row = c.execute("SELECT nodes FROM workflow_entity WHERE id=?", (WF_ID,)).fetchone()
nodes = json.loads(row[0])
assert patch_nodes(nodes)
c.execute(
    "UPDATE workflow_entity SET nodes=?, updatedAt=? WHERE id=?",
    (json.dumps(nodes), datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S.%f")[:-3], WF_ID),
)

h = c.execute(
    "SELECT nodes FROM workflow_history WHERE workflowId=? AND versionId=?",
    (WF_ID, VERSION_ID),
).fetchone()
if h:
    hnodes = json.loads(h[0])
    assert patch_nodes(hnodes)
    c.execute(
        "UPDATE workflow_history SET nodes=?, updatedAt=? WHERE workflowId=? AND versionId=?",
        (
            json.dumps(hnodes),
            datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S.%f")[:-3],
            WF_ID,
            VERSION_ID,
        ),
    )
    print("patched history", VERSION_ID)

# Ensure published pointer exists
pub = c.execute(
    "SELECT publishedVersionId FROM workflow_published_version WHERE workflowId=?",
    (WF_ID,),
).fetchone()
now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S.%f")[:-3]
if pub:
    c.execute(
        "UPDATE workflow_published_version SET publishedVersionId=?, updatedAt=? WHERE workflowId=?",
        (VERSION_ID, now, WF_ID),
    )
else:
    c.execute(
        "INSERT INTO workflow_published_version (workflowId, publishedVersionId, createdAt, updatedAt) VALUES (?,?,?,?)",
        (WF_ID, VERSION_ID, now, now),
    )
print("published ->", VERSION_ID)

db.commit()

# verify
nodes2 = json.loads(
    c.execute("SELECT nodes FROM workflow_entity WHERE id=?", (WF_ID,)).fetchone()[0]
)
for n in nodes2:
    if n["name"] == "Send Reply":
        print("Send URL", n["parameters"]["url"])
    if n["name"] == "Format Reply":
        print("Format has useCustomPreview?", "useCustomPreview" in n["parameters"]["jsCode"])

db.close()
print("OK wrote", DB_HOST)
