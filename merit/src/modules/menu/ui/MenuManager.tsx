"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { MenuNodeKind } from "@/generated/prisma/client";
import type { MeritEvent } from "@/lib/realtime-events";
import type { AppProps } from "@/shell/registry";
import { alertDialog, confirm } from "@/shell/confirm";
import { Field } from "@/shell/ui/Field";
import { FormDialog, type FormValues } from "@/shell/ui/FormDialog";
import { useSse } from "@/shell/useSse";
import { menuContextAction } from "../server/actions/menuAdmin";
import type { MenuContext } from "../server/menuContext";
import {
  createMenuNodeAction,
  autoTranslateMenuNodeAction,
  deleteMenuNodeAction,
  listMenuTreeAction,
  moveMenuNodeAction,
  setMenuAvailabilityAction,
} from "../server/actions/menuTree";
import type { MenuTreeNode } from "../server/menuTree";
import { NodeForm } from "./panels/NodeForm";
import { OutletSwitchBar } from "./panels/OutletSwitchBar";
import { countNodes, findNode, KIND_LABEL, TreePane } from "./panels/TreePane";

const LIVE_EVENTS = ["menu.changed", "menu.availability", "price.display", "ordering.changed", "realtime.resync"];
const RELOAD_MS = 300;

type Creating = { kind: MenuNodeKind; parent: MenuTreeNode | null } | null;

