import { readFile } from "node:fs/promises";
import path from "node:path";

import type {
  TamLoadResult,
  TamPrimitive,
  TamRow,
  TamSnapshot
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

function parseSnapshot(value: unknown): TamSnapshot | null {
  if (!isRecord(value)) {
    return null;
  }

  const { columns, rows, generatedAt, sourceFile, rowCount } = value;
  if (!Array.isArray(columns) || !columns.every((column) => typeof column === "string")) {
    return null;
  }

  if (!Array.isArray(rows)) {
    return null;
  }

  if (typeof generatedAt !== "string" || Number.isNaN(Date.parse(generatedAt))) {
    return null;
  }

  if (typeof sourceFile !== "string") {
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
    columns: [...columns],
    rows: parsedRows,
    generatedAt,
    sourceFile,
    rowCount
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

