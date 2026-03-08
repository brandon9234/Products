"use client";

import { useEffect, useMemo, useState } from "react";

import type { TamPrimitive, TamSnapshot } from "@/src/lib/tam/types";

const DEFAULT_PAGE_SIZE = 25;
const PAGE_SIZE_OPTIONS = [25, 50, 100];

interface SortState {
  column: string;
  direction: "asc" | "desc";
}

interface TamTableProps {
  snapshot: TamSnapshot;
}

export function TamTable({ snapshot }: TamTableProps) {
  const [globalQuery, setGlobalQuery] = useState("");
  const [columnFilters, setColumnFilters] = useState<Record<string, string>>(
    Object.fromEntries(snapshot.columns.map((column) => [column, ""]))
  );
  const [sortState, setSortState] = useState<SortState | null>(null);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    setColumnFilters(Object.fromEntries(snapshot.columns.map((column) => [column, ""])));
  }, [snapshot.columns]);

  useEffect(() => {
    setCurrentPage(1);
  }, [globalQuery, columnFilters, sortState, pageSize]);

  const filteredRows = useMemo(() => {
    const globalNeedle = globalQuery.trim().toLowerCase();

    return snapshot.rows.filter((row) => {
      if (globalNeedle.length > 0) {
        const hasGlobalMatch = snapshot.columns.some((column) =>
          cellToString(row[column]).toLowerCase().includes(globalNeedle)
        );

        if (!hasGlobalMatch) {
          return false;
        }
      }

      return snapshot.columns.every((column) => {
        const filterNeedle = (columnFilters[column] ?? "").trim().toLowerCase();
        if (filterNeedle.length === 0) {
          return true;
        }

        return cellToString(row[column]).toLowerCase().includes(filterNeedle);
      });
    });
  }, [globalQuery, snapshot.rows, snapshot.columns, columnFilters]);

  const sortedRows = useMemo(() => {
    if (!sortState) {
      return filteredRows;
    }

    const { column, direction } = sortState;
    const multiplier = direction === "asc" ? 1 : -1;

    return [...filteredRows].sort((leftRow, rightRow) => {
      const comparison = compareCells(leftRow[column], rightRow[column]);
      return comparison * multiplier;
    });
  }, [filteredRows, sortState]);

  const totalPages = Math.max(1, Math.ceil(sortedRows.length / pageSize));
  const clampedPage = Math.min(currentPage, totalPages);

  useEffect(() => {
    if (currentPage !== clampedPage) {
      setCurrentPage(clampedPage);
    }
  }, [currentPage, clampedPage]);

  const pageStart = (clampedPage - 1) * pageSize;
  const pageRows = sortedRows.slice(pageStart, pageStart + pageSize);

  if (snapshot.columns.length === 0) {
    return (
      <section className="message-card">
        <h2>No Columns Found</h2>
        <p>The snapshot exists but there are no header columns in the source sheet.</p>
      </section>
    );
  }

  return (
    <section className="table-shell">
      <div className="summary-strip">
        <span>
          <strong>{snapshot.rowCount}</strong> total rows
        </span>
        <span>
          <strong>{snapshot.columns.length}</strong> columns
        </span>
        <span>
          Imported: <strong>{new Date(snapshot.generatedAt).toLocaleString()}</strong>
        </span>
        <span>
          Showing <strong>{sortedRows.length}</strong> filtered rows
        </span>
      </div>

      <div className="control-grid">
        <label className="control-field">
          <span>Global Search</span>
          <input
            type="text"
            value={globalQuery}
            onChange={(event) => setGlobalQuery(event.target.value)}
            placeholder="Search any column..."
          />
        </label>

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
      </div>

      <details className="filter-panel" open>
        <summary>Column Filters</summary>
        <div className="filter-grid">
          {snapshot.columns.map((column) => (
            <label key={column} className="control-field">
              <span>{column}</span>
              <input
                type="text"
                value={columnFilters[column] ?? ""}
                onChange={(event) =>
                  setColumnFilters((previous) => ({
                    ...previous,
                    [column]: event.target.value
                  }))
                }
                placeholder={`Filter ${column}`}
              />
            </label>
          ))}
        </div>
      </details>

      <div className="table-container">
        <table className="tam-table">
          <thead>
            <tr>
              {snapshot.columns.map((column) => (
                <th key={column} scope="col">
                  <button
                    type="button"
                    className="sort-button"
                    onClick={() => setSortState(nextSortState(sortState, column))}
                    aria-label={`Sort by ${column}`}
                  >
                    {column}
                    <span className="sort-indicator">
                      {sortState?.column === column
                        ? sortState.direction === "asc"
                          ? "^"
                          : "v"
                        : "<>"}
                    </span>
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pageRows.length > 0 ? (
              pageRows.map((row, rowIndex) => (
                <tr key={`${pageStart + rowIndex}`}>
                  {snapshot.columns.map((column) => (
                    <td key={column}>{renderCell(row[column])}</td>
                  ))}
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={snapshot.columns.length} className="empty-row">
                  No rows match the current filters.
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

function renderCell(value: TamPrimitive): string {
  return value === null ? "-" : String(value);
}

function cellToString(value: TamPrimitive): string {
  return value === null ? "" : String(value);
}
