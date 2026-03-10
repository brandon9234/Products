import { NextRequest, NextResponse } from "next/server";

import { PRODUCT_CATEGORY_COLUMN } from "@/src/lib/tam/productSheets";
import {
  readDatasetSnapshot,
  writeDatasetSnapshot
} from "@/src/lib/tam/datasetStore";
import type {
  TamImageRef,
  TamPrimitive,
  TamRow,
  TamSheetSnapshot,
  TamWorkbookSnapshot
} from "@/src/lib/tam/types";

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
    }
  | {
      action: "delete-column";
      sheetName: string;
      columnName: string;
    }
  | {
      action: "reorder-column";
      sheetName: string;
      columnName: string;
      targetIndex: number;
    }
  | {
      action: "delete-sheet";
      sheetName: string;
    }
  | {
      action: "delete-product-category";
      productCategory: string;
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
    let responseSheet: TamSheetSnapshot | null = null;
    let responsePayload: Record<string, unknown> = { ok: true };

    switch (body.action) {
      case "update-cell": {
        const sheet = getSheet(snapshot.sheets, body.sheetName);
        applyCellUpdate(sheet, body);
        responseSheet = sheet;
        break;
      }
      case "add-column": {
        const sheet = getSheet(snapshot.sheets, body.sheetName);
        applyAddColumn(sheet, body.columnName);
        responseSheet = sheet;
        break;
      }
      case "delete-column": {
        const sheet = getSheet(snapshot.sheets, body.sheetName);
        applyDeleteColumn(sheet, body.columnName);
        responseSheet = sheet;
        break;
      }
      case "reorder-column": {
        const sheet = getSheet(snapshot.sheets, body.sheetName);
        applyReorderColumn(sheet, body.columnName, body.targetIndex);
        responseSheet = sheet;
        break;
      }
      case "delete-sheet": {
        const nextSheetName = applyDeleteSheet(snapshot, body.sheetName);
        responsePayload = {
          ok: true,
          deletedSheetName: body.sheetName,
          nextSheetName
        };
        break;
      }
      case "delete-product-category": {
        const removedRowCount = applyDeleteProductCategory(
          snapshot.sheets,
          body.productCategory
        );
        if (removedRowCount === 0) {
          throw new Error(`Product category not found: ${body.productCategory}`);
        }
        break;
      }
      default:
        return NextResponse.json({ error: "Unsupported action." }, { status: 400 });
    }

    snapshot.generatedAt = new Date().toISOString();
    await writeDatasetSnapshot(snapshotPath, snapshot);

    if (responseSheet) {
      return NextResponse.json({ sheet: responseSheet });
    }

    return NextResponse.json(responsePayload);
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

function applyDeleteColumn(sheet: TamSheetSnapshot, columnName: string) {
  const columnIndex = sheet.columns.indexOf(columnName);
  if (columnIndex < 0) {
    throw new Error(`Column not found: ${columnName}`);
  }

  sheet.columns.splice(columnIndex, 1);
  for (const row of sheet.rows) {
    delete row[columnName];
  }
}

function applyReorderColumn(
  sheet: TamSheetSnapshot,
  columnName: string,
  targetIndex: number
) {
  const currentIndex = sheet.columns.indexOf(columnName);
  if (currentIndex < 0) {
    throw new Error(`Column not found: ${columnName}`);
  }

  if (!Number.isInteger(targetIndex)) {
    throw new Error("targetIndex must be an integer.");
  }

  if (targetIndex < 0 || targetIndex >= sheet.columns.length) {
    throw new Error("targetIndex is out of bounds.");
  }

  if (currentIndex === targetIndex) {
    return;
  }

  const [movedColumn] = sheet.columns.splice(currentIndex, 1);
  sheet.columns.splice(targetIndex, 0, movedColumn);
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

function applyDeleteSheet(snapshot: TamWorkbookSnapshot, requestedSheetName: string): string {
  const sheetName = requestedSheetName.trim();
  if (!sheetName) {
    throw new Error("sheetName is required.");
  }

  if (sheetName === "Substrates") {
    throw new Error('The "Substrates" sheet cannot be deleted.');
  }

  const sheetIndex = snapshot.sheets.findIndex((sheet) => sheet.name === sheetName);
  if (sheetIndex < 0) {
    throw new Error(`Sheet not found: ${sheetName}`);
  }

  if (snapshot.sheets.length <= 1) {
    throw new Error("Cannot delete the last remaining sheet.");
  }

  snapshot.sheets.splice(sheetIndex, 1);
  const fallbackSheet =
    snapshot.sheets[sheetIndex] ??
    snapshot.sheets[sheetIndex - 1] ??
    snapshot.sheets[0];

  if (!fallbackSheet) {
    throw new Error("No fallback sheet is available after deletion.");
  }

  if (snapshot.defaultSheet === sheetName) {
    snapshot.defaultSheet = fallbackSheet.name;
  }

  return fallbackSheet.name;
}

function applyDeleteProductCategory(
  sheets: TamSheetSnapshot[],
  requestedProductCategory: string
): number {
  const normalizedCategory = normalizeCategory(requestedProductCategory);
  if (!normalizedCategory) {
    throw new Error("Product category is required.");
  }

  let deletedRows = 0;

  for (const sheet of sheets) {
    if (!sheet.columns.includes(PRODUCT_CATEGORY_COLUMN)) {
      continue;
    }

    const retainedRows: TamRow[] = [];
    const nextRowIndexByPrevious = new Map<number, number>();

    for (let rowIndex = 0; rowIndex < sheet.rows.length; rowIndex += 1) {
      const row = sheet.rows[rowIndex];
      if (normalizeCategory(row[PRODUCT_CATEGORY_COLUMN]) === normalizedCategory) {
        deletedRows += 1;
        continue;
      }

      nextRowIndexByPrevious.set(rowIndex, retainedRows.length);
      retainedRows.push(row);
    }

    if (retainedRows.length === sheet.rows.length) {
      continue;
    }

    sheet.rows = retainedRows;
    sheet.rowCount = retainedRows.length;

    if (!sheet.images || sheet.images.length === 0) {
      continue;
    }

    const nextImages: TamImageRef[] = [];
    for (const imageRef of sheet.images) {
      const remappedRowIndex = nextRowIndexByPrevious.get(imageRef.rowIndex);
      if (remappedRowIndex === undefined) {
        continue;
      }

      nextImages.push({
        ...imageRef,
        rowIndex: remappedRowIndex
      });
    }

    if (nextImages.length > 0) {
      sheet.images = nextImages;
    } else {
      delete sheet.images;
    }
  }

  return deletedRows;
}

function normalizeCategory(value: TamPrimitive): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }

  return trimmed;
}
