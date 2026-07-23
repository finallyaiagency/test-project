import re
import unittest
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
CSS_PATH = PROJECT_ROOT / "Flipping Income Chart" / "styles.css"
HTML_PATH = PROJECT_ROOT / "Flipping Income Chart" / "index.html"


def rule_body(source: str, selector: str) -> str:
    match = re.search(rf"{re.escape(selector)}\s*\{{([^}}]+)\}}", source)
    if not match:
        raise AssertionError(f"Missing CSS rule for {selector}")
    return match.group(1)


class MobileYearFilterLayoutTest(unittest.TestCase):
    def test_year_filter_actions_stack_in_a_half_width_mobile_panel(self) -> None:
        css = CSS_PATH.read_text(encoding="utf-8")
        marker = "@media (max-width: 620px)"
        self.assertIn(marker, css)
        mobile_css = css.split(marker, 1)[1]

        wrap = rule_body(mobile_css, "#year-filter-wrap")
        panel = rule_body(mobile_css, "#year-filter-panel")
        actions = rule_body(mobile_css, "#year-filter-panel .multi-filter-actions")
        buttons = rule_body(mobile_css, "#year-filter-panel .multi-filter-actions button")

        self.assertIn("min-width: 150px", wrap)
        self.assertIn("flex: 0 1 150px", wrap)
        self.assertIn("width: min(160px, calc(100vw - 20px))", panel)
        self.assertIn("flex-direction: column", actions)
        self.assertIn("width: 100%", buttons)
        self.assertIn("flex: 0 0 auto", buttons)

    def test_category_filter_actions_stack_in_a_half_width_mobile_panel(self) -> None:
        css = CSS_PATH.read_text(encoding="utf-8")
        marker = "@media (max-width: 620px)"
        self.assertIn(marker, css)
        mobile_css = css.split(marker, 1)[1]

        wrap = rule_body(mobile_css, "#category-filter-wrap")
        panel = rule_body(mobile_css, "#category-filter-panel")
        actions = rule_body(mobile_css, "#category-filter-panel .multi-filter-actions")
        buttons = rule_body(mobile_css, "#category-filter-panel .multi-filter-actions button")

        self.assertIn("min-width: 150px", wrap)
        self.assertIn("flex: 0 1 150px", wrap)
        self.assertIn("width: min(160px, calc(100vw - 20px))", panel)
        self.assertIn("flex-direction: column", actions)
        self.assertIn("width: 100%", buttons)
        self.assertIn("flex: 0 0 auto", buttons)

    def test_mobile_layout_and_chart_code_use_fresh_cache_busters(self) -> None:
        html = HTML_PATH.read_text(encoding="utf-8")
        self.assertIn('href="styles.css?v=20260723-2"', html)
        self.assertIn('src="script.js?v=20260723-4"', html)


if __name__ == "__main__":
    unittest.main()
