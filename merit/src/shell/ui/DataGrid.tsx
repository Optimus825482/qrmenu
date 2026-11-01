"use client";

import { isValidElement, type KeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode, useEffect, useId, useMemo, useRef, useState } from "react";
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

export type RowContextAction = { label: string; onSelect(): void; disabled?: boolean };

type Props<T extends { id: string }> = {
  className?: string;
  rowClassName?: (row: T) => string | undefined;
  columns: Column<T>[];
  rows: T[];
  total: number;
  page: number;
  pageSize: number;
  onPage: (page: number) => void;
  onSort: (sort: SortSpec) => void;
  onSearch: (q: string) => void;
  selectedId?: string;
  selectedIds?: readonly string[];
  multiSelect?: boolean;
  onSelect: (row: T, selection?: { additive?: true; rangeIds?: string[] }) => void;
  /** Enter on the selected row or a double click (usually "edit"). */
  onActivate?: (row: T) => void;
  /** Optional actions shown when a row is right-clicked. */
  rowContextActions?: (row: T) => RowContextAction[];
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

function renderedText(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(renderedText).join(" ");
  if (isValidElement<{ children?: ReactNode }>(node)) return renderedText(node.props.children);
  return "";
}

function sortValue<T>(column: Column<T>, row: T): unknown {
  const value = (row as Record<string, unknown>)[column.key];
  if (value !== null && value !== undefined) return value;
  return renderedText(column.render?.(row));
}

function compareValues(a: unknown, b: unknown): number {
  if (a instanceof Date || b instanceof Date) {
    return new Date(a as string | number | Date).getTime() - new Date(b as string | number | Date).getTime();
  }
  if (typeof a === "number" && typeof b === "number") return a - b;
  if (typeof a === "boolean" && typeof b === "boolean") return Number(a) - Number(b);
  const text = (value: unknown) => Array.isArray(value) ? value.join(", ") : value == null ? "" : String(value);
  return text(a).localeCompare(text(b), "tr", { numeric: true, sensitivity: "base" });
}

/**
 * Windows XP style data table: grey header row, blue selected row, 1px borders. Generic: it knows
 * nothing about entities. Focus stays on the grid element while rows are selected (it is the tab
 * stop for the rows; sortable column headers are tab stops of their own) and the selected row is
 * exposed through aria-activedescendant. Keys: ↑/↓ move the selection, Home/End jump, Enter
 * activates. Clicking a row or a sortable header hands focus to the grid, so the arrow keys keep
 * working after a mouse sort (Enter/Space on a header keeps focus on the header).
 */
export function DataGrid<T extends { id: string }>({
  className,
  rowClassName,
  columns,
  rows,
  total,
  page,
  pageSize,
  onPage,
  onSort,
  onSearch,
  selectedId,
  selectedIds,
  multiSelect = false,
  onSelect,
  onActivate,
  rowContextActions,
  onPageSize,
  sort,
  q,
  toolbar,
  emptyText,
}: Props<T>) {
  const gridId = useId();
  const gridRef = useRef<HTMLDivElement>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const resizeRef = useRef<{ key: string; x: number; width: number } | null>(null);
  const [resizedWidths, setResizedWidths] = useState<Record<string, number>>({});
  const [localSort, setLocalSort] = useState<SortSpec | undefined>();
  const [contextMenu, setContextMenu] = useState<{ actions: RowContextAction[]; x: number; y: number } | null>(null);
  const anchorId = useRef<string | undefined>(selectedId);
  const rowId = (id: string) => `${gridId}-row-${id}`;
  const template = columns.map((c) => resizedWidths[c.key] ? `${resizedWidths[c.key]}px` : track(c.width)).join(" ");
  const resizeStorageKey = `merit-grid-widths:${columns.map((column) => column.key).join(",")}`;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const selectedSet = new Set(selectedIds ?? (selectedId ? [selectedId] : []));
  const visibleRows = useMemo(() => {
    if (!localSort) return rows;
    const column = columns.find((item) => item.key === localSort.field);
    if (!column) return rows;
    return rows
      .map((row, index) => ({ row, index, value: sortValue(column, row) }))
      .sort((a, b) => {
        const result = compareValues(a.value, b.value);
        return result === 0 ? a.index - b.index : localSort.dir === "asc" ? result : -result;
      })
      .map(({ row }) => row);
  }, [rows, columns, localSort]);
  const selectedIndex = visibleRows.findIndex((r) => r.id === selectedId);

  useEffect(() => {
    if (selectedId === undefined) return;
    // The ids contain generated colons: look the row up by walking, not by selector.
    const el = gridRef.current?.querySelector<HTMLElement>(`[data-row-id="${CSS.escape(selectedId)}"]`);
    el?.scrollIntoView?.({ block: "nearest" });
  }, [selectedId]);

  useEffect(() => {
    let widths: Record<string, number> | undefined;
    try {
      const saved = window.localStorage.getItem(resizeStorageKey);
      if (saved) {
        const parsed: unknown = JSON.parse(saved);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          widths = Object.fromEntries(
            Object.entries(parsed).filter((entry): entry is [string, number] => typeof entry[1] === "number" && Number.isFinite(entry[1])),
          );
        }
      }
    } catch {
      // Width customization is optional; ignore unavailable or invalid local storage.
    }
    if (!widths) return;
    const timer = window.setTimeout(() => setResizedWidths(widths), 0);
    return () => window.clearTimeout(timer);
  }, [resizeStorageKey]);

  const saveWidths = (widths: Record<string, number>) => {
    setResizedWidths(widths);
    try {
      window.localStorage.setItem(resizeStorageKey, JSON.stringify(widths));
    } catch {
      // Keep the in-memory resize even if the browser cannot persist preferences.
    }
  };

  const beginResize = (event: ReactPointerEvent<HTMLSpanElement>, key: string) => {
    event.preventDefault();
    event.stopPropagation();
    const cell = event.currentTarget.parentElement;
    if (!cell) return;
    resizeRef.current = { key, x: event.clientX, width: cell.getBoundingClientRect().width };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const moveResize = (event: ReactPointerEvent<HTMLSpanElement>) => {
    const drag = resizeRef.current;
    if (!drag) return;
    const width = Math.max(52, Math.round(drag.width + event.clientX - drag.x));
    saveWidths({ ...resizedWidths, [drag.key]: width });
  };

  const endResize = () => { resizeRef.current = null; };

  useEffect(() => {
    if (!contextMenu) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!contextMenuRef.current?.contains(event.target as Node)) setContextMenu(null);
    };
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") setContextMenu(null);
    };
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [contextMenu]);

  const move = (index: number) => {
    const row = visibleRows[Math.min(Math.max(index, 0), visibleRows.length - 1)];
    if (row && row.id !== selectedId) {
      anchorId.current = row.id;
      onSelect(row);
    }
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
    const current = column.sortable === true ? sort : localSort;
    const dir = current?.field === column.key && current.dir === "asc" ? "desc" : "asc";
    if (column.sortable === true) {
      setLocalSort(undefined);
      onSort({ field: column.key, dir });
    } else {
      setLocalSort({ field: column.key, dir });
    }
  };

  return (
    <div className={className ? `xp-grid ${className}` : "xp-grid"}>
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
        // The header row counts as row 1: data rows are numbered from 2 across all pages.
        aria-rowcount={total + 1}
        aria-colcount={columns.length}
        aria-activedescendant={selectedIndex === -1 ? undefined : rowId(rows[selectedIndex].id)}
        className="xp-grid-body"
        onKeyDown={onKeyDown}
      >
        <div role="row" aria-rowindex={1} className="xp-grid-row xp-grid-head" style={{ gridTemplateColumns: template }}>
          {columns.map((column) => {
            const activeSort = column.sortable === true ? sort : localSort;
            const sorted = activeSort?.field === column.key ? activeSort.dir : undefined;
            const sortable = column.sortable !== false;
            return (
              <div
                key={column.key}
                role="columnheader"
                className="xp-grid-cell"
                style={{ position: "relative" }}
                data-sortable={sortable ? "true" : undefined}
                aria-sort={sorted ? (sorted === "asc" ? "ascending" : "descending") : undefined}
                tabIndex={sortable ? 0 : undefined}
                onClick={() => {
                  // Like a row click: the grid keeps the keyboard, so ↑/↓ work after a mouse sort.
                  if (sortable) gridRef.current?.focus();
                  toggleSort(column);
                }}
                onKeyDown={(e) => {
                  if (sortable && (e.key === "Enter" || e.key === " ")) {
                    e.preventDefault();
                    toggleSort(column);
                  }
                }}
              >
                {column.title}
                {sorted ? (
                  <span aria-hidden="true" className="xp-grid-sort">
                    {sorted === "asc" ? " ▲" : " ▼"}
                  </span>
                ) : null}
                <span
                  role="separator"
                  aria-orientation="vertical"
                  aria-label={`${column.title} sütun genişliği`}
                  aria-valuenow={resizedWidths[column.key]}
                  tabIndex={0}
                  className="xp-grid-resize-handle"
                  onPointerDown={(event) => beginResize(event, column.key)}
                  onPointerMove={moveResize}
                  onPointerUp={endResize}
                  onPointerCancel={endResize}
                  onClick={(event) => event.stopPropagation()}
                  onKeyDown={(event) => {
                    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
                    event.preventDefault();
                    event.stopPropagation();
                    const current = resizedWidths[column.key] ?? event.currentTarget.parentElement?.getBoundingClientRect().width ?? 100;
                    saveWidths({ ...resizedWidths, [column.key]: Math.max(52, current + (event.key === "ArrowRight" ? 10 : -10)) });
                  }}
                />
              </div>
            );
          })}
        </div>

        {visibleRows.map((row, index) => (
          <div
            key={row.id}
            id={rowId(row.id)}
            aria-rowindex={(page - 1) * pageSize + index + 2}
            data-row-id={row.id}
            role="row"
            aria-selected={selectedSet.has(row.id)}
            className={rowClassName?.(row) ? `xp-grid-row ${rowClassName(row)}` : "xp-grid-row"}
            style={{ gridTemplateColumns: template }}
            onClick={(event) => {
              gridRef.current?.focus();
              if (multiSelect && event.shiftKey && anchorId.current) {
              const from = visibleRows.findIndex((item) => item.id === anchorId.current);
                const to = index;
                if (from !== -1) {
                  onSelect(row, { rangeIds: visibleRows.slice(Math.min(from, to), Math.max(from, to) + 1).map((item) => item.id) });
                  return;
                }
              }
              if (multiSelect && (event.ctrlKey || event.metaKey)) {
                anchorId.current ??= row.id;
                onSelect(row, { additive: true });
                return;
              }
              anchorId.current = row.id;
              onSelect(row);
            }}
            onDoubleClick={() => onActivate?.(row)}
            onContextMenu={(event) => {
              if (!rowContextActions) return;
              event.preventDefault();
              onSelect(row);
              setContextMenu({
                actions: rowContextActions(row),
                x: Math.max(8, Math.min(event.clientX, window.innerWidth - 190)),
                y: Math.max(8, Math.min(event.clientY, window.innerHeight - 110)),
              });
            }}
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

      {contextMenu ? (
        <div ref={contextMenuRef} role="menu" aria-label="Satır işlemleri" className="xp-row-context-menu" style={{ left: contextMenu.x, top: contextMenu.y }}>
          {contextMenu.actions.map((action, index) => (
            <button
              key={`${action.label}-${index}`}
              type="button"
              role="menuitem"
              disabled={action.disabled}
              onClick={() => { setContextMenu(null); action.onSelect(); }}
            >
              {action.label}
            </button>
          ))}
        </div>
      ) : null}

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
