import { NextRequest, NextResponse } from "next/server";

import {
  readDatasetSnapshot,
  writeDatasetSnapshot
} from "@/src/lib/tam/datasetStore";
import type { TamPrimitive, TamSheetSnapshot } from "@/src/lib/tam/types";

type SheetMutationBody =
  | {
      action: "update-cell";
      sheetName: string;
      rowIndex: number;
      columnName: string;
      value: string | null;
    }
  | {
      action: "add-column";
      sheetName: string;
      columnName: string;
    };

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ dataset: string }> }
) {
  const { dataset } = await context.params;
  let body: SheetMutationBody;

  try {
    body = (await request.json()) as SheetMutationBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  try {
    const { snapshot, snapshotPath } = await readDatasetSnapshot(dataset);
    const sheet = getSheet(snapshot.sheets, body.sheetName);

    if (body.action === "update-cell") {
      applyCellUpdate(sheet, body);
    } else if (body.action === "add-column") {
      applyAddColumn(sheet, body.columnName);
    } else {
      return NextResponse.json({ error: "Unsupported action." }, { status: 400 });
    }

    snapshot.generatedAt = new Date().toISOString();
    await writeDatasetSnapshot(snapshotPath, snapshot);

    return NextResponse.json({ sheet });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 400 }
    );
  }
}

function getSheet(sheets: TamSheetSnapshot[], sheetName: string): TamSheetSnapshot {
  const sheet = sheets.find((entry) => entry.name === sheetName);
  if (!sheet) {
    throw new Error(`Sheet not found: ${sheetName}`);
  }
  return sheet;
}

function applyCellUpdate(
  sheet: TamSheetSnapshot,
  body: Extract<SheetMutationBody, { action: "update-cell" }>
) {
  const { rowIndex, columnName, value } = body;
  if (
    !Number.isInteger(rowIndex) ||
    rowIndex < 0 ||
    rowIndex >= sheet.rows.length
  ) {
    throw new Error("Row index is out of bounds.");
  }

  if (!sheet.columns.includes(columnName)) {
    throw new Error(`Column not found: ${columnName}`);
  }

  sheet.rows[rowIndex][columnName] = normalizePrimitiveValue(value);
}

function applyAddColumn(sheet: TamSheetSnapshot, requestedName: string) {
  const baseName = requestedName.trim();
  if (!baseName) {
    throw new Error("Column name is required.");
  }

  const columnName = createUniqueColumnName(sheet.columns, baseName);
  sheet.columns.push(columnName);
  for (const row of sheet.rows) {
    row[columnName] = null;
  }
}

function createUniqueColumnName(existingColumns: string[], baseName: string): string {
  if (!existingColumns.includes(baseName)) {
    return baseName;
  }

  let sequence = 2;
  while (existingColumns.includes(`${baseName} (${sequence})`)) {
    sequence += 1;
  }

  return `${baseName} (${sequence})`;
}

function normalizePrimitiveValue(value: string | null): TamPrimitive {
  if (value === null) {
    return null;
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }

  return value;
}

