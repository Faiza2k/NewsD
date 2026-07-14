import sqlite3
import json
from datetime import datetime, timezone

DB = "/data/database.sqlite"
WF = "import-ask-dm-1783678000000"
VER = "d5487e7f-69d5-4782-8825-544db4147cfb"


def patch_nodes_json(raw: str) -> str:
    old_url = "={{ $json.useCustomPreview ? 'http://waha:3000/api/send/link-custom-preview' : 'http://waha:3000/api/sendText' }}"
    new_url = "http://waha:3000/api/sendText"
    if old_url not in raw:
        # maybe already patched
        if '"url": "http://waha:3000/api/sendText"' in raw or '"url":"http://waha:3000/api/sendText"' in raw:
            print("URL already fixed")
        else:
            raise SystemExit("Send URL expression not found")
    else:
        raw = raw.replace(old_url, new_url)

    old_body = "={{ $json.useCustomPreview ? JSON.stringify({ session: 'default', chatId: $json.chatId, text: $json.text, linkPreviewHighQuality: true, preview: { url: $json.previewUrl, title: $json.previewTitle, description: $json.previewDescription } }) : JSON.stringify({ session: 'default', chatId: $json.chatId, text: $json.text, linkPreview: true, linkPreviewHighQuality: true }) }}"
    new_body = "={{ JSON.stringify({ session: 'default', chatId: $json.chatId, text: $json.text, linkPreview: true }) }}"
    if old_body in raw:
        raw = raw.replace(old_body, new_body)
    else:
        print("body expr missing or already patched")

    old_flag = "useCustomPreview: Boolean(preview)"
    if old_flag in raw:
        raw = raw.replace(old_flag, "useCustomPreview: false")
    else:
        print("flag missing or already patched")

    nodes = json.loads(raw)
    send = next(n for n in nodes if n["name"] == "Send Reply")
    assert "link-custom-preview" not in send["parameters"]["url"]
    assert "sendText" in send["parameters"]["url"]
    return raw


db = sqlite3.connect(DB)
c = db.cursor()
now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S.%f")[:-3]

# ensure workflow active
c.execute("UPDATE workflow_entity SET active=1, updatedAt=? WHERE id=?", (now, WF))

for table, where, args in [
    ("workflow_entity", "id=?", (WF,)),
    ("workflow_history", "workflowId=? AND versionId=?", (WF, VER)),
]:
    row = c.execute(f"SELECT nodes FROM {table} WHERE {where}", args).fetchone()
    if not row:
        print("skip missing", table)
        continue
    patched = patch_nodes_json(row[0])
    c.execute(f"UPDATE {table} SET nodes=?, updatedAt=? WHERE {where}", (patched, now, *args))
    print("patched", table)

# deactivate other ask workflows that might conflict on same webhook path
c.execute(
    "UPDATE workflow_entity SET active=0 WHERE id != ? AND lower(name) LIKE '%ask%'",
    (WF,),
)

db.commit()
db.close()
print("DONE")
