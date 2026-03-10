"use client";

import React from "react";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  MACHINE_COLUMN_NAME,
  MACHINE_OPTIONS,
  parseMachineSelection,
  serializeMachineSelection
} from "@/src/lib/tam/machineOptions";
import type { TamImageRef, TamPrimitive, TamSheetSnapshot } from "@/src/lib/tam/types";

const DEFAULT_PAGE_SIZE = 25;
const SUBSTRATES_PAGE_SIZE = 30;
const PAGE_SIZE_OPTIONS = [25, 30, 50, 100];
const IMAGE_COLUMN_WIDTH = 272;
const DEFAULT_COLUMN_WIDTH = 260;
const MIN_COLUMN_WIDTH = 170;
const MAX_COLUMN_WIDTH = 960;
const PRODUCT_CATEGORY_COLUMN_NAME = "Product Category";
const MATERIAL_SOURCE_COLUMN_NAME = "Material";

interface SortState {
  column: string;
  direction: "asc" | "desc";
}

interface ColumnResizeState {
  column: string;
  startX: number;
  startWidth: number;
}

interface ColumnDragHoverState {
  column: string;
  position: "before" | "after";
}

interface TamTableProps {
  datasetId: "tam";
  snapshot: TamSheetSnapshot & {
    generatedAt: string;
    sourceFile: string;
  };
  readOnly?: boolean;
  productCategoryToQueryKey?: Record<string, string>;
}

