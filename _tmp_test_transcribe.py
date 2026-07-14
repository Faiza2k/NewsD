import json
import os
import sys
import urllib.request
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")
key = Path(r"D:\n8n\.waha_api_key").read_text(encoding="utf-8").strip()
url = "http://127.0.0.1:3001/api/files/default/false_193277873631353@lid_AC611BF43C8A437041EBC5F8E89F54DF.oga"
out = Path(r"D:\News_Dashboard\_tmp_voice.oga")

req = urllib.request.Request(url, headers={"X-Api-Key": key})
try:
    with urllib.request.urlopen(req, timeout=30) as r:
        data = r.read()
        ctype = r.headers.get("Content-Type")
    out.write_bytes(data)
    print("download_ok", len(data), "ctype", ctype)
except Exception as e:
    print("download_fail", e)
    raise SystemExit(1)

# multipart upload helper
import uuid

def post_multipart(endpoint: str, file_path: Path, mime: str = "audio/ogg"):
    boundary = "----Boundary" + uuid.uuid4().hex
    file_bytes = file_path.read_bytes()
    body = b""
    body += f"--{boundary}\r\n".encode()
    body += b'Content-Disposition: form-data; name="file"; filename="voice.ogg"\r\n'
    body += f"Content-Type: {mime}\r\n\r\n".encode()
    body += file_bytes + b"\r\n"
    body += f"--{boundary}--\r\n".encode()
    req = urllib.request.Request(
        endpoint,
        data=body,
        headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=90) as r:
            raw = r.read().decode("utf-8", errors="replace")
            print(endpoint, "status", r.status, raw[:500])
            return raw
    except urllib.error.HTTPError as e:
        raw = e.read().decode("utf-8", errors="replace")
        print(endpoint, "HTTP", e.code, raw[:800])
        return raw

print("--- local ---")
post_multipart("http://127.0.0.1:3000/api/transcribe", out)
print("--- vercel ---")
post_multipart("https://news-d.vercel.app/api/transcribe", out)
