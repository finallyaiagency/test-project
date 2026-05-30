#!/usr/bin/env python3
"""Normalize the Facebook flip tracker Google Sheet."""

from __future__ import annotations

import argparse
import json
import re
import sys
from datetime import datetime
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
GOOGLE_SCRIPTS = ROOT / "skills" / "productivity" / "google-workspace" / "scripts"
if str(GOOGLE_SCRIPTS) not in sys.path:
    sys.path.insert(0, str(GOOGLE_SCRIPTS))

from google_api import build_service  # noqa: E402


NEW_HEADERS = [
    "Scan Timestamp",
    "Status",
    "Listing ID",
    "Listing URL",
    "Title",
    "Ask Price",
    "Location",
    "Seller Name",
    "Category",
    "Brand",
    "Model",
    "Part Number / SKU",
    "Size / Dimensions",
    "Condition Stated",
    "Condition From Photos",
    "Accessories Included",
    "Missing / Risk Items",
    "Photos Available",
    "Photos Inspected",
    "Vision Quality",
    "Max Buy Price",
    "Opening Offer",
    "List Price",
    "Accept Price",
    "Estimated Costs",
    "Estimated Gross Profit",
    "ROI",
    "Verdict",
    "Confidence",
    "Sell Days Min",
    "Sell Days Max",
    "Demand Trend",
    "Seasonality",
    "Competition Level",
    "Price Justification",
    "Red Flags",
    "Green Flags",
    "Suggested Title Keywords",
    "Soft Seller Message",
    "Lowball Seller Message",
    "Recommended Message",
    "Data Quality",
    "Browser URL Verified",
    "Expected Listing ID",
    "Actual Listing ID",
    "Notes",
]


def a1_col(index: int) -> str:
    result = ""
    index += 1
    while index:
        index, remainder = divmod(index - 1, 26)
        result = chr(65 + remainder) + result
    return result


def sheet_ref(title: str) -> str:
    return "'" + title.replace("'", "''") + "'"


def old_get(row_map: dict[str, str], *keys: str) -> str:
    for key in keys:
        value = row_map.get(key, "")
        if value not in ("", None):
            return str(value).strip()
    return ""


def parse_money(value: str) -> float | None:
    match = re.search(r"-?\d+(?:,\d{3})*(?:\.\d+)?|-?\d+(?:\.\d+)?", str(value or ""))
    if not match:
        return None
    return float(match.group(0).replace(",", ""))


def parse_roi(value: str) -> float | None:
    money = parse_money(value)
    if money is None:
        return None
    text = str(value or "")
    if "%" in text or abs(money) > 3:
        return money / 100
    return money


def parse_range(value: str) -> tuple[int | None, int | None]:
    nums = [int(float(match)) for match in re.findall(r"\d+(?:\.\d+)?", str(value or ""))]
    if not nums:
        return None, None
    if len(nums) == 1:
        return nums[0], nums[0]
    return min(nums[0], nums[1]), max(nums[0], nums[1])


def parse_media(value: str) -> tuple[int | None, int | None]:
    text = str(value or "")
    ratio = re.search(r"(\d+)\s*/\s*(\d+)", text)
    if ratio:
        inspected = int(ratio.group(1))
        available = int(ratio.group(2))
        return available, inspected
    nums = [int(match) for match in re.findall(r"\d+", text)]
    if len(nums) >= 2:
        return max(nums[0], nums[1]), min(nums[0], nums[1])
    if len(nums) == 1:
        return nums[0], nums[0]
    return None, None


def listing_id_from_url(value: str) -> str:
    match = re.search(r"/marketplace/item/(\d+)", str(value or ""))
    return match.group(1) if match else ""


def canonical_url(item_id: str, fallback: str) -> str:
    if item_id:
        return f"https://www.facebook.com/marketplace/item/{item_id}/"
    return str(fallback or "").strip()


def normalize_verdict(value: str) -> str:
    lower = str(value or "").lower()
    if "no" in lower:
        return "NO-GO"
    if "caution" in lower or "review" in lower:
        return "CAUTION"
    if "go" in lower:
        return "GO"
    return str(value or "").strip()


