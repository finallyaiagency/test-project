import unittest
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
HTML_PATH = PROJECT_ROOT / "Flipping Income Chart" / "index.html"
SCRIPT_PATH = PROJECT_ROOT / "Flipping Income Chart" / "script.js"


class IncomeChartKpiTest(unittest.TestCase):
    def test_duplicate_sold_count_card_is_removed(self) -> None:
        html = HTML_PATH.read_text(encoding="utf-8")
        script = SCRIPT_PATH.read_text(encoding="utf-8")

        self.assertIn("<span>Sold Units</span>", html)
        self.assertNotIn("<span>Sold Count</span>", html)
        self.assertNotIn('id="sold-count-secondary"', html)
        self.assertNotIn('setText("sold-count-secondary"', script)

    def test_zero_ad_sheet_gap_displays_as_zero_when_sheet_metric_exists(self) -> None:
        script = SCRIPT_PATH.read_text(encoding="utf-8")

        self.assertIn(
            'const hasAdGapMetric = useSheetKpis && kpiMetrics.has("Ad vs Sheet Gap");',
            script,
        )
        self.assertIn(
            'setText("ad-gap", hasAdGapMetric ? number.format(adGap) : "n/a");',
            script,
        )
        self.assertNotIn('setText("ad-gap", adGap ?', script)

    def test_inventory_age_uses_months_only_above_sixty_days(self) -> None:
        html = HTML_PATH.read_text(encoding="utf-8")
        script = SCRIPT_PATH.read_text(encoding="utf-8")

        self.assertIn("<span>Inventory Age</span>", html)
        self.assertIn("if (days > 60)", script)
        self.assertIn("number.format(days / 30.44)", script)
        self.assertIn('return `${number.format(days)} days`;', script)
        self.assertIn('setText("days-in-inventory", formatInventoryAge(daysInInventory));', script)

    def test_profit_per_day_uses_two_decimal_currency(self) -> None:
        html = HTML_PATH.read_text(encoding="utf-8")
        script = SCRIPT_PATH.read_text(encoding="utf-8")

        self.assertIn('<strong id="profit-per-day">$0.00</strong>', html)
        self.assertIn(
            'const moneyTwoDecimals = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });',
            script,
        )
        self.assertIn('setText("profit-per-day", moneyTwoDecimals.format(profitPerDay));', script)

    def test_average_markup_uses_no_decimal_places(self) -> None:
        script = SCRIPT_PATH.read_text(encoding="utf-8")

        self.assertIn(
            'const wholeNumber = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });',
            script,
        )
        self.assertIn('setText("avg-markup", formatWholeRatio(avgMarkup));', script)
        self.assertIn('return `${wholeNumber.format((Number.isFinite(value) ? value : 0) * 100)}%`;', script)

    def test_one_year_or_older_inventory_count_is_included(self) -> None:
        html = HTML_PATH.read_text(encoding="utf-8")
        script = SCRIPT_PATH.read_text(encoding="utf-8")

        self.assertIn("<span>Inventory 1 Year+</span>", html)
        self.assertIn('id="inventory-one-year"', html)
        self.assertIn(
            "const oneYearInventoryCount = inventoryRows.filter((row) => toNumber(row[COLS.daysHeld]) >= 365).length;",
            script,
        )
        self.assertIn('setText("inventory-one-year", number.format(oneYearInventoryCount));', script)

    def test_median_profit_is_included_for_sold_items(self) -> None:
        html = HTML_PATH.read_text(encoding="utf-8")
        script = SCRIPT_PATH.read_text(encoding="utf-8")

        self.assertIn("<span>Median Profit</span>", html)
        self.assertIn('id="median-profit"', html)
        self.assertIn(
            "const medianProfit = median(soldRows.map((row) => toNumber(row[COLS.profit])));",
            script,
        )
        self.assertIn('setText("median-profit", money.format(medianProfit));', script)

    def test_active_asking_uses_only_tracked_groundbnb_inventory_and_excludes_elr(self) -> None:
        html = HTML_PATH.read_text(encoding="utf-8")
        script = SCRIPT_PATH.read_text(encoding="utf-8")

        self.assertIn('const ACTIVE_ASKING_EXCLUDED_ASSET_IDS = new Set(["GB-0173"]);', script)
        self.assertIn('if (!assetId.startsWith("GB-")) return null;', script)
        self.assertIn(
            "const activeAskingRows = inventoryRows.filter((row) => !ACTIVE_ASKING_EXCLUDED_ASSET_IDS.has(String(row[COLS.assetId]).trim()));",
            script,
        )
        self.assertIn("const activeAsking = sum(activeAskingRows, COLS.asking);", script)
        self.assertIn(
            "const unrealizedProfit = activeAsking - sum(activeAskingRows, COLS.buyPrice);",
            script,
        )
        self.assertNotIn('metricValue("Active Asking Value"', script)
        self.assertNotIn('metricValue("Unrealized Gross Profit"', script)
        self.assertIn("Excludes the Cadillac ELR", html)
        self.assertIn("asking value minus the paid cost", html)

    def test_return_cards_distinguish_realized_roi_from_non_apy_flip_pace(self) -> None:
        html = HTML_PATH.read_text(encoding="utf-8")

        self.assertIn("<span>Realized Return on Cost</span>", html)
        self.assertIn("Gross profit divided by paid cost basis", html)
        self.assertIn("<span>Annualized Flip Pace (Not APY)</span>", html)
        self.assertIn("not comparable to portfolio APY", html)
        self.assertNotIn("<span>Annualized Return on Capital</span>", html)


if __name__ == "__main__":
    unittest.main()
