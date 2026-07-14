import json
import sqlite3
import sys

sys.stdout.reconfigure(encoding="utf-8")
c = sqlite3.connect(r"d:\News_Dashboard\_n8n_verify.sqlite")
row = c.execute(
    "select nodes from workflow_entity where id=?",
    ("import-ask-dm-1783678000000",),
).fetchone()
nodes = json.loads(row[0])
print([n["name"] for n in nodes])
print(
    "has_transcribe",
    any("api/transcribe" in n.get("parameters", {}).get("jsCode", "") for n in nodes),
)
print(
    "sendText_only",
    next(n for n in nodes if n["name"] == "Send Reply")["parameters"]["url"],
)
