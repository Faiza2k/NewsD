import sqlite3
import json
import sys

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
db = sqlite3.connect(r"d:\News_Dashboard\_n8n_chk.sqlite")
c = db.cursor()
row = c.execute(
    "SELECT nodes FROM workflow_entity WHERE id=?",
    ("import-ask-dm-1783678000000",),
).fetchone()
nodes = json.loads(row[0])
for n in nodes:
    if n.get("name") == "Format Reply":
        print(n["parameters"].get("jsCode", ""))
