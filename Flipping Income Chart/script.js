(function () {
    const payload = window.FLIP_TRACKER_DATA || { headers: [], rows: [] };
    const headers = payload.headers || [];
    const rows = (payload.rows || []).map((row) => headers.reduce((record, header, index) => {
        record[header] = row[index];
        return record;
    }, {}));

    const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
    const number = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });
    const COLS = {
        item: "Description",
        type: "Type",
        buyDate: "Date bought",
        soldDate: "Date sold",
        buyPrice: "Paid",
        soldPrice: "Sale price",
        profit: "Profit",
        sold: "Sold",
        inventory: "In Inventory",
    };
    const TRACE_DEFS = [
        ["inventoryValue", "Inventory Value", null, true],
        ["cashOnHand", "Cash on Hand", null, true],
        ["total", "Total Inventory + Cash", null, true],
        ["inventoryMA", "Inventory Value 30D MA", null, false],
        ["cashMA", "Cash on Hand 30D MA", null, false],
        ["totalMA", "Total 30D MA", null, true],
        ["avgInventoryValue", "Avg Inventory Value per Item", "y2", false],
        ["avgMA", "Avg Inventory Value 30D MA", "y2", false],
        ["activity", "Buy / Sell Activity", null, false],
    ];

    const items = rows.filter((row) => excelDate(row[COLS.buyDate]));
    const yearFilter = document.getElementById("year-filter");
    const categoryFilter = document.getElementById("category-filter");
    const traceControls = document.getElementById("trace-controls");
    const traceState = new Map(TRACE_DEFS.map(([key, , , enabled]) => [key, enabled]));

    initControls();
    render();

    function initControls() {
        const years = Array.from(new Set(items.flatMap((row) => [excelDate(row[COLS.buyDate]), excelDate(row[COLS.soldDate])])
            .filter(Boolean)
            .map((date) => date.getUTCFullYear()))).sort((a, b) => b - a);
        const categories = Array.from(new Set(items.map((row) => row[COLS.type] || "Other"))).sort((a, b) => a.localeCompare(b));

        yearFilter.innerHTML = `<option value="all">All years</option>${years.map((year) => `<option value="${year}">${year}</option>`).join("")}`;
        categoryFilter.innerHTML = `<option value="all">All categories</option>${categories.map((type) => `<option value="${escapeAttr(type)}">${escapeHtml(type)}</option>`).join("")}`;
        traceControls.innerHTML = TRACE_DEFS.map(([key, label, , enabled]) => `
            <label class="trace-toggle">
                <input type="checkbox" value="${key}" ${enabled ? "checked" : ""}>
                <span>${escapeHtml(label)}</span>
            </label>
        `).join("");

        yearFilter.addEventListener("change", render);
        categoryFilter.addEventListener("change", render);
        traceControls.addEventListener("change", (event) => {
            if (event.target.matches("input[type='checkbox']")) {
                traceState.set(event.target.value, event.target.checked);
                render();
            }
        });
    }

    function filteredItems() {
        const year = yearFilter.value;
        const category = categoryFilter.value;
        return items.filter((row) => {
            const buyDate = excelDate(row[COLS.buyDate]);
            const soldDate = excelDate(row[COLS.soldDate]);
            const matchesYear = year === "all" || [buyDate, soldDate].some((date) => date && String(date.getUTCFullYear()) === year);
            const matchesCategory = category === "all" || (row[COLS.type] || "Other") === category;
            return matchesYear && matchesCategory;
        });
    }

    function filteredSoldRows(sourceItems) {
        const year = yearFilter.value;
        return sourceItems.filter((row) => {
            const soldDate = excelDate(row[COLS.soldDate]);
            const sold = toNumber(row[COLS.sold]) === 1 || toNumber(row[COLS.soldPrice]) > 0;
            return sold && (year === "all" || (soldDate && String(soldDate.getUTCFullYear()) === year));
        });
    }

    function render() {
        const scopedItems = filteredItems();
        const scopedEvents = buildEvents(scopedItems).sort((a, b) => a.date - b.date);
        const daily = buildDaily(scopedEvents);
        const soldRows = filteredSoldRows(scopedItems);
        const inventoryRows = scopedItems.filter((row) => toNumber(row[COLS.inventory]) === 1);

        renderKpis(soldRows, inventoryRows);
        renderPlotly(daily);
        renderTypeBars(soldRows);
        renderInventory(inventoryRows);
        renderRecentSales(soldRows);
    }

    function buildEvents(sourceRows) {
        const allEvents = [];
        sourceRows.forEach((row) => {
            const buyDate = excelDate(row[COLS.buyDate]);
            const soldDate = excelDate(row[COLS.soldDate]);
            const paid = toNumber(row[COLS.buyPrice]);
            const salePrice = toNumber(row[COLS.soldPrice]);
            const item = row[COLS.item] || "Untitled item";

            if (buyDate) {
                allEvents.push({ date: buyDate, item, type: "Buy", amount: paid, inventoryDelta: paid, cashDelta: -paid, countDelta: 1 });
            }
            if (soldDate) {
                allEvents.push({ date: soldDate, item, type: "Sell", amount: salePrice, inventoryDelta: -paid, cashDelta: salePrice, countDelta: -1 });
            }
        });
        return allEvents;
    }

    function buildDaily(sourceEvents) {
        if (!sourceEvents.length) return [];
        const start = new Date(dateKey(sourceEvents[0].date));
        const today = new Date();
        const lastEvent = sourceEvents[sourceEvents.length - 1].date;
        const end = lastEvent > today ? lastEvent : today;
        const byDate = new Map();

        sourceEvents.forEach((event) => {
            const key = dateKey(event.date);
            const bucket = byDate.get(key) || { inventoryDelta: 0, cashDelta: 0, countDelta: 0, activity: [] };
            bucket.inventoryDelta += event.inventoryDelta;
            bucket.cashDelta += event.cashDelta;
            bucket.countDelta += event.countDelta;
            bucket.activity.push(`${event.type}: ${event.item} (${money.format(event.amount)})`);
            byDate.set(key, bucket);
        });

        const output = [];
        let inventoryValue = 0;
        let cashOnHand = 0;
        let inventoryCount = 0;
        for (let date = start; date <= end; date = addDays(date, 1)) {
            const bucket = byDate.get(dateKey(date)) || { inventoryDelta: 0, cashDelta: 0, countDelta: 0, activity: [] };
            inventoryValue += bucket.inventoryDelta;
            cashOnHand += bucket.cashDelta;
            inventoryCount += bucket.countDelta;
            output.push({
                date: new Date(date),
                inventoryValue,
                cashOnHand,
                inventoryCount,
                total: inventoryValue + cashOnHand,
                avgInventoryValue: inventoryCount > 0 ? inventoryValue / inventoryCount : null,
                activity: bucket.activity.join("<br>"),
            });
        }

        const inventoryMA = rollingMean(output.map((row) => row.inventoryValue), 30);
        const cashMA = rollingMean(output.map((row) => row.cashOnHand), 30);
        const totalMA = rollingMean(output.map((row) => row.total), 30);
        const avgMA = rollingMean(output.map((row) => row.avgInventoryValue), 30);
        return output.map((row, index) => ({ ...row, inventoryMA: inventoryMA[index], cashMA: cashMA[index], totalMA: totalMA[index], avgMA: avgMA[index] }));
    }

    function renderKpis(soldRows, inventoryRows) {
        const totalProfit = sum(soldRows, COLS.profit);
        const salesRevenue = sum(soldRows, COLS.soldPrice);
        const paid = sum(soldRows, COLS.buyPrice);
        const avgDays = average(soldRows, "Days to sell");
        const inventoryCost = sum(inventoryRows, COLS.buyPrice);
        const roi = paid ? totalProfit / paid : 0;
        setText("total-profit", money.format(totalProfit));
        setText("sales-revenue", money.format(salesRevenue));
        setText("sold-count", soldRows.length);
        setText("avg-days", number.format(avgDays));
        setText("inventory-cost", money.format(inventoryCost));
        setText("realized-roi", `${number.format(roi * 100)}%`);
    }

    function renderPlotly(source) {
        const data = TRACE_DEFS
            .filter(([key]) => traceState.get(key))
            .map(([key, label, axis]) => key === "activity" ? activityTrace(source) : lineTrace(source, key, label, axis));

        Plotly.react("income-chart", data, {
            title: { text: "Adventure Asset Tracker: Inventory Value, Cash on Hand, Total Equity, and Avg Item Value" },
            paper_bgcolor: "rgba(0,0,0,0)",
            plot_bgcolor: "rgba(0,0,0,0)",
            font: { family: "Outfit, sans-serif", color: "#f4f0df" },
            colorway: ["#42f5a7", "#55d6ff", "#ffb84a", "#2acb84", "#3aa5ff", "#f5d06a", "#ff6f91", "#cbbcff", "#ffffff"],
            xaxis: { title: "Date", gridcolor: "rgba(244,240,223,0.10)", zerolinecolor: "rgba(244,240,223,0.18)" },
            yaxis: {
                title: "Inventory / Cash / Total Equity ($)",
                tickprefix: "$",
                separatethousands: true,
                gridcolor: "rgba(244,240,223,0.10)",
                zerolinecolor: "rgba(244,240,223,0.18)",
            },
            yaxis2: {
                title: "Avg Inventory Value per Item ($)",
                tickprefix: "$",
                separatethousands: true,
                overlaying: "y",
                side: "right",
                gridcolor: "rgba(244,240,223,0)",
            },
            hovermode: "x",
            hoverlabel: { bgcolor: "#101411", bordercolor: "rgba(66,245,167,0.55)", font: { color: "#f4f0df" } },
            legend: { orientation: "h", yanchor: "bottom", y: 1.02, xanchor: "left", x: 0 },
            margin: { l: 72, r: 82, t: 92, b: 58 },
        }, { responsive: true, displaylogo: false });
    }

    function lineTrace(source, key, label, axis) {
        return {
            x: source.map((row) => row.date),
            y: source.map((row) => row[key]),
            mode: "lines",
            name: label,
            yaxis: axis,
            line: { width: key.endsWith("MA") ? 2 : 3 },
            hovertemplate: `<b>%{x|%Y-%m-%d}</b><br>${label}: $%{y:,.2f}<extra></extra>`,
        };
    }

    function activityTrace(source) {
        const active = source.filter((row) => row.activity);
        return {
            x: active.map((row) => row.date),
            y: active.map((row) => row.total),
            mode: "markers",
            name: "Buy / Sell Activity",
            marker: { size: 8, symbol: "diamond", color: "#f4f0df", line: { width: 1, color: "#42f5a7" } },
            text: active.map((row) => row.activity),
            hovertemplate: "<b>%{x|%Y-%m-%d}</b><br>%{text}<extra></extra>",
        };
    }

    function renderTypeBars(records) {
        const byType = new Map();
        records.forEach((row) => {
            const type = row[COLS.type] || "Other";
            byType.set(type, (byType.get(type) || 0) + toNumber(row[COLS.profit]));
        });
        const sorted = Array.from(byType.entries()).sort((a, b) => b[1] - a[1]).slice(0, 8);
        const max = Math.max(1, ...sorted.map((entry) => Math.abs(entry[1])));
        document.getElementById("type-bars").innerHTML = sorted.map(([type, profit]) => `
            <div class="bar-row">
                <header><span>${escapeHtml(type)}</span><strong>${money.format(profit)}</strong></header>
                <div class="bar-track"><div class="bar-fill" style="width: ${Math.max(3, Math.abs(profit) / max * 100)}%"></div></div>
            </div>
        `).join("") || `<p>No closed sales match the selected filters.</p>`;
    }

    function renderInventory(inventoryRows) {
        const topInventory = [...inventoryRows].sort((a, b) => toNumber(b[COLS.buyPrice]) - toNumber(a[COLS.buyPrice])).slice(0, 8);
        document.getElementById("inventory-list").innerHTML = topInventory.map((row) => `
            <div class="inventory-item">
                <div>
                    <strong>${escapeHtml(row[COLS.item] || "Untitled item")}</strong>
                    <span>${escapeHtml(row[COLS.type] || "Other")} bought ${formatDate(row[COLS.buyDate])}</span>
                </div>
                <b>${money.format(toNumber(row[COLS.buyPrice]))}</b>
            </div>
        `).join("") || `<p>No active inventory matches the selected filters.</p>`;
    }

    function renderRecentSales(records) {
        const recent = [...records].sort((a, b) => (excelDate(b[COLS.soldDate]) || 0) - (excelDate(a[COLS.soldDate]) || 0)).slice(0, 12);
        document.getElementById("recent-sales").innerHTML = recent.map((row) => {
            const profit = toNumber(row[COLS.profit]);
            return `
                <tr>
                    <td>${formatDate(row[COLS.soldDate])}</td>
                    <td>${escapeHtml(row[COLS.item] || "")}</td>
                    <td>${escapeHtml(row[COLS.type] || "")}</td>
                    <td>${money.format(toNumber(row[COLS.buyPrice]))}</td>
                    <td>${money.format(toNumber(row[COLS.soldPrice]))}</td>
                    <td class="${profit >= 0 ? "profit-positive" : "profit-negative"}">${money.format(profit)}</td>
                    <td>${number.format(toNumber(row["Days to sell"]))}</td>
                </tr>
            `;
        }).join("");
    }

    function toNumber(value) {
        const numeric = Number(value);
        return Number.isFinite(numeric) ? numeric : 0;
    }

    function excelDate(value) {
        if (!value) return null;
        if (typeof value === "string" && value.includes("-")) {
            const parsed = new Date(value);
            return Number.isNaN(parsed.valueOf()) ? null : parsed;
        }
        const serial = Number(value);
        if (!Number.isFinite(serial)) return null;
        return new Date(Date.UTC(1899, 11, 30 + serial));
    }

    function dateKey(date) {
        return date.toISOString().slice(0, 10);
    }

    function addDays(date, days) {
        const copy = new Date(date);
        copy.setUTCDate(copy.getUTCDate() + days);
        return copy;
    }

    function formatDate(value) {
        const date = excelDate(value);
        return date ? date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }) : "";
    }

    function mean(values) {
        const valid = values.filter((value) => Number.isFinite(value));
        return valid.length ? valid.reduce((total, value) => total + value, 0) / valid.length : null;
    }

    function rollingMean(values, windowSize) {
        return values.map((_, index) => mean(values.slice(Math.max(0, index - windowSize + 1), index + 1)));
    }

    function sum(records, key) {
        return records.reduce((total, row) => total + toNumber(row[key]), 0);
    }

    function average(records, key) {
        const values = records.map((row) => toNumber(row[key])).filter((value) => value > 0);
        return values.length ? values.reduce((total, value) => total + value, 0) / values.length : 0;
    }

    function setText(id, value) {
        document.getElementById(id).textContent = value;
    }

    function escapeHtml(value) {
        return String(value).replace(/[&<>"']/g, (char) => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#039;",
        }[char]));
    }

    function escapeAttr(value) {
        return escapeHtml(value).replace(/`/g, "&#096;");
    }
}());
