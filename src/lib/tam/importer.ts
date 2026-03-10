import { mkdir, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import * as XLSX from "xlsx";

import type {
  TamImageRef,
  TamPrimitive,
  TamRow,
  TamSheetSnapshot,
  TamWorkbookSnapshot
} from "./types";

export const DEFAULT_SHEET_NAME = "TAM";
const AUTO_GENERATED_COLUMN_NAME_PATTERN = /^Column \d+(?: \(\d+\))?$/;

interface BuildSnapshotOptions {
  workbook: XLSX.WorkBook;
  sourceFile: string;
  preferredSheet?: string;
  generatedAt?: Date;
}

interface BuildWorkbookSnapshotOptions {
  workbook: XLSX.WorkBook;
  sourceFile: string;
  preferredSheet?: string;
  generatedAt?: Date;
  imagesBySheet?: Record<string, TamImageRef[]>;
}

interface ExtractWorkbookImagesOptions {
  workbook: XLSX.WorkBook;
  outputDir: string;
  publicBasePath: string;
}

interface WorkbookFileEntry {
  content?: unknown;
}

interface WorkbookFileContainer {
  files?: Record<string, WorkbookFileEntry>;
}

interface WorkbookSheetMeta {
  name?: string;
  sheetId?: string | number;
  sheetid?: string | number;
}

interface SheetBuildResult {
  snapshot: TamSheetSnapshot;
  worksheetRowToSnapshotRowIndex: Map<number, number>;
}

export function readWorkbookFromFile(inputPath: string): XLSX.WorkBook {
  return XLSX.readFile(inputPath, {
    raw: true,
    cellDates: false,
    bookFiles: true
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
}: BuildSnapshotOptions): TamSheetSnapshot & {
  generatedAt: string;
  sourceFile: string;
} {
  const selectedSheetName = resolveSheetName(workbook, preferredSheet);
  const sheet = workbook.Sheets[selectedSheetName];

  if (!sheet) {
    throw new Error(`Unable to read sheet "${selectedSheetName}".`);
  }

  const { snapshot: sheetSnapshot } = buildSheetSnapshot(selectedSheetName, sheet);

  return {
    ...sheetSnapshot,
    generatedAt: generatedAt.toISOString(),
    sourceFile: normalizePath(sourceFile)
  };
}

export function buildWorkbookSnapshotFromWorkbook({
  workbook,
  sourceFile,
  preferredSheet = DEFAULT_SHEET_NAME,
  generatedAt = new Date(),
  imagesBySheet
}: BuildWorkbookSnapshotOptions): TamWorkbookSnapshot {
  if (workbook.SheetNames.length === 0) {
    throw new Error("Workbook does not contain any sheets.");
  }

  const sheets = workbook.SheetNames.map((sheetName) => {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) {
      throw new Error(`Unable to read sheet "${sheetName}".`);
    }

    const { snapshot: sheetSnapshot } = buildSheetSnapshot(sheetName, sheet);
    const sheetImages =
      imagesBySheet?.[sheetName]?.filter(
        (imageRef) =>
          imageRef.rowIndex >= 0 && imageRef.rowIndex < sheetSnapshot.rowCount
      ) ?? [];

    if (sheetImages.length === 0) {
      return sheetSnapshot;
    }

    return {
      ...sheetSnapshot,
      images: sheetImages
    };
  });

  return {
    defaultSheet: resolveSheetName(workbook, preferredSheet),
    sheets,
    generatedAt: generatedAt.toISOString(),
    sourceFile: normalizePath(sourceFile)
  };
}

export async function extractWorkbookImages({
  workbook,
  outputDir,
  publicBasePath
}: ExtractWorkbookImagesOptions): Promise<Record<string, TamImageRef[]>> {
  // xlsx exposes raw OOXML workbook files, so embedded image extraction has to
  // walk the worksheet -> drawing -> media relationship chain explicitly.
  const files = getWorkbookFiles(workbook);
  await clearGeneratedAssetOutputDir(outputDir);

  const imagesBySheet: Record<string, TamImageRef[]> = {};
  const usedFileNames = new Set<string>();

  for (const sheetMeta of resolveSheetMeta(workbook)) {
    const sheet = workbook.Sheets[sheetMeta.name];
    if (!sheet) {
      continue;
    }

    const { worksheetRowToSnapshotRowIndex } = buildSheetSnapshot(sheetMeta.name, sheet);
    const embeddedImages = files
      ? await extractEmbeddedSheetImages({
          files,
          sheetMeta,
          worksheetRowToSnapshotRowIndex,
          outputDir,
          publicBasePath,
          usedFileNames
        })
      : [];
    const formulaImages = await extractFormulaCellImages({
      sheet,
      sheetName: sheetMeta.name,
      worksheetRowToSnapshotRowIndex,
      outputDir,
      publicBasePath,
      usedFileNames
    });
    const sheetImages = [...embeddedImages, ...formulaImages].sort((left, right) => {
      if (left.rowIndex === right.rowIndex) {
        return left.colIndex - right.colIndex;
      }
      return left.rowIndex - right.rowIndex;
    });

    if (sheetImages.length > 0) {
      imagesBySheet[sheetMeta.name] = sheetImages;
    }
  }

  return imagesBySheet;
}

async function extractEmbeddedSheetImages({
  files,
  sheetMeta,
  worksheetRowToSnapshotRowIndex,
  outputDir,
  publicBasePath,
  usedFileNames
}: {
  files: Record<string, WorkbookFileEntry>;
  sheetMeta: { name: string; sheetId: number };
  worksheetRowToSnapshotRowIndex: Map<number, number>;
  outputDir: string;
  publicBasePath: string;
  usedFileNames: Set<string>;
}): Promise<TamImageRef[]> {
  const sheetPath = `xl/worksheets/sheet${sheetMeta.sheetId}.xml`;
  const sheetXml = getXmlFileContent(files, sheetPath);
  if (!sheetXml) {
    return [];
  }

  const drawingRelationshipId = parseDrawingRelationshipId(sheetXml);
  if (!drawingRelationshipId) {
    return [];
  }

  const sheetRelationshipsXml = getXmlFileContent(files, toRelationshipsPath(sheetPath));
  if (!sheetRelationshipsXml) {
    return [];
  }

  const sheetRelationshipMap = parseRelationshipMap(sheetRelationshipsXml);
  const drawingTarget = sheetRelationshipMap.get(drawingRelationshipId);
  if (!drawingTarget) {
    return [];
  }

  const drawingPath = resolveRelationshipTarget(sheetPath, drawingTarget);
  const drawingXml = getXmlFileContent(files, drawingPath);
  if (!drawingXml) {
    return [];
  }

  const drawingRelationshipXml = getXmlFileContent(
    files,
    toRelationshipsPath(drawingPath)
  );
  if (!drawingRelationshipXml) {
    return [];
  }

  const drawingRelationshipMap = parseRelationshipMap(drawingRelationshipXml);
  const anchors = parseDrawingAnchors(drawingXml);
  if (anchors.length === 0) {
    return [];
  }

  const sheetImages: TamImageRef[] = [];
  const safeSheetName = slugifySegment(sheetMeta.name);

  for (const anchor of anchors) {
    const snapshotRowIndex = worksheetRowToSnapshotRowIndex.get(anchor.row);
    if (snapshotRowIndex === undefined) {
      continue;
    }

    const mediaTarget = drawingRelationshipMap.get(anchor.embedId);
    if (!mediaTarget) {
      continue;
    }

    const mediaPath = resolveRelationshipTarget(drawingPath, mediaTarget);
    const mediaContent = getBinaryFileContent(files[mediaPath]?.content);
    if (!mediaContent) {
      continue;
    }

    const extension = path.posix.extname(mediaPath) || ".bin";
    const baseFileName = `${safeSheetName}-r${anchor.row}-c${anchor.col}${extension}`;
    const outputFileName = makeUniqueFileName(baseFileName, usedFileNames);
    const outputFilePath = path.join(outputDir, outputFileName);
    await writeFile(outputFilePath, mediaContent);

    sheetImages.push({
      rowIndex: snapshotRowIndex,
      colIndex: anchor.col,
      src: `${publicBasePath}/${encodeURIComponent(outputFileName)}`,
      fileName: path.posix.basename(mediaPath)
    });
  }

  return sheetImages;
}

async function extractFormulaCellImages({
  sheet,
  sheetName,
  worksheetRowToSnapshotRowIndex,
  outputDir,
  publicBasePath,
  usedFileNames
}: {
  sheet: XLSX.WorkSheet;
  sheetName: string;
  worksheetRowToSnapshotRowIndex: Map<number, number>;
  outputDir: string;
  publicBasePath: string;
  usedFileNames: Set<string>;
}): Promise<TamImageRef[]> {
  const sheetRange = sheet["!ref"];
  if (!sheetRange) {
    return [];
  }

  const range = XLSX.utils.decode_range(sheetRange);
  const safeSheetName = slugifySegment(sheetName);
  const sheetImages: TamImageRef[] = [];

  for (let rowIndex = Math.max(range.s.r, 1); rowIndex <= range.e.r; rowIndex += 1) {
    const snapshotRowIndex = worksheetRowToSnapshotRowIndex.get(rowIndex);
    if (snapshotRowIndex === undefined) {
      continue;
    }

    for (let colIndex = range.s.c; colIndex <= range.e.c; colIndex += 1) {
      const cellAddress = XLSX.utils.encode_cell({ c: colIndex, r: rowIndex });
      const cell = sheet[cellAddress];
      const formulaImageUrl = parseImageFormula(cell?.f);
      if (!formulaImageUrl) {
        continue;
      }

      const imageAsset = await persistFormulaImageAsset({
        sourceUrl: formulaImageUrl,
        outputDir,
        publicBasePath,
        baseFileStem: `${safeSheetName}-r${rowIndex}-c${colIndex}`,
        usedFileNames
      });

      sheetImages.push({
        rowIndex: snapshotRowIndex,
        colIndex,
        src: imageAsset.src,
        fileName: imageAsset.fileName
      });
    }
  }

  return sheetImages;
}

async function persistFormulaImageAsset({
  sourceUrl,
  outputDir,
  publicBasePath,
  baseFileStem,
  usedFileNames
}: {
  sourceUrl: string;
  outputDir: string;
  publicBasePath: string;
  baseFileStem: string;
  usedFileNames: Set<string>;
}): Promise<{ src: string; fileName: string }> {
  const fallbackFileName = resolveRemoteFileName(sourceUrl, ".bin");

  try {
    const response = await fetch(sourceUrl, {
      headers: {
        Accept: "image/*,*/*;q=0.8",
        "User-Agent": "Products-TAM-Importer/1.0"
      }
    });

    if (!response.ok) {
      throw new Error(`Image download failed: ${response.status}`);
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length === 0) {
      throw new Error("Image download returned an empty body.");
    }

    const extension = resolveRemoteImageExtension(
      sourceUrl,
      response.headers.get("content-type")
    );
    const outputFileName = makeUniqueFileName(
      `${baseFileStem}${extension}`,
      usedFileNames
    );
    const outputFilePath = path.join(outputDir, outputFileName);
    await writeFile(outputFilePath, buffer);

    return {
      src: `${publicBasePath}/${encodeURIComponent(outputFileName)}`,
      fileName: resolveRemoteFileName(sourceUrl, extension)
    };
  } catch {
    return {
      src: sourceUrl,
      fileName: fallbackFileName
    };
  }
}

function buildSheetSnapshot(
  sheetName: string,
  sheet: XLSX.WorkSheet
) : SheetBuildResult {
  const matrix = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    raw: true,
    blankrows: true,
    defval: null
  }) as unknown[][];

  if (matrix.length === 0) {
    return {
      snapshot: {
        name: sheetName,
        columns: [],
        rows: [],
        rowCount: 0
      },
      worksheetRowToSnapshotRowIndex: new Map()
    };
  }

  const [headerRow, ...worksheetRows] = matrix;
  const columns = normalizeHeaders(headerRow);
  const rows: TamRow[] = [];
  const worksheetRowToSnapshotRowIndex = new Map<number, number>();

  worksheetRows.forEach((row, worksheetRowOffset) => {
    const normalizedRow = Array.isArray(row) ? row : [];
    const worksheetRowIndex = worksheetRowOffset + 1;

    if (isEmptyWorksheetRow(normalizedRow) && !hasImageFormulaInWorksheetRow(sheet, worksheetRowIndex)) {
      return;
    }

    worksheetRowToSnapshotRowIndex.set(worksheetRowIndex, rows.length);
    rows.push(buildRow(columns, normalizedRow));
  });

  const { columns: sanitizedColumns, rows: sanitizedRows } =
    shouldDropEmptyGeneratedColumns(sheetName)
      ? dropEmptyGeneratedColumns(columns, rows)
      : { columns, rows };

  return {
    snapshot: {
      name: sheetName,
      columns: sanitizedColumns,
      rows: sanitizedRows,
      rowCount: sanitizedRows.length
    },
    worksheetRowToSnapshotRowIndex
  };
}

