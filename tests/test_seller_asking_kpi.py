import unittest
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
HTML_PATH = PROJECT_ROOT / "Flipping Income Chart" / "index.html"
SCRIPT_PATH = PROJECT_ROOT / "Flipping Income Chart" / "script.js"


class SellerAskingKpiTest(unittest.TestCase):
    def test_one_paid_percent_kpi_covers_sold_and_active_items(self) -> None:
        html = HTML_PATH.read_text(encoding="utf-8")
        script = SCRIPT_PATH.read_text(encoding="utf-8")

        self.assertEqual(html.count("<span>Average Paid % of Seller Asking</span>"), 1)
        self.assertIn("across all sold and active items", html)
        self.assertNotIn("Average Savings vs Seller Asking", html)
        self.assertNotIn("Active Avg Paid % of Seller Asking", html)
        self.assertNotIn("Active Avg Savings vs Seller Asking", html)

        self.assertIn(
            "const avgPaidVsSellerAsking = averageRatio([...soldRows, ...inventoryRows], COLS.buyPrice, COLS.asking);",
            script,
        )
        self.assertIn('setText("avg-paid-percent-seller-asking", formatRatio(avgPaidVsSellerAsking));', script)
        self.assertNotIn("avgSavingsVsSellerAsking", script)
        self.assertNotIn("activeAvgPaidVsSellerAsking", script)
        self.assertNotIn("activeAvgSavingsVsSellerAsking", script)


if __name__ == "__main__":
    unittest.main()