def infer_category(title: str) -> str:
    lower = title.lower()
    groups = [
        ("Watersports", ["kayak", "paddle", "sup", "windsurf", "sail"]),
        ("Camping / Portable Utility", ["camp", "portable", "12v", "shower", "oven", "air conditioner"]),
        ("Outdoor / Yard", ["gazebo", "mower", "patio", "lawn", "yard"]),
        ("Home Improvement", ["water heater", "tankless", "heater", "tool", "generator"]),
        ("Electronics", ["battery", "solar", "power station", "charger"]),
    ]
    for label, needles in groups:
        if any(needle in lower for needle in needles):
            return label
    return ""


def quality_from(old_media: str, confidence: str) -> str:
    text = f"{old_media} {confidence}".lower()
    if "low" in text or "limited" in text or "manual" in text:
        return "Low"
    if "high" in text:
        return "High"
    return "Medium"


def price_justification(row: dict[str, object]) -> str:
    required = ["Max Buy Price", "Opening Offer", "List Price", "Accept Price", "Estimated Costs", "Estimated Gross Profit", "ROI"]
    missing = [key for key in required if row.get(key) in ("", None)]
    if missing:
        return "Needs pricing review: missing numeric values for " + ", ".join(missing) + "."
    return (
        f"Buy cap ${row['Max Buy Price']:.0f}; accept floor ${row['Accept Price']:.0f}; "
        f"costs ${row['Estimated Costs']:.0f}; expected profit ${row['Estimated Gross Profit']:.0f}; "
        f"ROI {row['ROI']:.0%}."
    )


def recommended_message(row: dict[str, object]) -> str:
    existing = str(row.get("Recommended Message") or "").strip()
    if existing:
        return existing

    soft = str(row.get("Soft Seller Message") or "").strip()
    lowball = str(row.get("Lowball Seller Message") or "").strip()
    verdict = str(row.get("Verdict") or "").upper()
    ask = row.get("Ask Price")
    max_buy = row.get("Max Buy Price")
    opening = row.get("Opening Offer")
    accept = row.get("Accept Price")

    if soft and lowball:
        if ask is not None and max_buy is not None and ask > (max_buy * 1.10):
            return lowball
        if verdict in {"CAUTION", "NO-GO"}:
            return lowball
        return soft
    if soft:
        return soft
    if lowball:
        return lowball

    offer = opening if opening is not None else (max_buy if max_buy is not None else accept)
    if offer is not None:
        return f"Hi, is this still available? I can do ${offer:.0f} cash pickup today if condition matches the listing."
    return "Hi, is this still available? Please confirm condition and your best pickup price."


