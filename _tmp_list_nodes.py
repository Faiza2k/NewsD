import sqlite3
import json
from datetime import datetime, timezone

DB = "/data/database.sqlite"
WF = "import-ask-dm-1783678000000"
VER = "d5487e7f-69d5-4782-8825-544db4147cfb"

db = sqlite3.connect(DB)
c = db.cursor()

for label, sql, args in [
    ("entity", "SELECT nodes, connections FROM workflow_entity WHERE id=?", (WF,)),
    ("history", "SELECT nodes, connections FROM workflow_history WHERE workflowId=? AND versionId=?", (WF, VER)),
]:
    row = c.execute(sql, args).fetchone()
    if not row:
        print(label, "MISSING")
        continue
    nodes = json.loads(row[0])
    print("====", label, "nodes", len(nodes))
    for n in nodes:
        print("-", n.get("name"), "|", n.get("type"), "| id=", n.get("id"), "| webhookId=", n.get("webhookId"))
        if "webhook" in str(n.get("type", "")).lower():
            print("  params", n.get("parameters"))

bak = sqlite3.connect("/data/database.sqlite.bak")
bc = bak.cursor()
print("BAK webhooks", list(bc.execute("SELECT * FROM webhook_entity")))
brow = bc.execute("SELECT nodes FROM workflow_entity WHERE id=?", (WF,)).fetchone()
if brow:
    for n in json.loads(brow[0]):
        print("BAK node", n.get("name"), n.get("type"), n.get("webhookId"))
bak.close()
db.close()