function isEmptyWorksheetRow(row: unknown[]): boolean {
  return row.every((value) => normalizeCell(value) === null);
}

function hasImageFormulaInWorksheetRow(sheet: XLSX.WorkSheet, worksheetRowIndex: number): boolean {
  const sheetRange = sheet["!ref"];
  if (!sheetRange) {
    return false;
  }

  const range = XLSX.utils.decode_range(sheetRange);
  for (let colIndex = range.s.c; colIndex <= range.e.c; colIndex += 1) {
    const cellAddress = XLSX.utils.encode_cell({ c: colIndex, r: worksheetRowIndex });
    if (parseImageFormula(sheet[cellAddress]?.f)) {
      return true;
    }
  }

  return false;
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

function shouldDropEmptyGeneratedColumns(sheetName: string): boolean {
  return sheetName !== "Substrates";
}

function dropEmptyGeneratedColumns(
  columns: string[],
  rows: TamRow[]
): { columns: string[]; rows: TamRow[] } {
  const removableColumns = new Set(
    columns.filter(
      (column) =>
        AUTO_GENERATED_COLUMN_NAME_PATTERN.test(column) &&
        rows.every((row) => isBlankPrimitive(row[column]))
    )
  );

  if (removableColumns.size === 0) {
    return { columns, rows };
  }

  const nextColumns = columns.filter((column) => !removableColumns.has(column));
  const nextRows = rows.map((row) => {
    const nextRow: TamRow = {};
    for (const column of nextColumns) {
      nextRow[column] = column in row ? row[column] : null;
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

async function clearGeneratedAssetOutputDir(outputDir: string): Promise<void> {
  await mkdir(outputDir, { recursive: true });
  const entries = await readdir(outputDir, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.name === "manual") {
      continue;
    }

    await rm(path.join(outputDir, entry.name), { recursive: true, force: true });
  }
}

function getWorkbookFiles(
  workbook: XLSX.WorkBook
): Record<string, WorkbookFileEntry> | null {
  const withFiles = workbook as XLSX.WorkBook & WorkbookFileContainer;
  return withFiles.files ?? null;
}

function resolveSheetMeta(workbook: XLSX.WorkBook): Array<{ name: string; sheetId: number }> {
  const workbookSheetMeta = (workbook.Workbook?.Sheets ?? []) as WorkbookSheetMeta[];
  if (workbookSheetMeta.length > 0) {
    const parsed = workbookSheetMeta
      .map((sheetMeta, index) => ({
        name: sheetMeta.name ?? workbook.SheetNames[index] ?? `Sheet ${index + 1}`,
        sheetId: parseInt(String(sheetMeta.sheetId ?? sheetMeta.sheetid ?? index + 1), 10)
      }))
      .filter((sheetMeta) => Number.isInteger(sheetMeta.sheetId) && sheetMeta.sheetId > 0);

    if (parsed.length > 0) {
      return parsed;
    }
  }

  return workbook.SheetNames.map((name, index) => ({
    name,
    sheetId: index + 1
  }));
}

function getXmlFileContent(
  files: Record<string, WorkbookFileEntry>,
  filePath: string
): string | null {
  const entry = files[filePath];
  if (!entry) {
    return null;
  }

  const binaryContent = getBinaryFileContent(entry.content);
  if (!binaryContent) {
    return null;
  }

  return binaryContent.toString("utf8");
}

function getBinaryFileContent(content: unknown): Buffer | null {
  if (Buffer.isBuffer(content)) {
    return content;
  }

  if (content instanceof Uint8Array) {
    return Buffer.from(content);
  }

  if (typeof content === "string") {
    return Buffer.from(content, "binary");
  }

  return null;
}

function parseDrawingRelationshipId(sheetXml: string): string | null {
  const match = /<drawing\b[^>]*\br:id="([^"]+)"/.exec(sheetXml);
  return match?.[1] ?? null;
}

function parseImageFormula(formula: unknown): string | null {
  if (typeof formula !== "string") {
    return null;
  }

  const match = /^\s*=?image\s*\(\s*"([^"]+)"/i.exec(formula);
  return match?.[1] ?? null;
}

function parseRelationshipMap(xml: string): Map<string, string> {
  const relationships = new Map<string, string>();
  const relationshipRegex = /<Relationship\b([^>]*?)(?:\/>|>)/g;

  for (const match of xml.matchAll(relationshipRegex)) {
    const attributesText = match[1];
    const id = extractXmlAttribute(attributesText, "Id");
    const target = extractXmlAttribute(attributesText, "Target");
    if (id && target) {
      relationships.set(id, target);
    }
  }

  return relationships;
}

function parseDrawingAnchors(
  drawingXml: string
): Array<{ row: number; col: number; embedId: string }> {
  const anchors: Array<{ row: number; col: number; embedId: string }> = [];
  const anchorRegex =
    /<xdr:(?:oneCellAnchor|twoCellAnchor)\b[\s\S]*?<\/xdr:(?:oneCellAnchor|twoCellAnchor)>/g;

  for (const anchorMatch of drawingXml.matchAll(anchorRegex)) {
    const anchorBlock = anchorMatch[0];
    const fromMatch =
      /<xdr:from>[\s\S]*?<xdr:col>(\d+)<\/xdr:col>[\s\S]*?<xdr:row>(\d+)<\/xdr:row>[\s\S]*?<\/xdr:from>/.exec(
        anchorBlock
      );
    const embedMatch = /<a:blip\b[^>]*\br:embed="([^"]+)"/.exec(anchorBlock);

    if (!fromMatch || !embedMatch) {
      continue;
    }

    const col = parseInt(fromMatch[1], 10);
    const row = parseInt(fromMatch[2], 10);
    if (!Number.isInteger(col) || !Number.isInteger(row)) {
      continue;
    }

    anchors.push({
      row,
      col,
      embedId: embedMatch[1]
    });
  }

  return anchors;
}

