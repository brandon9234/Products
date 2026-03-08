export type TamPrimitive = string | number | boolean | null;

export type TamRow = Record<string, TamPrimitive>;

export interface TamImageRef {
  rowIndex: number;
  colIndex: number;
  src: string;
  fileName: string;
}

export interface TamSheetSnapshot {
  name: string;
  columns: string[];
  rows: TamRow[];
  rowCount: number;
  images?: TamImageRef[];
}

export interface TamWorkbookSnapshot {
  defaultSheet: string;
  sheets: TamSheetSnapshot[];
  generatedAt: string;
  sourceFile: string;
}

export type TamLoadResult =
  | { status: "ok"; snapshot: TamWorkbookSnapshot }
  | { status: "missing"; snapshotPath: string }
  | { status: "malformed"; snapshotPath: string; error: string };
