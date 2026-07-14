import json
import sys
import urllib.request

sys.stdout.reconfigure(encoding="utf-8")
key = open(r"D:\n8n\.waha_api_key", encoding="utf-8").read().strip()

def get(url):
    req = urllib.request.Request(url, headers={"X-Api-Key": key})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read().decode("utf-8"))

s = get("http://127.0.0.1:3001/api/sessions/default")
print("session", s.get("status"), (s.get("engine") or {}).get("state"), (s.get("me") or {}).get("id"))

msgs = get("http://127.0.0.1:3001/api/default/chats/193277873631353@lid/messages?limit=20")
if not isinstance(msgs, list):
    msgs = msgs.get("messages") or msgs.get("data") or []

for m in msgs[:15]:
    who = "BOT" if m.get("fromMe") else "USER"
    if m.get("hasMedia"):
        media = m.get("media") or {}
        body = f"[MEDIA {media.get('mimetype')}] url={media.get('url')}"
    else:
        body = (m.get("body") or "").replace("\n", " / ")
    print(f"{who}: {body[:200]}")
