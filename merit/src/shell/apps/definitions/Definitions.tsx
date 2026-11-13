"use client";

import { appFrameUrl } from "@/shell/appearance";
import { type KeyboardEvent, useId, useMemo, useState } from "react";
import { listOutletsAction } from "@/modules/core/server/admin/actions/outlets";
import type { OutletRow } from "@/modules/core/server/admin/outlets";
import { useLiveList } from "@/shell/ui/useLiveList";
import { hotelsForApp, useWindowStore, windowStore } from "@/shell/windowStore";
import { XpIcon } from "../../icons";
import type { AppProps } from "../../registry";
import { FloorsPanel } from "./panels/FloorsPanel";
import { HotelPanel } from "./panels/HotelPanel";
import { OutletsPanel } from "./panels/OutletsPanel";
import { RoomsPanel } from "./panels/RoomsPanel";
import { RoomTypesPanel } from "./panels/RoomTypesPanel";
import { TablesPanel } from "./panels/TablesPanel";

type NodeDef = {
  id: string;
  label: string;
  /** Tree depth: 1 = top level, 2 = child of the previous level-1 node. */
  level: 1 | 2;
  outletId?: string;
  /** The P1 task that adds the panel; unset = implemented. */
  task?: number;
};

/** Otel › Katlar · Oda Tipleri · Odalar — Outletler › outlet kayıtları. */
export const DEFINITION_NODES: readonly NodeDef[] = [
  { id: "otel", label: "Otel", level: 1 },
  { id: "katlar", label: "Katlar", level: 2 },
  { id: "oda-tipleri", label: "Oda Tipleri", level: 2 },
  { id: "odalar", label: "Odalar", level: 2 },
  { id: "outletler", label: "Outletler", level: 1 },
  { id: "minibar-tanimlar", label: "Minibar & Setup Tanımları", level: 1 },
];

const DEFAULT_PANEL = "otel";

function initialNode(initialPanel?: string): string {
  // The setup guide used to open a separate Masalar node; keep that link working after
  // outlet-specific table lists become children of Outletler.
  if (initialPanel === "masalar") return "outletler";
  return DEFINITION_NODES.some((n) => n.id === initialPanel) ? (initialPanel as string) : DEFAULT_PANEL;
}

/**
 * Tanımlamalar (core.tanimlar): the definition tree on the left, the chosen panel on the right.
 * The window is bound to one hotel (needsHotel), so every panel works on that hotel. `initialPanel`
 * (a node id) opens the window on that node.
 */
