"use client";

import { useEffect, useState } from "react";
import type { MenuNodeKind } from "@/generated/prisma/client";
import type { MenuTreeNode } from "../../server/menuTree";

export const KIND_LABEL: Record<MenuNodeKind, string> = {
  KATEGORI: "Kategori",
  ALT_KATEGORI: "Alt Kategori",
  GRUP: "Grup",
  OGE: "Öğe",
};
export const CHILD_KIND: Record<MenuNodeKind, MenuNodeKind | null> = {
  KATEGORI: "ALT_KATEGORI",
  ALT_KATEGORI: "GRUP",
  GRUP: "OGE",
  OGE: null,
};

type Flat = { node: MenuTreeNode; depth: number; siblings: MenuTreeNode[] };

function flatten(nodes: MenuTreeNode[], depth = 0, out: Flat[] = []): Flat[] {
  for (const node of nodes) {
    out.push({ node, depth, siblings: nodes });
    flatten(node.children, depth + 1, out);
  }
  return out;
}

export function findNode(nodes: MenuTreeNode[], id: string | undefined): MenuTreeNode | undefined {
  return flatten(nodes).find((f) => f.node.id === id)?.node;
}

export function countNodes(nodes: MenuTreeNode[]): number {
  return flatten(nodes).length;
}

type Props = {
  nodes: MenuTreeNode[];
  selectedId?: string;
  canEdit: boolean;
  onSelect(node: MenuTreeNode): void;
  onNew(kind: MenuNodeKind, parent: MenuTreeNode | null): void;
  onMove(node: MenuTreeNode, direction: -1 | 1): void;
  onDelete(node: MenuTreeNode): void;
  onToggleAvailable(node: MenuTreeNode): void;
};

const KINDS: MenuNodeKind[] = ["KATEGORI", "ALT_KATEGORI", "GRUP", "OGE"];

/** Menu tree (Kategori > Alt Kategori > Grup > Öğe) with up / down move buttons and a context menu. */
export function TreePane({
  nodes,
  selectedId,
  canEdit,
  onSelect,
  onNew,
  onMove,
  onDelete,
  onToggleAvailable,
}: Props) {
  const flat = flatten(nodes);
  const selected = flat.find((f) => f.node.id === selectedId);
  const [menu, setMenu] = useState<{ x: number; y: number; node: MenuTreeNode } | null>(null);

  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("click", close);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [menu]);

  const childKind = selected ? CHILD_KIND[selected.node.kind] : null;
  const index = selected ? selected.siblings.indexOf(selected.node) : -1;
  const canCreate = (kind: MenuNodeKind) => kind === "KATEGORI" || childKind === kind;

  return (
    <div className="xp-mm-tree">
      {canEdit ? (
        <div role="toolbar" aria-label="Menü araçları" className="xp-grid-toolbar xp-mm-tools">
          {KINDS.map((kind) => (
            <button
              key={kind}
              type="button"
              className="xp-button"
              disabled={!canCreate(kind)}
              onClick={() => onNew(kind, kind === "KATEGORI" ? null : (selected?.node ?? null))}
            >
              {`Yeni ${KIND_LABEL[kind]}`}
            </button>
          ))}
          <button
            type="button"
            className="xp-button"
            aria-label="Yukarı taşı"
            disabled={!selected || index <= 0}
            onClick={() => selected && onMove(selected.node, -1)}
          >
            ↑
          </button>
          <button
            type="button"
            className="xp-button"
            aria-label="Aşağı taşı"
            disabled={!selected || index < 0 || index >= selected.siblings.length - 1}
            onClick={() => selected && onMove(selected.node, 1)}
          >
            ↓
          </button>
          <button
            type="button"
            className="xp-button"
            disabled={!selected}
            onClick={() => selected && onDelete(selected.node)}
          >
            Sil
          </button>
        </div>
      ) : null}
      <ul role="tree" aria-label="Menü ağacı" className="xp-mm-list">
        {flat.length === 0 ? <li className="xp-defs-note">Bu outletin menüsü boş</li> : null}
        {flat.map(({ node, depth }) => (
          <li
            key={node.id}
            role="treeitem"
            aria-selected={node.id === selectedId}
            aria-level={depth + 1}
            className="xp-mm-row"
            data-selected={node.id === selectedId || undefined}
            style={{ paddingLeft: 6 + depth * 16 }}
            tabIndex={node.id === selectedId ? 0 : -1}
            onClick={() => onSelect(node)}
            onContextMenu={(e) => {
              if (!canEdit) return;
              e.preventDefault();
              onSelect(node);
              setMenu({ x: e.clientX, y: e.clientY, node });
            }}
          >
            <span className="xp-mm-kind">{KIND_LABEL[node.kind]}</span>
            <span className="xp-mm-name">{node.name}</span>
            {node.kind === "OGE" && node.price !== null ? (
              <span className="xp-mm-price">{node.price}</span>
            ) : null}
            {!node.isAvailable ? <span className="xp-badge">tükendi</span> : null}
            {!node.isActive ? <span className="xp-badge">pasif</span> : null}
            {node.kind === "OGE" && !node.hasImage ? (
              <span className="xp-badge xp-mm-noimage">fotoğrafsız</span>
            ) : null}
          </li>
        ))}
      </ul>
      {menu ? (
        <div role="menu" aria-label="Menü öğesi" className="xp-mm-context" style={{ left: menu.x, top: menu.y }}>
          {CHILD_KIND[menu.node.kind] ? (
            <button
              type="button"
              role="menuitem"
              onClick={() => onNew(CHILD_KIND[menu.node.kind] as MenuNodeKind, menu.node)}
            >
              Yeni alt öğe
            </button>
          ) : null}
          <button type="button" role="menuitem" onClick={() => onToggleAvailable(menu.node)}>
            {menu.node.isAvailable ? "Tükendi yap" : "Mevcut yap"}
          </button>
          <button type="button" role="menuitem" onClick={() => onDelete(menu.node)}>
            Sil
          </button>
        </div>
      ) : null}
    </div>
  );
}
