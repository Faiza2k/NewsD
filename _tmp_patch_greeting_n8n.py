import sqlite3
from datetime import datetime, timezone

DB = "/data/database.sqlite"
WF = "import-ask-dm-1783678000000"
VER = "d5487e7f-69d5-4782-8825-544db4147cfb"

OLD = "if (lower === 'hello' || lower === 'hi' || lower === 'ok' || lower === 'thanks' || lower === 'thank you') return [];"
# Allow greetings through so /api/query can answer professionally.
NEW = "// greetings handled by NewsDash /api/query"

db = sqlite3.connect(DB)
c = db.cursor()
now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S.%f")[:-3]
for table, where, args in [
    ("workflow_entity", "id=?", (WF,)),
    ("workflow_history", "workflowId=? AND versionId=?", (WF, VER)),
]:
    row = c.execute(f"SELECT nodes FROM {table} WHERE {where}", args).fetchone()
    if not row:
        print("missing", table)
        continue
    raw = row[0]
    if OLD not in raw:
        print(table, "greeting filter not found or already patched")
        continue
    raw = raw.replace(OLD, NEW)
    c.execute(f"UPDATE {table} SET nodes=?, updatedAt=? WHERE {where}", (raw, now, *args))
    print("patched", table)
db.commit()
db.close()
print("DONE")
