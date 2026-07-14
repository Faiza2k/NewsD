import sqlite3
import json
import sys

db = sqlite3.connect(r"d:\News_Dashboard\_n8n_chk.sqlite")
c = db.cursor()

print("WORKFLOWS")
for r in c.execute(
    "SELECT id, name, active FROM workflow_entity ORDER BY updatedAt DESC LIMIT 25"
):
    print(json.dumps({"id": r[0], "name": r[1], "active": bool(r[2])}))

rows = list(
    c.execute(
        "SELECT id, name, active, nodes FROM workflow_entity WHERE lower(name) LIKE '%ask%'"
    )
)
print("ASK_COUNT", len(rows))
for r in rows:
    print("ASK", r[0], r[1], bool(r[2]))
    nodes = json.loads(r[3])
    print("NODES")
    for n in nodes:
        print(n.get("name"), "|", n.get("type"))
    for n in nodes:
        name = n.get("name") or ""
        if "Parse" in name:
            print("=== PARSE CODE ===")
            print((n.get("parameters") or {}).get("jsCode", "")[:4000])
        if any(x in name for x in ("Query", "Format", "Send")):
            print("===", name, "===")
            print(json.dumps(n.get("parameters") or {}, indent=2)[:1200])

print("EXECS")
for r in c.execute(
    "SELECT id, workflowId, finished, mode, status, startedAt, stoppedAt FROM execution_entity ORDER BY startedAt DESC LIMIT 12"
):
    print(
        json.dumps(
            {
                "id": r[0],
                "wf": r[1],
                "finished": r[2],
                "mode": r[3],
                "status": r[4],
                "started": str(r[5]),
                "stopped": str(r[6]),
            }
        )
    )

# published versions
print("VERSIONS")
try:
    for r in c.execute(
        "SELECT id, workflowId, name, versionId FROM workflow_history ORDER BY createdAt DESC LIMIT 10"
    ):
        print(json.dumps({"id": r[0], "wf": r[1], "name": r[2], "versionId": r[3]}))
except Exception as e:
    print("history_err", e)
    for row in c.execute("SELECT name FROM sqlite_master WHERE type='table'"):
        if "work" in row[0].lower() or "exec" in row[0].lower() or "version" in row[0].lower():
            print("table", row[0])
