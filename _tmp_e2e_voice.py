"""E2E: download last voice from WAHA chats OR synthesize ogg, base64→Vercel transcribe→query."""
import base64
import json
import os
import subprocess
import sys
import urllib.request

KEY = open(r"D:\n8n\.waha_api_key", encoding="utf-8").read().strip()
WAHA = "http://localhost:3001"
VERCEL = "https://news-d.vercel.app"
CHAT = "923138308265@c.us"


def http(method, url, data=None, headers=None, binary=False):
    h = dict(headers or {})
    body = None
    if data is not None:
        if isinstance(data, (bytes, bytearray)):
            body = data
        else:
            body = json.dumps(data).encode("utf-8")
            h.setdefault("Content-Type", "application/json")
    req = urllib.request.Request(url, data=body, headers=h, method=method)
    with urllib.request.urlopen(req, timeout=90) as r:
        raw = r.read()
        return raw if binary else json.loads(raw.decode("utf-8"))


def find_voice_media():
    # Recent messages for test chat
    url = f"{WAHA}/api/default/chats/{CHAT}/messages?limit=40"
    try:
        msgs = http("GET", url, headers={"X-Api-Key": KEY})
    except Exception as e:
        print("chat messages fail", e)
        return None, None
    if not isinstance(msgs, list):
        msgs = msgs.get("messages") or msgs.get("data") or []
    for m in msgs:
        body = m.get("body") or m.get("_data") or {}
        if isinstance(body, dict):
            has_media = body.get("hasMedia") or m.get("hasMedia")
            media = body.get("media") or m.get("media") or {}
            mimetype = (media.get("mimetype") or media.get("mimeType") or "")
            url_m = media.get("url") or ""
            if has_media and ("audio" in mimetype or "ogg" in mimetype or "ptt" in str(m.get("type", ""))):
                return url_m, mimetype
        # WAHA message shape
        if m.get("hasMedia") and (
            "audio" in str(m.get("media", {})).lower()
            or m.get("fromMe") is False
            and m.get("media")
        ):
            media = m.get("media") or {}
            return media.get("url"), media.get("mimetype") or "audio/ogg"
    # dump one sample for debug
    print("sample msg keys", list(msgs[0].keys()) if msgs else None)
    if msgs:
        print(json.dumps(msgs[0], default=str)[:800])
    return None, None


def main():
    media_url, mime = find_voice_media()
    print("found media", media_url, mime)

    buf = None
    if media_url:
        u = media_url
        if u.startswith("/"):
            u = "http://localhost:3001" + u
        u = u.replace("http://waha:3000", "http://localhost:3001")
        try:
            buf = http("GET", u, headers={"X-Api-Key": KEY}, binary=True)
            print("downloaded bytes", len(buf))
        except Exception as e:
            print("download fail", e)

    if not buf:
        # Fallback: use any local oga if present
        for p in [
            r"d:\News_Dashboard\_tmp_voice.oga",
            r"d:\News_Dashboard\waha-default-qr.png",  # not audio
        ]:
            if os.path.exists(p) and p.endswith((".oga", ".ogg", ".mp3", ".wav", ".m4a")):
                buf = open(p, "rb").read()
                print("using local", p, len(buf))
                break

    if not buf:
        print("NO_AUDIO — will still test query intelligence")
        for q in [
            "Fish hour weather",
            "62899 or 62829 ?",
            "Tell me about btc price is increasing or decreasing",
            "Iran war",
            "Weather today of Peshawar",
        ]:
            r = http("POST", f"{VERCEL}/api/query", {"q": q, "limit": 2})
            preview = (r.get("whatsappText") or "")[:280].replace("\n", " | ")
            print(f"Q={q!r} intent={r.get('intent')} => {preview}")
        return 1

    # Test base64 transcribe on Vercel (current + after deploy)
    b64 = base64.b64encode(buf).decode("ascii")
    try:
        tr = http(
            "POST",
            f"{VERCEL}/api/transcribe",
            {"audioBase64": b64, "mimeType": mime or "audio/ogg", "filename": "voice.ogg"},
        )
        print("TRANSCRIBE", tr)
        q = (tr.get("text") or "").strip()
    except Exception as e:
        print("TRANSCRIBE_FAIL", e)
        # try reading body
        import urllib.error

        if isinstance(e, urllib.error.HTTPError):
            print(e.read().decode("utf-8", errors="replace")[:500])
        return 2

    if not q:
        print("empty transcript")
        return 3

    r = http("POST", f"{VERCEL}/api/query", {"q": q, "limit": 2})
    print("QUERY intent=", r.get("intent"))
    print(r.get("whatsappText") or r)
    return 0


if __name__ == "__main__":
    sys.exit(main() or 0)
