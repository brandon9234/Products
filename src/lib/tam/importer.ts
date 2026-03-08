import * as XLSX from "xlsx";

import type { TamPrimitive, TamRow, TamSnapshot } from "./types";

export const DEFAULT_SHEET_NAME = "TAM";

interface BuildSnapshotOptions {
  workbook: XLSX.WorkBook;
  sourceFile: string;
  preferredSheet?: string;
  generatedAt?: Date;
}

export function readWorkbookFromFile(inputPath: string): XLSX.WorkBook {
  return XLSX.readFile(inputPath, {
    raw: true,
    cellDates: false
  });
}

export function resolveSheetName(
  workbook: XLSX.WorkBook,
  preferredSheet = DEFAULT_SHEET_NAME
): string {
  if (workbook.SheetNames.length === 0) {
    throw new Error("Workbook does not contain any sheets.");
  }

  if (workbook.Sheets[preferredSheet]) {
    return preferredSheet;
  }

  return workbook.SheetNames[0];
}

export function buildSnapshotFromWorkbook({
  workbook,
  sourceFile,
  preferredSheet = DEFAULT_SHEET_NAME,
  generatedAt = new Date()
}: BuildSnapshotOptions): TamSnapshot {
  const selectedSheetName = resolveSheetName(workbook, preferredSheet);
  const sheet = workbook.Sheets[selectedSheetName];

  if (!sheet) {
    throw new Error(`Unable to read sheet "${selectedSheetName}".`);
  }

  const matrix = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    raw: true,
    blankrows: false,
    defval: null
  }) as unknown[][];

  if (matrix.length === 0) {
    return {
      columns: [],
      rows: [],
      generatedAt: generatedAt.toISOString(),
      sourceFile: normalizePath(sourceFile),
      rowCount: 0
    };
  }

  const [headerRow, ...dataRows] = matrix;
  const columns = normalizeHeaders(headerRow);
  const rows = dataRows.map((row) =>
    buildRow(columns, Array.isArray(row) ? row : [])
  );

  return {
    columns,
    rows,
    generatedAt: generatedAt.toISOString(),
    sourceFile: normalizePath(sourceFile),
    rowCount: rows.length
  };
}

function normalizeHeaders(headerRow: unknown[]): string[] {
  const seen = new Map<string, number>();

  return headerRow.map((value, index) => {
    const trimmed = stringifyCell(value)?.trim() ?? "";
    const baseName = trimmed.length > 0 ? trimmed : `Column ${index + 1}`;
    const suffixCount = seen.get(baseName) ?? 0;
    seen.set(baseName, suffixCount + 1);

    if (suffixCount === 0) {
      return baseName;
    }

    return `${baseName} (${suffixCount + 1})`;
  });
}

function buildRow(columns: string[], rawRow: unknown[]): TamRow {
  const row: TamRow = {};

  for (let index = 0; index < columns.length; index += 1) {
    row[columns[index]] = normalizeCell(rawRow[index]);
  }

  return row;
}

function normalizeCell(value: unknown): TamPrimitive {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  const asString = stringifyCell(value)?.trim() ?? "";
  return asString.length > 0 ? asString : null;
}

function stringifyCell(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  return String(value);
}

function normalizePath(filePath: string): string {
  return filePath.replace(/\\/g, "/");
}

