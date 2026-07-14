import sqlite3
import json
import sys

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

def inspect(path):
    db = sqlite3.connect(path)
    c = db.cursor()
    raw = c.execute(
        "SELECT nodes FROM workflow_entity WHERE id=?",
        ("import-ask-dm-1783678000000",),
    ).fetchone()[0]
    print(path, "len", len(raw))
    print("pos791 context:", repr(raw[770:820]))
    # find control chars inside JSON strings (naive)
    for i, ch in enumerate(raw):
        if ord(ch) < 32 and ch not in "\r\n\t":
            print("ctrl at", i, ord(ch))
            print(repr(raw[max(0, i - 40) : i + 40]))
            break
    else:
        print("no weird ctrl chars (except maybe tab/newline as structure)")
    # Check if raw contains literal newlines (pretty-printed)
    print("has literal newlines", "\n" in raw)
    print("starts", raw[:40])
    db.close()

inspect(r"d:\News_Dashboard\_n8n_chk.sqlite")
inspect(r"d:\News_Dashboard\_n8n_fix_ask.sqlite")
