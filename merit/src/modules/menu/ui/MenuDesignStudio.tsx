"use client";

import { NextIntlClientProvider } from "next-intl";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import tr from "@/lib/i18n/messages/tr.json";
import en from "@/lib/i18n/messages/en.json";
import de from "@/lib/i18n/messages/de.json";
import ru from "@/lib/i18n/messages/ru.json";
import ar from "@/lib/i18n/messages/ar.json";
import fr from "@/lib/i18n/messages/fr.json";
import el from "@/lib/i18n/messages/el.json";
import it from "@/lib/i18n/messages/it.json";
import type { Locale } from "@/lib/i18n/locales";
import { useSse } from "@/shell/useSse";
import {
  AMBIENCES,
  CONCEPTS,
  CALL_WAITER_POSITIONS,
  CARD_STYLES,
  CATEGORY_TAB_STYLES,
  DENSITIES,
  DESIGN_BLOCKS,
  DESIGN_TEMPLATES,
  DEFAULT_OUTLET_DESIGN,
  HERO_STYLES,
  HERO_FONT_FAMILIES,
  TYPOGRAPHIES,
  templatePreset,
  type CallWaiterPosition,
  type CategoryTabStyle,
  type DesignBlockId,
  type DesignOptions,
  type HeroAlign,
  type HeroFontSize,
  type HeroFontFamily,
  type OutletDesign,
  type TemplateId,
} from "../design";
import { blockingFindings, evaluateQuality, type QualityItem } from "../quality";
import type { GuestCallOption } from "../callOptions";
import { listMenuTreeAction } from "../server/actions/menuTree";
import { saveOutletMenuDesignAction } from "../server/actions/themes";
import type { MenuTreeNode } from "../server/menuTree";
import type { AssignTarget, ThemeRow } from "../server/themes";
import { CallOptionsPanel } from "./CallOptionsPanel";
import { DesignPreviewFrame } from "./DesignPreviewFrame";
import { QualityPanel } from "./QualityPanel";
import { DEVICE_BOX, STUDIO_DEVICES, StudioDevice, type StudioDeviceId } from "./StudioDevice";
import { previewMenu } from "./previewMenu";
import { CallWaiterButton } from "./guest/CallWaiterButton";
import { GuestFrame } from "./guest/GuestFrame";
import { MenuView } from "./guest/MenuView";
import { Icon } from "@/components/icons/Icon";

export interface StudioContext {
  activeOutletId: string;
  activeOutletName: string;
  selectOutlet(id: string): void;
  activeHotelId: string;
  selectHotel(id: string): void;
  previewThemeId: string;
  selectTheme(id: string): void;
  clearThemeOverride(): void;
  themeOverride: string | null;
}

type Props = {
  hotelId?: string;
  initialOutletId?: string;
  rows: ThemeRow[];
  targets: AssignTarget[];
  onSaved(): void;
  /** Renk kütüphanesi ve outlet ataması. Önizlemenin yüksekliğini paylaşmaz. */
  library?: ReactNode | ((studio: StudioContext) => ReactNode);
};

const PREVIEW_MESSAGES: Record<Locale, Record<string, unknown>> = {
  tr,
  en,
  de,
  ru,
  ar,
  fr,
  el,
  it,
};

const FALLBACK_THEME: ThemeRow = {
  id: "",
  name: "Royal Gold",
  bg: "#0f0d0a",
  accent: "#c9a24a",
  soft: "#1d1a14",
  textOnAccent: "#0f0d0a",
  isDefault: true,
  outletCount: 0,
};

function reorder(items: DesignBlockId[], from: DesignBlockId, to: DesignBlockId): DesignBlockId[] {
  const result = [...items];
  const source = result.indexOf(from);
  const target = result.indexOf(to);
  if (source < 0 || target < 0 || source === target) return items;
  result.splice(source, 1);
  result.splice(target, 0, from);
  // Kategori gezintisi (sekmeler, arama) daima menü içeriklerinin (ürünlerin) üzerinde kalmalıdır
  if (result.indexOf("categories") > result.indexOf("items")) {
    return ["hero", "categories", "items"];
  }
  return result;
}

/** Every active dish of the (nested) menu tree, as the quality checks need to see it. */
function qualityItems(nodes: MenuTreeNode[], parentActive = true, path: string[] = []): QualityItem[] {
  return nodes.flatMap((node) => {
    const active = parentActive && node.isActive;
    if (!active) return [];
    if (node.kind === "OGE") {
      return [
        {
          id: node.id,
          name: node.name,
          categoryPath: path.join(" › "),
          detail: node.detail,
          imageUrl: node.imageUrl,
          allergens: node.allergens,
          tags: node.tags,
          translationLangs: node.translations.map((item) => item.lang),
        },
      ];
    }
    return qualityItems(node.children, active, [...path, node.name]);
  });
}

