import sqlite3

db = sqlite3.connect("/data/database.sqlite")
c = db.cursor()
print("WEBHOOKS")
for r in c.execute("SELECT * FROM webhook_entity"):
    print(r)
print("ACTIVE")
for r in c.execute(
    "SELECT id, name, active, activeVersionId, versionId FROM workflow_entity WHERE active=1"
):
    print(r)
print("PUBLISHED")
for r in c.execute("SELECT * FROM workflow_published_version"):
    print(r)
print("ASK NODES CHECK")
raw = c.execute(
    "SELECT nodes FROM workflow_entity WHERE id=?",
    ("import-ask-dm-1783678000000",),
).fetchone()[0]
print("has custom preview", "link-custom-preview" in raw)
print("has sendText", "api/sendText" in raw)
db.close()
