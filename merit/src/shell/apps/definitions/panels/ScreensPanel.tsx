"use client";

import { useEffect, useMemo, useState } from "react";
import { roleOptionsAction, updateRoleAction } from "@/modules/core/server/admin/actions/roles";
import type { RoleOptions } from "@/modules/core/server/admin/roles";
import { saveScreenLayoutAction, screenLayoutsAction } from "@/modules/core/server/actions/screenLayouts";
import {
  type BlockDef,
  defaultLayout,
  isDefaultLayout,
  LAYOUT_SCREENS,
  type Layout,
  type LayoutBlock,
  layoutFor,
  type LayoutScreenKey,
  layoutScreenFor,
  moveBlock,
  moveItem,
  SCREEN_LAYOUT_DEFS,
  type ScreenLayouts,
  setBlockStyle,
  setBlockVisible,
  setItemVisible,
} from "@/modules/core/screenLayouts";
import { confirm } from "@/shell/confirm";
import { notify } from "@/shell/notify";
import { ROLE_KIND_LABELS } from "./RolesPanel";

type Props = { setStatus(text: string): void; setDirty?(dirty: boolean): void };
type Device = "tablet" | "telefon";

const same = (a: Layout, b: Layout) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Ekranlar: per-role editor of the landing screens. Left: the role, its opening screen and the
 * blocks of the chosen screen (show/hide, order, style, parts). Right: a canvas sketch of the result.
 */
