import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

WF = "import-ask-dm-1783678000000"
EXPORT = Path("/tmp/NewsDash_Ask_Agent_DM.json")
DB = Path("/data/database.sqlite")

export = json.loads(EXPORT.read_text(encoding="utf-8"))[0]
new_nodes = export["nodes"]
new_connections = export["connections"]

db = sqlite3.connect(DB)
cur = db.cursor()
row = cur.execute("SELECT nodes FROM workflow_entity WHERE id=?", (WF,)).fetchone()
if not row:
    raise SystemExit(f"missing workflow {WF}")

live_nodes = json.loads(row[0])
live_by_name = {n["name"]: n for n in live_nodes}
for n in new_nodes:
    if n["name"] == "WAHA Message Webhook" and n["name"] in live_by_name:
        live = live_by_name[n["name"]]
        n["webhookId"] = live.get("webhookId", n.get("webhookId"))
        path = live.get("parameters", {}).get("path")
        if path:
            n.setdefault("parameters", {})["path"] = path

nodes_json = json.dumps(new_nodes, ensure_ascii=False)
conn_json = json.dumps(new_connections, ensure_ascii=False)
now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S.%f")[:-3]

cur.execute(
    "UPDATE workflow_entity SET nodes=?, connections=?, updatedAt=?, active=1, name=? WHERE id=?",
    (nodes_json, conn_json, now, "NewsDash → Ask Agent (DM) FIXED", WF),
)
cur.execute(
    "UPDATE workflow_entity SET active=0, updatedAt=? WHERE id!=? AND (name LIKE '%Ask Agent%' OR name LIKE '%ask%')",
    (now, WF),
)

hist = cur.execute(
    "SELECT versionId FROM workflow_history WHERE workflowId=? ORDER BY createdAt DESC LIMIT 1",
    (WF,),
).fetchone()
if hist:
    cur.execute(
        "UPDATE workflow_history SET nodes=?, connections=? WHERE workflowId=? AND versionId=?",
        (nodes_json, conn_json, WF, hist[0]),
    )

db.commit()
nodes = json.loads(cur.execute("SELECT nodes FROM workflow_entity WHERE id=?", (WF,)).fetchone()[0])
code = next(x["parameters"]["jsCode"] for x in nodes if x["name"] == "Resolve Text Query")
active = cur.execute("SELECT active FROM workflow_entity WHERE id=?", (WF,)).fetchone()[0]
print("audioBase64=", "audioBase64" in code)
print("formData=", "formData" in code)
print("active=", active)
db.close()
