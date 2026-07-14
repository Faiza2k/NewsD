import sqlite3
import json
import sys

sys.stdout.reconfigure(encoding="utf-8")
c = sqlite3.connect(r"d:\News_Dashboard\_n8n_chk_exec.sqlite")
tables = [r[0] for r in c.execute("SELECT name FROM sqlite_master WHERE type='table'")]
print("tables:", [t for t in tables if "exec" in t.lower() or "workflow" in t.lower()])

# Try common n8n execution tables
for t in tables:
    if "execution" in t.lower():
        cols = [r[1] for r in c.execute(f"PRAGMA table_info({t})")]
        print(t, cols[:20])

rows = c.execute(
    """
    SELECT id, workflowId, status, mode, startedAt, stoppedAt
    FROM execution_entity
    ORDER BY startedAt DESC
    LIMIT 8
    """
).fetchall()
print("executions:")
for r in rows:
    print(r)
