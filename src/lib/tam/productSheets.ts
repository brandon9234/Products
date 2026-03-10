import type { TamImageRef, TamPrimitive, TamRow, TamSheetSnapshot } from "./types";
import {
  MACHINE_COLUMN_NAME,
  MACHINE_OPTIONS,
  parseMachineSelection,
  type MachineOptionValue
} from "./machineOptions";

export const PRODUCT_CATEGORY_COLUMN = "Product Category";
export const PRODUCT_SOURCE_COLUMN = "Material";
export const PRODUCT_QUERY_PREFIX = "product::";
const PRODUCT_SKU_LENGTH = 5;
const AUTO_GENERATED_COLUMN_NAME_PATTERN = /^Column \d+(?: \(\d+\))?$/;

export interface DerivedProductSheet extends TamSheetSnapshot {
  queryKey: string;
  productCategory: string;
  sku: string;
}

export interface ProductSheetBuildResult {
  productSheets: DerivedProductSheet[];
  productCategoryToQueryKey: Record<string, string>;
}

export interface ProductSheetsByMachineGroup {
  machineKey: MachineOptionValue | "unassigned";
  machineLabel: string;
  productSheets: DerivedProductSheet[];
}

interface ProductGroupState {
  columns: string[];
  columnSet: Set<string>;
  rows: TamRow[];
  images: TamImageRef[];
}

export function buildDerivedProductSheets(
  sheets: TamSheetSnapshot[]
): ProductSheetBuildResult {
  const productGroups = new Map<string, ProductGroupState>();

  for (const sheet of sheets) {
    if (sheet.name === "Substrates") {
      continue;
    }

    const imagesByRow = mapImagesByRowIndex(sheet.images);
    for (let rowIndex = 0; rowIndex < sheet.rows.length; rowIndex += 1) {
      const row = sheet.rows[rowIndex];
      const productCategory = normalizeProductCategory(row[PRODUCT_CATEGORY_COLUMN]);
      if (!productCategory) {
        continue;
      }

      const group = getOrCreateProductGroup(productGroups, productCategory);
      for (const column of sheet.columns) {
        if (!group.columnSet.has(column)) {
          group.columnSet.add(column);
          group.columns.push(column);
        }
      }

      const derivedRowIndex = group.rows.length;
      group.rows.push({
        [PRODUCT_SOURCE_COLUMN]: sheet.name,
        ...row
      });

      const matchingImages = imagesByRow.get(rowIndex) ?? [];
      for (const imageRef of matchingImages) {
        group.images.push({
          ...imageRef,
          rowIndex: derivedRowIndex
        });
      }
    }
  }

  const usedQueryKeys = new Set<string>();
  const productCategoryToQueryKey: Record<string, string> = {};
  const productSheets = [...productGroups.entries()]
    .sort(([leftCategory], [rightCategory]) =>
      leftCategory.localeCompare(rightCategory, undefined, { sensitivity: "base" })
    )
    .map(([productCategory, groupState], productIndex) => {
      const queryKey = createUniqueProductQueryKey(productCategory, usedQueryKeys);
      productCategoryToQueryKey[productCategory] = queryKey;
      const sku = createProductSku(productIndex + 1);

      const normalizedRows = groupState.rows.map((row) => {
        const normalizedRow: TamRow = {};
        for (const column of groupState.columns) {
          normalizedRow[column] = readPrimitiveCell(row, column);
        }
        return normalizedRow;
      });
      const {
        columns: visibleColumns,
        rows: visibleRows
      } = dropEmptyGeneratedColumnsFromRows(groupState.columns, normalizedRows);

      const sheet: DerivedProductSheet = {
        name: productCategory,
        productCategory,
        sku,
        queryKey,
        columns: visibleColumns,
        rows: visibleRows,
        rowCount: visibleRows.length
      };

      if (groupState.images.length > 0) {
        sheet.images = groupState.images;
      }

      return sheet;
    });

  return {
    productSheets,
    productCategoryToQueryKey
  };
}

