import { readFile } from "node:fs/promises";
import path from "node:path";

import type {
  TamImageRef,
  TamLoadResult,
  TamPrimitive,
  TamRow,
  TamSheetSnapshot,
  TamWorkbookSnapshot
} from "./types";

const DEFAULT_SNAPSHOT_PATH = path.join(process.cwd(), "data", "tam.snapshot.json");

export async function loadTamSnapshot(
  snapshotPath = DEFAULT_SNAPSHOT_PATH
): Promise<TamLoadResult> {
  let rawText: string;

  try {
    rawText = await readFile(snapshotPath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { status: "missing", snapshotPath };
    }

    return {
      status: "malformed",
      snapshotPath,
      error: (error as Error).message
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch (error) {
    return {
      status: "malformed",
      snapshotPath,
      error: `Snapshot is not valid JSON: ${(error as Error).message}`
    };
  }

  const snapshot = parseSnapshot(parsed);
  if (!snapshot) {
    return {
      status: "malformed",
      snapshotPath,
      error: "Snapshot JSON shape is invalid."
    };
  }

  return { status: "ok", snapshot };
}

function parseSnapshot(value: unknown): TamWorkbookSnapshot | null {
  if (!isRecord(value)) {
    return null;
  }

  const workbook = parseWorkbookSnapshot(value);
  if (workbook) {
    return workbook;
  }

  const legacy = parseLegacySheetSnapshot(value);
  if (!legacy) {
    return null;
  }
  if (
    typeof value.generatedAt !== "string" ||
    Number.isNaN(Date.parse(value.generatedAt)) ||
    typeof value.sourceFile !== "string"
  ) {
    return null;
  }

  return {
    defaultSheet: legacy.name,
    sheets: [legacy],
    generatedAt: value.generatedAt,
    sourceFile: value.sourceFile
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isTamPrimitive(value: unknown): value is TamPrimitive {
  return (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  );
}

function parseWorkbookSnapshot(value: Record<string, unknown>): TamWorkbookSnapshot | null {
  const { generatedAt, sourceFile, sheets, defaultSheet } = value;
  if (typeof generatedAt !== "string" || Number.isNaN(Date.parse(generatedAt))) {
    return null;
  }

  if (typeof sourceFile !== "string") {
    return null;
  }

  if (!Array.isArray(sheets)) {
    return null;
  }

  const parsedSheets: TamSheetSnapshot[] = [];
  for (const sheetValue of sheets) {
    const parsedSheet = parseSheetSnapshot(sheetValue);
    if (!parsedSheet) {
      return null;
    }
    parsedSheets.push(parsedSheet);
  }

  if (parsedSheets.length === 0) {
    return {
      generatedAt,
      sourceFile,
      defaultSheet: typeof defaultSheet === "string" ? defaultSheet : "",
      sheets: []
    };
  }

  let normalizedDefaultSheet =
    typeof defaultSheet === "string" ? defaultSheet : parsedSheets[0].name;
  if (!parsedSheets.some((sheet) => sheet.name === normalizedDefaultSheet)) {
    normalizedDefaultSheet = parsedSheets[0].name;
  }

  return {
    generatedAt,
    sourceFile,
    defaultSheet: normalizedDefaultSheet,
    sheets: parsedSheets
  };
}

function parseLegacySheetSnapshot(value: Record<string, unknown>): TamSheetSnapshot | null {
  const { columns, rows, rowCount } = value;
  if (!Array.isArray(columns) || !columns.every((column) => typeof column === "string")) {
    return null;
  }

  if (!Array.isArray(rows)) {
    return null;
  }

  if (typeof rowCount !== "number" || !Number.isInteger(rowCount) || rowCount < 0) {
    return null;
  }

  const parsedRows: TamRow[] = [];
  for (const rowValue of rows) {
    if (!isRecord(rowValue)) {
      return null;
    }

    const row: TamRow = {};
    for (const column of columns) {
      const cellValue = column in rowValue ? rowValue[column] : null;
      if (!isTamPrimitive(cellValue)) {
        return null;
      }
      row[column] = cellValue;
    }
    parsedRows.push(row);
  }

  if (rowCount !== parsedRows.length) {
    return null;
  }

  return {
    name: "TAM",
    columns: [...columns],
    rows: parsedRows,
    rowCount
  };
}

function parseSheetSnapshot(value: unknown): TamSheetSnapshot | null {
  if (!isRecord(value)) {
    return null;
  }

  const { name, columns, rows, rowCount, images } = value;
  if (typeof name !== "string" || name.length === 0) {
    return null;
  }

  if (!Array.isArray(columns) || !columns.every((column) => typeof column === "string")) {
    return null;
  }

  if (!Array.isArray(rows)) {
    return null;
  }

  if (typeof rowCount !== "number" || !Number.isInteger(rowCount) || rowCount < 0) {
    return null;
  }

  const parsedRows: TamRow[] = [];
  for (const rowValue of rows) {
    if (!isRecord(rowValue)) {
      return null;
    }

    const row: TamRow = {};
    for (const column of columns) {
      const cellValue = column in rowValue ? rowValue[column] : null;
      if (!isTamPrimitive(cellValue)) {
        return null;
      }
      row[column] = cellValue;
    }
    parsedRows.push(row);
  }

  if (rowCount !== parsedRows.length) {
    return null;
  }

  let parsedImages: TamImageRef[] | undefined;
  if (images !== undefined) {
    if (!Array.isArray(images)) {
      return null;
    }

    parsedImages = [];
    for (const imageValue of images) {
      const parsedImage = parseImageRef(imageValue);
      if (!parsedImage) {
        return null;
      }
      parsedImages.push(parsedImage);
    }
  }

  const snapshot: TamSheetSnapshot = {
    name,
    columns: [...columns],
    rows: parsedRows,
    rowCount
  };

  if (parsedImages && parsedImages.length > 0) {
    snapshot.images = parsedImages;
  }

  return snapshot;
}

function parseImageRef(value: unknown): TamImageRef | null {
  if (!isRecord(value)) {
    return null;
  }

  const { rowIndex, colIndex, src, fileName } = value;
  if (
    typeof rowIndex !== "number" ||
    !Number.isInteger(rowIndex) ||
    rowIndex < 0 ||
    typeof colIndex !== "number" ||
    !Number.isInteger(colIndex) ||
    colIndex < 0 ||
    typeof src !== "string" ||
    src.length === 0 ||
    typeof fileName !== "string" ||
    fileName.length === 0
  ) {
    return null;
  }

  return {
    rowIndex,
    colIndex,
    src,
    fileName
  };
}
