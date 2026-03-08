import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  DEFAULT_SHEET_NAME,
  buildWorkbookSnapshotFromWorkbook,
  extractWorkbookImages,
  readWorkbookFromFile,
  resolveSheetName
} from "../src/lib/tam/importer";

interface CliOptions {
  input?: string;
  sheet?: string;
  output?: string;
}

const DEFAULT_OUTPUT = "data/tam.snapshot.json";
const DEFAULT_INPUT_CANDIDATES = ["data/raw/tam.xlsx", "data/raw/tam.csv", "data/raw/tam.xls"];

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const cwd = process.cwd();

    const resolvedInput = options.input
      ? path.resolve(cwd, options.input)
      : resolveDefaultInput(cwd);
    const resolvedOutput = options.output
      ? path.resolve(cwd, options.output)
      : path.resolve(cwd, DEFAULT_OUTPUT);

    if (!existsSync(resolvedInput)) {
      throw new Error(`Input file does not exist: ${resolvedInput}`);
    }

    const workbook = readWorkbookFromFile(resolvedInput);
    const preferredSheet = options.sheet ?? DEFAULT_SHEET_NAME;
    const selectedSheet = resolveSheetName(workbook, preferredSheet);
    const assetBucket = deriveAssetBucketName(resolvedOutput);
    const assetOutputDir = path.resolve(cwd, "public", "tam-assets", assetBucket);
    const assetPublicBasePath = `/tam-assets/${assetBucket}`;

    const imagesBySheet = await extractWorkbookImages({
      workbook,
      outputDir: assetOutputDir,
      publicBasePath: assetPublicBasePath
    });

    const snapshot = buildWorkbookSnapshotFromWorkbook({
      workbook,
      sourceFile: toPortablePath(path.relative(cwd, resolvedInput)),
      preferredSheet: preferredSheet,
      imagesBySheet
    });

    await mkdir(path.dirname(resolvedOutput), { recursive: true });
    await writeFile(resolvedOutput, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");

    const imageCount = snapshot.sheets.reduce(
      (total, sheet) => total + (sheet.images?.length ?? 0),
      0
    );

    console.log(
      [
        `TAM import complete.`,
        `Source: ${resolvedInput}`,
        `Default sheet: ${selectedSheet}`,
        `Sheets imported: ${snapshot.sheets.length}`,
        `Images extracted: ${imageCount}`,
        `Image assets: ${assetOutputDir}`,
        `Output: ${resolvedOutput}`
      ].join("\n")
    );
  } catch (error) {
    console.error(`TAM import failed: ${(error as Error).message}`);
    printUsage();
    process.exit(1);
  }
}

function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = {};

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--help" || arg === "-h") {
      printUsage();
      process.exit(0);
    }

    if (arg === "--input") {
      options.input = readArgValue(args, index, "--input");
      index += 1;
      continue;
    }

    if (arg === "--sheet") {
      options.sheet = readArgValue(args, index, "--sheet");
      index += 1;
      continue;
    }

    if (arg === "--output") {
      options.output = readArgValue(args, index, "--output");
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

function readArgValue(args: string[], index: number, flag: string): string {
  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`Missing value for ${flag}`);
  }

  return value;
}

function resolveDefaultInput(cwd: string): string {
  for (const candidate of DEFAULT_INPUT_CANDIDATES) {
    const absolutePath = path.resolve(cwd, candidate);
    if (existsSync(absolutePath)) {
      return absolutePath;
    }
  }

  throw new Error(
    `No default TAM input found. Expected one of: ${DEFAULT_INPUT_CANDIDATES.join(", ")}`
  );
}

function printUsage() {
  console.log(
    [
      "Usage: npm run import:tam -- --input <path> --sheet <name?> --output <path?>",
      "",
      "Options:",
      "  --input   Optional. Path to .xlsx/.xls/.csv file.",
      `            Default search order: ${DEFAULT_INPUT_CANDIDATES.join(", ")}`,
      `  --sheet   Optional. Preferred worksheet name (default: ${DEFAULT_SHEET_NAME}).`,
      `            Falls back to first sheet if preferred is missing.`,
      `  --output  Optional. Output snapshot path (default: ${DEFAULT_OUTPUT}).`
    ].join("\n")
  );
}

function toPortablePath(filePath: string): string {
  return filePath.replace(/\\/g, "/");
}

function deriveAssetBucketName(outputPath: string): string {
  const baseName = path.basename(outputPath, path.extname(outputPath));
  const withoutSnapshot = baseName.replace(/\.snapshot$/i, "");
  const sanitized = withoutSnapshot
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return sanitized.length > 0 ? sanitized : "tam";
}

void main();
