"""Patch n8n Ask workflow via docker cp + host python (n8n image has no python)."""
import json
import sqlite3
import subprocess
import tempfile
from datetime import datetime, timezone
from pathlib import Path

WF = "import-ask-dm-1783678000000"
EXPORT = Path(r"D:/n8n/NewsDash_Ask_Agent_DM.json")
CONTAINER = "newsdash-n8n"
REMOTE_DB = "/home/node/.n8n/database.sqlite"

export = json.loads(EXPORT.read_text(encoding="utf-8"))[0]
new_nodes = export["nodes"]
new_connections = export["connections"]

# Stop n8n so sqlite is not locked / WAL-safe
subprocess.check_call(["docker", "stop", CONTAINER])

with tempfile.TemporaryDirectory() as td:
    local_db = Path(td) / "database.sqlite"
    subprocess.check_call(["docker", "cp", f"{CONTAINER}:{REMOTE_DB}", str(local_db)])
    # Also copy wal/shm if present
    for suffix in ("-wal", "-shm"):
        try:
            subprocess.check_call(
                ["docker", "cp", f"{CONTAINER}:{REMOTE_DB}{suffix}", str(local_db) + suffix],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
        except subprocess.CalledProcessError:
            pass

    db = sqlite3.connect(local_db)
    cur = db.cursor()
    row = cur.execute("SELECT nodes FROM workflow_entity WHERE id=?", (WF,)).fetchone()
    if not row:
        raise SystemExit(f"missing workflow {WF}")

    live_nodes = json.loads(row[0])
    live_by_name = {n["name"]: n for n in live_nodes}
    for n in new_nodes:
        if n["name"] == "WAHA Message Webhook" and n["name"] in live_by_name:
            live = live_by_name[n["name"]]
            n["webhookId"] = live.get("webhookId", n.get("webhookId"))
            path = live.get("parameters", {}).get("path")
            if path:
                n.setdefault("parameters", {})["path"] = path

    nodes_json = json.dumps(new_nodes, ensure_ascii=False)
    conn_json = json.dumps(new_connections, ensure_ascii=False)
    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S.%f")[:-3]

    cur.execute(
        "UPDATE workflow_entity SET nodes=?, connections=?, updatedAt=?, active=1, name=? WHERE id=?",
        (nodes_json, conn_json, now, "NewsDash → Ask Agent (DM) FIXED", WF),
    )
    cur.execute(
        "UPDATE workflow_entity SET active=0, updatedAt=? WHERE id!=? AND (name LIKE '%Ask Agent%' OR name LIKE '%ask%')",
        (now, WF),
    )
    hist = cur.execute(
        "SELECT versionId FROM workflow_history WHERE workflowId=? ORDER BY createdAt DESC LIMIT 1",
        (WF,),
    ).fetchone()
    if hist:
        cur.execute(
            "UPDATE workflow_history SET nodes=?, connections=? WHERE workflowId=? AND versionId=?",
            (nodes_json, conn_json, WF, hist[0]),
        )
    db.commit()

    code = next(
        x["parameters"]["jsCode"]
        for x in json.loads(cur.execute("SELECT nodes FROM workflow_entity WHERE id=?", (WF,)).fetchone()[0])
        if x["name"] == "Resolve Text Query"
    )
    print("audioBase64=", "audioBase64" in code, "formData=", "formData" in code)
    db.close()

    # Remove WAL so container uses our clean db
    for suffix in ("-wal", "-shm"):
        p = Path(str(local_db) + suffix)
        if p.exists():
            p.unlink()

    subprocess.check_call(["docker", "cp", str(local_db), f"{CONTAINER}:{REMOTE_DB}"])
    # Drop stale wal/shm in container
    subprocess.check_call(
        [
            "docker",
            "start",
            CONTAINER,
        ]
    )
    subprocess.check_call(
        [
            "docker",
            "exec",
            "-u",
            "root",
            CONTAINER,
            "sh",
            "-c",
            f"rm -f {REMOTE_DB}-wal {REMOTE_DB}-shm; chown 1000:1000 {REMOTE_DB}",
        ]
    )
    subprocess.check_call(["docker", "restart", CONTAINER])
    print("n8n patched and restarted")
