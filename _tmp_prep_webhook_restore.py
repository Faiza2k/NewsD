import json
import shutil
import sqlite3
import sys
from datetime import datetime, timezone

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

CHK = r"d:\News_Dashboard\_n8n_chk.sqlite"
OUT = r"d:\News_Dashboard\_n8n_restore_webhook.sqlite"

WF = "import-ask-dm-1783678000000"
VER = "d5487e7f-69d5-4782-8825-544db4147cfb"

# Inspect source
src = sqlite3.connect(CHK)
sc = src.cursor()
for wid in [WF, "import-ask-dm-webhook-1783920000000"]:
    row = sc.execute("SELECT name, active, nodes FROM workflow_entity WHERE id=?", (wid,)).fetchone()
    nodes = json.loads(row[2])
    print("SRC", wid, row[0], "active", row[1])
    for n in nodes:
        print(" -", n.get("name"), "|", n.get("type"), "|", (n.get("parameters") or {}).get("path"))
    print(" custom-preview?", "link-custom-preview" in row[2])

# Prefer FIXED if it has webhook, else WEBHOOK workflow nodes
fixed_nodes_raw = sc.execute("SELECT nodes FROM workflow_entity WHERE id=?", (WF,)).fetchone()[0]
if "n8n-nodes-base.webhook" in fixed_nodes_raw:
    source_wf = WF
else:
    source_wf = "import-ask-dm-webhook-1783920000000"

nodes_raw, connections_raw, settings, name = sc.execute(
    "SELECT nodes, connections, settings, name FROM workflow_entity WHERE id=?",
    (source_wf,),
).fetchone()

# Surgical sendText fix
old_url = "={{ $json.useCustomPreview ? 'http://waha:3000/api/send/link-custom-preview' : 'http://waha:3000/api/sendText' }}"
new_url = "http://waha:3000/api/sendText"
if old_url in nodes_raw:
    nodes_raw = nodes_raw.replace(old_url, new_url)
old_body = "={{ $json.useCustomPreview ? JSON.stringify({ session: 'default', chatId: $json.chatId, text: $json.text, linkPreviewHighQuality: true, preview: { url: $json.previewUrl, title: $json.previewTitle, description: $json.previewDescription } }) : JSON.stringify({ session: 'default', chatId: $json.chatId, text: $json.text, linkPreview: true, linkPreviewHighQuality: true }) }}"
new_body = "={{ JSON.stringify({ session: 'default', chatId: $json.chatId, text: $json.text, linkPreview: true }) }}"
if old_body in nodes_raw:
    nodes_raw = nodes_raw.replace(old_body, new_body)
nodes_raw = nodes_raw.replace("useCustomPreview: Boolean(preview)", "useCustomPreview: false")

nodes = json.loads(nodes_raw)
wh = next(n for n in nodes if n.get("type") == "n8n-nodes-base.webhook")
webhook_id = wh.get("webhookId") or wh.get("id") or "newsdash-ask"
path = (wh.get("parameters") or {}).get("path") or "newsdash-ask"
print("Using source", source_wf, "webhookId", webhook_id, "path", path)
assert "link-custom-preview" not in nodes_raw
src.close()

# Build restore DB from current volume snapshot first? We'll patch volume directly via docker.
# Write a small payload file for the volume patcher.
payload = {
    "wf": WF,
    "ver": VER,
    "name": "NewsDash -> Ask Agent (DM) FIXED",
    "nodes": nodes_raw,
    "connections": connections_raw,
    "settings": settings
    or '{"executionTimeout":180,"timezone":"Asia/Karachi","executionOrder":"v1","binaryMode":"separate"}',
    "webhookId": webhook_id,
    "webhookPath": path,
    "webhookNode": wh.get("name") or "WAHA Message Webhook",
}
with open(r"d:\News_Dashboard\_tmp_webhook_payload.json", "w", encoding="utf-8") as f:
    json.dump(payload, f)
print("wrote payload")
