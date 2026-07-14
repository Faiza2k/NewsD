import sqlite3
import json
import sys

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
db = sqlite3.connect(r"d:\News_Dashboard\_n8n_chk.sqlite")
c = db.cursor()

print("WEBHOOK_ENTITY")
for r in c.execute("SELECT * FROM webhook_entity"):
    print(r)

print("\nALL RECENT EXECS")
for r in c.execute(
    """SELECT id, workflowId, finished, mode, status, startedAt, stoppedAt
       FROM execution_entity ORDER BY startedAt DESC LIMIT 20"""
):
    print(json.dumps({"id": r[0], "wf": r[1], "finished": r[2], "mode": r[3], "status": r[4], "started": str(r[5])}))

print("\nPUBLISHED")
try:
    cols = [x[1] for x in c.execute("PRAGMA table_info(workflow_published_version)")]
    print("cols", cols)
    for r in c.execute("SELECT * FROM workflow_published_version LIMIT 10"):
        print(r[:6] if len(r) > 6 else r)
except Exception as e:
    print(e)

print("\nPUBLICATION_TRIGGER")
try:
    for r in c.execute("SELECT * FROM workflow_publication_trigger_status LIMIT 20"):
        print(r)
except Exception as e:
    print(e)