export function ScreensPanel({ setStatus, setDirty }: Props) {
  const [options, setOptions] = useState<RoleOptions | null>(null);
  const [layouts, setLayouts] = useState<ScreenLayouts>({ roles: {} });
  const [canEdit, setCanEdit] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [roleCode, setRoleCode] = useState("");
  const [screenKey, setScreenKey] = useState<LayoutScreenKey>("kat");
  const [draft, setDraft] = useState<Layout>(() => defaultLayout("kat"));
  const [activeBlock, setActiveBlock] = useState<string | null>(null);
  const [device, setDevice] = useState<Device>("tablet");
  const [busy, setBusy] = useState(false);

  const role = options?.roles.find((r) => r.code === roleCode);
  const def = SCREEN_LAYOUT_DEFS[screenKey];
  const saved = useMemo(() => layoutFor(layouts, roleCode, screenKey), [layouts, roleCode, screenKey]);
  const dirty = !same(draft, saved);
  const landingKey = layoutScreenFor(role?.defaultScreen);
  const landingName = options?.screens.find((s) => s.code === role?.defaultScreen)?.name;

  /** Shows a role's screen, starting from what is stored for it. */
  const show = (code: string, key: LayoutScreenKey, all: ScreenLayouts = layouts) => {
    setRoleCode(code);
    setScreenKey(key);
    setDraft(layoutFor(all, code, key));
    setActiveBlock(null);
  };

  useEffect(() => {
    let live = true;
    void Promise.all([roleOptionsAction(), screenLayoutsAction()]).then(([roles, stored]) => {
      if (!live) return;
      if (!roles.ok) return setError(roles.error.message);
      if (!stored.ok) return setError(stored.error.message);
      setOptions(roles.data);
      setLayouts(stored.data.layouts);
      setCanEdit(stored.data.canEdit);
      const first = roles.data.roles.find((r) => layoutScreenFor(r.defaultScreen)) ?? roles.data.roles[0];
      if (first) {
        setRoleCode(first.code);
        const key = layoutScreenFor(first.defaultScreen) ?? "kat";
        setScreenKey(key);
        setDraft(layoutFor(stored.data.layouts, first.code, key));
      }
    });
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    setDirty?.(dirty);
    return () => setDirty?.(false);
  }, [dirty, setDirty]);

  useEffect(() => {
    if (!role) return;
    setStatus(`${role.name} · ${def.title}${dirty ? " · kaydedilmemiş değişiklik" : ""}${canEdit ? "" : " (salt okunur)"}`);
  }, [role, def.title, dirty, canEdit, setStatus]);

  /** Leaving a changed screen asks first: the draft lives only in this panel. */
  const leave = async (): Promise<boolean> =>
    !dirty ||
    (await confirm({
      title: "Kaydedilmemiş değişiklik",
      message: "Bu ekrandaki değişiklikler kaydedilmedi. Vazgeçilsin mi?",
      confirmLabel: "Vazgeç ve devam et",
    }));

  const pickRole = async (code: string) => {
    if (code === roleCode || !(await leave())) return;
    const next = options?.roles.find((r) => r.code === code);
    show(code, layoutScreenFor(next?.defaultScreen) ?? screenKey);
  };

  const pickScreen = async (key: LayoutScreenKey) => {
    if (key === screenKey || !(await leave())) return;
    show(roleCode, key);
  };

  const save = async (layout: Layout | null) => {
    setBusy(true);
    const result = await saveScreenLayoutAction({ roleCode, screen: screenKey, layout });
    setBusy(false);
    if (!result.ok) return notify.error(result.error.message, { title: "Ekran kaydedilemedi" });
    setLayouts(result.data);
    setDraft(layoutFor(result.data, roleCode, screenKey));
    notify.success(
      layout === null
        ? `“${role?.name}” için ${def.title} varsayılan düzene döndü.`
        : `“${role?.name}” için ${def.title} düzeni kaydedildi. Kullanıcılar ekranı yeniden açtığında görür.`,
    );
  };

  const reset = async () => {
    const yes = await confirm({
      title: "Varsayılana dön",
      message: `“${role?.name}” rolünün ${def.title} ekranı için yapılan düzen silinsin mi?`,
      confirmLabel: "Varsayılana dön",
    });
    if (yes) await save(null);
  };

  const setLanding = async (code: string) => {
    if (!role) return;
    setBusy(true);
    const result = await updateRoleAction({
      id: role.id,
      data: { name: role.name, kind: role.kind, maxOnlineMinutes: role.maxOnlineMinutes ?? undefined, defaultScreen: code || undefined },
    });
    setBusy(false);
    if (!result.ok) return notify.error(result.error.message, { title: "Açılış ekranı değiştirilemedi" });
    setOptions((prev) =>
      prev ? { ...prev, roles: prev.roles.map((r) => (r.id === role.id ? { ...r, defaultScreen: result.data.defaultScreen } : r)) } : prev,
    );
    notify.success(`“${role.name}” rolünün açılış ekranı güncellendi.`);
    const key = layoutScreenFor(code);
    if (key && key !== screenKey && !dirty) show(roleCode, key);
  };

  const copyFrom = (code: string) => {
    if (code) setDraft(layoutFor(layouts, code, screenKey));
  };

  if (error) {
    return (
      <p role="alert" className="xp-defs-error">
        {error}
      </p>
    );
  }
  if (!options || !role) return <p className="xp-defs-note">Ekranlar yükleniyor…</p>;

  const customised = (code: string, key: LayoutScreenKey) => Boolean(layouts.roles[code]?.[key]);
  const blockDef = (id: string) => def.blocks.find((b) => b.id === id)!;

  return (
    <div className="xp-screens">
      <aside className="xp-screens-tools" aria-label="Ekran düzenleme araçları">
        <section className="xp-screens-section">
          <h3>1 · Rol</h3>
          <select aria-label="Rol" value={roleCode} onChange={(e) => void pickRole(e.target.value)}>
            {options.roles.map((r) => (
              <option key={r.code} value={r.code}>
                {r.name} ({ROLE_KIND_LABELS[r.kind]}){LAYOUT_SCREENS.some((k) => customised(r.code, k)) ? " •" : ""}
              </option>
            ))}
          </select>
          <label className="xp-screens-field">
            <span>Açılış ekranı (girişte açılan)</span>
            <select
              value={role.defaultScreen ?? ""}
              disabled={!canEdit || busy}
              onChange={(e) => void setLanding(e.target.value)}
            >
              <option value="">Yok (ilk yetkili ekran)</option>
              {options.screens.map((s) => (
                <option key={s.code} value={s.code}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          {!landingKey && role.defaultScreen ? (
            <p className="xp-screens-hint">
              “{landingName ?? role.defaultScreen}” sabit bir operasyon ekranı: öğeleri düzenlenemez. Aşağıdan bu rolün
              kullanabildiği düzenlenebilir bir ekranı seçebilirsiniz.
            </p>
          ) : null}
        </section>

        <section className="xp-screens-section">
          <h3>2 · Düzenlenecek ekran</h3>
          <div className="xp-screens-tabs" role="tablist" aria-label="Düzenlenecek ekran">
            {LAYOUT_SCREENS.map((key) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={key === screenKey}
                className="xp-screens-tab"
                onClick={() => void pickScreen(key)}
              >
                <b>{SCREEN_LAYOUT_DEFS[key].title}</b>
                <small>
                  {SCREEN_LAYOUT_DEFS[key].path}
                  {key === landingKey ? " · açılış ekranı" : ""}
                  {customised(roleCode, key) ? " · özel düzen" : ""}
                </small>
              </button>
            ))}
          </div>
        </section>

        <section className="xp-screens-section">
          <h3>3 · Öğeler ve gösterim</h3>
          <p className="xp-screens-hint">İşaretli öğeler ekranda görünür. Oklarla sırayı değiştirin; bir öğeye tıklayıp stilini ve parçalarını seçin.</p>
          <ol className="xp-screens-blocks">
            {draft.blocks.map((block, index) => (
              <BlockRow
                key={block.id}
                block={block}
                def={blockDef(block.id)}
                open={activeBlock === block.id}
                first={index === 0}
                last={index === draft.blocks.length - 1}
                disabled={!canEdit}
                onOpen={() => setActiveBlock(activeBlock === block.id ? null : block.id)}
                onChange={setDraft}
                layout={draft}
              />
            ))}
          </ol>
          {canEdit ? (
            <label className="xp-screens-field">
              <span>Başka rolün düzenini al</span>
              <select value="" onChange={(e) => copyFrom(e.target.value)}>
                <option value="">Seçin…</option>
                {options.roles
                  .filter((r) => r.code !== roleCode && customised(r.code, screenKey))
                  .map((r) => (
                    <option key={r.code} value={r.code}>
                      {r.name}
                    </option>
                  ))}
              </select>
            </label>
          ) : null}
        </section>

        <div className="xp-screens-actions">
          <button type="button" className="xp-button" disabled={!canEdit || !dirty || busy} onClick={() => void save(draft)}>
            Kaydet
          </button>
          <button type="button" className="xp-button" disabled={!dirty || busy} onClick={() => setDraft(saved)}>
            Geri al
          </button>
          <button
            type="button"
            className="xp-button"
            disabled={!canEdit || busy || (!customised(roleCode, screenKey) && isDefaultLayout(screenKey, draft))}
            onClick={() => (customised(roleCode, screenKey) ? void reset() : setDraft(defaultLayout(screenKey)))}
          >
            Varsayılana dön
          </button>
        </div>
      </aside>

      <section className="xp-screens-stage" aria-label="Ekran önizlemesi">
        <header className="xp-screens-stage-bar">
          <span>
            <i data-dirty={dirty || undefined} /> ÖNİZLEME · {role.name} · {def.title}
          </span>
          {def.device === "tablet" ? (
            <span className="xp-screens-devices">
              {(["tablet", "telefon"] as const).map((d) => (
                <button key={d} type="button" className="xp-button" data-selected={device === d || undefined} onClick={() => setDevice(d)}>
                  {d === "tablet" ? "Tablet" : "Telefon"}
                </button>
              ))}
            </span>
          ) : null}
        </header>
        <div className="xp-screens-canvas">
          <div className="xp-screens-device" data-device={def.device === "pencere" ? "pencere" : device}>
            <div className="xp-screens-device-bar">{def.device === "pencere" ? `${def.title} · pencere` : def.title}</div>
            <div className="xp-screens-screen">
              {draft.blocks.filter((b) => b.visible).length === 0 ? <p className="xp-screens-hint">Görünen öğe yok.</p> : null}
              {draft.blocks
                .filter((b) => b.visible)
                .map((block) => (
                  <button
                    key={block.id}
                    type="button"
                    className="xp-screens-block"
                    data-active={activeBlock === block.id || undefined}
                    onClick={() => setActiveBlock(block.id)}
                    aria-label={`${blockDef(block.id).label} öğesini seç`}
                  >
                    <span className="xp-screens-block-tag">{blockDef(block.id).label}</span>
                    <Sketch def={blockDef(block.id)} block={block} />
                  </button>
                ))}
            </div>
          </div>
        </div>
        <p className="xp-screens-foot">
          Önizleme örnek sayılarla çizilen bir taslaktır; gerçek ekranda kullanıcının yetkisi olmayan kısayollar ayrıca gizlenir.
        </p>
      </section>
    </div>
  );
}

function BlockRow({
  block,
  def,
  open,
  first,
  last,
  disabled,
  onOpen,
  onChange,
  layout,
}: {
  block: LayoutBlock;
  def: BlockDef;
  open: boolean;
  first: boolean;
  last: boolean;
  disabled: boolean;
  onOpen(): void;
  onChange(next: Layout): void;
  layout: Layout;
}) {
  const itemLabel = (id: string) => def.items?.find((i) => i.id === id)?.label ?? id;
  return (
    <li className="xp-screens-row" data-open={open || undefined} data-hidden={!block.visible || undefined}>
      <div className="xp-screens-row-head">
        <input
          type="checkbox"
          aria-label={`${def.label} görünsün`}
          checked={block.visible}
          disabled={disabled || def.required}
          title={def.required ? "Bu öğe ekranın çalışması için gerekli; gizlenemez" : undefined}
          onChange={(e) => onChange(setBlockVisible(layout, block.id, e.target.checked))}
        />
        <button type="button" className="xp-screens-row-name" aria-expanded={open} onClick={onOpen}>
          <b>{def.label}</b>
          {def.required ? <em>zorunlu</em> : null}
        </button>
        <button type="button" className="xp-button" aria-label={`${def.label} yukarı`} disabled={disabled || first} onClick={() => onChange(moveBlock(layout, block.id, -1))}>
          ▲
        </button>
        <button type="button" className="xp-button" aria-label={`${def.label} aşağı`} disabled={disabled || last} onClick={() => onChange(moveBlock(layout, block.id, 1))}>
          ▼
        </button>
      </div>
      {open ? (
        <div className="xp-screens-row-body">
          <p>{def.description}</p>
          {def.styles ? (
            <fieldset>
              <legend>Gösterim stili</legend>
              {def.styles.map((style) => (
                <label key={style.id}>
                  <input
                    type="radio"
                    name={`stil-${block.id}`}
                    checked={block.style === style.id}
                    disabled={disabled}
                    onChange={() => onChange(setBlockStyle(layout, block.id, style.id))}
                  />
                  {style.label}
                </label>
              ))}
            </fieldset>
          ) : null}
          {block.items.length > 0 ? (
            <fieldset>
              <legend>Parçalar</legend>
              {block.items.map((item, index) => (
                <div key={item.id} className="xp-screens-item">
                  <label>
                    <input
                      type="checkbox"
                      checked={item.visible}
                      disabled={disabled || (item.visible && block.items.filter((i) => i.visible).length === 1)}
                      onChange={(e) => onChange(setItemVisible(layout, block.id, item.id, e.target.checked))}
                    />
                    {itemLabel(item.id)}
                  </label>
                  <button type="button" className="xp-button" aria-label={`${itemLabel(item.id)} yukarı`} disabled={disabled || index === 0} onClick={() => onChange(moveItem(layout, block.id, item.id, -1))}>
                    ▲
                  </button>
                  <button type="button" className="xp-button" aria-label={`${itemLabel(item.id)} aşağı`} disabled={disabled || index === block.items.length - 1} onClick={() => onChange(moveItem(layout, block.id, item.id, 1))}>
                    ▼
                  </button>
                </div>
              ))}
            </fieldset>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

const SAMPLE = [42, 27, 12, 3, 1, 8];

/** Canvas drawing of one block: its real labels with sample numbers, in the chosen style. */
function Sketch({ def, block }: { def: BlockDef; block: LayoutBlock }) {
  const items = block.items
    .filter((item) => item.visible)
    .map((item) => def.items!.find((d) => d.id === item.id)!);
  switch (def.sketch) {
    case "kpis":
      return (
        <div className="xp-sk-kpis" data-style={block.style ?? "kutu"}>
          {items.map((item, i) => (
            <div key={item.id} data-tone={item.tone}>
              <small>{item.label}</small>
              <b>{SAMPLE[i % SAMPLE.length]}</b>
            </div>
          ))}
        </div>
      );
    case "bar":
      return (
        <div className="xp-sk-bar">
          <small>
            {def.label} <b>%64</b>
          </small>
          <div>
            <i />
          </div>
        </div>
      );
    case "banner":
      return <div className="xp-sk-banner">⚠ Havuz stoğunda 3 ürün kritik seviyenin altında · Kritik Stokları Gör →</div>;
    case "cards": {
      const cards = items.length > 0 ? items.map((i) => i.label) : ["1. Kat", "2. Kat", "3. Kat", "4. Kat", "5. Kat", "6. Kat"];
      return (
        <div className="xp-sk-cards" data-style={block.style ?? "kart"}>
          {cards.map((label) => (
            <div key={label}>
              <b>{label}</b>
              <small>{items.length > 0 ? "Ekranı Aç →" : "18/24 dolu · 2 DND"}</small>
            </div>
          ))}
        </div>
      );
    }
    case "buttons":
      return (
        <div className="xp-sk-buttons">
          {items.map((item) => (
            <div key={item.id}>
              <b>{item.label}:</b>
              <i />
              <i />
              <i />
            </div>
          ))}
        </div>
      );
    case "chips":
      return (
        <div className="xp-sk-chips">
          {["Bekleyen sipariş 4", "MyBar 2", "Çağrı 1", "Geciken 0"].map((chip) => (
            <span key={chip}>{chip}</span>
          ))}
        </div>
      );
    case "list":
      return (
        <ul className="xp-sk-list">
          {["Merit Royal", "Merit Royal Diamond", "Merit Royal Premium"].map((row, i) => (
            <li key={row}>
              <span>{def.id === "akis" ? `12:0${i}:15 · olay` : row}</span>
              <b>{def.id === "akis" ? "" : SAMPLE[i + 2]}</b>
            </li>
          ))}
        </ul>
      );
    default:
      return <div className="xp-sk-note">Bugünün rutin işleri · 2/5 tamamlandı</div>;
  }
}
