import json
import sqlite3
import sys

sys.stdout.reconfigure(encoding="utf-8")
# Will be run against a fresh docker cp after n8n is healthy — only for listing.
c = sqlite3.connect(r"d:\News_Dashboard\_n8n_after_restore.sqlite")
for r in c.execute("select id,name,active from workflow_entity"):
    print(repr(r))
