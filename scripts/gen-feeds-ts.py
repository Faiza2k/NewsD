#!/usr/bin/env python3
"""Generate newsdashboard-feeds.ts from new-feeds.json."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "scripts" / "new-feeds.json"
OUT = ROOT / "src" / "lib" / "feeds" / "newsdashboard-feeds.ts"

feeds = json.loads(DATA.read_text(encoding="utf-8"))

lines = [
    "import type { FeedSource } from '@/types';",
    "",
    "/** RSS feeds ported from Faiza2k/NewsDashboard app.py (deduped against base registry). */",
    "export const NEWSDASHBOARD_FEEDS: FeedSource[] = [",
]

for f in feeds:
    subs = ", ".join(f"'{s}'" for s in f["subcategories"])
    lines.append(
        f"  {{ id: '{f['id']}', name: '{f['name'].replace(chr(39), chr(92)+chr(39))}', "
        f"url: '{f['url']}', category: '{f['category']}', subcategories: [{subs}], priority: {f['priority']} }},"
    )

lines.append("];")
lines.append("")

OUT.write_text("\n".join(lines), encoding="utf-8")
print(f"Wrote {len(feeds)} feeds to {OUT}")