export function buildProductSheetsByMachine(
  productSheets: DerivedProductSheet[]
): ProductSheetsByMachineGroup[] {
  const machineToProducts = new Map<MachineOptionValue, DerivedProductSheet[]>();
  const unassignedProducts: DerivedProductSheet[] = [];

  for (const productSheet of productSheets) {
    const usedMachines = resolveProductMachines(productSheet.rows);
    if (usedMachines.size === 0) {
      unassignedProducts.push(productSheet);
      continue;
    }

    for (const machine of usedMachines) {
      const existing = machineToProducts.get(machine);
      if (existing) {
        existing.push(productSheet);
      } else {
        machineToProducts.set(machine, [productSheet]);
      }
    }
  }

  const groups = MACHINE_OPTIONS.map((machine) => ({
    machineKey: machine.value,
    machineLabel: machine.label,
    productSheets: sortProductSheets(machineToProducts.get(machine.value) ?? [])
  })).filter((group) => group.productSheets.length > 0);

  if (unassignedProducts.length > 0) {
    groups.push({
      machineKey: "unassigned",
      machineLabel: "Unassigned",
      productSheets: sortProductSheets(unassignedProducts)
    });
  }

  return groups;
}

function getOrCreateProductGroup(
  groups: Map<string, ProductGroupState>,
  productCategory: string
): ProductGroupState {
  const existing = groups.get(productCategory);
  if (existing) {
    return existing;
  }

  const created: ProductGroupState = {
    columns: [PRODUCT_SOURCE_COLUMN],
    columnSet: new Set([PRODUCT_SOURCE_COLUMN]),
    rows: [],
    images: []
  };
  groups.set(productCategory, created);
  return created;
}

function normalizeProductCategory(value: TamPrimitive): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function mapImagesByRowIndex(images: TamImageRef[] | undefined): Map<number, TamImageRef[]> {
  const map = new Map<number, TamImageRef[]>();
  for (const imageRef of images ?? []) {
    const existing = map.get(imageRef.rowIndex);
    if (existing) {
      existing.push(imageRef);
    } else {
      map.set(imageRef.rowIndex, [imageRef]);
    }
  }
  return map;
}

function readPrimitiveCell(row: TamRow, column: string): TamPrimitive {
  if (column in row) {
    return row[column];
  }

  return null;
}

function dropEmptyGeneratedColumnsFromRows(
  columns: string[],
  rows: TamRow[]
): { columns: string[]; rows: TamRow[] } {
  const removableColumns = new Set(
    columns.filter(
      (column) =>
        AUTO_GENERATED_COLUMN_NAME_PATTERN.test(column) &&
        column !== PRODUCT_SOURCE_COLUMN &&
        rows.every((row) => isBlankPrimitive(row[column]))
    )
  );

  if (removableColumns.size === 0) {
    return {
      columns: [...columns],
      rows
    };
  }

  const nextColumns = columns.filter((column) => !removableColumns.has(column));
  const nextRows = rows.map((row) => {
    const nextRow: TamRow = {};
    for (const column of nextColumns) {
      nextRow[column] = readPrimitiveCell(row, column);
    }
    return nextRow;
  });

  return {
    columns: nextColumns,
    rows: nextRows
  };
}

function isBlankPrimitive(value: TamPrimitive): boolean {
  if (value === null) {
    return true;
  }

  return typeof value === "string" && value.trim().length === 0;
}

function resolveProductMachines(rows: TamRow[]): Set<MachineOptionValue> {
  const machines = new Set<MachineOptionValue>();

  for (const row of rows) {
    const selectedMachines = parseMachineSelection(readPrimitiveCell(row, MACHINE_COLUMN_NAME));
    for (const machine of selectedMachines) {
      machines.add(machine);
    }
  }

  return machines;
}

function sortProductSheets(productSheets: DerivedProductSheet[]): DerivedProductSheet[] {
  return [...productSheets].sort((left, right) => {
    const skuComparison = left.sku.localeCompare(right.sku, undefined, { numeric: true });
    if (skuComparison !== 0) {
      return skuComparison;
    }

    return left.productCategory.localeCompare(right.productCategory, undefined, {
      sensitivity: "base"
    });
  });
}

function createUniqueProductQueryKey(productCategory: string, usedQueryKeys: Set<string>): string {
  const slug = slugify(productCategory) || "product";
  let candidate = `${PRODUCT_QUERY_PREFIX}${slug}`;
  let sequence = 2;

  while (usedQueryKeys.has(candidate)) {
    candidate = `${PRODUCT_QUERY_PREFIX}${slug}-${sequence}`;
    sequence += 1;
  }

  usedQueryKeys.add(candidate);
  return candidate;
}

function createProductSku(sequence: number): string {
  return String(sequence).padStart(PRODUCT_SKU_LENGTH, "0");
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
