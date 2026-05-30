#!/usr/bin/env python3
"""Export the cleaned flip tracker sheet to browser-readable JS data."""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
GOOGLE_SCRIPTS = ROOT / "skills" / "productivity" / "google-workspace" / "scripts"
if str(GOOGLE_SCRIPTS) not in sys.path:
    sys.path.insert(0, str(GOOGLE_SCRIPTS))

from google_api import build_service  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("spreadsheet_id")
    parser.add_argument("--range", default="Sheet1!A1:AT1000")
    parser.add_argument("--output", default="test-project/flip-tracker-data.js")
    args = parser.parse_args()

    service = build_service("sheets", "v4")
    values = service.spreadsheets().values().get(
        spreadsheetId=args.spreadsheet_id,
        range=args.range,
        valueRenderOption="UNFORMATTED_VALUE",
    ).execute().get("values", [])
    if not values:
        raise SystemExit("No rows returned from sheet")

    headers = [str(value).strip() for value in values[0]]
    rows = []
    for source in values[1:]:
        row = list(source) + [""] * (len(headers) - len(source))
        if any(str(value).strip() for value in row):
            rows.append(row[: len(headers)])

    payload = {
        "exportedAt": datetime.now().isoformat(timespec="seconds"),
        "sourceSheetId": args.spreadsheet_id,
        "sourceRange": args.range,
        "headers": headers,
        "rows": rows,
    }
    output_path = ROOT / args.output
    output_path.write_text("window.FLIP_TRACKER_DATA = " + json.dumps(payload, ensure_ascii=False, indent=2) + ";\n", encoding="utf-8")
    print(json.dumps({"rows": len(rows), "headers": len(headers), "output": str(output_path)}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