/** Distinct dish photos of the outlet, for the photo-hero picker. */
function photoChoices(nodes: MenuTreeNode[]): { url: string; name: string }[] {
  const seen = new Map<string, string>();
  const walk = (list: MenuTreeNode[]) => {
    for (const node of list) {
      if (!node.isActive) continue;
      if (node.kind === "OGE" && node.imageUrl && !seen.has(node.imageUrl)) seen.set(node.imageUrl, node.name);
      walk(node.children);
    }
  };
  walk(nodes);
  return [...seen].map(([url, name]) => ({ url, name }));
}

export function MenuDesignStudio({ hotelId, initialOutletId, rows, targets, onSaved, library }: Props) {
  const availableHotels = useMemo(
    () => targets.filter((target) => !hotelId || target.hotelId === hotelId),
    [hotelId, targets],
  );
  const [selectedHotelId, setSelectedHotelId] = useState(hotelId ?? availableHotels[0]?.hotelId ?? "");
  const selectedHotel = availableHotels.find((target) => target.hotelId === selectedHotelId) ?? availableHotels[0];
  const availableTargets = useMemo(
    () => selectedHotel?.outlets.map((outlet) => ({ ...outlet, hotelId: selectedHotel.hotelId, hotelName: selectedHotel.hotelName })) ?? [],
    [selectedHotel],
  );
  const [outletId, setOutletId] = useState(initialOutletId ?? "");
  const [draft, setDraft] = useState<{ outletId: string; design: OutletDesign; themeId: string } | null>(null);
  const [nodes, setNodes] = useState<MenuTreeNode[]>([]);
  const [dragging, setDragging] = useState<DesignBlockId | null>(null);
  const [device, setDevice] = useState<StudioDeviceId>("iphone-promax");
  const [rail, setRail] = useState<"tasarim" | "renk" | "cagri">("tasarim");
  const [callOptions, setCallOptions] = useState<GuestCallOption[]>([]);
  const canvasRef = useRef<HTMLDivElement>(null);
  const [fitZoom, setFitZoom] = useState(0.8);
  const [zoomLock, setZoomLock] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [themeOverride, setThemeOverride] = useState<string | null>(null);
  const [previewLocale, setPreviewLocale] = useState<Locale>("tr");
  const [allTemplatesView, setAllTemplatesView] = useState(false);

  const outlet = availableTargets.find((item) => item.id === outletId) ?? availableTargets[0];
  const activeOutletId = outlet?.id ?? "";
  const design = draft?.outletId === activeOutletId ? draft.design : (outlet?.design ?? DEFAULT_OUTLET_DESIGN);
  const themeId =
    themeOverride ??
    (draft?.outletId === activeOutletId
      ? draft.themeId
      : (outlet?.themeId ?? rows.find((row) => row.isDefault)?.id ?? rows[0]?.id ?? ""));
  const selectedTheme = rows.find((item) => item.id === themeId) ?? rows.find((row) => row.isDefault) ?? rows[0] ?? FALLBACK_THEME;
  const zoom = zoomLock ?? fitZoom;
  const ambienceLabel = AMBIENCES.find((item) => item.id === design.ambience)?.label ?? "Ambiyans";
  const ambienceTemplates = useMemo(
    () => DESIGN_TEMPLATES.filter((template) => template.ambience === design.ambience),
    [design.ambience],
  );
  const templatesToShow = allTemplatesView ? DESIGN_TEMPLATES : ambienceTemplates;

  const studioContext: StudioContext = useMemo(
    () => ({
      activeOutletId,
      activeOutletName: outlet?.name ?? "",
      selectOutlet: (id: string) => {
        setOutletId(id);
        setThemeOverride(null);
        setNotice(null);
      },
      activeHotelId: selectedHotelId,
      selectHotel: (id: string) => {
        setSelectedHotelId(id);
        const nextHotel = availableHotels.find((item) => item.hotelId === id);
        const firstOutlet = nextHotel?.outlets[0]?.id ?? "";
        setOutletId(firstOutlet);
        setThemeOverride(null);
        setNotice(null);
      },
      previewThemeId: themeId,
      selectTheme: (id: string) => {
        setThemeOverride(id);
      },
      clearThemeOverride: () => {
        setThemeOverride(null);
      },
      themeOverride,
    }),
    [activeOutletId, outlet?.name, selectedHotelId, availableHotels, themeId, themeOverride],
  );

  useEffect(() => {
    const node = canvasRef.current;
    if (!node) return;
    const measure = () => {
      const box = DEVICE_BOX[device];
      const width = node.clientWidth - 40;
      const height = node.clientHeight - 56;
      if (width <= 0 || height <= 0) return;
      const next = Math.min(width / box.w, height / box.h);
      setFitZoom(Math.max(0.3, Math.min(1.15, Math.round(next * 100) / 100)));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [device]);

  useEffect(() => {
    if (!activeOutletId) return;
    let cancelled = false;
    void listMenuTreeAction({ outletId: activeOutletId }).then((result) => {
      if (!cancelled) setNodes(result.ok ? result.data : []);
    });
    return () => {
      cancelled = true;
    };
  }, [activeOutletId]);

  useSse((event) => {
    if (event.type === "realtime.resync" || (event.type === "menu.changed" && event.outletId === activeOutletId)) {
      if (activeOutletId) void listMenuTreeAction({ outletId: activeOutletId }).then((result) => setNodes(result.ok ? result.data : []));
    }
  }, ["menu.changed", "realtime.resync"]);

  const commit = (next: OutletDesign, nextThemeId = themeId) => {
    setDraft({ outletId: activeOutletId, design: next, themeId: nextThemeId });
    setNotice(null);
  };
  const patchOptions = (partial: Partial<DesignOptions>) => commit({ ...design, options: { ...design.options, ...partial } });

  // The React Compiler memoizes this; a manual useMemo over `outlet?.…` could not be preserved.
  const preview = previewMenu({
    nodes,
    design,
    theme: selectedTheme,
    hotelName: outlet?.hotelName ?? "Merit Royal",
    outletName: outlet?.name ?? "Menü",
    callOptions,
    locale: previewLocale,
  });

  const findings = evaluateQuality({ design, theme: selectedTheme, items: qualityItems(nodes) });
  const blocked = blockingFindings(design, selectedTheme);
  const photos = photoChoices(nodes);

  const publish = async () => {
    if (!outlet || !themeId || blocked.length > 0) return;
    setBusy(true);
    setNotice(null);
    const result = await saveOutletMenuDesignAction({ outletId: activeOutletId, themeId, design });
    setBusy(false);
    if (!result.ok) {
      setNotice(result.error.message);
      return;
    }
    setNotice("Tasarım kaydedildi ve outletin canlı menüsüne yayınlandı.");
    onSaved();
  };

  return (
    <section className="xp-menu-studio" data-rail={rail} aria-label="Menü tasarım merkezi">
      <header className="xp-menu-studio-head">
        <div>
          <span className="xp-design-eyebrow">MENU EXPERIENCE STUDIO</span>
          <h2>Menü tasarım merkezi</h2>
        </div>
        <div className="xp-design-rail" role="tablist" aria-label="Stüdyo bölümleri">
          <button type="button" role="tab" aria-selected={rail === "tasarim"} data-selected={rail === "tasarim" || undefined} onClick={() => setRail("tasarim")}>Tasarım</button>
          <button type="button" role="tab" aria-selected={rail === "renk"} data-selected={rail === "renk" || undefined} onClick={() => setRail("renk")}>Renkler</button>
          <button type="button" role="tab" aria-selected={rail === "cagri"} data-selected={rail === "cagri" || undefined} onClick={() => setRail("cagri")}>Garson çağrısı</button>
        </div>
        <button
          type="button"
          className="xp-button xp-design-publish"
          disabled={!outlet || !themeId || busy || blocked.length > 0}
          aria-describedby={blocked.length > 0 ? "xp-design-publish-blocked" : undefined}
          onClick={() => void publish()}
        >
          {busy ? "Yayınlanıyor…" : "Yayına al"}
        </button>
        {blocked.length > 0 ? (
          <span id="xp-design-publish-blocked" className="xp-design-publish-blocked">
            Yayın engellendi: {blocked[0].message}
          </span>
        ) : null}
      </header>
      <div className="xp-design-workspace">
        <aside className="xp-design-tools">
          <div className="xp-design-library">{typeof library === "function" ? library(studioContext) : library}</div>
          <div className="xp-design-controls">
            <label>
              <span>Otel</span>
              <select
                aria-label="Otel"
                value={selectedHotel?.hotelId ?? ""}
                onChange={(event) => {
                  setSelectedHotelId(event.target.value);
                  setOutletId(availableHotels.find((item) => item.hotelId === event.target.value)?.outlets[0]?.id ?? "");
                  setThemeOverride(null);
                  setNotice(null);
                }}
              >
                <option value="">Otel seçin</option>
                {availableHotels.map((item) => (
                  <option key={item.hotelId} value={item.hotelId}>{item.hotelName}</option>
                ))}
              </select>
            </label>
            <label>
              <span>Outlet</span>
              <select
                aria-label="Outlet"
                value={activeOutletId}
                disabled={!selectedHotel}
                onChange={(event) => {
                  setOutletId(event.target.value);
                  setThemeOverride(null);
                  setNotice(null);
                }}
              >
                <option value="">Outlet seçin</option>
                {availableTargets.map((item) => (
                  <option key={item.id} value={item.id}>{item.name}</option>
                ))}
              </select>
            </label>
            <label>
              <span>Ambiyans</span>
              <select
                aria-label="Ambiyans"
                value={design.ambience}
                onChange={(event) => {
                  const ambience = event.target.value as OutletDesign["ambience"];
                  const template = DESIGN_TEMPLATES.find((item) => item.ambience === ambience) ?? DESIGN_TEMPLATES[0];
                  if (template) commit(templatePreset(template.id as TemplateId));
                }}
              >
                {AMBIENCES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
              </select>
            </label>
            <label>
              <span>Konsept</span>
              <select
                aria-label="Konsept"
                value={design.concept}
                onChange={(event) => {
                  const concept = event.target.value as OutletDesign["concept"];
                  const template =
                    DESIGN_TEMPLATES.find((item) => item.ambience === design.ambience && item.concept === concept) ??
                    DESIGN_TEMPLATES.find((item) => item.concept === concept) ??
                    DESIGN_TEMPLATES[0];
                  if (template) commit(templatePreset(template.id as TemplateId));
                }}
              >
                {CONCEPTS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
              </select>
            </label>
            <label>
              <span>Renk teması</span>
              <select
                aria-label="Renk teması"
                value={themeId}
                disabled={rows.length === 0}
                onChange={(event) => {
                  setThemeOverride(null);
                  commit(design, event.target.value);
                }}
              >
                {rows.map((item) => (
                  <option key={item.id} value={item.id}>{item.name}</option>
                ))}
              </select>
            </label>
          </div>

          <div className="xp-design-calls" hidden={rail !== "cagri"}>
            <div className="xp-call-button-config">
              <label className="xp-design-field">
                <strong>Garson Çağır Buton Metni</strong>
                <input
                  type="text"
                  maxLength={35}
                  value={design.options.callWaiterText ?? ""}
                  placeholder="Varsayılan: Garson çağır"
                  onChange={(e) => patchOptions({ callWaiterText: e.target.value })}
                />
              </label>
              <small>Boş bırakıldığında misafirin diline göre otomatik gösterilir (TR: Garson çağır, EN: Call waiter vb.).</small>
            </div>
            <div className="xp-call-button-config" style={{ marginTop: 10 }}>
              <label className="xp-design-field">
                <strong>Buton Konumu</strong>
                <select
                  value={design.options.callWaiterPosition ?? "STICKY_FOOTER"}
                  onChange={(e) => patchOptions({ callWaiterPosition: e.target.value as CallWaiterPosition })}
                >
                  {CALL_WAITER_POSITIONS.map((pos) => (
                    <option key={pos.id} value={pos.id}>
                      {pos.label}
                    </option>
                  ))}
                </select>
              </label>
              <small>Butonun misafir ekranındaki yerleşimi: alt sabit bar, üst başlık veya hero/başlık altı.</small>
            </div>
            <CallOptionsPanel
              outletId={activeOutletId}
              onChanged={(options) => setCallOptions(options.filter((option) => option.isActive))}
            />
          </div>

          <div className="xp-design-template-list">
            <div className="xp-design-side-title" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <strong>{allTemplatesView ? "Tüm Şablonlar" : `${ambienceLabel} Şablonları`}</strong>
              <div style={{ display: "inline-flex", gap: 3 }}>
                <button
                  type="button"
                  className="xp-btn"
                  style={{
                    padding: "2px 6px",
                    fontSize: 10,
                    fontWeight: !allTemplatesView ? 700 : 400,
                    backgroundColor: !allTemplatesView ? "#d9e2ec" : undefined,
                  }}
                  onClick={() => setAllTemplatesView(false)}
                >
                  Bu Ambiyans ({ambienceTemplates.length})
                </button>
                <button
                  type="button"
                  className="xp-btn"
                  style={{
                    padding: "2px 6px",
                    fontSize: 10,
                    fontWeight: allTemplatesView ? 700 : 400,
                    backgroundColor: allTemplatesView ? "#d9e2ec" : undefined,
                  }}
                  onClick={() => setAllTemplatesView(true)}
                >
                  Tümü ({DESIGN_TEMPLATES.length})
                </button>
              </div>
            </div>
            <p>
              {allTemplatesView
                ? "Dünya çapındaki 44 lüks şablon arasından dilediğinizi seçin."
                : `${ambienceLabel} için hazır en az 3 farklı yerleşim ve ambiyans şablonu.`}
            </p>
            <div className="xp-design-ambience">
                {templatesToShow.map((template) => {
                  const isSelected = design.template === template.id;
                  return (
                    <button
                      key={template.id}
                      type="button"
                      className="xp-design-template"
                      data-selected={isSelected || undefined}
                      onClick={() => commit(templatePreset(template.id as TemplateId))}
                    >
                      <div className="xp-design-template-art-wrap">
                        <span className={`xp-design-template-art is-${template.style}`}><i /><i /><i /></span>
                        {isSelected ? <span className="xp-design-selected-pill"><Icon name="check" size={16} /> SEÇİLİ</span> : null}
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                        <strong>{template.name}</strong>
                        <span style={{ fontSize: 9, opacity: 0.75, fontWeight: 500 }}>
                          {CONCEPTS.find((c) => c.id === template.concept)?.label}
                        </span>
                      </div>
                      <small>{CARD_STYLES.find((item) => item.id === template.options.cardStyle)?.label} · {template.options.showImages ? "fotoğraflı" : "yazı menüsü"} · {template.options.typography}</small>
                    </button>
                  );
                })}
            </div>
          </div>

          <div className="xp-design-inspector">
            <strong>Elle düzenle</strong>
            <p>Bu ayarlar seçili şablonun üzerine yazılır ve önizlemeye anında yansır.</p>
            <div className="xp-design-choices" role="group" aria-label="Kart düzeni">
              {CARD_STYLES.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className="xp-button"
                  data-selected={design.options.cardStyle === item.id || undefined}
                  onClick={() => patchOptions({ cardStyle: item.id })}
                >
                  {item.label}
                </button>
              ))}
            </div>

            <div style={{ marginTop: 10, marginBottom: 8 }}>
              <b style={{ display: "block", fontSize: 11, fontWeight: "bold", marginBottom: 5, color: "#1e293b" }}>
                Kategori Sekme Düzeni
              </b>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 5 }}>
                {CATEGORY_TAB_STYLES.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className="xp-button"
                    data-selected={(design.options.categoryTabStyle ?? "CHIPS_ROW") === item.id || undefined}
                    aria-pressed={(design.options.categoryTabStyle ?? "CHIPS_ROW") === item.id}
                    onClick={() => patchOptions({ categoryTabStyle: item.id })}
                    title={item.desc}
                    style={{ padding: "6px 8px", fontSize: "11px", minHeight: "32px", whiteSpace: "normal", lineHeight: 1.25, textAlign: "center" }}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Outlet Başlığı Manuel Özelleştirme (2. Görsel: Hizalama, Font, Boyut, Renkler) */}
            <div style={{ marginTop: 10, marginBottom: 10, padding: "8px 10px", background: "rgba(0,0,0,0.03)", borderRadius: "8px", border: "1px solid rgba(0,0,0,0.08)" }}>
              <b style={{ display: "block", fontSize: 11, fontWeight: "bold", marginBottom: 6, color: "#1e293b" }}>
                Outlet Başlığı & Hero Alanı
              </b>

              {/* Hizalama (Ortala, Sola, Sağa) */}
              <div style={{ marginBottom: 6 }}>
                <span style={{ fontSize: 10, color: "#64748b", display: "block", marginBottom: 3 }}>Hizalama:</span>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 4 }}>
                  {[
                    { id: "left", label: "⬅ Sola" },
                    { id: "center", label: "⬌ Ortala" },
                    { id: "right", label: "➡ Sağa" },
                  ].map((align) => (
                    <button
                      key={align.id}
                      type="button"
                      className="xp-button"
                      data-selected={(design.options.heroAlign ?? "left") === align.id || undefined}
                      onClick={() => patchOptions({ heroAlign: align.id as HeroAlign })}
                      style={{ fontSize: 10, padding: "4px" }}
                    >
                      {align.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Font Boyutu & Yazı Fontu */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 6 }}>
                <div>
                  <span style={{ fontSize: 10, color: "#64748b", display: "block", marginBottom: 3 }}>Font Boyutu:</span>
                  <select
                    value={design.options.heroFontSize ?? "medium"}
                    onChange={(e) => patchOptions({ heroFontSize: e.target.value as HeroFontSize })}
                    style={{ width: "100%", fontSize: 11, padding: "4px 5px", borderRadius: 4, border: "1px solid #cbd5e1", background: "#fff" }}
                  >
                    <option value="small">Küçük (18px)</option>
                    <option value="medium">Standart (22px)</option>
                    <option value="large">Büyük (26px)</option>
                    <option value="xlarge">İhtişamlı (32px)</option>
                  </select>
                </div>
                <div>
                  <span style={{ fontSize: 10, color: "#64748b", display: "block", marginBottom: 3 }}>Yazı Fontu:</span>
                  <select
                    value={design.options.heroFontFamily ?? "serif"}
                    onChange={(e) => patchOptions({ heroFontFamily: e.target.value as HeroFontFamily })}
                    style={{ width: "100%", fontSize: 11, padding: "4px 5px", borderRadius: 4, border: "1px solid #cbd5e1", background: "#fff" }}
                  >
                    {HERO_FONT_FAMILIES.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Arka Plan Rengi & Yazı Rengi */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                <div>
                  <span style={{ fontSize: 10, color: "#64748b", display: "block", marginBottom: 3 }}>Arka Plan:</span>
                  <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                    <input
                      type="color"
                      value={design.options.heroBgColor && design.options.heroBgColor !== "transparent" ? design.options.heroBgColor : "#1d1a14"}
                      onChange={(e) => patchOptions({ heroBgColor: e.target.value })}
                      style={{ width: 26, height: 24, padding: 1, border: "1px solid #cbd5e1", borderRadius: 4, cursor: "pointer" }}
                      title="Özel arka plan rengi seç"
                    />
                    <button
                      type="button"
                      className="xp-button"
                      onClick={() => patchOptions({ heroBgColor: "" })}
                      style={{ fontSize: 9, padding: "2px 4px", minWidth: 0 }}
                      title="Varsayılan tema rengine dön"
                    >
                      Oto
                    </button>
                    <button
                      type="button"
                      className="xp-button"
                      onClick={() => patchOptions({ heroBgColor: "transparent" })}
                      style={{ fontSize: 9, padding: "2px 4px", minWidth: 0 }}
                      title="Arka planı saydam/şeffaf yap"
                    >
                      Şeffaf
                    </button>
                  </div>
                </div>
                <div>
                  <span style={{ fontSize: 10, color: "#64748b", display: "block", marginBottom: 3 }}>Yazı Rengi:</span>
                  <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                    <input
                      type="color"
                      value={design.options.heroTextColor || "#c9a24a"}
                      onChange={(e) => patchOptions({ heroTextColor: e.target.value })}
                      style={{ width: 26, height: 24, padding: 1, border: "1px solid #cbd5e1", borderRadius: 4, cursor: "pointer" }}
                      title="Özel yazı rengi seç"
                    />
                    <button
                      type="button"
                      className="xp-button"
                      onClick={() => patchOptions({ heroTextColor: "" })}
                      style={{ fontSize: 9, padding: "2px 4px", minWidth: 0 }}
                      title="Varsayılan tema rengine dön"
                    >
                      Oto
                    </button>
                  </div>
                </div>
              </div>
            </div>
            <label className="xp-module-switch xp-design-toggle"><input type="checkbox" checked={design.options.showImages} onChange={(event) => patchOptions({ showImages: event.target.checked })} />Fotoğraflar</label>
            <label className="xp-module-switch xp-design-toggle"><input type="checkbox" checked={design.options.showPrices} onChange={(event) => patchOptions({ showPrices: event.target.checked })} />Fiyatlar</label>
            <label className="xp-module-switch xp-design-toggle"><input type="checkbox" checked={design.options.showTags} onChange={(event) => patchOptions({ showTags: event.target.checked })} />Etiketler</label>
            <label className="xp-module-switch xp-design-toggle"><input type="checkbox" checked={design.options.showAllergens} onChange={(event) => patchOptions({ showAllergens: event.target.checked })} />Alerjen ikonları</label>
            <label className="xp-module-switch xp-design-toggle"><input type="checkbox" checked={design.options.uppercaseCategories} onChange={(event) => patchOptions({ uppercaseCategories: event.target.checked })} />Büyük harf başlıklar</label>
            <label className="xp-module-switch xp-design-toggle"><input type="checkbox" checked={design.options.curatedPhotos} onChange={(event) => patchOptions({ curatedPhotos: event.target.checked })} />Küratörlü fotoğraf (yalnız şefin seçimi, en çok 3)</label>
            <label className="xp-module-switch xp-design-toggle"><input type="checkbox" checked={design.options.showSearch} onChange={(event) => patchOptions({ showSearch: event.target.checked })} />Arama kutusu</label>
            <label className="xp-module-switch xp-design-toggle"><input type="checkbox" checked={design.options.showFilters} onChange={(event) => patchOptions({ showFilters: event.target.checked })} />Etiket süzgeçleri</label>
            <div className="xp-design-typography" role="group" aria-label="Tipografi çifti">
              <b>Tipografi</b>
              {TYPOGRAPHIES.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className="xp-design-typo-card"
                  data-typography={item.id.toLowerCase()}
                  data-selected={design.options.typography === item.id || undefined}
                  aria-pressed={design.options.typography === item.id}
                  onClick={() => patchOptions({ typography: item.id })}
                >
                  <span aria-hidden="true">Aa</span>
                  <small>{item.label}</small>
                </button>
              ))}
            </div>
            <div className="xp-design-choices" role="group" aria-label="Yoğunluk">
              {DENSITIES.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className="xp-button"
                  data-selected={design.options.density === item.id || undefined}
                  aria-pressed={design.options.density === item.id}
                  onClick={() => patchOptions({ density: item.id })}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <div className="xp-design-choices" role="group" aria-label="Karşılama stili">
              {HERO_STYLES.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className="xp-button"
                  data-selected={design.options.hero === item.id || undefined}
                  aria-pressed={design.options.hero === item.id}
                  onClick={() => patchOptions({ hero: item.id })}
                >
                  {item.label}
                </button>
              ))}
            </div>
            {design.options.hero === "PHOTO" ? (
              photos.length > 0 ? (
                <label className="xp-design-field">
                  Karşılama fotoğrafı
                  <select value={design.options.heroImageUrl} onChange={(event) => patchOptions({ heroImageUrl: event.target.value })}>
                    <option value="">Fotoğraf seçin</option>
                    {photos.map((photo) => (
                      <option key={photo.url} value={photo.url}>{photo.name}</option>
                    ))}
                  </select>
                </label>
              ) : (
                <p>Önce bir ürüne fotoğraf ekleyin.</p>
              )
            ) : null}
            <label className="xp-design-field">
              Öne çıkan başlığı
              <input
                type="text"
                maxLength={40}
                value={design.options.featuredTitle}
                placeholder="Öne çıkanlar"
                onChange={(event) => patchOptions({ featuredTitle: event.target.value })}
              />
            </label>
            <label className="xp-design-field">
              Garson çağır butonu metni
              <input
                type="text"
                maxLength={35}
                value={design.options.callWaiterText ?? ""}
                placeholder="Varsayılan: Garson çağır"
                onChange={(event) => patchOptions({ callWaiterText: event.target.value })}
              />
            </label>
            <label className="xp-design-field">
              Garson çağır butonu konumu
              <select
                value={design.options.callWaiterPosition ?? "STICKY_FOOTER"}
                onChange={(event) => patchOptions({ callWaiterPosition: event.target.value as CallWaiterPosition })}
              >
                {CALL_WAITER_POSITIONS.map((pos) => (
                  <option key={pos.id} value={pos.id}>
                    {pos.label}
                  </option>
                ))}
              </select>
            </label>
            <div className="xp-design-inspector-palette">
              <span>Arka plan<i style={{ background: selectedTheme.bg }} /></span>
              <span>Vurgu<i style={{ background: selectedTheme.accent }} /></span>
              <span>Yüzey<i style={{ background: selectedTheme.soft }} /></span>
            </div>
            <div className="xp-design-blocks">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                <b>Bölüm sırası</b>
                <button
                  type="button"
                  className="xp-btn"
                  style={{ padding: "1px 6px", fontSize: 10 }}
                  onClick={() => commit({ ...design, layout: ["hero", "categories", "items"] })}
                  title="Standart bölüm düzenine sıfırla"
                >
                  Sıfırla
                </button>
              </div>
              <small style={{ display: "block", color: "#64748b", fontSize: 10, marginBottom: 6 }}>
                Kategori gezintisi her zaman ürün listesinin üstünde yer alır.
              </small>
              {design.layout.map((block, index) => (
                <div
                  key={block}
                  draggable
                  onDragStart={() => setDragging(block)}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={() => {
                    if (dragging) commit({ ...design, layout: reorder(design.layout, dragging, block) });
                    setDragging(null);
                  }}
                  onDragEnd={() => setDragging(null)}
                >
                  <small>{String(index + 1).padStart(2, "0")}</small>
                  {DESIGN_BLOCKS.find((item) => item.id === block)?.label}
                  <span>⠿</span>
                </div>
              ))}
            </div>
          </div>
        </aside>

        <div className="xp-design-canvas-wrap">
          <div className="xp-design-canvas-toolbar">
            <div className="xp-design-canvas-status">
              <span><i />{preview.sample ? "ÖRNEK MENÜ" : "CANLI MENÜ"}</span>
              {activeOutletId ? (
                <a
                  href={`/q/onizleme/${activeOutletId}?theme=${selectedTheme.id}&lang=${previewLocale}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="xp-button"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 5,
                    marginLeft: 8,
                    padding: "3px 9px",
                    fontSize: 11,
                    fontWeight: 600,
                    textDecoration: "none",
                    color: "#0369a1",
                    background: "#e0f2fe",
                    border: "1px solid #bae6fd",
                    borderRadius: 6,
                  }}
                  title="Menüyü ayrı bir tarayıcı sekmesinde tam ekran olarak aç"
                >
                  <Icon name="link" size={13} />
                  <span>Tarayıcıda Önizle</span>
                </a>
              ) : null}
              {themeOverride ? (
                <span className="xp-theme-override-pill">
                  Önizlenen Tema: <strong>{selectedTheme.name}</strong>
                  <button type="button" onClick={() => setThemeOverride(null)} title="Orijinal temaya dön">×</button>
                </span>
              ) : null}
            </div>
            <div className="xp-design-zoom" aria-label="Önizleme">
              {STUDIO_DEVICES.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className="xp-button"
                  data-selected={device === item.id || undefined}
                  onClick={() => {
                    setDevice(item.id);
                    setZoomLock(null);
                  }}
                >
                  {item.label}
                </button>
              ))}
              <button type="button" className="xp-button" aria-label="Uzaklaştır" disabled={zoom <= 0.35} onClick={() => setZoomLock(Math.max(0.35, Math.round((zoom - 0.05) * 100) / 100))}>−</button>
              <button type="button" className="xp-button xp-design-zoom-value" onClick={() => setZoomLock(null)}>{zoomLock === null ? "Sığdır" : `${Math.round(zoom * 100)}%`}</button>
              <button type="button" className="xp-button" aria-label="Yakınlaştır" disabled={zoom >= 1.15} onClick={() => setZoomLock(Math.min(1.15, Math.round((zoom + 0.05) * 100) / 100))}>+</button>
            </div>
          </div>
          <div className="xp-design-canvas-body">
            <div className="xp-design-canvas" ref={canvasRef} data-locked={zoomLock !== null || undefined}>
              <div className="xp-design-stage" style={{ width: DEVICE_BOX[device].w * zoom, height: DEVICE_BOX[device].h * zoom }}>
                <div className="xp-design-stage-scale" style={{ width: DEVICE_BOX[device].w, height: DEVICE_BOX[device].h, transform: `scale(${zoom})` }}>
                  <StudioDevice device={device}>
                <DesignPreviewFrame>
                  <NextIntlClientProvider locale={previewLocale} messages={PREVIEW_MESSAGES[previewLocale]}>
                    <GuestFrame
                      token="onizleme"
                      locale={previewLocale}
                      onLocaleChange={setPreviewLocale}
                      preview
                      device={device}
                      theme={selectedTheme}
                      design={design}
                      outletName={outlet?.name ?? "Menü"}
                      tableLabel="Masa 12"
                      headerCallWaiter={
                        design.options.callWaiterPosition === "STICKY_HEADER" ? (
                          <CallWaiterButton
                            token="onizleme"
                            locale={previewLocale}
                            options={callOptions}
                            preview
                            customText={design.options.callWaiterText}
                          />
                        ) : undefined
                      }
                      footer={
                        design.options.callWaiterPosition === "STICKY_FOOTER" || !design.options.callWaiterPosition ? (
                          <div className="g-footer-actions">
                            <CallWaiterButton
                              token="onizleme"
                              locale={previewLocale}
                              options={callOptions}
                              preview
                              customText={design.options.callWaiterText}
                            />
                          </div>
                        ) : undefined
                      }
                    >
                      <MenuView
                        menu={{
                          ...preview.menu,
                          state: {
                            ...preview.menu.state,
                            design,
                            callOptions,
                          },
                        }}
                        locale={previewLocale}
                        token="onizleme"
                      />
                    </GuestFrame>
                  </NextIntlClientProvider>
                </DesignPreviewFrame>
                  </StudioDevice>
                </div>
              </div>
            </div>
            <aside className="xp-design-canvas-aside">
              <QualityPanel
                findings={findings}
                outletId={activeOutletId}
                onRefreshNodes={() => {
                  if (activeOutletId) {
                    void listMenuTreeAction({ outletId: activeOutletId }).then((result) =>
                      setNodes(result.ok ? result.data : []),
                    );
                  }
                }}
                onEnableCuratedPhotos={() => patchOptions({ curatedPhotos: true })}
              />
            </aside>
          </div>
        </div>
      </div>
      {notice ? <p className={notice.startsWith("Tasarım kaydedildi") ? "xp-design-success" : "xp-design-error"} role={notice.startsWith("Tasarım kaydedildi") ? "status" : "alert"}>{notice}</p> : null}
    </section>
  );
}