def transform_rows(old_values: list[list[object]]) -> list[list[object]]:
    if not old_values:
        return [NEW_HEADERS]
    old_headers = [str(header).strip() for header in old_values[0]]
    output = [NEW_HEADERS]

    for old_row in old_values[1:]:
        if not any(str(cell).strip() for cell in old_row):
            continue
        old = {header: str(old_row[index]).strip() if index < len(old_row) else "" for index, header in enumerate(old_headers)}
        url = old_get(old, "URL", "Listing URL")
        item_id = listing_id_from_url(url)
        title = old_get(old, "Title")
        sell_min, sell_max = parse_range(old_get(old, "Est. Days to Sell", "Sell Days Min"))
        photos_available, photos_inspected = parse_media(old_get(old, "Media Inspected"))

        row = {
            "Scan Timestamp": old_get(old, "Date analyzed", "Scan Timestamp") or datetime.now().isoformat(timespec="seconds"),
            "Status": "Active",
            "Listing ID": item_id,
            "Listing URL": canonical_url(item_id, url),
            "Title": title,
            "Ask Price": parse_money(old_get(old, "Ask Price")),
            "Location": old_get(old, "Location"),
            "Seller Name": old_get(old, "Seller Name"),
            "Category": old_get(old, "Category") or infer_category(title),
            "Brand": old_get(old, "Brand"),
            "Model": old_get(old, "Model"),
            "Part Number / SKU": old_get(old, "Part Number / SKU"),
            "Size / Dimensions": old_get(old, "Size / Dimensions"),
            "Condition Stated": old_get(old, "Condition", "Condition Stated"),
            "Condition From Photos": old_get(old, "Condition From Photos"),
            "Accessories Included": old_get(old, "Key Accessories", "Accessories Included"),
            "Missing / Risk Items": old_get(old, "Missing/Risk Items", "Missing / Risk Items"),
            "Photos Available": parse_money(old_get(old, "Photos Available")) if old_get(old, "Photos Available") else photos_available,
            "Photos Inspected": parse_money(old_get(old, "Photos Inspected")) if old_get(old, "Photos Inspected") else photos_inspected,
            "Vision Quality": old_get(old, "Vision Quality") or quality_from(old_get(old, "Media Inspected"), old_get(old, "Confidence")),
            "Max Buy Price": parse_money(old_get(old, "Max Buy Price")),
            "Opening Offer": parse_money(old_get(old, "Opening Offer")),
            "List Price": parse_money(old_get(old, "List Price")),
            "Accept Price": parse_money(old_get(old, "Accept Price")),
            "Estimated Costs": parse_money(old_get(old, "Est. Costs", "Estimated Costs")),
            "Estimated Gross Profit": parse_money(old_get(old, "Est. Gross Profit", "Estimated Gross Profit")),
            "ROI": parse_roi(old_get(old, "ROI %", "ROI")),
            "Verdict": normalize_verdict(old_get(old, "Verdict")),
            "Confidence": old_get(old, "Confidence"),
            "Sell Days Min": sell_min,
            "Sell Days Max": sell_max,
            "Demand Trend": old_get(old, "Demand Trend"),
            "Seasonality": old_get(old, "Seasonality"),
            "Competition Level": old_get(old, "Competition Level"),
            "Price Justification": old_get(old, "Price Justification"),
            "Red Flags": old_get(old, "Red Flags"),
            "Green Flags": old_get(old, "Green Flags"),
            "Suggested Title Keywords": old_get(old, "Suggested Title Keywords"),
            "Soft Seller Message": old_get(old, "Soft Message", "Soft Seller Message"),
            "Lowball Seller Message": old_get(old, "Lowball Message", "Lowball Seller Message"),
            "Recommended Message": old_get(old, "Recommended Message"),
            "Data Quality": old_get(old, "Data Quality") or "PASS",
            "Browser URL Verified": old_get(old, "Browser URL Verified") or ("TRUE" if item_id else "FALSE"),
            "Expected Listing ID": old_get(old, "Expected Listing ID") or item_id,
            "Actual Listing ID": old_get(old, "Actual Listing ID") or item_id,
            "Notes": old_get(old, "Notes") or "Cleaned from prior tracker schema; canonical URL and numeric fields normalized.",
        }
        computed_justification = price_justification(row)
        existing_just = str(row["Price Justification"] or "").strip()
        if not existing_just or "needs pricing review" in existing_just.lower():
            row["Price Justification"] = computed_justification
        row["Recommended Message"] = recommended_message(row)

        critical = ["Listing ID", "Title", "Ask Price", "Max Buy Price", "Opening Offer", "List Price", "Accept Price", "Estimated Gross Profit", "ROI", "Verdict"]
        if any(row.get(key) in ("", None) for key in critical):
            row["Data Quality"] = "NEEDS REVIEW"

        output.append(["" if row.get(header) is None else row.get(header, "") for header in NEW_HEADERS])

    return output


def rgb(hex_color: str) -> dict[str, float]:
    color = hex_color.lstrip("#")
    return {
        "red": int(color[0:2], 16) / 255,
        "green": int(color[2:4], 16) / 255,
        "blue": int(color[4:6], 16) / 255,
    }


def col(headers: list[str], name: str) -> int:
    return headers.index(name)