export function Definitions({ hotelId, initialPanel, setStatus, windowId }: AppProps) {
  const [panel, setPanel] = useState(() => initialNode(initialPanel));
  const [legacyTablesOpen, setLegacyTablesOpen] = useState(initialPanel === "masalar");
  const treeId = useId();
  const itemId = (id: string) => `${treeId}-${id}`;
  const availableHotels = useWindowStore((state) => state.hotels);
  const fontFamily = useWindowStore((state) => state.fontFamily);
  const theme = useWindowStore((state) => state.theme);
  const screensByHotel = useWindowStore((state) => state.screensByHotel);
  const hotelChoices = useMemo(
    () => hotelsForApp({ hotels: availableHotels, screensByHotel }, "core.tanimlar"),
    [availableHotels, screensByHotel],
  );
  const currentHotelIndex = hotelChoices.findIndex((hotel) => hotel.id === hotelId);
  const moveBack = () => {
    const previousHotel = hotelChoices[currentHotelIndex - 1];
    if (previousHotel) windowStore.getState().setHotel(windowId, previousHotel.id);
    else if (currentHotelIndex === 0) windowStore.getState().clearHotel(windowId);
  };
  const outlets = useLiveList<OutletRow>(
    (query) =>
      hotelId
        ? listOutletsAction({ hotelId, query, withoutRoomService: true })
        : Promise.resolve({
            ok: true as const,
            data: { items: [] as OutletRow[], total: 0, page: 1, pageSize: query.pageSize },
          }),
    { hotelId, entities: ["outlet", "outletArea"], pageSize: 100 },
  );
  const outletNodes: NodeDef[] = outlets.rows.map((outlet) => ({
      id: `outlet:${outlet.id}`,
      label: outlet.name,
      level: 2 as const,
      outletId: outlet.id,
    }));
  const nodes = [
    ...DEFINITION_NODES.slice(0, DEFINITION_NODES.findIndex((n) => n.id === "outletler") + 1),
    ...outletNodes,
    ...DEFINITION_NODES.slice(DEFINITION_NODES.findIndex((n) => n.id === "outletler") + 1),
  ];
  const legacyOutlet = legacyTablesOpen && !outlets.loading ? outlets.rows[0] : undefined;
  const selectedPanel = legacyOutlet
    ? `outlet:${legacyOutlet.id}`
    : nodes.some((item) => item.id === panel)
      ? panel
      : "outletler";
  const node = nodes.find((item) => item.id === selectedPanel) ?? nodes[0];

  const select = (id: string, focus = false) => {
    setLegacyTablesOpen(false);
    setPanel(id);
    if (focus) document.getElementById(itemId(id))?.focus();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const index = nodes.findIndex((n) => n.id === node.id);
    let next: number;
    if (e.key === "ArrowDown") next = Math.min(index + 1, nodes.length - 1);
    else if (e.key === "ArrowUp") next = Math.max(index - 1, 0);
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = nodes.length - 1;
    else return;
    e.preventDefault();
    select(nodes[next].id, true);
  };

  let body;
  if (!hotelId) {
    body = <p className="xp-defs-note">Bir otel seçilmedi.</p>;
  } else if (node.task !== undefined) {
    body = (
      <div className="xp-app-placeholder">
        <XpIcon name="pencere" size={40} />
        <div>
          <strong>{node.label}</strong>
          <p>Bu bölüm P1 Task {node.task}&apos;te eklenecek.</p>
        </div>
      </div>
    );
  } else if (node.id === "katlar") {
    body = <FloorsPanel hotelId={hotelId} setStatus={setStatus} />;
  } else if (node.id === "oda-tipleri") {
    body = <RoomTypesPanel hotelId={hotelId} setStatus={setStatus} />;
  } else if (node.id === "odalar") {
    body = <RoomsPanel hotelId={hotelId} setStatus={setStatus} />;
  } else if (node.outletId) {
    body = <TablesPanel hotelId={hotelId} outletId={node.outletId} setStatus={setStatus} />;
  } else if (node.id === "outletler") {
    body = <OutletsPanel hotelId={hotelId} setStatus={setStatus} />;
  } else if (node.id === "minibar-tanimlar") {
    body = (
      <iframe
        // The page follows the window's hotel (its own selector is hidden inside a frame).
        key={hotelId ?? ""}
        // Marked as a shell frame (`font`/`theme`): the page drops the staff chrome and its links keep the hotel.
        src={appFrameUrl(hotelId ? `/depo/tanimlar?hotelId=${encodeURIComponent(hotelId)}` : "/depo/tanimlar", { fontFamily, theme })}
        title="Minibar Tanımları"
        className="w-full h-full border-0 rounded-lg min-h-[500px]"
      />
    );
  } else {
    body = <HotelPanel hotelId={hotelId} setStatus={setStatus} />;
  }

  return (
    <div className="xp-defs">
      <div className="xp-defs-content">
        <nav className="xp-defs-nav" aria-label="Tanımlamalar">
          <div
            role="tree"
            aria-label="Tanımlama başlıkları"
            className="xp-tree"
            data-guide="tanim-klasorleri"
            onKeyDown={onKeyDown}
          >
            {nodes.map((n) => {
              const selected = n.id === node.id;
              return (
                <div
                  key={n.id}
                  id={itemId(n.id)}
                  role="treeitem"
                  aria-level={n.level}
                  aria-selected={selected}
                  aria-expanded={
                    n.id === "outletler" ||
                    (n.id.startsWith("outlet:") &&
                      (outlets.rows.find((outlet) => `outlet:${outlet.id}` === n.id)?.areas.length ?? 0) > 1)
                      ? true
                      : undefined
                  }
                  tabIndex={selected ? 0 : -1}
                  title={n.label}
                  className="xp-tree-item"
                  data-level={n.level}
                  onClick={() => select(n.id)}
                >
                  {n.label}
                </div>
              );
            })}
          </div>
        </nav>
        <div className="xp-defs-main" role="region" aria-label={`${node.label} paneli`}>
          {body}
        </div>
      </div>
    </div>
  );
}
