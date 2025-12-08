"""Simple checker for local links and assets in static HTML files.

This script scans all ``.html`` files in the repository and reports any
``href`` or ``src`` references that point to local files that do not
exist. External links (http, mailto, etc.) and in-page anchors are
ignored.

Usage::

    python scripts/check_links.py

"""
from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
HTML_PATTERN = re.compile(r"(?:href|src)=['\"]([^'\"]+)['\"]", re.IGNORECASE)
SKIP_PREFIXES = (
    "http://",
    "https://",
    "mailto:",
    "tel:",
    "javascript:",
    "data:",
    "whatsapp:",
    "sms:",
)


def normalize_link(link: str) -> str:
    """Remove fragments and query strings from a link."""
    link = link.split("#", 1)[0]
    link = link.split("?", 1)[0]
    return link.strip()


def resolve_path(base_file: Path, link: str) -> Path | None:
    """Resolve a link to an absolute path within the repository.

    Returns ``None`` for anchors or links outside the repo root.
    """
    if not link or link.startswith(SKIP_PREFIXES) or link.startswith("#"):
        return None

    target = ROOT / link.lstrip("/") if link.startswith("/") else (base_file.parent / link).resolve()
    try:
        target.relative_to(ROOT)
    except ValueError:
        return None
    return target


def find_missing_links(html_file: Path) -> list[str]:
    """Return a list of missing link targets for a given HTML file."""
    content = html_file.read_text(encoding="utf-8", errors="ignore")
    missing: list[str] = []

    for raw in HTML_PATTERN.findall(content):
        link = normalize_link(raw)
        target = resolve_path(html_file, link)
        if target is None:
            continue
        if not target.exists():
            missing.append(raw)
    return missing


def main() -> int:
    html_files = sorted(ROOT.rglob("*.html"))
    total_missing = 0

    for html_file in html_files:
        missing_links = find_missing_links(html_file)
        if not missing_links:
            continue

        total_missing += len(missing_links)
        print(f"[MISSING] {html_file.relative_to(ROOT)}")
        for link in sorted(set(missing_links)):
            print(f"  - {link}")

    if total_missing == 0:
        print("No missing local links detected.")
    else:
        print(f"Total missing references: {total_missing}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
