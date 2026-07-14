import json
import sqlite3
import sys

sys.stdout.reconfigure(encoding="utf-8")
c = sqlite3.connect(r"d:\News_Dashboard\_n8n_voice_chk.sqlite")
row = c.execute(
    "select nodes from workflow_entity where id=?",
    ("import-ask-dm-1783678000000",),
).fetchone()
if not row:
    print("workflow missing")
    raise SystemExit(1)
nodes = json.loads(row[0])
parse = next(n for n in nodes if n["name"] == "Parse Incoming Message")
resolve = next(n for n in nodes if n["name"] == "Resolve Text Query")
pc = parse["parameters"]["jsCode"]
rc = resolve["parameters"]["jsCode"]
print("parse_has_localhost_rewrite", "localhost" in pc and "replace" in pc and "waha:3000" in pc)
print("resolve_has_transcribe", "api/transcribe" in rc)
print("resolve_formData", "formData" in rc)
i = pc.find("mediaUrl = mediaUrl.replace")
print("rewrite_snippet:", repr(pc[i : i + 200]) if i >= 0 else "MISSING")
