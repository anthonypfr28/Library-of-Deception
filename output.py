#!/usr/bin/env python3
"""
output.py
---------
The Library of Deception's archivist script.

Walks the docs/ directory, reads every file it finds, and produces a
single JSON index (data/files.json) describing each document: its
name, extension, size, line count, last-modified time, a short
preview, and its full formatted content.

server.js reads the file this script produces and hands it to the
frontend. This script never talks to the frontend directly, and the
frontend never touches the filesystem directly -- output.py is the
only thing that reads docs/.

Usage:
    python3 output.py
"""

import json
import os
import datetime

DOCS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "docs")
DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data")
OUTPUT_FILE = os.path.join(DATA_DIR, "files.json")

# Extensions we know how to label. Anything else falls back to "TEXT".
LANGUAGE_LABELS = {
    ".txt": "TEXT",
    ".md": "MARKDOWN",
    ".json": "JSON",
    ".py": "PYTHON",
    ".js": "JAVASCRIPT",
    ".csv": "CSV",
    ".log": "LOG",
}


def format_size(num_bytes: int) -> str:
    """Render a byte count the way GitHub does: B, KB, MB."""
    if num_bytes < 1024:
        return f"{num_bytes} B"
    if num_bytes < 1024 * 1024:
        return f"{num_bytes / 1024:.1f} KB"
    return f"{num_bytes / (1024 * 1024):.1f} MB"


def pad_content(raw_text: str) -> str:
    """
    Add a little breathing room to the raw file content before it is
    handed to the viewer: normalize line endings, strip trailing
    whitespace per line, and guarantee a single trailing newline.
    This is the "organizing" step -- the file on disk is left
    untouched, only the copy that ends up in files.json is tidied.
    """
    lines = raw_text.replace("\r\n", "\n").replace("\r", "\n").split("\n")
    cleaned = [line.rstrip() for line in lines]
    text = "\n".join(cleaned).strip("\n")
    return text + "\n"


def build_preview(text: str, max_chars: int = 160) -> str:
    """First line or first max_chars, whichever is shorter, for the table row."""
    first_line = text.strip().split("\n", 1)[0]
    if len(first_line) > max_chars:
        return first_line[:max_chars].rstrip() + "..."
    return first_line


def collect_files():
    entries = []

    if not os.path.isdir(DOCS_DIR):
        print(f"[output.py] docs/ directory not found at {DOCS_DIR}")
        return entries

    for filename in sorted(os.listdir(DOCS_DIR)):
        full_path = os.path.join(DOCS_DIR, filename)
        if not os.path.isfile(full_path):
            continue

        with open(full_path, "r", encoding="utf-8", errors="replace") as f:
            raw = f.read()

        content = pad_content(raw)
        stat = os.stat(full_path)
        _, ext = os.path.splitext(filename)
        ext = ext.lower()

        entries.append(
            {
                "name": filename,
                "extension": ext.lstrip("."),
                "language": LANGUAGE_LABELS.get(ext, "TEXT"),
                "size_bytes": stat.st_size,
                "size_label": format_size(stat.st_size),
                "line_count": content.count("\n"),
                "modified": datetime.datetime.fromtimestamp(
                    stat.st_mtime, tz=datetime.timezone.utc
                ).isoformat(),
                "preview": build_preview(content),
                "content": content,
            }
        )

    return entries


def main():
    os.makedirs(DATA_DIR, exist_ok=True)
    entries = collect_files()

    index = {
        "generated_at": datetime.datetime.now(tz=datetime.timezone.utc).isoformat(),
        "repository": "library-of-deception",
        "file_count": len(entries),
        "files": entries,
    }

    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(index, f, indent=2)

    print(f"[output.py] Indexed {len(entries)} file(s) from docs/ -> {OUTPUT_FILE}")


if __name__ == "__main__":
    main()
