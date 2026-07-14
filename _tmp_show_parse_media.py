import json
import sqlite3
import sys

sys.stdout.reconfigure(encoding="utf-8")
c = sqlite3.connect(r"d:\News_Dashboard\_n8n_voice_chk.sqlite")
nodes = json.loads(
    c.execute(
        "select nodes from workflow_entity where id=?",
        ("import-ask-dm-1783678000000",),
    ).fetchone()[0]
)
pc = next(n["parameters"]["jsCode"] for n in nodes if n["name"] == "Parse Incoming Message")
start = pc.find("let mediaUrl")
print(pc[start : start + 1100])
