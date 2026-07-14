import sqlite3
import json
import sys

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

db = sqlite3.connect(r"d:\News_Dashboard\_n8n_chk.sqlite")
c = db.cursor()

active_id = "import-ask-dm-1783678000000"
row = c.execute(
    "SELECT id, name, active, nodes, connections FROM workflow_entity WHERE id=?",
    (active_id,),
).fetchone()
print("ACTIVE", row[0], row[1], bool(row[2]))
nodes = json.loads(row[3])
print("NODES")
for n in nodes:
    print("-", n.get("name"), "|", n.get("type"), "|", (n.get("parameters") or {}).get("path") or "")

for n in nodes:
    name = n.get("name") or ""
    params = n.get("parameters") or {}
    if "Parse" in name or "Code" in (n.get("type") or ""):
        print("\n====", name, "====")
        code = params.get("jsCode") or ""
        print(code[:5000])
    if "HTTP" in (n.get("type") or "") or "Query" in name or "Send" in name:
        print("\n====", name, "PARAMS ====")
        print(json.dumps(params, indent=2)[:2000])

print("\nEXECS for active wf")
for r in c.execute(
    """SELECT id, finished, mode, status, startedAt, stoppedAt
       FROM execution_entity
       WHERE workflowId=?
       ORDER BY startedAt DESC LIMIT 15""",
    (active_id,),
):
    print(
        json.dumps(
            {
                "id": r[0],
                "finished": r[1],
                "mode": r[2],
                "status": r[3],
                "started": str(r[4]),
                "stopped": str(r[5]),
            }
        )
    )

# Also check webhook workflow
wh = c.execute(
    "SELECT id, name, active, nodes FROM workflow_entity WHERE id=?",
    ("import-ask-dm-webhook-1783920000000",),
).fetchone()
print("\nWEBHOOK_WF", wh[0], wh[1], bool(wh[2]))
wnodes = json.loads(wh[3])
for n in wnodes:
    print("-", n.get("name"), "|", n.get("type"), "| path=", (n.get("parameters") or {}).get("path"))

# webhook_entity table?
print("\nTABLES")
for r in c.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"):
    if any(x in r[0].lower() for x in ("webhook", "exec", "workflow", "version", "history")):
        print(r[0])

try:
    for r in c.execute("SELECT workflowId, webhookPath, method FROM webhook_entity"):
        print("webhook_entity", r)
except Exception as e:
    print("no webhook_entity", e)