function toRelationshipsPath(sourcePath: string): string {
  return path.posix.join(
    path.posix.dirname(sourcePath),
    "_rels",
    `${path.posix.basename(sourcePath)}.rels`
  );
}

function resolveRelationshipTarget(sourcePath: string, target: string): string {
  if (target.startsWith("/")) {
    return target.slice(1);
  }

  return path.posix.normalize(path.posix.join(path.posix.dirname(sourcePath), target));
}

function extractXmlAttribute(attributesText: string, attribute: string): string | null {
  const match = new RegExp(`${attribute}="([^"]+)"`).exec(attributesText);
  return match?.[1] ?? null;
}

function slugifySegment(value: string): string {
  const sanitized = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return sanitized.length > 0 ? sanitized : "sheet";
}

function resolveRemoteImageExtension(sourceUrl: string, contentType: string | null): string {
  const urlExtension = getUrlExtension(sourceUrl);
  if (urlExtension) {
    return urlExtension;
  }

  const normalizedContentType = contentType?.split(";")[0]?.trim().toLowerCase() ?? null;

  if (normalizedContentType === "image/jpeg") {
    return ".jpg";
  }
  if (normalizedContentType === "image/png") {
    return ".png";
  }
  if (normalizedContentType === "image/webp") {
    return ".webp";
  }
  if (normalizedContentType === "image/gif") {
    return ".gif";
  }

  return ".bin";
}

