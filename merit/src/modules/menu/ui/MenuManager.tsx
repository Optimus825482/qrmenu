"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { MenuNodeKind } from "@/generated/prisma/client";
import type { MeritEvent } from "@/lib/realtime-events";
import type { AppProps } from "@/shell/registry";
import { Icon } from "@/components/icons/Icon";
import { confirm } from "@/shell/confirm";
import { notify } from "@/shell/notify";
import { Field } from "@/shell/ui/Field";
import { FormDialog, type FormValues } from "@/shell/ui/FormDialog";
import { useSse } from "@/shell/useSse";
import { menuContextAction } from "../server/actions/menuAdmin";
import type { MenuContext } from "../server/menuContext";
import {
  auditAndSyncOutletTranslationsAction,
  createMenuNodeAction,
  autoTranslateMenuNodeAction,
  deleteMenuNodeAction,
  listMenuTreeAction,
  moveMenuNodeAction,
  setMenuAvailabilityAction,
} from "../server/actions/menuTree";
import type { MenuTreeNode } from "../server/menuTree";
import type { OutletTranslationAuditStatus } from "../server/translations";
import { NodeForm } from "./panels/NodeForm";
import { OutletSwitchBar } from "./panels/OutletSwitchBar";
import { countNodes, findNode, KIND_LABEL, TreePane } from "./panels/TreePane";

const LIVE_EVENTS = ["menu.changed", "menu.availability", "price.display", "ordering.changed", "realtime.resync"];
const RELOAD_MS = 300;

type Creating = { kind: MenuNodeKind; parent: MenuTreeNode | null } | null;

export type MenuManagerProps = AppProps & {
  lockOutletType?: "ODA_SERVISI";
};

