import sqlite3
import json
import sys

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

# Diagnose corruption in patched db
for path in [
    r"d:\News_Dashboard\_n8n_fix_ask.sqlite",
    r"d:\News_Dashboard\_n8n_chk.sqlite",
]:
    print("====", path)
    db = sqlite3.connect(path)
    c = db.cursor()
    for wf in c.execute("SELECT id, name, nodes FROM workflow_entity"):
        raw = wf[2]
        try:
            nodes = json.loads(raw)
            # re-dump and parse to validate
            json.loads(json.dumps(nodes))
            print("OK", wf[0], "nodes", len(nodes))
        except Exception as e:
            print("BAD entity", wf[0], e)
            print("around", repr(raw[760:820]))
    for h in c.execute(
        "SELECT versionId, workflowId, nodes FROM workflow_history WHERE workflowId=?",
        ("import-ask-dm-1783678000000",),
    ):
        try:
            json.loads(h[2])
            print("OK hist", h[0][:8])
        except Exception as e:
            print("BAD hist", h[0], e)
            print("around", repr(h[2][760:820]))
    db.close()
