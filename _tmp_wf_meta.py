import sqlite3
import json
import sys

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

def dump_wf(path):
    print("====", path)
    db = sqlite3.connect(path)
    c = db.cursor()
    row = c.execute(
        """SELECT id, active, versionId, activeVersionId, settings, staticData, pinData, meta, nodeGroups
           FROM workflow_entity WHERE id=?""",
        ("import-ask-dm-1783678000000",),
    ).fetchone()
    keys = [
        "id",
        "active",
        "versionId",
        "activeVersionId",
        "settings",
        "staticData",
        "pinData",
        "meta",
        "nodeGroups",
    ]
    data = dict(zip(keys, row))
    for k, v in data.items():
        print(k, "=>", repr(v)[:200] if isinstance(v, str) else v)
        if isinstance(v, str) and v.strip()[:1] in "{[":
            try:
                json.loads(v)
                print("  json OK")
            except Exception as e:
                print("  json BAD", e)
    pub = c.execute(
        "SELECT * FROM workflow_published_version WHERE workflowId=?",
        ("import-ask-dm-1783678000000",),
    ).fetchall()
    print("published", pub)
    db.close()

dump_wf(r"d:\News_Dashboard\_n8n_chk.sqlite")
dump_wf(r"d:\News_Dashboard\_n8n_fix_ask.sqlite")
