import sqlite3
import json
from datetime import datetime, timezone
import uuid

DB = "/data/database.sqlite"
WF = "import-ask-dm-1783678000000"
VER = "d5487e7f-69d5-4782-8825-544db4147cfb"

db = sqlite3.connect(DB)
c = db.cursor()

print("webhook cols", [x[1] for x in c.execute("PRAGMA table_info(webhook_entity)")])
print("current webhooks", list(c.execute("SELECT * FROM webhook_entity")))

# Find webhook node id/webhookId from workflow nodes
raw = c.execute("SELECT nodes FROM workflow_entity WHERE id=?", (WF,)).fetchone()[0]
nodes = json.loads(raw)
wh = next(n for n in nodes if n.get("type") == "n8n-nodes-base.webhook")
print("webhook node", json.dumps({k: wh.get(k) for k in ("id", "name", "webhookId", "parameters")}, indent=2)[:1200])

cols = [x[1] for x in c.execute("PRAGMA table_info(webhook_entity)")]
print("COL DETAIL")
for x in c.execute("PRAGMA table_info(webhook_entity)"):
    print(x)

# Also check bak for sample row shape if available
try:
    bak = sqlite3.connect("/data/database.sqlite.bak")
    bc = bak.cursor()
    print("BAK webhooks", list(bc.execute("SELECT * FROM webhook_entity")))
    bak.close()
except Exception as e:
    print("bak err", e)

db.close()
