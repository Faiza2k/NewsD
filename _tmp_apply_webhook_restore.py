import json
import sqlite3
from datetime import datetime, timezone

DB = "/data/database.sqlite"
PAYLOAD = "/work/_tmp_webhook_payload.json"

with open(PAYLOAD, encoding="utf-8") as f:
    p = json.load(f)

WF = p["wf"]
VER = p["ver"]
now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S.%f")[:-3]

db = sqlite3.connect(DB)
c = db.cursor()

# Ensure FIXED workflow exists and is webhook-based
c.execute(
    """
    UPDATE workflow_entity
    SET name=?, active=1, nodes=?, connections=?, settings=?,
        versionId=?, activeVersionId=?, updatedAt=?, isArchived=0
    WHERE id=?
    """,
    (
        "NewsDash → Ask Agent (DM) FIXED",
        p["nodes"],
        p["connections"],
        p["settings"],
        VER,
        VER,
        now,
        WF,
    ),
)
print("updated entity rows", c.rowcount)

# Update matching history version if present; else insert
hist = c.execute(
    "SELECT versionId FROM workflow_history WHERE workflowId=? AND versionId=?",
    (WF, VER),
).fetchone()
if hist:
    c.execute(
        "UPDATE workflow_history SET nodes=?, connections=?, name=?, updatedAt=? WHERE workflowId=? AND versionId=?",
        (p["nodes"], p["connections"], "NewsDash → Ask Agent (DM) FIXED", now, WF, VER),
    )
    print("updated history")
else:
    c.execute(
        """
        INSERT INTO workflow_history
        (versionId, workflowId, authors, createdAt, updatedAt, nodes, connections, name, autosaved, description, nodeGroups)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, '', '[]')
        """,
        (
            VER,
            WF,
            "restore",
            now,
            now,
            p["nodes"],
            p["connections"],
            "NewsDash → Ask Agent (DM) FIXED",
        ),
    )
    print("inserted history")

# Deactivate other ask workflows
c.execute(
    "UPDATE workflow_entity SET active=0, updatedAt=? WHERE id != ? AND lower(name) LIKE '%ask%'",
    (now, WF),
)

# Register webhook
c.execute("DELETE FROM webhook_entity WHERE webhookPath=? OR workflowId=?", (p["webhookPath"], WF))
c.execute(
    """
    INSERT INTO webhook_entity (workflowId, webhookPath, method, node, webhookId, pathLength)
    VALUES (?, ?, 'POST', ?, ?, ?)
    """,
    (
        WF,
        p["webhookPath"],
        p["webhookNode"],
        p["webhookId"],
        len(str(p["webhookPath"]).split("/")),
    ),
)
print("webhook registered", p["webhookPath"])

# Optional published pointer
pub = c.execute(
    "SELECT publishedVersionId FROM workflow_published_version WHERE workflowId=?",
    (WF,),
).fetchone()
if pub:
    c.execute(
        "UPDATE workflow_published_version SET publishedVersionId=?, updatedAt=? WHERE workflowId=?",
        (VER, now, WF),
    )
else:
    c.execute(
        "INSERT INTO workflow_published_version (workflowId, publishedVersionId, createdAt, updatedAt) VALUES (?,?,?,?)",
        (WF, VER, now, now),
    )

db.commit()

# verify
raw = c.execute("SELECT nodes FROM workflow_entity WHERE id=?", (WF,)).fetchone()[0]
print("has webhook node", "n8n-nodes-base.webhook" in raw)
print("has custom preview", "link-custom-preview" in raw)
print("webhooks", list(c.execute("SELECT * FROM webhook_entity")))
db.close()
print("DONE")