function resolveRemoteFileName(sourceUrl: string, fallbackExtension: string): string {
  try {
    const parsedUrl = new URL(sourceUrl);
    const fileName = path.posix.basename(parsedUrl.pathname);
    if (fileName) {
      return fileName;
    }
  } catch {
    return `image${fallbackExtension}`;
  }

  return `image${fallbackExtension}`;
}

function getUrlExtension(sourceUrl: string): string | null {
  try {
    const parsedUrl = new URL(sourceUrl);
    const extension = path.posix.extname(parsedUrl.pathname).toLowerCase();
    if ([".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp", ".svg"].includes(extension)) {
      return extension;
    }
  } catch {
    return null;
  }

  return null;
}

function makeUniqueFileName(baseFileName: string, usedFileNames: Set<string>): string {
  if (!usedFileNames.has(baseFileName)) {
    usedFileNames.add(baseFileName);
    return baseFileName;
  }

  const extension = path.posix.extname(baseFileName);
  const stem = baseFileName.slice(0, baseFileName.length - extension.length);
  let sequence = 2;
  while (usedFileNames.has(`${stem}-${sequence}${extension}`)) {
    sequence += 1;
  }

  const nextName = `${stem}-${sequence}${extension}`;
  usedFileNames.add(nextName);
  return nextName;
}
