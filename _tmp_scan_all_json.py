import sqlite3
import json
import sys
import re

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

path = r"d:\News_Dashboard\_n8n_fix_ask.sqlite"
db = sqlite3.connect(path)
c = db.cursor()

for table in [r[0] for r in c.execute("SELECT name FROM sqlite_master WHERE type='table'")]:
    cols = [r[1] for r in c.execute(f"PRAGMA table_info({table})")]
    text_cols = [
        col
        for col, typ in [(r[1], r[2]) for r in c.execute(f"PRAGMA table_info({table})")]
        if typ.upper() in ("TEXT", "VARCHAR", "NVARCHAR", "")
    ]
    for col in text_cols:
        try:
            rows = c.execute(f"SELECT rowid, {col} FROM {table}").fetchall()
        except Exception:
            continue
        for rowid, val in rows:
            if not isinstance(val, str):
                continue
            s = val.strip()
            if not (s.startswith("{") or s.startswith("[")):
                continue
            try:
                json.loads(s)
            except Exception as e:
                print(f"BAD {table}.{col} rowid={rowid}: {e}")
                print(repr(s[max(0, 760) : 830]))

print("scan done")
db.close()
