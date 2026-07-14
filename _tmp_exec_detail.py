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
    WHERE workflowId='import-ask-dm-1783678000000'
    ORDER BY startedAt DESC
    LIMIT 5
    """
).fetchall()
print("recent ask execs:", rows)

for eid, *_ in rows[:3]:
    raw = c.execute(
        "SELECT data FROM execution_data WHERE executionId=?", (str(eid),)
    ).fetchone()
    if not raw:
        print(eid, "no data")
        continue
    blob = raw[0]
    if isinstance(blob, memoryview):
        blob = blob.tobytes()
    if isinstance(blob, bytes):
        try:
            text = blob.decode("utf-8")
        except Exception:
            try:
                text = zlib.decompress(blob).decode("utf-8")
            except Exception as e:
                print(eid, "decode fail", e)
                continue
    else:
        text = str(blob)
    try:
        data = json.loads(text)
    except Exception:
        # n8n sometimes stores JSON with version prefix
        idx = text.find("{")
        data = json.loads(text[idx:]) if idx >= 0 else None
    if not data:
        print(eid, "no json")
        continue
    # Walk resultData.runData for node outputs
    run = (((data.get("resultData") or {}).get("runData")) or {})
    print("\n=== exec", eid, "nodes", list(run.keys()))
    for name in [
        "Parse Incoming Message",
        "Resolve Text Query",
        "Query NewsDash",
        "Format Reply",
        "Send Reply",
    ]:
        if name not in run:
            continue
        try:
            item = run[name][0]["data"]["main"][0][0]["json"]
        except Exception:
            # error?
            err = None
            try:
                err = run[name][0].get("error")
            except Exception:
                pass
            print(name, "ERR", err)
            continue
        keys = list(item.keys())
        slim = {k: item.get(k) for k in keys if k in (
            "q", "mediaUrl", "mimeType", "needsTranscribe", "skipQuery",
            "chatId", "whatsappText", "text", "error", "intent", "total",
            "displayTopic", "brief",
        )}
        if "whatsappText" in item and item["whatsappText"]:
            slim["whatsappText"] = str(item["whatsappText"])[:180]
        if "text" in item and item["text"]:
            slim["text"] = str(item["text"])[:180]
        print(name, json.dumps(slim, ensure_ascii=False)[:500])
