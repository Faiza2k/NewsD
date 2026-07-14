from pathlib import Path

p = Path(r"D:\n8n\NewsDash_Ask_Agent_DM.json")
text = p.read_text(encoding="utf-8")

needle = (
    "if (mediaUrl && mediaUrl.startsWith('/')) {\\n"
    "    mediaUrl = 'http://waha:3000' + mediaUrl;\\n"
    "  }"
)
insert = (
    needle
    + "\\n  // WAHA returns http://localhost:3000/... which is unreachable from the n8n container.\\n"
    + "  mediaUrl = mediaUrl.replace(/https?:\\\\/\\\\/(localhost|127\\\\.0\\\\.0\\\\.1):(3000|3001)/gi, 'http://waha:3000');"
)

if needle not in text:
    raise SystemExit("needle not found: " + repr(text[text.find("mediaUrl.startsWith") : text.find("mediaUrl.startsWith") + 250]))

if "mediaUrl.replace(/https?" in text:
    print("already patched")
else:
    text = text.replace(needle, insert, 1)
    p.write_text(text, encoding="utf-8")
    print("patched workflow JSON")
