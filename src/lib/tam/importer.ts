import { mkdir, rm, writeFile } from "node:fs/promises";
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

  const sheetSnapshot = buildSheetSnapshot(selectedSheetName, sheet);

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

    const sheetSnapshot = buildSheetSnapshot(sheetName, sheet);
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
  const files = getWorkbookFiles(workbook);
  if (!files) {
    return {};
  }

  await rm(outputDir, { recursive: true, force: true });
  await mkdir(outputDir, { recursive: true });

  const imagesBySheet: Record<string, TamImageRef[]> = {};
  const usedFileNames = new Set<string>();

  for (const sheetMeta of resolveSheetMeta(workbook)) {
    const sheetPath = `xl/worksheets/sheet${sheetMeta.sheetId}.xml`;
    const sheetXml = getXmlFileContent(files, sheetPath);
    if (!sheetXml) {
      continue;
    }

    const drawingRelationshipId = parseDrawingRelationshipId(sheetXml);
    if (!drawingRelationshipId) {
      continue;
    }

    const sheetRelationshipsXml = getXmlFileContent(files, toRelationshipsPath(sheetPath));
    if (!sheetRelationshipsXml) {
      continue;
    }

    const sheetRelationshipMap = parseRelationshipMap(sheetRelationshipsXml);
    const drawingTarget = sheetRelationshipMap.get(drawingRelationshipId);
    if (!drawingTarget) {
      continue;
    }

    const drawingPath = resolveRelationshipTarget(sheetPath, drawingTarget);
    const drawingXml = getXmlFileContent(files, drawingPath);
    if (!drawingXml) {
      continue;
    }

    const drawingRelationshipXml = getXmlFileContent(
      files,
      toRelationshipsPath(drawingPath)
    );
    if (!drawingRelationshipXml) {
      continue;
    }

    const drawingRelationshipMap = parseRelationshipMap(drawingRelationshipXml);
    const anchors = parseDrawingAnchors(drawingXml);
    if (anchors.length === 0) {
      continue;
    }

    const sheetImages: TamImageRef[] = [];
    const safeSheetName = slugifySegment(sheetMeta.name);

    for (const anchor of anchors) {
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
        rowIndex: anchor.row - 1,
        colIndex: anchor.col,
        src: `${publicBasePath}/${encodeURIComponent(outputFileName)}`,
        fileName: path.posix.basename(mediaPath)
      });
    }

    if (sheetImages.length > 0) {
      imagesBySheet[sheetMeta.name] = sheetImages.sort((left, right) => {
        if (left.rowIndex === right.rowIndex) {
          return left.colIndex - right.colIndex;
        }
        return left.rowIndex - right.rowIndex;
      });
    }
  }

  return imagesBySheet;
}

function buildSheetSnapshot(
  sheetName: string,
  sheet: XLSX.WorkSheet
): TamSheetSnapshot {
  const matrix = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    raw: true,
    blankrows: false,
    defval: null
  }) as unknown[][];

  if (matrix.length === 0) {
    return {
      name: sheetName,
      columns: [],
      rows: [],
      rowCount: 0
    };
  }

  const [headerRow, ...dataRows] = matrix;
  const columns = normalizeHeaders(headerRow);
  const rows = dataRows.map((row) =>
    buildRow(columns, Array.isArray(row) ? row : [])
  );

  return {
    name: sheetName,
    columns,
    rows,
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

function getWorkbookFiles(
  workbook: XLSX.WorkBook
): Record<string, WorkbookFileEntry> | null {
  const withFiles = workbook as XLSX.WorkBook & WorkbookFileContainer;
  return withFiles.files ?? null;
}

function resolveSheetMeta(workbook: XLSX.WorkBook): Array<{ name: string; sheetId: number }> {
  const workbookSheetMeta = workbook.Workbook?.Sheets ?? [];
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
