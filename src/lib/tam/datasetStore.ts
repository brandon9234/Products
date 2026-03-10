import { writeFile } from "node:fs/promises";
import path from "node:path";

import { loadTamSnapshot } from "./loadSnapshot";
import type { TamWorkbookSnapshot } from "./types";

const DATASET_SNAPSHOT_FILES: Record<string, string> = {
  tam: "tam.snapshot.json"
};

export async function readDatasetSnapshot(datasetId: string): Promise<{
  snapshotPath: string;
  snapshot: TamWorkbookSnapshot;
}> {
  const snapshotPath = resolveDatasetSnapshotPath(datasetId);
  const result = await loadTamSnapshot(snapshotPath);

  if (result.status === "missing") {
    throw new Error(`Snapshot file is missing: ${snapshotPath}`);
  }

  if (result.status === "malformed") {
    throw new Error(`Snapshot file is malformed: ${result.error}`);
  }

  return {
    snapshotPath,
    snapshot: result.snapshot
  };
}

export async function writeDatasetSnapshot(
  snapshotPath: string,
  snapshot: TamWorkbookSnapshot
): Promise<void> {
  await writeFile(snapshotPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
}

export function resolveDatasetSnapshotPath(datasetId: string): string {
  const snapshotFile = DATASET_SNAPSHOT_FILES[datasetId];
  if (!snapshotFile) {
    throw new Error(`Unsupported dataset: ${datasetId}`);
  }

  return path.join(process.cwd(), "data", snapshotFile);
}

export function resolveDatasetAssetOutputDir(datasetId: string): string {
  ensureDataset(datasetId);
  // Manual uploads live in a separate folder so re-importing workbook-derived
  // assets can replace extracted files without deleting user-added images.
  return path.join(process.cwd(), "public", "tam-assets", datasetId, "manual");
}

export function resolveDatasetAssetPublicBase(datasetId: string): string {
  ensureDataset(datasetId);
  return `/tam-assets/${datasetId}/manual`;
}

function ensureDataset(datasetId: string): void {
  if (!(datasetId in DATASET_SNAPSHOT_FILES)) {
    throw new Error(`Unsupported dataset: ${datasetId}`);
  }
}
