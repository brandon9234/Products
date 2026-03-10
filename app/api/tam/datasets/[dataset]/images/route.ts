import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

import { NextRequest, NextResponse } from "next/server";

import {
  readDatasetSnapshot,
  resolveDatasetAssetOutputDir,
  resolveDatasetAssetPublicBase,
  writeDatasetSnapshot
} from "@/src/lib/tam/datasetStore";
import type { TamSheetSnapshot } from "@/src/lib/tam/types";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ dataset: string }> }
) {
  const { dataset } = await context.params;

  try {
    const formData = await request.formData();
    const sheetName = String(formData.get("sheetName") ?? "");
    const rowIndexRaw = String(formData.get("rowIndex") ?? "");
    const file = formData.get("file");

    if (!sheetName) {
      throw new Error("sheetName is required.");
    }

    const rowIndex = parseInt(rowIndexRaw, 10);
    if (typeof rowIndex !== "number" || !Number.isInteger(rowIndex) || rowIndex < 0) {
      throw new Error("rowIndex must be a valid integer.");
    }

    if (!(file instanceof File)) {
      throw new Error("file is required.");
    }

    if (!file.type.startsWith("image/")) {
      throw new Error("Only image files are allowed.");
    }

    const { snapshot, snapshotPath } = await readDatasetSnapshot(dataset);
    const sheet = getSheet(snapshot.sheets, sheetName);
    if (rowIndex >= sheet.rows.length) {
      throw new Error("rowIndex is out of bounds.");
    }

    const outputDir = resolveDatasetAssetOutputDir(dataset);
    const publicBasePath = resolveDatasetAssetPublicBase(dataset);

    await mkdir(outputDir, { recursive: true });
    const extension = resolveImageExtension(file.name, file.type);
    const fileName = `${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 10)}${extension}`;

    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(path.join(outputDir, fileName), buffer);

    sheet.images = sheet.images ?? [];
    sheet.images.push({
      rowIndex,
      colIndex: 0,
      src: `${publicBasePath}/${encodeURIComponent(fileName)}`,
      fileName: file.name
    });

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

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ dataset: string }> }
) {
  const { dataset } = await context.params;

  try {
    const body = (await request.json()) as {
      sheetName?: string;
      rowIndex?: number;
      src?: string;
    };
    const sheetName = body.sheetName?.trim();
    const rowIndex = body.rowIndex;
    const src = body.src?.trim();

    if (!sheetName) {
      throw new Error("sheetName is required.");
    }

    if (typeof rowIndex !== "number" || !Number.isInteger(rowIndex) || rowIndex < 0) {
      throw new Error("rowIndex must be a valid integer.");
    }

    if (!src) {
      throw new Error("src is required.");
    }

    const { snapshot, snapshotPath } = await readDatasetSnapshot(dataset);
    const sheet = getSheet(snapshot.sheets, sheetName);
    const imageIndex =
      sheet.images?.findIndex((imageRef) => imageRef.rowIndex === rowIndex && imageRef.src === src) ??
      -1;

    if (imageIndex < 0 || !sheet.images) {
      throw new Error("Image not found.");
    }

    const [removedImage] = sheet.images.splice(imageIndex, 1);
    if (sheet.images.length === 0) {
      delete sheet.images;
    }

    snapshot.generatedAt = new Date().toISOString();
    await writeDatasetSnapshot(snapshotPath, snapshot);

    if (!isImageReferenced(snapshot.sheets, removedImage.src)) {
      await tryDeletePublicAsset(removedImage.src);
    }

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

function resolveImageExtension(fileName: string, mimeType: string): string {
  const fileExt = path.extname(fileName).toLowerCase();
  if (fileExt) {
    return fileExt;
  }

  if (mimeType === "image/jpeg") {
    return ".jpg";
  }
  if (mimeType === "image/png") {
    return ".png";
  }
  if (mimeType === "image/webp") {
    return ".webp";
  }

  return ".bin";
}

function isImageReferenced(sheets: TamSheetSnapshot[], src: string): boolean {
  return sheets.some((sheet) => sheet.images?.some((imageRef) => imageRef.src === src));
}

async function tryDeletePublicAsset(src: string): Promise<void> {
  const assetPath = resolvePublicAssetPath(src);
  if (!assetPath) {
    return;
  }

  try {
    await unlink(assetPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      return;
    }
  }
}

function resolvePublicAssetPath(src: string): string | null {
  const cleanSrc = src.split("?")[0]?.split("#")[0] ?? src;
  if (!cleanSrc.startsWith("/tam-assets/")) {
    return null;
  }

  const publicRoot = path.resolve(process.cwd(), "public");
  const relativeAssetPath = decodeURIComponent(cleanSrc.replace(/^\/+/, ""));
  const assetPath = path.resolve(publicRoot, relativeAssetPath);

  if (!assetPath.startsWith(`${publicRoot}${path.sep}`)) {
    return null;
  }

  return assetPath;
}