/** Menü Yönetimi (QM-MEN): outlet menu tree on the left, node form on the right. */
export function MenuManager({ hotelId, setStatus, setDirty, openApp, close, lockOutletType }: MenuManagerProps) {
  const [context, setContext] = useState<MenuContext | null>(null);
  const [outletId, setOutletId] = useState<string | undefined>();
  const [tree, setTree] = useState<MenuTreeNode[]>([]);
  const [selectedId, setSelectedId] = useState<string | undefined>();
  const [creating, setCreating] = useState<Creating>(null);
  const [error, setError] = useState<string | null>(null);
  const [translationAudit, setTranslationAudit] = useState<OutletTranslationAuditStatus | null>(null);

  const runTranslationAudit = useCallback(async (id: string | undefined, triggerSync = true) => {
    if (!id) {
      setTranslationAudit(null);
      return;
    }
    const res = await auditAndSyncOutletTranslationsAction({ outletId: id, triggerSync });
    if (res.ok) {
      setTranslationAudit(res.data);
    }
  }, []);

  const loadContext = useCallback(async () => {
    if (!hotelId) return;
    const result = await menuContextAction({ hotelId });
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    setError(null);
    const outlets = lockOutletType
      ? result.data.outlets.filter((o) => o.type === lockOutletType)
      : result.data.outlets.filter((o) => o.type !== "ODA_SERVISI");
    setContext({
      ...result.data,
      outlets,
    });
    setOutletId((current) =>
      current && outlets.some((o) => o.id === current) ? current : outlets[0]?.id,
    );
  }, [hotelId, lockOutletType]);

  const loadTree = useCallback(async () => {
    if (!outletId) {
      setTree([]);
      setTranslationAudit(null);
      return;
    }
    const result = await listMenuTreeAction({ outletId });
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    setError(null);
    setTree(result.data);
    void runTranslationAudit(outletId, true);
  }, [outletId, runTranslationAudit]);

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
    const total = countNodes(tree);
    if (translationAudit && translationAudit.totalNodes > 0) {
      if (translationAudit.missingNodes > 0) {
        setStatus(`${total} menü kaydı · Çeviri kontrolü: ${translationAudit.missingNodes} kayıtta eksikler arka planda tamamlanıyor...`);
      } else {
        setStatus(`${total} menü kaydı · 8 dil çevirisi tam (%100)`);
      }
    } else {
      setStatus(`${total} menü kaydı`);
    }
  }, [tree, translationAudit, setStatus]);

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
        notify.info(`Kayıt yapıldı; çeviri arka planda tamamlanacak: ${translated.error.message}`);
      } else {
        notify.success(`${translated.data.languages.length} dil için otomatik çeviri oluşturuldu ve eksik çeviriler kontrol edildi.`);
      }
      await loadTree();
      void runTranslationAudit(outletId, true);
    }
    return result;
  };

  const move = async (node: MenuTreeNode, direction: -1 | 1) => {
    const siblings = node.parentId ? (findNode(tree, node.parentId)?.children ?? []) : tree;
    const index = siblings.findIndex((s) => s.id === node.id) + direction;
    const approved = await confirm({
      title: "Menü sırasını güncelle",
      message: `“${node.name}” menü kaydının sırası değiştirilsin mi?`,
      danger: true, confirmLabel: "Onayla",
    });
    if (!approved) return;
    const result = await moveMenuNodeAction({
      nodeId: node.id,
      data: { newParentId: node.parentId, index },
    });
    if (!result.ok) notify.error(result.error.message, { title: "Taşınamadı" });
    else notify.success(`“${node.name}” menü sırası güncellendi.`);
    await loadTree();
  };

  const remove = async (node: MenuTreeNode) => {
    const yes = await confirm({
      title: `${KIND_LABEL[node.kind]} sil`,
      message: `"${node.name}" silinsin mi? Altındaki kayıtlar da silinir; siparişte kullanılmışsa pasife alınır.`,
      danger: true, confirmLabel: "Sil",
    });
    if (!yes) return;
    const result = await deleteMenuNodeAction({ nodeId: node.id });
    if (!result.ok) {
      notify.error(result.error.message, { title: "Silinemedi" });
      return;
    }
    notify.success(`“${node.name}” silindi.`);
    setSelectedId(undefined);
    await loadTree();
  };

  const toggleAvailable = async (node: MenuTreeNode) => {
    const approved = await confirm({
      title: "Menü durumunu güncelle",
      message: `“${node.name}” ${node.isAvailable ? "pasife alınsın" : "yeniden aktifleştirilsin"} mi?`,
      danger: true, confirmLabel: "Onayla",
    });
    if (!approved) return;
    const result = await setMenuAvailabilityAction({ nodeId: node.id, available: !node.isAvailable });
    if (!result.ok) notify.error(result.error.message, { title: "Değiştirilemedi" });
    else notify.success(`“${node.name}” menü durumu güncellendi.`);
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
      <div className="xp-mm-top" style={{ alignItems: "center", gap: 10 }}>
        <button
          type="button"
          className="xp-button"
          onClick={() => {
            if (typeof close === "function") close();
            else if (typeof window !== "undefined" && window.history.length > 1) window.history.back();
          }}
          title="Geri dön / Pencereyi kapat"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            fontWeight: 700,
            padding: "2px 10px",
            minHeight: "var(--tap-min, 44px)",
            minWidth: "var(--tap-min, 44px)",
          }}
        >
          <span aria-hidden="true" style={{ fontSize: 13, lineHeight: 1 }}>←</span>
          <span>Geri</span>
        </button>

        <div style={{ width: 1, height: 18, backgroundColor: "#b2b2b2", margin: "0 2px" }} />

        {context?.fixedOutlet || lockOutletType ? (
          <span style={{ fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 6 }}>
            <span style={{ color: "#475569" }}>Outlet:</span>
            <strong
              style={{
                color: "var(--xp-title-text, #0055ea)",
                backgroundColor: "#ffffff",
                padding: "2px 8px",
                border: "1px solid #7f9db9",
                borderRadius: 3,
                fontSize: 12,
              }}
            >
              {outlet?.name}
            </strong>
          </span>
        ) : (
          <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontWeight: 600 }}>
            <span style={{ color: "#334155" }}>Outlet:</span>
            <div style={{ position: "relative", display: "inline-flex", alignItems: "center" }}>
              <select
                className="xp-system-select"
                value={outletId ?? ""}
                style={{
                  height: 26,
                  minWidth: 180,
                  padding: "2px 26px 2px 8px",
                  border: "1px solid #7f9db9",
                  borderRadius: 3,
                  backgroundColor: "#ffffff",
                  color: "#0f172a",
                  fontWeight: 600,
                  fontSize: 12,
                  cursor: "pointer",
                  appearance: "none",
                  WebkitAppearance: "none",
                  boxShadow: "inset 1px 1px 2px rgba(0,0,0,0.12)",
                }}
                onChange={(e) => {
                  setOutletId(e.target.value);
                  setSelectedId(undefined);
                }}
              >
                {context?.outlets.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
              <span
                style={{
                  position: "absolute",
                  right: 8,
                  pointerEvents: "none",
                  fontSize: 10,
                  color: "#475569",
                  fontWeight: 800,
                  userSelect: "none",
                }}
              >
                ▼
              </span>
            </div>
          </label>
        )}
        {outlet && context ? (
          <OutletSwitchBar outlet={outlet} canSwitch={context.canSwitch} onChanged={reload} />
        ) : null}
        {outletId && translationAudit && translationAudit.totalNodes > 0 ? (
          <span
            title={
              translationAudit.missingNodes > 0
                ? `${translationAudit.missingNodes} kayıtta eksik çeviriler arka planda otomatik tamamlanıyor`
                : `Tüm ${translationAudit.totalNodes} menü kaydının 8 dilde çevirisi eksiksiz tamamlandı`
            }
            style={{
              marginLeft: "auto",
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              padding: "2px 8px",
              borderRadius: 999,
              fontSize: 11,
              fontWeight: 600,
              border: translationAudit.missingNodes > 0 ? "1px solid #f59e0b" : "1px solid #16a34a",
              backgroundColor: translationAudit.missingNodes > 0 ? "#fffbeb" : "#f0fdf4",
              color: translationAudit.missingNodes > 0 ? "#b45309" : "#15803d",
            }}
          >
            <Icon name={translationAudit.missingNodes > 0 ? "refresh" : "check"} size={12} />
            <span>
              {translationAudit.missingNodes > 0
                ? `Otomatik Çeviri: ${translationAudit.completeNodes}/${translationAudit.totalNodes} (${translationAudit.missingNodes} tamamlanıyor)`
                : `7 Dil Çevirisi Tamam (${translationAudit.completeNodes}/${translationAudit.totalNodes})`}
            </span>
          </span>
        ) : null}
        <button
          type="button"
          className="xp-button"
          disabled={!outletId}
          style={{ height: 26, marginLeft: translationAudit && translationAudit.totalNodes > 0 ? 0 : "auto" }}
          // Room service has its own studio: the outlet studio never lists the room service outlet.
          onClick={() => openApp(lockOutletType ? "rs.tema" : "menu.tema", { hotelId, outletId })}
        >
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
        <div className="xp-mm-side" data-guide="urun-formu">
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
          <Field name="price" label={`Fiyat (${outlet?.currency ?? "EUR"})`}>
            <input type="text" inputMode="decimal" />
          </Field>
        ) : null}
      </FormDialog>
    </div>
  );
}
