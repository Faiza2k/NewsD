import json
import sqlite3
import sys
import zlib

sys.stdout.reconfigure(encoding="utf-8")
c = sqlite3.connect(r"d:\News_Dashboard\_n8n_chk_exec.sqlite")
rows = c.execute(
    """
    SELECT id, workflowId, status, startedAt, stoppedAt
    FROM execution_entity
    ORDER BY startedAt DESC
    LIMIT 15
    """
).fetchall()
print("all recent:")
for r in rows:
    print(r)

# Inspect latest ask-ish
eid = rows[0][0]
raw = c.execute("SELECT data FROM execution_data WHERE executionId=?", (str(eid),)).fetchone()[0]
if isinstance(raw, memoryview):
    raw = raw.tobytes()
if isinstance(raw, bytes):
    try:
        text = raw.decode("utf-8")
    except Exception:
        text = zlib.decompress(raw).decode("utf-8")
else:
    text = str(raw)
print("raw start:", text[:200])
data = json.loads(text[text.find("[") if text.strip().startswith("[") or text.find("{\"version")<0 and text.find("[")==0 else text.find("{") :])
# n8n 2.x format often: [version, dataObj] or just object
if isinstance(data, list):
    print("list len", len(data), "types", [type(x).__name__ for x in data[:3]])
    payload = None
    for x in data:
        if isinstance(x, dict) and ("resultData" in x or "runData" in x or "executionData" in x):
            payload = x
            break
        if isinstance(x, dict) and "resultData" in str(x.keys()):
            payload = x
    if payload is None and len(data) >= 2 and isinstance(data[1], dict):
        payload = data[1]
    data = payload or {}
print("top keys", list(data.keys())[:30] if isinstance(data, dict) else type(data))
run = {}
if isinstance(data, dict):
    run = ((data.get("resultData") or {}).get("runData")) or data.get("runData") or {}
    if not run and "executionData" in data:
        run = ((data["executionData"].get("resultData") or {}).get("runData")) or {}
print("nodes", list(run.keys()) if isinstance(run, dict) else run)
