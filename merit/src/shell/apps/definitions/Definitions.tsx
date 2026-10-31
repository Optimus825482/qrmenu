"use client";

import { type KeyboardEvent, useId, useState } from "react";
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
  /** The P1 task that adds the panel; unset = implemented. */
  task?: number;
};

/** Otel › Katlar · Oda Tipleri · Odalar — Outletler › Masalar — Kullanıcılar · Ekipler · Roller · Yetki Matrisi. */
export const DEFINITION_NODES: readonly NodeDef[] = [
  { id: "otel", label: "Otel", level: 1 },
  { id: "katlar", label: "Katlar", level: 2 },
  { id: "oda-tipleri", label: "Oda Tipleri", level: 2 },
  { id: "odalar", label: "Odalar", level: 2 },
  { id: "outletler", label: "Outletler", level: 1 },
  { id: "masalar", label: "Masalar", level: 2 },
  { id: "kullanicilar", label: "Kullanıcılar", level: 1, task: 5 },
  { id: "ekipler", label: "Ekipler", level: 1, task: 5 },
  { id: "roller", label: "Roller", level: 1, task: 6 },
  { id: "yetki-matrisi", label: "Yetki Matrisi", level: 1, task: 6 },
];

const DEFAULT_PANEL = "otel";

function initialNode(initialPanel?: string): string {
  return DEFINITION_NODES.some((n) => n.id === initialPanel) ? (initialPanel as string) : DEFAULT_PANEL;
}

/**
 * Tanımlamalar (core.tanimlar): the definition tree on the left, the chosen panel on the right.
 * The window is bound to one hotel (needsHotel), so every panel works on that hotel. `initialPanel`
 * (a node id) opens the window on that node.
 */
export function Definitions({ hotelId, initialPanel, setStatus }: AppProps) {
  const [panel, setPanel] = useState(() => initialNode(initialPanel));
  const treeId = useId();
  const itemId = (id: string) => `${treeId}-${id}`;
  const node = DEFINITION_NODES.find((n) => n.id === panel) ?? DEFINITION_NODES[0];

  const select = (id: string, focus = false) => {
    setPanel(id);
    if (focus) document.getElementById(itemId(id))?.focus();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const index = DEFINITION_NODES.findIndex((n) => n.id === panel);
    let next: number;
    if (e.key === "ArrowDown") next = Math.min(index + 1, DEFINITION_NODES.length - 1);
    else if (e.key === "ArrowUp") next = Math.max(index - 1, 0);
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = DEFINITION_NODES.length - 1;
    else return;
    e.preventDefault();
    select(DEFINITION_NODES[next].id, true);
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
  } else if (node.id === "outletler") {
    body = <OutletsPanel hotelId={hotelId} setStatus={setStatus} />;
  } else if (node.id === "masalar") {
    body = <TablesPanel hotelId={hotelId} setStatus={setStatus} />;
  } else {
    body = <HotelPanel hotelId={hotelId} setStatus={setStatus} />;
  }

  return (
    <div className="xp-defs">
      <nav className="xp-defs-nav" aria-label="Tanımlamalar">
        <div
          role="tree"
          aria-label="Tanımlama başlıkları"
          className="xp-tree"
          onKeyDown={onKeyDown}
        >
          {DEFINITION_NODES.map((n) => {
            const selected = n.id === node.id;
            return (
              <div
                key={n.id}
                id={itemId(n.id)}
                role="treeitem"
                aria-level={n.level}
                aria-selected={selected}
                tabIndex={selected ? 0 : -1}
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
  );
}
