import json
import sqlite3
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")

DB = Path(r"d:\News_Dashboard\_n8n_live.sqlite")
WF = "import-ask-dm-1783678000000"
EXPORT = Path(r"D:\n8n\NewsDash_Ask_Agent_DM.json")

export = json.loads(EXPORT.read_text(encoding="utf-8"))[0]
new_nodes = export["nodes"]
new_connections = export["connections"]

# Keep webhook path/id from live if present; overlay our node graph by name.
db = sqlite3.connect(DB)
cur = db.cursor()
raw_nodes, raw_conn = cur.execute(
    "SELECT nodes, connections FROM workflow_entity WHERE id=?", (WF,)
).fetchone()
live_nodes = json.loads(raw_nodes)

# Preserve live webhookId / path from existing webhook node
live_by_name = {n["name"]: n for n in live_nodes}
for n in new_nodes:
    if n["name"] in live_by_name and n["name"] == "WAHA Message Webhook":
        live = live_by_name[n["name"]]
        n["webhookId"] = live.get("webhookId", n.get("webhookId"))
        # keep live path if set
        if live.get("parameters", {}).get("path"):
            n.setdefault("parameters", {})["path"] = live["parameters"]["path"]

nodes_json = json.dumps(new_nodes, ensure_ascii=False)
conn_json = json.dumps(new_connections, ensure_ascii=False)
now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S.%f")[:-3]

cur.execute(
    "UPDATE workflow_entity SET nodes=?, connections=?, updatedAt=?, name=? WHERE id=?",
    (nodes_json, conn_json, now, "NewsDash → Ask Agent (DM) FIXED", WF),
)

# Patch latest history row if exists
hist = cur.execute(
    "SELECT versionId FROM workflow_history WHERE workflowId=? ORDER BY createdAt DESC LIMIT 1",
    (WF,),
).fetchone()
if hist:
    cur.execute(
        "UPDATE workflow_history SET nodes=?, connections=? WHERE workflowId=? AND versionId=?",
        (nodes_json, conn_json, WF, hist[0]),
    )
    print("patched history", hist[0])

db.commit()

# Verify
nodes = json.loads(
    cur.execute("SELECT nodes FROM workflow_entity WHERE id=?", (WF,)).fetchone()[0]
)
names = [n["name"] for n in nodes]
assert "Resolve Text Query" in names
assert "Parse Incoming Message" in names
send = next(n for n in nodes if n["name"] == "Send Reply")
assert send["parameters"]["url"] == "http://waha:3000/api/sendText"
resolve = next(n for n in nodes if n["name"] == "Resolve Text Query")
assert "api/transcribe" in resolve["parameters"]["jsCode"]
assert "formData" in resolve["parameters"]["jsCode"]
print("OK nodes:", names)
db.close()
