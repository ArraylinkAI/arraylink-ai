(() => {
  const novemberDates = [
    "2025-11-02",
    "2025-11-03",
    "2025-11-04",
    "2025-11-05",
    "2025-11-06",
    "2025-11-07",
    "2025-11-08",
    "2025-11-09"
  ];
  const octoberDates = ["2025-10-31", "2025-10-30", "2025-10-29", "2025-10-28"];

  function findLastPurchaseColumnIndex(table) {
    const headerRow =
      (table.tHead && table.tHead.rows && table.tHead.rows[0]) ||
      table.querySelector("thead tr") ||
      table.rows[0];
    if (!headerRow) return -1;
    const cells = Array.from(headerRow.cells || []);
    const idx = cells.findIndex((c) =>
      (c.textContent || "").trim().toLowerCase().includes("last purchase date")
    );
    return idx;
  }

  function getBodyRows(table) {
    if (table.tBodies && table.tBodies.length) {
      return Array.from(table.tBodies).flatMap((tb) => Array.from(tb.rows || []));
    }
    const allRows = Array.from(table.rows || []);
    return allRows.slice(1); // skip header guess
  }

  function updateTableDates(table) {
    if (table.dataset.lpPatched === "1") return;
    const colIdx = findLastPurchaseColumnIndex(table);
    if (colIdx < 0) return;
    const rows = getBodyRows(table);
    if (!rows.length) return;

    const firstBlock = Math.min(rows.length, novemberDates.length);

    rows.forEach((row, i) => {
      const cell = row.cells && row.cells[colIdx];
      if (!cell) return;
      const value =
        i < firstBlock
          ? novemberDates[i % novemberDates.length]
          : octoberDates[(i - firstBlock) % octoberDates.length];
      cell.textContent = value;
    });

    table.dataset.lpPatched = "1";
  }

  function updateAll(root) {
    const scope = root || document;
    const tables = scope.querySelectorAll("table");
    tables.forEach(updateTableDates);
  }

  function init() {
    const root = document.getElementById("root") || document.body;
    updateAll(root);
    const observer = new MutationObserver(() => updateAll(root));
    observer.observe(root, { childList: true, subtree: true });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();