function TamTable({
  datasetId,
  snapshot,
  readOnly = false,
  productCategoryToQueryKey
}: TamTableProps) {
  const [tableData, setTableData] = useState(snapshot);
  const [sortState, setSortState] = useState<SortState | null>(null);
  const [pageSize, setPageSize] = useState(() => getDefaultPageSize(snapshot));
  const [currentPage, setCurrentPage] = useState(1);
  const [newColumnName, setNewColumnName] = useState("");
  const [saveStateMessage, setSaveStateMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [tableContainerWidth, setTableContainerWidth] = useState(0);
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({});
  const [resizeState, setResizeState] = useState<ColumnResizeState | null>(null);
  const [draggedColumn, setDraggedColumn] = useState<string | null>(null);
  const [dragHoverState, setDragHoverState] = useState<ColumnDragHoverState | null>(null);
  const tableContainerRef = useRef<HTMLDivElement | null>(null);
  const canMutate = !readOnly;
  const isMaterialsSheet = canMutate && tableData.name !== "Substrates";

  useEffect(() => {
    setTableData(snapshot);
    setSortState(null);
    setPageSize(getDefaultPageSize(snapshot));
    setCurrentPage(1);
    setSaveStateMessage(null);
    setColumnWidths({});
    setResizeState(null);
    setDraggedColumn(null);
    setDragHoverState(null);
  }, [snapshot]);

  useEffect(() => {
    setCurrentPage(1);
  }, [sortState, pageSize]);

  useEffect(() => {
    const container = tableContainerRef.current;
    if (!container) {
      return;
    }

    const syncWidth = () => {
      setTableContainerWidth(container.clientWidth);
    };

    syncWidth();

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", syncWidth);
      return () => {
        window.removeEventListener("resize", syncWidth);
      };
    }

    const observer = new ResizeObserver(() => {
      syncWidth();
    });
    observer.observe(container);

    return () => {
      observer.disconnect();
    };
  }, []);

  const defaultColumnWidth = useMemo(() => {
    if (tableData.columns.length === 0) {
      return DEFAULT_COLUMN_WIDTH;
    }

    const availableWidth = tableContainerWidth - IMAGE_COLUMN_WIDTH;
    if (availableWidth <= 0) {
      return DEFAULT_COLUMN_WIDTH;
    }

    return clampColumnWidth(Math.floor(availableWidth / tableData.columns.length));
  }, [tableContainerWidth, tableData.columns.length]);

  useEffect(() => {
    setColumnWidths((previous) => {
      const next: Record<string, number> = {};
      for (const column of tableData.columns) {
        if (typeof previous[column] === "number") {
          next[column] = previous[column];
        }
      }

      if (Object.keys(previous).length === Object.keys(next).length) {
        return previous;
      }

      return next;
    });
  }, [tableData.columns]);

  useEffect(() => {
    if (!resizeState) {
      return;
    }

    const handleMouseMove = (event: MouseEvent) => {
      const widthDelta = event.clientX - resizeState.startX;
      const nextWidth = clampColumnWidth(resizeState.startWidth + widthDelta);
      setColumnWidths((previous) => {
        if (previous[resizeState.column] === nextWidth) {
          return previous;
        }

        return {
          ...previous,
          [resizeState.column]: nextWidth
        };
      });
    };

    const handleMouseUp = () => {
      setResizeState(null);
    };

    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
    };
  }, [resizeState]);

  const resolvedColumnWidths = useMemo(
    () => tableData.columns.map((column) => columnWidths[column] ?? defaultColumnWidth),
    [columnWidths, defaultColumnWidth, tableData.columns]
  );

  const tableWidth = useMemo(() => {
    const totalColumnWidth = resolvedColumnWidths.reduce(
      (sum, width) => sum + width,
      IMAGE_COLUMN_WIDTH
    );
    return Math.max(totalColumnWidth, tableContainerWidth);
  }, [resolvedColumnWidths, tableContainerWidth]);

  // Keep original row indexes attached even after sorting and pagination so
  // save/delete requests still target the persisted snapshot row.
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
    const map = new Map<number, TamImageRef[]>();
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

  function updateCellDraft(rowIndex: number, columnName: string, nextValue: TamPrimitive) {
    setTableData((previous) => {
      const nextRows = [...previous.rows];
      const nextRow = { ...nextRows[rowIndex] };
      nextRow[columnName] = nextValue;
      nextRows[rowIndex] = nextRow;

      return {
        ...previous,
        rows: nextRows
      };
    });
  }

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

  async function deleteRowImage(rowIndex: number, src: string) {
    try {
      setIsSaving(true);
      const response = await fetch(`/api/tam/datasets/${datasetId}/images`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          sheetName: tableData.name,
          rowIndex,
          src
        })
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({ error: "Unknown error." }));
        throw new Error(payload.error ?? "Failed to delete image.");
      }

      const payload = (await response.json()) as { sheet: TamSheetSnapshot };
      setTableData((previous) => ({
        ...previous,
        ...payload.sheet
      }));
      setSaveStateMessage("Image deleted.");
    } catch (error) {
      setSaveStateMessage(`Delete failed: ${(error as Error).message}`);
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

  async function deleteColumn(columnName: string) {
    if (!window.confirm(`Delete column "${columnName}"? This will remove its values from the snapshot.`)) {
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
          action: "delete-column",
          sheetName: tableData.name,
          columnName
        })
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({ error: "Unknown error." }));
        throw new Error(payload.error ?? "Failed to delete column.");
      }

      const payload = (await response.json()) as { sheet: TamSheetSnapshot };
      setTableData((previous) => ({
        ...previous,
        ...payload.sheet
      }));
      setSortState((current) => (current?.column === columnName ? null : current));
      setSaveStateMessage("Column deleted.");
    } catch (error) {
      setSaveStateMessage(`Delete column failed: ${(error as Error).message}`);
    } finally {
      setIsSaving(false);
    }
  }

  async function reorderColumn(columnName: string, targetIndex: number) {
    if (targetIndex < 0 || targetIndex >= tableData.columns.length) {
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
          action: "reorder-column",
          sheetName: tableData.name,
          columnName,
          targetIndex
        })
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({ error: "Unknown error." }));
        throw new Error(payload.error ?? "Failed to reorder column.");
      }

      const payload = (await response.json()) as { sheet: TamSheetSnapshot };
      setTableData((previous) => ({
        ...previous,
        ...payload.sheet
      }));
      setSaveStateMessage("Column order updated.");
    } catch (error) {
      setSaveStateMessage(`Reorder failed: ${(error as Error).message}`);
    } finally {
      setIsSaving(false);
    }
  }

  function startColumnResize(
    event: React.MouseEvent<HTMLButtonElement>,
    columnName: string
  ) {
    event.preventDefault();
    event.stopPropagation();
    setResizeState({
      column: columnName,
      startX: event.clientX,
      startWidth: columnWidths[columnName] ?? defaultColumnWidth
    });
  }

  function handleColumnDragStart(
    event: React.DragEvent<HTMLButtonElement>,
    columnName: string
  ) {
    if (!isMaterialsSheet || isSaving) {
      event.preventDefault();
      return;
    }

    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", columnName);
    setDraggedColumn(columnName);
    setDragHoverState(null);
  }

  function handleColumnDragOver(
    event: React.DragEvent<HTMLTableCellElement>,
    columnName: string
  ) {
    if (!draggedColumn || draggedColumn === columnName) {
      return;
    }

    event.preventDefault();
    const bounds = event.currentTarget.getBoundingClientRect();
    const nextPosition = event.clientX - bounds.left <= bounds.width / 2 ? "before" : "after";
    setDragHoverState((current) => {
      if (current?.column === columnName && current.position === nextPosition) {
        return current;
      }

      return {
        column: columnName,
        position: nextPosition
      };
    });
  }

  function handleColumnDrop(
    event: React.DragEvent<HTMLTableCellElement>,
    targetColumnName: string
  ) {
    event.preventDefault();
    const sourceColumn =
      draggedColumn || event.dataTransfer.getData("text/plain");
    const hoverStateForTarget =
      dragHoverState?.column === targetColumnName
        ? dragHoverState
        : {
            column: targetColumnName,
            position: "before" as const
          };

    setDraggedColumn(null);
    setDragHoverState(null);

    if (!sourceColumn || sourceColumn === targetColumnName) {
      return;
    }

    const sourceIndex = tableData.columns.indexOf(sourceColumn);
    const targetIndexBase = tableData.columns.indexOf(targetColumnName);
    if (sourceIndex < 0 || targetIndexBase < 0) {
      return;
    }

    let targetIndex =
      hoverStateForTarget.position === "before"
        ? targetIndexBase
        : targetIndexBase + 1;
    if (sourceIndex < targetIndex) {
      targetIndex -= 1;
    }

    targetIndex = Math.max(0, Math.min(targetIndex, tableData.columns.length - 1));
    if (targetIndex === sourceIndex) {
      return;
    }

    void reorderColumn(sourceColumn, targetIndex);
  }

  function handleColumnDragEnd() {
    setDraggedColumn(null);
    setDragHoverState(null);
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
        <span>{readOnly ? "Read-only product table" : isSaving ? "Saving..." : saveStateMessage ?? "Ready"}</span>
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

        {canMutate ? (
          <label className="control-field">
            <span>Add column</span>
            <div className="inline-field">
              <input
                type="text"
                value={newColumnName}
                onChange={(event) => setNewColumnName(event.target.value)}
                placeholder="New column name"
                disabled={isSaving}
              />
              <button type="button" onClick={addColumn} disabled={isSaving}>
                Add
              </button>
            </div>
          </label>
        ) : null}
      </div>

      <div className="table-container" ref={tableContainerRef}>
        <table className="tam-table" style={{ width: `${tableWidth}px` }}>
          <colgroup>
            <col style={{ width: `${IMAGE_COLUMN_WIDTH}px` }} />
            {tableData.columns.map((column, columnIndex) => (
              <col
                key={`col-${column}`}
                style={{ width: `${resolvedColumnWidths[columnIndex]}px` }}
              />
            ))}
          </colgroup>
          <thead>
            <tr>
              <th scope="col" className="image-column-header">
                Images
              </th>
              {tableData.columns.map((column) => (
                <th
                  key={column}
                  scope="col"
                  className={[
                    "data-column-header",
                    draggedColumn === column ? "is-dragging" : "",
                    dragHoverState?.column === column &&
                    dragHoverState.position === "before"
                      ? "is-drag-over-before"
                      : "",
                    dragHoverState?.column === column &&
                    dragHoverState.position === "after"
                      ? "is-drag-over-after"
                      : ""
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  onDragOver={
                    isMaterialsSheet
                      ? (event) => {
                          handleColumnDragOver(event, column);
                        }
                      : undefined
                  }
                  onDrop={
                    isMaterialsSheet
                      ? (event) => {
                          handleColumnDrop(event, column);
                        }
                      : undefined
                  }
                >
                  <div className="header-cell">
                    <button
                      type="button"
                      className="sort-button"
                      onClick={() => setSortState(nextSortState(sortState, column))}
                      aria-label={`Sort by ${column}`}
                    >
                      <span>{column}</span>
                      <span className="sort-indicator">
                        {sortState?.column === column
                          ? sortState.direction === "asc"
                            ? "^"
                            : "v"
                          : "<>"}
                      </span>
                    </button>
                    {isMaterialsSheet ? (
                      <div className="column-actions">
                        <button
                          type="button"
                          className="column-action column-action-drag"
                          aria-label={`Drag column ${column}`}
                          draggable={!isSaving}
                          onDragStart={(event) => {
                            handleColumnDragStart(event, column);
                          }}
                          onDragEnd={handleColumnDragEnd}
                          disabled={isSaving}
                        >
                          ::
                        </button>
                        <button
                          type="button"
                          className="column-action column-action-danger"
                          aria-label={`Delete column ${column}`}
                          onClick={() => {
                            void deleteColumn(column);
                          }}
                          disabled={isSaving}
                        >
                          x
                        </button>
                      </div>
                    ) : null}
                    <button
                      type="button"
                      className="column-resize-handle"
                      aria-label={`Resize column ${column}`}
                      onMouseDown={(event) => {
                        startColumnResize(event, column);
                      }}
                    />
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
                      {(rowImageMap.get(rowIndex) ?? []).length > 0 ? (
                        (rowImageMap.get(rowIndex) ?? []).map((imageRef, imageIndex) => (
                          <div key={`${imageRef.src}-${imageIndex}`} className="image-tile">
                            <a
                              href={imageRef.src}
                              target="_blank"
                              rel="noreferrer"
                              className="image-preview"
                              title={imageRef.fileName}
                            >
                              <img
                                src={imageRef.src}
                                alt={imageRef.fileName}
                                className="row-thumb"
                                width={104}
                                height={104}
                              />
                            </a>
                            {canMutate && imageIndex === 0 ? (
                              <ImageUploadControl
                                rowIndex={rowIndex}
                                disabled={isSaving}
                                variant="overlay"
                                onUpload={(file) => {
                                  void uploadRowImage(rowIndex, file);
                                }}
                              />
                            ) : null}
                            {canMutate ? (
                              <button
                                type="button"
                                className="image-action image-delete-action"
                                aria-label={`Delete ${imageRef.fileName}`}
                                onClick={() => {
                                  void deleteRowImage(rowIndex, imageRef.src);
                                }}
                                disabled={isSaving}
                              >
                                <span aria-hidden="true">x</span>
                              </button>
                            ) : null}
                          </div>
                        ))
                      ) : canMutate ? (
                        <ImageUploadControl
                          rowIndex={rowIndex}
                          disabled={isSaving}
                          variant="tile"
                          onUpload={(file) => {
                            void uploadRowImage(rowIndex, file);
                          }}
                        />
                      ) : (
                        <div className="image-empty">No image</div>
                      )}
                    </div>
                  </td>
                  {tableData.columns.map((column) => {
                    const productQueryKey =
                      canMutate && column === PRODUCT_CATEGORY_COLUMN_NAME
                        ? resolveProductQueryKey(row[column], productCategoryToQueryKey)
                        : null;
                    const sourceMaterialSheet =
                      readOnly &&
                      column === MATERIAL_SOURCE_COLUMN_NAME &&
                      typeof row[column] === "string" &&
                      row[column].trim().length > 0
                        ? row[column].trim()
                        : null;
                    const linkHref = productQueryKey
                      ? `/tam?sheet=${encodeURIComponent(productQueryKey)}`
                      : sourceMaterialSheet
                        ? `/tam?sheet=${encodeURIComponent(sourceMaterialSheet)}`
                        : null;
                    const linkLabel = productQueryKey
                      ? "Open product table"
                      : sourceMaterialSheet
                        ? "Open material table"
                        : null;
                    const textInput = (
                      <input
                        type="text"
                        className="cell-input"
                        value={cellToInput(row[column])}
                        readOnly={!canMutate}
                        onChange={
                          canMutate
                            ? (event) => {
                                updateCellDraft(rowIndex, column, event.target.value);
                              }
                            : undefined
                        }
                        onBlur={
                          canMutate
                            ? (event) => {
                                const normalized = normalizeInputValue(event.target.value);
                                void saveCellValue(rowIndex, column, normalized);
                              }
                            : undefined
                        }
                      />
                    );

                    return (
                      <td key={column}>
                        {column === MACHINE_COLUMN_NAME && canMutate ? (
                          <MachineSelectionControl
                            value={row[column]}
                            disabled={isSaving}
                            onChange={(nextValue) => {
                              updateCellDraft(rowIndex, column, nextValue);
                              void saveCellValue(rowIndex, column, nextValue);
                            }}
                          />
                        ) : linkHref && linkLabel ? (
                          <div className="cell-stack">
                            {textInput}
                            <a href={linkHref} className="cell-link">
                              {linkLabel}
                            </a>
                          </div>
                        ) : (
                          textInput
                        )}
                      </td>
                    );
                  })}
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

function getDefaultPageSize(snapshot: Pick<TamSheetSnapshot, "name">): number {
  return snapshot.name === "Substrates" ? SUBSTRATES_PAGE_SIZE : DEFAULT_PAGE_SIZE;
}

function clampColumnWidth(width: number): number {
  return Math.max(MIN_COLUMN_WIDTH, Math.min(MAX_COLUMN_WIDTH, Math.round(width)));
}

interface ImageUploadControlProps {
  rowIndex: number;
  disabled: boolean;
  variant: "overlay" | "tile";
  onUpload: (file: File) => void;
}

function ImageUploadControl({
  rowIndex,
  disabled,
  variant,
  onUpload
}: ImageUploadControlProps) {
  const className =
    variant === "tile"
      ? "image-tile image-upload-tile"
      : "image-action image-upload-action";

  return (
    <label className={className}>
      <span className="image-upload-icon" aria-hidden="true">
        +
      </span>
      <input
        type="file"
        accept="image/*"
        className="image-upload-input"
        aria-label={`Upload image for row ${rowIndex + 1}`}
        disabled={disabled}
        onChange={(event) => {
          const nextFile = event.target.files?.[0];
          if (!nextFile) {
            return;
          }
          onUpload(nextFile);
          event.currentTarget.value = "";
        }}
      />
    </label>
  );
}

function MachineSelectionControl({
  value,
  disabled,
  onChange
}: {
  value: TamPrimitive;
  disabled: boolean;
  onChange: (nextValue: string | null) => void;
}) {
  const selectedMachines = parseMachineSelection(value);
  const selectedLabels = MACHINE_OPTIONS.filter((option) =>
    selectedMachines.has(option.value)
  ).map((option) => option.label);
  const summaryLabel =
    selectedLabels.length > 0
      ? selectedLabels.join(", ")
      : "Select machine use for production";

  return (
    <details className="machine-dropdown">
      <summary
        className={`machine-dropdown-trigger ${disabled ? "is-disabled" : ""}`}
        onClick={(event) => {
          if (disabled) {
            event.preventDefault();
          }
        }}
      >
        {summaryLabel}
      </summary>
      <div className="machine-dropdown-menu">
        <p className="machine-dropdown-hint">You can select as many as you want.</p>
        {MACHINE_OPTIONS.map((option) => {
          const isChecked = selectedMachines.has(option.value);
          return (
            <label key={option.value} className="machine-dropdown-option">
              <input
                type="checkbox"
                checked={isChecked}
                disabled={disabled}
                onChange={() => {
                  const nextSelection = new Set(selectedMachines);
                  if (isChecked) {
                    nextSelection.delete(option.value);
                  } else {
                    nextSelection.add(option.value);
                  }

                  onChange(serializeMachineSelection(nextSelection));
                }}
              />
              <span>{option.label}</span>
            </label>
          );
        })}
      </div>
    </details>
  );
}

function resolveProductQueryKey(
  value: TamPrimitive,
  productCategoryToQueryKey: Record<string, string> | undefined
): string | null {
  if (!productCategoryToQueryKey || typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }

  return productCategoryToQueryKey[trimmed] ?? null;
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

export { TamTable };
export default TamTable;
