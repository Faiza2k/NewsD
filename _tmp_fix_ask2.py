import shutil
import sqlite3
import json
from datetime import datetime, timezone

SRC = r"d:\News_Dashboard\_n8n_chk.sqlite"
OUT = r"d:\News_Dashboard\_n8n_fix_ask2.sqlite"
shutil.copy2(SRC, OUT)

WF = "import-ask-dm-1783678000000"
VER = "d5487e7f-69d5-4782-8825-544db4147cfb"


def patch_nodes_json(raw: str) -> str:
    # Keep original JSON encoding; only swap the broken custom-preview path.
    old_url = "={{ $json.useCustomPreview ? 'http://waha:3000/api/send/link-custom-preview' : 'http://waha:3000/api/sendText' }}"
    if old_url not in raw:
        raise SystemExit("Send URL expression not found")
    raw = raw.replace(old_url, "http://waha:3000/api/sendText")

    old_body = "={{ $json.useCustomPreview ? JSON.stringify({ session: 'default', chatId: $json.chatId, text: $json.text, linkPreviewHighQuality: true, preview: { url: $json.previewUrl, title: $json.previewTitle, description: $json.previewDescription } }) : JSON.stringify({ session: 'default', chatId: $json.chatId, text: $json.text, linkPreview: true, linkPreviewHighQuality: true }) }}"
    new_body = "={{ JSON.stringify({ session: 'default', chatId: $json.chatId, text: $json.text, linkPreview: true }) }}"
    if old_body not in raw:
        raise SystemExit("Send body expression not found")
    raw = raw.replace(old_body, new_body)

    old_flag = "useCustomPreview: Boolean(preview)"
    new_flag = "useCustomPreview: false"
    if old_flag not in raw:
        raise SystemExit("useCustomPreview flag not found")
    raw = raw.replace(old_flag, new_flag)

    # Validate
    nodes = json.loads(raw)
    send = next(n for n in nodes if n["name"] == "Send Reply")
    fmt = next(n for n in nodes if n["name"] == "Format Reply")
    assert send["parameters"]["url"] == "http://waha:3000/api/sendText"
    assert "useCustomPreview: false" in fmt["parameters"]["jsCode"]
    assert "link-custom-preview" not in raw
    return raw


db = sqlite3.connect(OUT)
c = db.cursor()
now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S.%f")[:-3]

for table, where, args in [
    ("workflow_entity", "id=?", (WF,)),
    ("workflow_history", "workflowId=? AND versionId=?", (WF, VER)),
]:
    raw = c.execute(f"SELECT nodes FROM {table} WHERE {where}", args).fetchone()[0]
    patched = patch_nodes_json(raw)
    c.execute(f"UPDATE {table} SET nodes=?, updatedAt=? WHERE {where}", (patched, now, *args))
    print("patched", table)

# Do NOT insert published version row — original had none
db.commit()
db.close()
print("OK", OUT)
