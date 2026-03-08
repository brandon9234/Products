"use client";

import React from "react";
import { useEffect, useMemo, useState } from "react";

import type { TamPrimitive, TamSheetSnapshot } from "@/src/lib/tam/types";

const DEFAULT_PAGE_SIZE = 25;
const PAGE_SIZE_OPTIONS = [25, 50, 100];

interface SortState {
  column: string;
  direction: "asc" | "desc";
}

interface TamTableProps {
  datasetId: "tam" | "tam-2";
  snapshot: TamSheetSnapshot & {
    generatedAt: string;
    sourceFile: string;
  };
}

export function TamTable({ datasetId, snapshot }: TamTableProps) {
  const [tableData, setTableData] = useState(snapshot);
  const [sortState, setSortState] = useState<SortState | null>(null);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [currentPage, setCurrentPage] = useState(1);
  const [newColumnName, setNewColumnName] = useState("");
  const [saveStateMessage, setSaveStateMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setTableData(snapshot);
    setSortState(null);
    setCurrentPage(1);
    setSaveStateMessage(null);
  }, [snapshot]);

  useEffect(() => {
    setCurrentPage(1);
  }, [sortState, pageSize]);

  const rowsWithIndex = useMemo(
    () => tableData.rows.map((row, rowIndex) => ({ row, rowIndex })),
    [tableData.rows]
  );

  const sortedRows = useMemo(() => {
    if (!sortState) {
      return rowsWithIndex;
    }

    const { column, direction } = sortState;
    const multiplier = direction === "asc" ? 1 : -1;
    return [...rowsWithIndex].sort((left, right) => {
      const comparison = compareCells(left.row[column], right.row[column]);
      return comparison * multiplier;
    });
  }, [rowsWithIndex, sortState]);

  const rowImageMap = useMemo(() => {
    const map = new Map<number, NonNullable<typeof tableData.images>>();
    for (const imageRef of tableData.images ?? []) {
      const rowImages = map.get(imageRef.rowIndex);
      if (rowImages) {
        rowImages.push(imageRef);
      } else {
        map.set(imageRef.rowIndex, [imageRef]);
      }
    }
    return map;
  }, [tableData.images]);

  const totalPages = Math.max(1, Math.ceil(sortedRows.length / pageSize));
  const clampedPage = Math.min(currentPage, totalPages);
  const pageStart = (clampedPage - 1) * pageSize;
  const pageRows = sortedRows.slice(pageStart, pageStart + pageSize);
  const imageCount = tableData.images?.length ?? 0;

  async function saveCellValue(
    rowIndex: number,
    columnName: string,
    nextValue: string | null
  ) {
    try {
      setIsSaving(true);
      const response = await fetch(`/api/tam/datasets/${datasetId}/sheet`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          action: "update-cell",
          sheetName: tableData.name,
          rowIndex,
          columnName,
          value: nextValue
        })
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({ error: "Unknown error." }));
        throw new Error(payload.error ?? "Failed to save cell.");
      }

      const payload = (await response.json()) as { sheet: TamSheetSnapshot };
      setTableData((previous) => ({
        ...previous,
        ...payload.sheet
      }));
      setSaveStateMessage("Saved.");
    } catch (error) {
      setSaveStateMessage(`Save failed: ${(error as Error).message}`);
    } finally {
      setIsSaving(false);
    }
  }

  async function uploadRowImage(rowIndex: number, file: File) {
    try {
      setIsSaving(true);
      const formData = new FormData();
      formData.append("sheetName", tableData.name);
      formData.append("rowIndex", String(rowIndex));
      formData.append("file", file);

      const response = await fetch(`/api/tam/datasets/${datasetId}/images`, {
        method: "POST",
        body: formData
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({ error: "Unknown error." }));
        throw new Error(payload.error ?? "Failed to upload image.");
      }

      const payload = (await response.json()) as { sheet: TamSheetSnapshot };
      setTableData((previous) => ({
        ...previous,
        ...payload.sheet
      }));
      setSaveStateMessage("Image uploaded.");
    } catch (error) {
      setSaveStateMessage(`Upload failed: ${(error as Error).message}`);
    } finally {
      setIsSaving(false);
    }
  }

  async function addColumn() {
    const trimmed = newColumnName.trim();
    if (!trimmed) {
      return;
    }

    try {
      setIsSaving(true);
      const response = await fetch(`/api/tam/datasets/${datasetId}/sheet`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          action: "add-column",
          sheetName: tableData.name,
          columnName: trimmed
        })
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({ error: "Unknown error." }));
        throw new Error(payload.error ?? "Failed to add column.");
      }

      const payload = (await response.json()) as { sheet: TamSheetSnapshot };
      setTableData((previous) => ({
        ...previous,
        ...payload.sheet
      }));
      setNewColumnName("");
      setSaveStateMessage("Column added.");
    } catch (error) {
      setSaveStateMessage(`Add column failed: ${(error as Error).message}`);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section className="table-shell">
      <div className="summary-strip">
        <span>
          <strong>{tableData.rowCount}</strong> total rows
        </span>
        <span>
          <strong>{tableData.columns.length}</strong> columns
        </span>
        <span>
          Images <strong>{imageCount}</strong>
        </span>
        <span>
          Imported: <strong>{new Date(tableData.generatedAt).toLocaleString()}</strong>
        </span>
        <span>{isSaving ? "Saving..." : saveStateMessage ?? "Ready"}</span>
      </div>

      <div className="control-grid">
        <label className="control-field">
          <span>Rows per page</span>
          <select
            value={String(pageSize)}
            onChange={(event) => setPageSize(Number(event.target.value))}
          >
            {PAGE_SIZE_OPTIONS.map((sizeOption) => (
              <option key={sizeOption} value={sizeOption}>
                {sizeOption}
              </option>
            ))}
          </select>
        </label>

        <label className="control-field">
          <span>Add column</span>
          <div className="inline-field">
            <input
              type="text"
              value={newColumnName}
              onChange={(event) => setNewColumnName(event.target.value)}
              placeholder="New column name"
            />
            <button type="button" onClick={addColumn}>
              Add
            </button>
          </div>
        </label>
      </div>

      <div className="table-container">
        <table className="tam-table">
          <thead>
            <tr>
              <th scope="col">Images</th>
              {tableData.columns.map((column) => (
                <th key={column} scope="col">
                  <div className="header-cell">
                    <span>{column}</span>
                    <button
                      type="button"
                      className="sort-button"
                      onClick={() => setSortState(nextSortState(sortState, column))}
                      aria-label={`Sort by ${column}`}
                    >
                      <span className="sort-indicator">
                        {sortState?.column === column
                          ? sortState.direction === "asc"
                            ? "^"
                            : "v"
                          : "<>"}
                      </span>
                    </button>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pageRows.length > 0 ? (
              pageRows.map(({ row, rowIndex }) => (
                <tr key={`${rowIndex}`}>
                  <td className="image-cell">
                    <div className="image-strip">
                      {(rowImageMap.get(rowIndex) ?? []).map((imageRef, imageIndex) => (
                        <a
                          key={`${imageRef.src}-${imageIndex}`}
                          href={imageRef.src}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <img
                            src={imageRef.src}
                            alt={imageRef.fileName}
                            className="row-thumb"
                          />
                        </a>
                      ))}
                      <label className="upload-pill">
                        Upload
                        <input
                          type="file"
                          accept="image/*"
                          onChange={(event) => {
                            const nextFile = event.target.files?.[0];
                            if (!nextFile) {
                              return;
                            }
                            void uploadRowImage(rowIndex, nextFile);
                            event.currentTarget.value = "";
                          }}
                        />
                      </label>
                    </div>
                  </td>
                  {tableData.columns.map((column) => (
                    <td key={column}>
                      <input
                        type="text"
                        className="cell-input"
                        value={cellToInput(row[column])}
                        onChange={(event) => {
                          const rawValue = event.target.value;
                          setTableData((previous) => {
                            const nextRows = [...previous.rows];
                            const nextRow = { ...nextRows[rowIndex] };
                            nextRow[column] = rawValue;
                            nextRows[rowIndex] = nextRow;

                            return {
                              ...previous,
                              rows: nextRows
                            };
                          });
                        }}
                        onBlur={(event) => {
                          const normalized = normalizeInputValue(event.target.value);
                          void saveCellValue(rowIndex, column, normalized);
                        }}
                      />
                    </td>
                  ))}
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={tableData.columns.length + 1} className="empty-row">
                  No rows available.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="pagination">
        <button
          type="button"
          onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
          disabled={clampedPage === 1}
        >
          Previous
        </button>
        <span>
          Page {clampedPage} of {totalPages}
        </span>
        <button
          type="button"
          onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
          disabled={clampedPage === totalPages}
        >
          Next
        </button>
      </div>
    </section>
  );
}

function nextSortState(current: SortState | null, column: string): SortState | null {
  if (!current || current.column !== column) {
    return { column, direction: "asc" };
  }

  if (current.direction === "asc") {
    return { column, direction: "desc" };
  }

  return null;
}

function compareCells(left: TamPrimitive, right: TamPrimitive): number {
  if (left === null && right === null) {
    return 0;
  }
  if (left === null) {
    return 1;
  }
  if (right === null) {
    return -1;
  }

  if (typeof left === "number" && typeof right === "number") {
    return left - right;
  }

  if (typeof left === "boolean" && typeof right === "boolean") {
    return Number(left) - Number(right);
  }

  return String(left).localeCompare(String(right), undefined, {
    numeric: true,
    sensitivity: "base"
  });
}

function cellToInput(value: TamPrimitive): string {
  return value === null ? "" : String(value);
}

function normalizeInputValue(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }

  return value;
}

