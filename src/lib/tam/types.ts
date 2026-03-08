export type TamPrimitive = string | number | boolean | null;

export type TamRow = Record<string, TamPrimitive>;

export interface TamSnapshot {
  columns: string[];
  rows: TamRow[];
  generatedAt: string;
  sourceFile: string;
  rowCount: number;
}

export type TamLoadResult =
  | { status: "ok"; snapshot: TamSnapshot }
  | { status: "missing"; snapshotPath: string }
  | { status: "malformed"; snapshotPath: string; error: string };

