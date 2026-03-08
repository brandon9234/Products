import * as XLSX from "xlsx";
import { describe, expect, it } from "vitest";

import { buildSnapshotFromWorkbook, resolveSheetName } from "@/src/lib/tam/importer";

const FIXED_DATE = new Date("2026-03-08T00:00:00.000Z");

describe("buildSnapshotFromWorkbook", () => {
  it("parses headers and rows while preserving all columns", () => {
    const workbook = XLSX.utils.book_new();
    const sheet = XLSX.utils.aoa_to_sheet([
      [" Market ", "Revenue", "Active"],
      ["North", 1200, true],
      ["South", "", false]
    ]);
    XLSX.utils.book_append_sheet(workbook, sheet, "TAM");

    const snapshot = buildSnapshotFromWorkbook({
      workbook,
      sourceFile: "data/raw/tam.xlsx",
      preferredSheet: "TAM",
      generatedAt: FIXED_DATE
    });

    expect(snapshot.columns).toEqual(["Market", "Revenue", "Active"]);
    expect(snapshot.rowCount).toBe(2);
    expect(snapshot.rows).toEqual([
      { Market: "North", Revenue: 1200, Active: true },
      { Market: "South", Revenue: null, Active: false }
    ]);
  });

  it("falls back to first sheet if TAM is missing", () => {
    const workbook = XLSX.utils.book_new();
    const firstSheet = XLSX.utils.aoa_to_sheet([
      ["Region", "Units"],
      ["West", 55]
    ]);
    XLSX.utils.book_append_sheet(workbook, firstSheet, "ExportData");

    const selectedSheet = resolveSheetName(workbook, "TAM");
    const snapshot = buildSnapshotFromWorkbook({
      workbook,
      sourceFile: "data/raw/tam.xlsx",
      preferredSheet: "TAM",
      generatedAt: FIXED_DATE
    });

    expect(selectedSheet).toBe("ExportData");
    expect(snapshot.columns).toEqual(["Region", "Units"]);
    expect(snapshot.rows).toEqual([{ Region: "West", Units: 55 }]);
  });

  it("creates deterministic snapshot output when timestamp is fixed", () => {
    const workbook = XLSX.utils.book_new();
    const sheet = XLSX.utils.aoa_to_sheet([
      ["Category", "Share"],
      ["A", 0.25]
    ]);
    XLSX.utils.book_append_sheet(workbook, sheet, "TAM");

    const first = buildSnapshotFromWorkbook({
      workbook,
      sourceFile: "data/raw/tam.xlsx",
      generatedAt: FIXED_DATE
    });
    const second = buildSnapshotFromWorkbook({
      workbook,
      sourceFile: "data/raw/tam.xlsx",
      generatedAt: FIXED_DATE
    });

    expect(first).toEqual(second);
    expect(first.generatedAt).toBe("2026-03-08T00:00:00.000Z");
  });
});