def apply_formatting(service, spreadsheet_id: str, sheet_id: int, row_count: int) -> None:
    col_count = len(NEW_HEADERS)
    requests = [
        {
            "updateSheetProperties": {
                "properties": {"sheetId": sheet_id, "gridProperties": {"frozenRowCount": 1}},
                "fields": "gridProperties.frozenRowCount",
            }
        },
        {"setBasicFilter": {"filter": {"range": {"sheetId": sheet_id, "startRowIndex": 0, "endRowIndex": row_count, "startColumnIndex": 0, "endColumnIndex": col_count}}}},
        {
            "repeatCell": {
                "range": {"sheetId": sheet_id, "startRowIndex": 0, "endRowIndex": 1, "startColumnIndex": 0, "endColumnIndex": col_count},
                "cell": {
                    "userEnteredFormat": {
                        "backgroundColor": rgb("#151915"),
                        "horizontalAlignment": "CENTER",
                        "textFormat": {"foregroundColor": rgb("#42F5A7"), "bold": True},
                    }
                },
                "fields": "userEnteredFormat(backgroundColor,horizontalAlignment,textFormat)",
            }
        },
        {
            "repeatCell": {
                "range": {"sheetId": sheet_id, "startRowIndex": 1, "endRowIndex": row_count, "startColumnIndex": 0, "endColumnIndex": col_count},
                "cell": {"userEnteredFormat": {"wrapStrategy": "WRAP", "verticalAlignment": "TOP"}},
                "fields": "userEnteredFormat(wrapStrategy,verticalAlignment)",
            }
        },
    ]

    widths = {
        "Listing URL": 230,
        "Title": 280,
        "Location": 150,
        "Accessories Included": 230,
        "Missing / Risk Items": 260,
        "Price Justification": 310,
        "Red Flags": 270,
        "Green Flags": 250,
        "Suggested Title Keywords": 250,
        "Soft Seller Message": 320,
        "Lowball Seller Message": 320,
        "Recommended Message": 320,
        "Notes": 260,
    }
    for index, header in enumerate(NEW_HEADERS):
        requests.append(
            {
                "updateDimensionProperties": {
                    "range": {"sheetId": sheet_id, "dimension": "COLUMNS", "startIndex": index, "endIndex": index + 1},
                    "properties": {"pixelSize": widths.get(header, 118)},
                    "fields": "pixelSize",
                }
            }
        )

    def repeat_format(names: list[str], fmt: dict[str, object]) -> None:
        for name in names:
            index = col(NEW_HEADERS, name)
            requests.append(
                {
                    "repeatCell": {
                        "range": {"sheetId": sheet_id, "startRowIndex": 1, "endRowIndex": row_count, "startColumnIndex": index, "endColumnIndex": index + 1},
                        "cell": {"userEnteredFormat": fmt},
                        "fields": "userEnteredFormat",
                    }
                }
            )

    repeat_format(
        ["Ask Price", "Max Buy Price", "Opening Offer", "List Price", "Accept Price", "Estimated Costs", "Estimated Gross Profit"],
        {"numberFormat": {"type": "CURRENCY", "pattern": "$#,##0"}, "horizontalAlignment": "RIGHT"},
    )
    repeat_format(["ROI"], {"numberFormat": {"type": "PERCENT", "pattern": "0%"}, "horizontalAlignment": "RIGHT"})
    repeat_format(["Photos Available", "Photos Inspected", "Sell Days Min", "Sell Days Max"], {"numberFormat": {"type": "NUMBER", "pattern": "0"}, "horizontalAlignment": "RIGHT"})
    repeat_format(["Listing ID", "Expected Listing ID", "Actual Listing ID"], {"numberFormat": {"type": "TEXT", "pattern": "@"}})

    validations = {
        "Status": ["Active", "Sold", "Skipped", "Needs Review"],
        "Verdict": ["GO", "CAUTION", "NO-GO"],
        "Confidence": ["High", "Medium", "Medium-Low", "Low"],
        "Vision Quality": ["High", "Medium", "Low", "Needs premium/manual review"],
        "Data Quality": ["PASS", "NEEDS REVIEW", "BLOCKED"],
        "Browser URL Verified": ["TRUE", "FALSE"],
    }
    for name, values in validations.items():
        index = col(NEW_HEADERS, name)
        requests.append(
            {
                "setDataValidation": {
                    "range": {"sheetId": sheet_id, "startRowIndex": 1, "endRowIndex": row_count, "startColumnIndex": index, "endColumnIndex": index + 1},
                    "rule": {
                        "condition": {"type": "ONE_OF_LIST", "values": [{"userEnteredValue": value} for value in values]},
                        "strict": False,
                        "showCustomUi": True,
                    },
                }
            }
        )

    service.spreadsheets().batchUpdate(spreadsheetId=spreadsheet_id, body={"requests": requests}).execute()


