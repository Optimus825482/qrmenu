"use client";

import { type KeyboardEvent, type ReactNode, useEffect, useId, useRef } from "react";
import { PAGE_SIZES, type PageSize, type SortSpec } from "@/modules/core/server/admin/listQuery";

export type Column<T> = {
  /** Cell fallback reads `row[key]`; also the sort field sent to `onSort`. */
  key: string;
  title: string;
  /** Pixels (number) or any CSS track size; omitted = share the remaining width. */
  width?: number | string;
  render?: (row: T) => ReactNode;
  sortable?: boolean;
};

type Props<T extends { id: string }> = {
  columns: Column<T>[];
  rows: T[];
  total: number;
  page: number;
  pageSize: number;
  onPage: (page: number) => void;
  onSort: (sort: SortSpec) => void;
  onSearch: (q: string) => void;
  selectedId?: string;
  onSelect: (row: T) => void;
  /** Enter on the selected row or a double click (usually "edit"). */
  onActivate?: (row: T) => void;
  onPageSize?: (pageSize: PageSize) => void;
  /** Current sort, drawn as an arrow on its header. */
  sort?: SortSpec;
  /** Search text; omit to let the box keep its own. */
  q?: string;
  toolbar?: ReactNode;
  emptyText: string;
};

function track(width: number | string | undefined): string {
  if (width === undefined) return "minmax(0, 1fr)";
  return typeof width === "number" ? `${width}px` : width;
}

function cell<T>(column: Column<T>, row: T): ReactNode {
  if (column.render) return column.render(row);
  const value = (row as Record<string, unknown>)[column.key];
  return value === null || value === undefined ? "" : String(value);
}

/**
 * Windows XP style data table: grey header row, blue selected row, 1px borders. Generic: it knows
 * nothing about entities. The grid element is the one tab stop; focus stays on it and the selected
 * row is exposed through aria-activedescendant. Keys: ↑/↓ move the selection, Home/End jump,
 * Enter activates.
 */
export function DataGrid<T extends { id: string }>({
  columns,
  rows,
  total,
  page,
  pageSize,
  onPage,
  onSort,
  onSearch,
  selectedId,
  onSelect,
  onActivate,
  onPageSize,
  sort,
  q,
  toolbar,
  emptyText,
}: Props<T>) {
  const gridId = useId();
  const gridRef = useRef<HTMLDivElement>(null);
  const rowId = (id: string) => `${gridId}-row-${id}`;
  const template = columns.map((c) => track(c.width)).join(" ");
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const selectedIndex = rows.findIndex((r) => r.id === selectedId);

  useEffect(() => {
    if (selectedId === undefined) return;
    // The ids contain generated colons: look the row up by walking, not by selector.
    const el = gridRef.current?.querySelector<HTMLElement>(`[data-row-id="${CSS.escape(selectedId)}"]`);
    el?.scrollIntoView?.({ block: "nearest" });
  }, [selectedId]);

  const move = (index: number) => {
    const row = rows[Math.min(Math.max(index, 0), rows.length - 1)];
    if (row && row.id !== selectedId) onSelect(row);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget || rows.length === 0) return;
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        move(selectedIndex === -1 ? 0 : selectedIndex + 1);
        break;
      case "ArrowUp":
        e.preventDefault();
        move(selectedIndex === -1 ? 0 : selectedIndex - 1);
        break;
      case "Home":
        e.preventDefault();
        move(0);
        break;
      case "End":
        e.preventDefault();
        move(rows.length - 1);
        break;
      case "Enter":
        if (selectedIndex !== -1 && onActivate) {
          e.preventDefault();
          onActivate(rows[selectedIndex]);
        }
        break;
    }
  };

  const toggleSort = (column: Column<T>) => {
    if (!column.sortable) return;
    const dir = sort?.field === column.key && sort.dir === "asc" ? "desc" : "asc";
    onSort({ field: column.key, dir });
  };

  return (
    <div className="xp-grid">
      <div className="xp-grid-bar">
        {toolbar}
        <input
          type="search"
          className="xp-grid-search"
          placeholder="Ara…"
          aria-label="Listede ara"
          {...(q === undefined ? {} : { value: q })}
          onChange={(e) => onSearch(e.target.value)}
        />
      </div>

      <div
        ref={gridRef}
        role="grid"
        tabIndex={0}
        aria-rowcount={total}
        aria-colcount={columns.length}
        aria-activedescendant={selectedIndex === -1 ? undefined : rowId(rows[selectedIndex].id)}
        className="xp-grid-body"
        onKeyDown={onKeyDown}
      >
        <div role="row" className="xp-grid-row xp-grid-head" style={{ gridTemplateColumns: template }}>
          {columns.map((column) => {
            const sorted = sort?.field === column.key ? sort.dir : undefined;
            return (
              <div
                key={column.key}
                role="columnheader"
                className="xp-grid-cell"
                data-sortable={column.sortable ? "true" : undefined}
                aria-sort={sorted ? (sorted === "asc" ? "ascending" : "descending") : undefined}
                onClick={() => toggleSort(column)}
              >
                {column.title}
                {sorted ? (
                  <span aria-hidden="true" className="xp-grid-sort">
                    {sorted === "asc" ? " ▲" : " ▼"}
                  </span>
                ) : null}
              </div>
            );
          })}
        </div>

        {rows.map((row) => (
          <div
            key={row.id}
            id={rowId(row.id)}
            data-row-id={row.id}
            role="row"
            aria-selected={row.id === selectedId}
            className="xp-grid-row"
            style={{ gridTemplateColumns: template }}
            onClick={() => {
              gridRef.current?.focus();
              onSelect(row);
            }}
            onDoubleClick={() => onActivate?.(row)}
          >
            {columns.map((column) => (
              <div key={column.key} role="gridcell" className="xp-grid-cell">
                {cell(column, row)}
              </div>
            ))}
          </div>
        ))}

        {rows.length === 0 ? <p className="xp-grid-empty">{emptyText}</p> : null}
      </div>

      <div className="xp-grid-footer">
        <span>{total} kayıt</span>
        <span className="xp-grid-pager">
          {onPageSize ? (
            <select
              aria-label="Sayfa başına kayıt"
              value={pageSize}
              onChange={(e) => onPageSize(Number(e.target.value) as PageSize)}
            >
              {PAGE_SIZES.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          ) : null}
          <button
            type="button"
            className="xp-button xp-grid-page-button"
            aria-label="Önceki sayfa"
            disabled={page <= 1}
            onClick={() => onPage(page - 1)}
          >
            ‹
          </button>
          <span aria-live="polite">
            Sayfa {page} / {pages}
          </span>
          <button
            type="button"
            className="xp-button xp-grid-page-button"
            aria-label="Sonraki sayfa"
            disabled={page >= pages}
            onClick={() => onPage(page + 1)}
          >
            ›
          </button>
        </span>
      </div>
    </div>
  );
}
