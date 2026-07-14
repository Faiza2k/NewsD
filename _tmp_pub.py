import sqlite3
import json
import sys

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
db = sqlite3.connect(r"d:\News_Dashboard\_n8n_chk.sqlite")
c = db.cursor()

print("published cols", [x[1] for x in c.execute("PRAGMA table_info(workflow_published_version)")])
print("history cols", [x[1] for x in c.execute("PRAGMA table_info(workflow_history)")])
print("PUBLISHED ROWS")
for r in c.execute("SELECT * FROM workflow_published_version"):
    print(tuple(str(x)[:80] for x in r))

wf = "import-ask-dm-1783678000000"
print("HISTORY")
for r in c.execute(
    "SELECT versionId, createdAt FROM workflow_history WHERE workflowId=? ORDER BY createdAt DESC LIMIT 5",
    (wf,),
):
    print(r)

# Get latest history nodes if stored
cols = [x[1] for x in c.execute("PRAGMA table_info(workflow_history)")]
print("hist cols full", cols)
row = c.execute(
    "SELECT * FROM workflow_history WHERE workflowId=? ORDER BY createdAt DESC LIMIT 1",
    (wf,),
).fetchone()
if row:
    data = dict(zip(cols, row))
    for k, v in data.items():
        if isinstance(v, str) and ("nodes" in k.lower() or k in ("nodes", "connections", "workflowData")):
            print("KEY", k, "len", len(v))
        elif k.lower() in ("nodes", "data", "snapshot", "workflowjson", "workflowdata"):
            print("KEY", k, type(v), str(v)[:100])
    # dump keys
    print({k: (type(v).__name__, (len(v) if isinstance(v, (str, bytes)) else v)) for k, v in data.items()})