def validate_clean_rows(values: list[list[object]]) -> list[str]:
    errors = []
    header = values[0]
    indexes = {name: header.index(name) for name in header}
    for row_num, row in enumerate(values[1:], start=2):
        row += [""] * (len(header) - len(row))
        url = str(row[indexes["Listing URL"]])
        expected = str(row[indexes["Expected Listing ID"]])
        actual = str(row[indexes["Actual Listing ID"]])
        if expected and expected not in url:
            errors.append(f"row {row_num}: expected listing ID not present in URL")
        if expected != actual:
            errors.append(f"row {row_num}: expected/actual listing IDs differ")
        for name in ["Ask Price", "Max Buy Price", "Opening Offer", "List Price", "Accept Price", "Estimated Costs", "Estimated Gross Profit", "ROI"]:
            value = row[indexes[name]]
            if value != "" and not isinstance(value, (int, float)):
                errors.append(f"row {row_num}: {name} is not numeric")
    return errors


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("spreadsheet_id")
    parser.add_argument("--range", default="A1:AZ1000")
    args = parser.parse_args()

    service = build_service("sheets", "v4")
    metadata = service.spreadsheets().get(spreadsheetId=args.spreadsheet_id).execute()
    main_sheet = metadata["sheets"][0]["properties"]
    main_title = main_sheet["title"]
    main_sheet_id = main_sheet["sheetId"]

    old_values = service.spreadsheets().values().get(spreadsheetId=args.spreadsheet_id, range=f"{sheet_ref(main_title)}!{args.range}").execute().get("values", [])
    cleaned = transform_rows(old_values)
    row_count = len(cleaned)
    end_col = a1_col(len(NEW_HEADERS) - 1)

    backup_name = f"Raw Backup {datetime.now().strftime('%Y-%m-%d %H%M')}"
    service.spreadsheets().batchUpdate(
        spreadsheetId=args.spreadsheet_id,
        body={"requests": [{"duplicateSheet": {"sourceSheetId": main_sheet_id, "newSheetName": backup_name}}]},
    ).execute()
    service.spreadsheets().batchUpdate(
        spreadsheetId=args.spreadsheet_id,
        body={"requests": [{"updateSheetProperties": {"properties": {"sheetId": main_sheet_id, "index": 0}, "fields": "index"}}]},
    ).execute()

    service.spreadsheets().values().clear(spreadsheetId=args.spreadsheet_id, range=f"{sheet_ref(main_title)}!A:ZZ").execute()
    service.spreadsheets().values().update(
        spreadsheetId=args.spreadsheet_id,
        range=f"{sheet_ref(main_title)}!A1:{end_col}{row_count}",
        valueInputOption="RAW",
        body={"values": cleaned},
    ).execute()
    apply_formatting(service, args.spreadsheet_id, main_sheet_id, row_count)

    readback = service.spreadsheets().values().get(
        spreadsheetId=args.spreadsheet_id,
        range=f"{sheet_ref(main_title)}!A1:{end_col}{row_count}",
        valueRenderOption="UNFORMATTED_VALUE",
    ).execute().get("values", [])
    errors = validate_clean_rows(readback)
    print(json.dumps({"rows": row_count - 1, "columns": len(NEW_HEADERS), "backup": backup_name, "validation_errors": errors}, indent=2))
    return 1 if errors else 0


if __name__ == "__main__":
    raise SystemExit(main())
