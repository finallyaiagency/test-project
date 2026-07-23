import unittest
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
SCRIPT_PATH = PROJECT_ROOT / "Flipping Income Chart" / "script.js"


def function_source(script: str, function_name: str, next_function_name: str) -> str:
    start = script.index(f"function {function_name}")
    end = script.index(f"function {next_function_name}", start)
    return script[start:end]


class IncomeChartPlotlyLayoutTest(unittest.TestCase):
    def test_income_chart_reserves_separate_vertical_space_for_title_and_legend(self) -> None:
        script = SCRIPT_PATH.read_text(encoding="utf-8")
        render_plotly = function_source(script, "renderPlotly", "lineTrace")

        self.assertIn(
            'title: { text: "Groundbnb Inventory, Cash, Equity & Yield", x: 0, xanchor: "left", y: 0.98, yanchor: "top" }',
            render_plotly,
        )
        self.assertIn('legend: { orientation: "h", yanchor: "bottom", y: 1.02, xanchor: "left", x: 0 }', render_plotly)
        self.assertIn("margin: { l: 72, r: 82, t: 150, b: 58 }", render_plotly)

    def test_profit_per_day_bars_render_highest_value_at_the_top(self) -> None:
        script = SCRIPT_PATH.read_text(encoding="utf-8")
        render_bars = function_source(script, "renderTypeBars", "renderInventory")

        self.assertIn(".sort((a, b) => b.rate - a.rate)", render_bars)
        self.assertIn(
            'yaxis: { automargin: true, categoryorder: "array", categoryarray: sorted.map((row) => row.type), autorange: "reversed", gridcolor: "rgba(244,240,223,0.06)" }',
            render_bars,
        )


if __name__ == "__main__":
    unittest.main()