/** Menü Yönetimi (QM-MEN): outlet menu tree on the left, node form on the right. */
export function MenuManager({ hotelId, setStatus, setDirty, openApp }: AppProps) {
  const [context, setContext] = useState<MenuContext | null>(null);
  const [outletId, setOutletId] = useState<string | undefined>();
  const [tree, setTree] = useState<MenuTreeNode[]>([]);
  const [selectedId, setSelectedId] = useState<string | undefined>();
  const [creating, setCreating] = useState<Creating>(null);
  const [error, setError] = useState<string | null>(null);

  const loadContext = useCallback(async () => {
    if (!hotelId) return;
    const result = await menuContextAction({ hotelId });
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    setError(null);
    setContext(result.data);
    setOutletId((current) =>
      current && result.data.outlets.some((o) => o.id === current) ? current : result.data.outlets[0]?.id,
    );
  }, [hotelId]);

  const loadTree = useCallback(async () => {
    if (!outletId) {
      setTree([]);
      return;
    }
    const result = await listMenuTreeAction({ outletId });
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    setError(null);
    setTree(result.data);
  }, [outletId]);

  const reload = useCallback(() => {
    void loadContext();
    void loadTree();
  }, [loadContext, loadTree]);

  // Deferred one tick: the loaders set state once their request returns.
  useEffect(() => {
    const t = setTimeout(() => void loadContext(), 0);
    return () => clearTimeout(t);
  }, [loadContext]);
  useEffect(() => {
    const t = setTimeout(() => void loadTree(), 0);
    return () => clearTimeout(t);
  }, [loadTree]);

  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useSse((e: MeritEvent) => {
    if (e.type !== "realtime.resync" && e.outletId !== outletId) return;
    clearTimeout(timer.current);
    timer.current = setTimeout(reload, RELOAD_MS);
  }, LIVE_EVENTS);
  useEffect(() => () => clearTimeout(timer.current), []);

  useEffect(() => {
    setStatus(`${countNodes(tree)} menü kaydı`);
  }, [tree, setStatus]);

  const canEdit = context?.canEdit ?? false;
  const outlet = context?.outlets.find((o) => o.id === outletId);
  const selected = findNode(tree, selectedId);

  const create = async (values: FormValues) => {
    if (!outletId || !creating) return { ok: false as const, error: { code: "VALIDATION" as const, message: "Outlet seçin" } };
    const data: Record<string, unknown> = {
      kind: creating.kind,
      name: values.name ?? "",
      parentId: creating.parent?.id ?? null,
    };
    if (creating.kind === "OGE") {
      const raw = (values.price ?? "").trim().replace(",", ".");
      data.price = raw === "" ? null : Number(raw);
    }
    const result = await createMenuNodeAction({ outletId, data });
    if (result.ok) {
      setSelectedId(result.data.id);
      const translated = await autoTranslateMenuNodeAction({ nodeId: result.data.id });
      if (!translated.ok) {
        void alertDialog({ title: "Kayıt yapıldı; çeviri oluşturulamadı", message: translated.error.message });
      } else {
        void alertDialog({ title: "Kayıt ve çeviriler tamamlandı", message: `${translated.data.languages.length} dil için DeepL çevirisi oluşturuldu. Menü terimlerini kullanmadan önce gözden geçirin.` });
      }
      await loadTree();
    }
    return result;
  };

  const move = async (node: MenuTreeNode, direction: -1 | 1) => {
    const siblings = node.parentId ? (findNode(tree, node.parentId)?.children ?? []) : tree;
    const index = siblings.findIndex((s) => s.id === node.id) + direction;
    const approved = await confirm({
      title: "Menü sırasını güncelle",
      message: `“${node.name}” menü kaydının sırası değiştirilsin mi?`,
      danger: true,
    });
    if (!approved) return;
    const result = await moveMenuNodeAction({
      nodeId: node.id,
      data: { newParentId: node.parentId, index },
    });
    if (!result.ok) void alertDialog({ title: "Taşınamadı", message: result.error.message });
    else await alertDialog({ title: "İşlem tamamlandı", message: `“${node.name}” menü sırası güncellendi.` });
    await loadTree();
  };

  const remove = async (node: MenuTreeNode) => {
    const yes = await confirm({
      title: `${KIND_LABEL[node.kind]} sil`,
      message: `"${node.name}" silinsin mi? Altındaki kayıtlar da silinir; siparişte kullanılmışsa pasife alınır.`,
      danger: true,
    });
    if (!yes) return;
    const result = await deleteMenuNodeAction({ nodeId: node.id });
    if (!result.ok) {
      void alertDialog({ title: "Silinemedi", message: result.error.message });
      return;
    }
    await alertDialog({ title: "Kayıt silindi", message: `“${node.name}” silindi.` });
    setSelectedId(undefined);
    await loadTree();
  };

  const toggleAvailable = async (node: MenuTreeNode) => {
    const approved = await confirm({
      title: "Menü durumunu güncelle",
      message: `“${node.name}” ${node.isAvailable ? "pasife alınsın" : "yeniden aktifleştirilsin"} mi?`,
      danger: true,
    });
    if (!approved) return;
    const result = await setMenuAvailabilityAction({ nodeId: node.id, available: !node.isAvailable });
    if (!result.ok) void alertDialog({ title: "Değiştirilemedi", message: result.error.message });
    else await alertDialog({ title: "İşlem tamamlandı", message: `“${node.name}” menü durumu güncellendi.` });
    await loadTree();
  };

  if (!hotelId) return <p className="xp-defs-note">Bir otel seçilmedi.</p>;
  if (error && !context) {
    return (
      <p role="alert" className="xp-defs-error">
        {error}
      </p>
    );
  }
  if (context && context.outlets.length === 0) {
    return <p className="xp-defs-note">Bu otelde menüsü olan bir outlet yok.</p>;
  }

  return (
    <div className="xp-mm">
      <div className="xp-mm-top">
        <span className="xp-mm-hotel"><strong>Otel:</strong> {context?.hotelName ?? "Yükleniyor…"}</span>
        {context?.fixedOutlet ? (
          <strong>{outlet?.name}</strong>
        ) : (
          <label className="xp-module-switch">
            Outlet
            <select value={outletId ?? ""} onChange={(e) => {
                setOutletId(e.target.value);
                setSelectedId(undefined);
              }}>
              {context?.outlets.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </label>
        )}
        {outlet && context ? (
          <OutletSwitchBar outlet={outlet} canSwitch={context.canSwitch} onChanged={reload} />
        ) : null}
        <button type="button" className="xp-button" disabled={!outletId} onClick={() => openApp("menu.tema", { hotelId, outletId })}>
          Menü Tasarımı
        </button>
      </div>
      {error ? (
        <p role="alert" className="xp-defs-error">
          {error}
        </p>
      ) : null}
      <div className="xp-mm-body">
        <TreePane
          nodes={tree}
          selectedId={selectedId}
          canEdit={canEdit}
          onSelect={(node) => setSelectedId(node.id)}
          onNew={(kind, parent) => setCreating({ kind, parent })}
          onMove={(node, direction) => void move(node, direction)}
          onDelete={(node) => void remove(node)}
          onToggleAvailable={(node) => void toggleAvailable(node)}
        />
        <div className="xp-mm-side">
          {selected ? (
            <NodeForm
              key={selected.id}
              node={selected}
              canEdit={canEdit}
              setDirty={setDirty}
              onChanged={() => void loadTree()}
            />
          ) : (
            <p className="xp-defs-note">Ağaçtan bir kayıt seçin.</p>
          )}
        </div>
      </div>
      <FormDialog
        title={creating ? `Yeni ${KIND_LABEL[creating.kind]}` : "Yeni kayıt"}
        open={creating !== null}
        onClose={() => setCreating(null)}
        onSubmit={create}
        submitText="Oluştur"
      >
        <Field name="name" label="Ad">
          <input type="text" maxLength={120} />
        </Field>
        {creating?.kind === "OGE" ? (
          <Field name="price" label="Fiyat">
            <input type="text" inputMode="decimal" />
          </Field>
        ) : null}
      </FormDialog>
    </div>
  );
}
