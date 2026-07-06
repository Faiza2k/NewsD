#!/usr/bin/env python3
"""Extract RSS_FEEDS from NewsDashboard app.py and list feeds not in registry.ts."""
import re
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
APP_PY = ROOT / "_ref-newsdashboard" / "app.py"
REGISTRY = ROOT / "src" / "lib" / "feeds" / "registry.ts"
OUT = ROOT / "scripts" / "new-feeds.json"

content = APP_PY.read_text(encoding="utf-8")
start = content.index("RSS_FEEDS = [")
end = content.index("]\n\n# ── In-memory caches", start)
feeds = eval(content[start + len("RSS_FEEDS = ") : end + 1])

reg = REGISTRY.read_text(encoding="utf-8")
urls_in_registry = set(re.findall(r"url: '([^']+)'", reg))
ids_in_registry = set(re.findall(r"id: '([^']+)'", reg))

CAT_MAP = {
    "technology": "tech",
    "geopolitics": "global",
    "science": "research",
    "cybersecurity": "tech",
    "clouddevops": "github",
    "forex": "trading",
    "gold": "trading",
    "ai": "ai",
    "crypto": "crypto",
    "trading": "trading",
    "github": "github",
    "startups": "startups",
}


def norm_url(u: str) -> str:
    return u.rstrip("/").lower()


existing_urls = {norm_url(u) for u in urls_in_registry}
new_feeds = []

for feed in feeds:
    url = feed["url"]
    fid = feed["id"]
    if norm_url(url) in existing_urls:
        continue
    if fid.replace("_", "-") in ids_in_registry or fid in ids_in_registry:
        continue

    cat = CAT_MAP.get(feed["category"], "tech")
    sub_raw = feed.get("subcategory", "news")
    sub = re.sub(r"[^a-z0-9]+", "-", sub_raw.lower()).strip("-")[:40] or "news"

    new_feeds.append(
        {
            "id": fid.replace("_", "-"),
            "name": feed["source"],
            "url": url,
            "category": cat,
            "subcategories": [sub],
            "priority": 4 if feed["category"] in ("ai", "technology", "science") else 3,
        }
    )
    existing_urls.add(norm_url(url))

OUT.write_text(json.dumps(new_feeds, indent=2), encoding="utf-8")
print(f"Total in app.py: {len(feeds)}")
print(f"Current registry URLs: {len(urls_in_registry)}")
print(f"New feeds to add: {len(new_feeds)}")
print(f"Written to {OUT}")
