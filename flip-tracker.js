(function () {
    const data = window.FLIP_TRACKER_DATA || { headers: [], rows: [] };
    const headers = data.headers || [];
    const records = (data.rows || []).map((row, index) => {
        const sourceRow = Array.isArray(row) ? row : (Array.isArray(row.value) ? row.value : []);
        const values = {};
        headers.forEach((header, colIndex) => {
            values[header] = sourceRow[colIndex] == null ? "" : String(sourceRow[colIndex]).trim();
        });
        return {
            id: index,
            values,
            title: getAny(values, ["Title"]) || `Record ${index + 1}`,
            location: getAny(values, ["Location"]) || "Unknown",
            verdict: normalizeVerdict(getAny(values, ["Verdict"])),
            ask: parseMoney(getAny(values, ["Ask Price"])),
            openingOffer: parseMoney(getAny(values, ["Opening Offer"])),
            maxBuy: parseMoney(getAny(values, ["Max Buy Price"])),
            listPrice: parseMoney(getAny(values, ["List Price"])),
            acceptPrice: parseMoney(getAny(values, ["Accept Price"])),
            estimatedCosts: parseMoney(getAny(values, ["Estimated Costs", "Est. Costs"])),
            profit: parseMoney(getAny(values, ["Estimated Gross Profit", "Est. Gross Profit"])),
            roi: parsePercent(getAny(values, ["ROI", "ROI %"])),
            newEstimate: parseMoney(getAny(values, ["New Price Estimate", "New Retail Price", "MSRP", "List Price"])),
            days: parseFirstNumber(getAny(values, ["Sell Days Min", "Est. Days to Sell"])),
            confidence: getAny(values, ["Confidence"]) || "-",
            searchable: headers.map((header) => get(values, header)).join(" ").toLowerCase()
        };
    });

    const state = {
        filtered: [],
        selectedId: records[0] ? records[0].id : null
    };

    const els = {
        search: document.getElementById("search-input"),
        location: document.getElementById("location-filter"),
        verdict: document.getElementById("verdict-filter"),
        kpi: document.getElementById("kpi-filter"),
        sort: document.getElementById("sort-select"),
        reset: document.getElementById("reset-filters"),
        list: document.getElementById("record-list"),
        railCount: document.getElementById("rail-count"),
        visibleCount: document.getElementById("visible-count"),
        totalCount: document.getElementById("total-count"),
        goRate: document.getElementById("go-rate"),
        avgRoi: document.getElementById("avg-roi"),
        position: document.getElementById("record-position"),
        title: document.getElementById("record-title"),
        prev: document.getElementById("prev-record"),
        next: document.getElementById("next-record"),
        roiGauge: document.getElementById("roi-gauge"),
        profitGauge: document.getElementById("profit-gauge"),
        buyGauge: document.getElementById("buy-gauge"),
        confidenceGauge: document.getElementById("confidence-gauge"),
        roiValue: document.getElementById("roi-value"),
        profitValue: document.getElementById("profit-value"),
        buyValue: document.getElementById("buy-value"),
        confidenceValue: document.getElementById("confidence-value"),
        quickVerdict: document.getElementById("quick-verdict"),
        quickAsk: document.getElementById("quick-ask"),
        quickLocation: document.getElementById("quick-location"),
        quickDays: document.getElementById("quick-days"),
        accordion: document.getElementById("accordion-zone"),
        panel: document.querySelector(".record-panel"),
        verdictIndicator: document.getElementById("verdict-indicator"),
        priceScaleRange: document.getElementById("price-scale-range"),
        buyZone: document.getElementById("buy-zone"),
        cautionZone: document.getElementById("caution-zone"),
        sellZone: document.getElementById("sell-zone"),
        buyBand: document.getElementById("buy-band"),
        sellBand: document.getElementById("sell-band"),
        priceMarkers: document.getElementById("price-markers"),
        priceLegend: document.getElementById("price-scale-legend")
    };

    function get(values, key) {
        return values[key] || "";
    }

    function getAny(values, keys) {
        for (const key of keys) {
            if (values[key]) return values[key];
        }
        return "";
    }

    function parseMoney(value) {
        const text = String(value || "").replace(/,/g, "");
        const match = text.match(/-?\d+(\.\d+)?/);
        return match ? Number(match[0]) : null;
    }

    function parsePercent(value) {
        const text = String(value || "").replace(/,/g, "");
        const match = text.match(/-?\d+(\.\d+)?/);
        if (!match) return null;
        const numeric = Number(match[0]);
        if (!text.includes("%") && Math.abs(numeric) <= 3) return numeric * 100;
        return numeric;
    }

    function parseFirstNumber(value) {
        const match = String(value || "").match(/\d+(\.\d+)?/);
        return match ? Number(match[0]) : null;
    }

    function normalizeVerdict(value) {
        const raw = String(value || "").trim();
        const lower = raw.toLowerCase();
        if (lower.includes("no")) return "NO-GO";
        if (lower.includes("caution")) return "CAUTION";
        if (lower.includes("go")) return "GO";
        return raw || "-";
    }

    function money(value) {
        return value == null || Number.isNaN(value) ? "-" : `$${Math.round(value).toLocaleString()}`;
    }

    function pct(value) {
        return value == null || Number.isNaN(value) ? "-" : `${Math.round(value)}%`;
    }

    function safeText(value) {
        return value == null || value === "" ? "-" : String(value);
    }

    function setGauge(el, value, max, tone) {
        const numeric = value == null || Number.isNaN(value) ? 0 : Math.max(0, Math.min(100, (value / max) * 100));
        el.style.setProperty("--pct", `${numeric}%`);
        el.style.setProperty("--tone", tone);
    }

    function verdictClass(verdict) {
        const lower = String(verdict || "").toLowerCase();
        if (lower.includes("no")) return "no-go";
        if (lower.includes("caution")) return "caution";
        if (lower.includes("go")) return "go";
        return "";
    }

    function buildFilters() {
        const locations = Array.from(new Set(records.map((record) => record.location).filter(Boolean))).sort((a, b) => a.localeCompare(b));
        const verdicts = Array.from(new Set(records.map((record) => record.verdict).filter(Boolean))).sort((a, b) => a.localeCompare(b));
        fillSelect(els.location, [["all", "All locations"], ...locations.map((value) => [value, value])]);
        fillSelect(els.verdict, [["all", "All verdicts"], ...verdicts.map((value) => [value, value])]);
    }

    function fillSelect(select, options) {
        select.innerHTML = options.map(([value, label]) => `<option value="${escapeAttr(value)}">${escapeHtml(label)}</option>`).join("");
    }

    function applyFilters() {
        const query = els.search.value.trim().toLowerCase();
        const location = els.location.value;
        const verdict = els.verdict.value;
        const kpi = els.kpi.value;

        state.filtered = records.filter((record) => {
            if (query && !record.searchable.includes(query)) return false;
            if (location !== "all" && record.location !== location) return false;
            if (verdict !== "all" && record.verdict !== verdict) return false;
            if (kpi === "go" && record.verdict !== "GO") return false;
            if (kpi === "roi60" && !(record.roi != null && record.roi >= 60)) return false;
            if (kpi === "profit50" && !(record.profit != null && record.profit >= 50)) return false;
            if (kpi === "ask100" && !(record.ask != null && record.ask <= 100)) return false;
            if (kpi === "caution" && record.verdict === "GO") return false;
            return true;
        });

        state.filtered.sort(sorter(els.sort.value));
        if (!state.filtered.some((record) => record.id === state.selectedId)) {
            state.selectedId = state.filtered[0] ? state.filtered[0].id : null;
        }
        render();
    }

    function sorter(mode) {
        const byText = (field) => (a, b) => String(a[field] || "").localeCompare(String(b[field] || ""));
        const byNumDesc = (field) => (a, b) => (b[field] ?? -Infinity) - (a[field] ?? -Infinity);
        const byNumAsc = (field) => (a, b) => (a[field] ?? Infinity) - (b[field] ?? Infinity);
        const options = {
            "roi-desc": byNumDesc("roi"),
            "profit-desc": byNumDesc("profit"),
            "ask-asc": byNumAsc("ask"),
            "ask-desc": byNumDesc("ask"),
            "maxbuy-asc": byNumAsc("maxBuy"),
            "days-asc": byNumAsc("days"),
            "location-asc": byText("location"),
            "title-asc": byText("title")
        };
        return options[mode] || options["roi-desc"];
    }

    function render() {
        renderSummary();
        renderList();
        renderDetail();
    }

    function renderSummary() {
        const visible = state.filtered.length;
        const go = state.filtered.filter((record) => record.verdict === "GO").length;
        const roiValues = state.filtered.map((record) => record.roi).filter((value) => value != null && !Number.isNaN(value));
        const avg = roiValues.length ? roiValues.reduce((sum, value) => sum + value, 0) / roiValues.length : 0;
        els.visibleCount.textContent = visible;
        els.totalCount.textContent = records.length;
        els.goRate.textContent = visible ? `${Math.round((go / visible) * 100)}%` : "0%";
        els.avgRoi.textContent = `${Math.round(avg)}%`;
        els.railCount.textContent = visible;
    }

    function renderList() {
        if (!state.filtered.length) {
            els.list.innerHTML = '<div class="empty-state">No records match these filters.</div>';
            return;
        }
        els.list.innerHTML = state.filtered.map((record) => `
            <button class="record-item ${record.id === state.selectedId ? "active" : ""}" type="button" data-id="${record.id}">
                <strong>${escapeHtml(record.title)}</strong>
                <small>${escapeHtml(record.location)} | Ask ${escapeHtml(money(record.ask))} | ROI ${escapeHtml(pct(record.roi))}</small>
                <span class="tag-row">
                    <span class="tag ${verdictClass(record.verdict)}">${escapeHtml(record.verdict)}</span>
                    <span class="tag">${escapeHtml(money(record.profit))} profit</span>
                </span>
            </button>
        `).join("");
    }

    function renderDetail() {
        const record = state.filtered.find((item) => item.id === state.selectedId);
        if (!record) {
            els.position.textContent = "0 / 0";
            els.title.textContent = "No records";
            els.accordion.innerHTML = '<div class="empty-state">Adjust filters to show records.</div>';
            els.panel.dataset.verdict = "";
            els.verdictIndicator.textContent = "Verdict: -";
            clearPriceScale();
            return;
        }

        const index = state.filtered.findIndex((item) => item.id === record.id);
        const values = record.values;
        els.position.textContent = `${index + 1} / ${state.filtered.length}`;
        els.title.textContent = record.title;
        els.roiValue.textContent = pct(record.roi);
        els.profitValue.textContent = money(record.profit);
        els.buyValue.textContent = money(record.maxBuy);
        els.confidenceValue.textContent = record.confidence;
        els.quickVerdict.textContent = record.verdict;
        els.quickAsk.textContent = money(record.ask);
        els.quickLocation.textContent = record.location;
        els.quickDays.textContent = safeText(sellDays(values));
        setVerdictVisual(record.verdict);

        setGauge(els.roiGauge, record.roi, 120, record.roi >= 60 ? "var(--hud)" : "var(--amber)");
        setGauge(els.profitGauge, record.profit, 400, record.profit >= 50 ? "var(--hud)" : "var(--amber)");
        setGauge(els.buyGauge, record.maxBuy, Math.max(100, record.ask || record.maxBuy || 100), "var(--cyan)");
        setGauge(els.confidenceGauge, confidenceScore(record.confidence), 100, confidenceTone(record.confidence));
        renderPriceScale(record);

        els.accordion.innerHTML = [
            section("Mission Brief", values, ["Scan Timestamp", "Date analyzed", "Status", "Listing ID", "Listing URL", "URL", "Title", "Ask Price", "Location", "Verdict", "Confidence", "Sell Days Min", "Sell Days Max", "Est. Days to Sell"], true),
            section("Pricing", values, ["Max Buy Price", "Opening Offer", "List Price", "Accept Price", "Estimated Costs", "Est. Costs", "Estimated Gross Profit", "Est. Gross Profit", "ROI", "ROI %", "Price Justification"], true),
            section("Item ID", values, ["Seller Name", "Category", "Brand", "Model", "Part Number / SKU", "Size / Dimensions", "Condition Stated", "Condition", "Condition From Photos", "Accessories Included", "Key Accessories"], false),
            section("Media And Quality Gate", values, ["Photos Available", "Photos Inspected", "Vision Quality", "Media Inspected", "Data Quality", "Browser URL Verified", "Expected Listing ID", "Actual Listing ID"], false),
            section("Risk And Sales Notes", values, ["Missing / Risk Items", "Missing/Risk Items", "Demand Trend", "Seasonality", "Competition Level", "Red Flags", "Green Flags", "Suggested Title Keywords"], false),
            section("Seller Messages", values, ["Soft Seller Message", "Soft Message", "Lowball Seller Message", "Lowball Message", "Recommended Message"], false),
            allColumns(values)
        ].join("");
    }

    function setVerdictVisual(verdict) {
        const normalized = normalizeVerdict(verdict);
        els.panel.dataset.verdict = normalized;
        const tone = verdictClass(normalized);
        els.verdictIndicator.className = "verdict-indicator";
        if (tone) els.verdictIndicator.classList.add(tone);
        els.verdictIndicator.textContent = `Verdict: ${normalized}`;
    }

    function clearPriceScale() {
        els.priceScaleRange.textContent = "0 - $0";
        els.buyZone.style.left = "0%";
        els.buyZone.style.width = "0%";
        els.cautionZone.style.left = "0%";
        els.cautionZone.style.width = "0%";
        els.sellZone.style.left = "0%";
        els.sellZone.style.width = "100%";
        els.buyBand.style.left = "0%";
        els.buyBand.style.width = "0%";
        els.sellBand.style.left = "0%";
        els.sellBand.style.width = "0%";
        els.priceMarkers.innerHTML = "";
        els.priceLegend.innerHTML = "";
    }

    function renderPriceScale(record) {
        const targetSale = [record.maxBuy, record.estimatedCosts, record.profit].every((value) => value != null)
            ? record.maxBuy + record.estimatedCosts + record.profit
            : null;
        const points = [
            { label: "Opening", value: record.openingOffer, tone: "var(--hud)" },
            { label: "Max Buy", value: record.maxBuy, tone: "var(--hud)" },
            { label: "Ask", value: record.ask, tone: "var(--amber)" },
            { label: "Accept", value: record.acceptPrice, tone: "var(--cyan)" },
            { label: "List", value: record.listPrice, tone: "var(--cyan)" },
            { label: "New Est", value: record.newEstimate, tone: "#a0c4ff" },
            { label: "Costs", value: record.estimatedCosts, tone: "var(--steel)" },
            { label: "Profit Target", value: targetSale, tone: "var(--danger)" }
        ].filter((point) => point.value != null && !Number.isNaN(point.value));

        if (!points.length) {
            clearPriceScale();
            return;
        }

        const maxima = points.map((point) => point.value);
        const scaleMax = Math.max(1, ...maxima);
        const buyEnd = clamp(0, valueOr(record.maxBuy, scaleMax * 0.35), scaleMax);
        const cautionEnd = clamp(buyEnd, valueOr(record.acceptPrice, scaleMax * 0.68), scaleMax);

        els.priceScaleRange.textContent = `0 - ${money(scaleMax)}`;

        setSpan(els.buyZone, 0, buyEnd, scaleMax);
        setSpan(els.cautionZone, buyEnd, cautionEnd, scaleMax);
        setSpan(els.sellZone, cautionEnd, scaleMax, scaleMax);
        setSpan(els.buyBand, valueOr(record.openingOffer, buyEnd * 0.65), buyEnd, scaleMax);
        setSpan(els.sellBand, valueOr(record.acceptPrice, cautionEnd), valueOr(record.listPrice, scaleMax), scaleMax);

        els.priceMarkers.innerHTML = points.map((point, index) => {
            const position = pctPos(point.value, scaleMax);
            return `
                <div class="price-marker" style="--x:${position}%;--row:${index % 3};--tone:${point.tone}">
                    <span class="price-dot"></span>
                    <span class="price-chip">${escapeHtml(point.label)} ${escapeHtml(money(point.value))}</span>
                </div>
            `;
        }).join("");

        els.priceLegend.innerHTML = [
            `<span class="legend-item">Buy Zone: 0 to ${escapeHtml(money(buyEnd))}</span>`,
            `<span class="legend-item">Sell Zone: ${escapeHtml(money(cautionEnd))} to ${escapeHtml(money(scaleMax))}</span>`,
            `<span class="legend-item">Target Profit: ${escapeHtml(money(record.profit))}</span>`
        ].join("");
    }

    function setSpan(element, start, end, max) {
        const from = pctPos(clamp(0, start, max), max);
        const to = pctPos(clamp(0, end, max), max);
        const width = Math.max(0, to - from);
        element.style.left = `${from}%`;
        element.style.width = `${width}%`;
    }

    function pctPos(value, max) {
        if (max <= 0) return 0;
        return (value / max) * 100;
    }

    function valueOr(value, fallback) {
        return value == null || Number.isNaN(value) ? fallback : value;
    }

    function clamp(min, value, max) {
        return Math.min(max, Math.max(min, value));
    }

    function sellDays(values) {
        const min = getAny(values, ["Sell Days Min"]);
        const max = getAny(values, ["Sell Days Max"]);
        if (min && max) return `${min}-${max} days`;
        return getAny(values, ["Est. Days to Sell"]);
    }

    function section(title, values, keys, open) {
        const fields = keys.filter((key) => headers.includes(key)).map((key) => field(key, get(values, key))).join("");
        return `<details ${open ? "open" : ""}><summary>${escapeHtml(title)}</summary><div class="field-grid">${fields}</div></details>`;
    }

    function allColumns(values) {
        return `<details><summary>All Columns</summary><div class="field-grid">${headers.map((header) => field(header, get(values, header))).join("")}</div></details>`;
    }

    function field(label, value) {
        const text = safeText(value);
        const rendered = /^https?:\/\//i.test(text)
            ? `<a href="${escapeAttr(text)}" target="_blank" rel="noopener noreferrer">${escapeHtml(text)}</a>`
            : escapeHtml(text);
        return `<div class="field"><span class="field-label">${escapeHtml(label)}</span><div class="field-value">${rendered}</div></div>`;
    }

    function confidenceScore(value) {
        const lower = String(value || "").toLowerCase();
        if (lower.includes("high")) return 88;
        if (lower.includes("medium")) return 58;
        if (lower.includes("low")) return 28;
        return 42;
    }

    function confidenceTone(value) {
        const score = confidenceScore(value);
        if (score >= 80) return "var(--hud)";
        if (score >= 50) return "var(--amber)";
        return "var(--danger)";
    }

    function moveSelection(direction) {
        if (!state.filtered.length) return;
        const current = state.filtered.findIndex((record) => record.id === state.selectedId);
        const next = (current + direction + state.filtered.length) % state.filtered.length;
        state.selectedId = state.filtered[next].id;
        render();
        document.querySelector(".record-panel").scrollIntoView({ block: "start", behavior: "smooth" });
    }

    function escapeHtml(value) {
        return String(value)
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;")
            .replaceAll("'", "&#039;");
    }

    function escapeAttr(value) {
        return escapeHtml(value);
    }

    function bindEvents() {
        [els.search, els.location, els.verdict, els.kpi, els.sort].forEach((el) => {
            el.addEventListener("input", applyFilters);
            el.addEventListener("change", applyFilters);
        });
        els.reset.addEventListener("click", () => {
            els.search.value = "";
            els.location.value = "all";
            els.verdict.value = "all";
            els.kpi.value = "all";
            els.sort.value = "roi-desc";
            applyFilters();
        });
        els.prev.addEventListener("click", () => moveSelection(-1));
        els.next.addEventListener("click", () => moveSelection(1));
        els.list.addEventListener("click", (event) => {
            const button = event.target.closest(".record-item");
            if (!button) return;
            state.selectedId = Number(button.dataset.id);
            render();
        });
    }

    buildFilters();
    bindEvents();
    applyFilters();
})();
