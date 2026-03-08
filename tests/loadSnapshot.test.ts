import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { loadTamSnapshot } from "@/src/lib/tam/loadSnapshot";

describe("loadTamSnapshot", () => {
  it("returns missing state when snapshot file does not exist", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "tam-load-missing-"));
    const snapshotPath = path.join(tempDir, "missing.json");

    const result = await loadTamSnapshot(snapshotPath);

    expect(result.status).toBe("missing");
  });

  it("returns malformed state when JSON cannot be parsed", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "tam-load-bad-json-"));
    const snapshotPath = path.join(tempDir, "bad.json");
    await writeFile(snapshotPath, "{", "utf8");

    const result = await loadTamSnapshot(snapshotPath);

    expect(result.status).toBe("malformed");
  });

  it("returns malformed state when schema is invalid", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "tam-load-bad-shape-"));
    const snapshotPath = path.join(tempDir, "bad-shape.json");
    await writeFile(
      snapshotPath,
      JSON.stringify({
        columns: ["Market"],
        rows: [{ Market: "North" }],
        generatedAt: "not-a-date",
        sourceFile: "data/raw/tam.xlsx",
        rowCount: 1
      }),
      "utf8"
    );

    const result = await loadTamSnapshot(snapshotPath);

    expect(result.status).toBe("malformed");
  });

  it("returns parsed snapshot for valid input", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "tam-load-ok-"));
    const snapshotPath = path.join(tempDir, "ok.json");
    await writeFile(
      snapshotPath,
      JSON.stringify({
        defaultSheet: "MarketData",
        sheets: [
          {
            name: "MarketData",
            columns: ["Market", "Revenue"],
            rows: [{ Market: "North", Revenue: 100 }],
            rowCount: 1
          }
        ],
        generatedAt: "2026-03-08T00:00:00.000Z",
        sourceFile: "data/raw/tam.xlsx",
        rowCount: 1
      }),
      "utf8"
    );

    const result = await loadTamSnapshot(snapshotPath);

    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.snapshot.sheets[0].columns).toEqual(["Market", "Revenue"]);
      expect(result.snapshot.sheets[0].rows[0]).toEqual({ Market: "North", Revenue: 100 });
    }
  });
});
