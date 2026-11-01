"use client";

import { NextIntlClientProvider } from "next-intl";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import tr from "@/lib/i18n/messages/tr.json";
import { useSse } from "@/shell/useSse";
import {
  AMBIENCES,
  CARD_STYLES,
  DENSITIES,
  DESIGN_BLOCKS,
  DESIGN_TEMPLATES,
  DEFAULT_OUTLET_DESIGN,
  HERO_STYLES,
  TYPOGRAPHIES,
  templatePreset,
  type DesignBlockId,
  type DesignOptions,
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

type Props = {
  hotelId?: string;
  rows: ThemeRow[];
  targets: AssignTarget[];
  onSaved(): void;
  /** Renk kütüphanesi ve outlet ataması. Önizlemenin yüksekliğini paylaşmaz. */
  library?: ReactNode;
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
  return result;
}

/** Every active dish of the (nested) menu tree, as the quality checks need to see it. */
function qualityItems(nodes: MenuTreeNode[], parentActive = true): QualityItem[] {
  return nodes.flatMap((node) => {
    const active = parentActive && node.isActive;
    if (!active) return [];
    if (node.kind === "OGE") {
      return [
        {
          detail: node.detail,
          imageUrl: node.imageUrl,
          allergens: node.allergens,
          tags: node.tags,
          translationLangs: node.translations.map((item) => item.lang),
        },
      ];
    }
    return qualityItems(node.children, active);
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

export function MenuDesignStudio({ hotelId, rows, targets, onSaved, library }: Props) {
  const availableHotels = useMemo(
    () => targets.filter((target) => !hotelId || target.hotelId === hotelId),
    [hotelId, targets],
  );
  const [selectedHotelId, setSelectedHotelId] = useState(hotelId ?? availableHotels[0]?.hotelId ?? "");
  const selectedHotel = availableHotels.find((target) => target.hotelId === selectedHotelId) ?? availableHotels[0];
  const availableTargets =
    selectedHotel?.outlets.map((outlet) => ({ ...outlet, hotelId: selectedHotel.hotelId, hotelName: selectedHotel.hotelName })) ?? [];
  const [outletId, setOutletId] = useState(availableTargets[0]?.id ?? "");
  const [draft, setDraft] = useState<{ outletId: string; design: OutletDesign; themeId: string } | null>(null);
  const [nodes, setNodes] = useState<MenuTreeNode[]>([]);
  const [dragging, setDragging] = useState<DesignBlockId | null>(null);
  const [device, setDevice] = useState<StudioDeviceId>("iphone-x");
  const [rail, setRail] = useState<"tasarim" | "renk" | "cagri">("tasarim");
  const [callOptions, setCallOptions] = useState<GuestCallOption[]>([]);
  const canvasRef = useRef<HTMLDivElement>(null);
  const [fitZoom, setFitZoom] = useState(0.8);
  const [zoomLock, setZoomLock] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const outlet = availableTargets.find((item) => item.id === outletId) ?? availableTargets[0];
  const activeOutletId = outlet?.id ?? "";
  const design = draft?.outletId === activeOutletId ? draft.design : (outlet?.design ?? DEFAULT_OUTLET_DESIGN);
  const themeId =
    draft?.outletId === activeOutletId
      ? draft.themeId
      : (outlet?.themeId ?? rows.find((row) => row.isDefault)?.id ?? rows[0]?.id ?? "");
  const selectedTheme = rows.find((item) => item.id === themeId) ?? rows.find((row) => row.isDefault) ?? rows[0] ?? FALLBACK_THEME;
  const zoom = zoomLock ?? fitZoom;

  useEffect(() => {
    const node = canvasRef.current;
    if (!node) return;
    const measure = () => {
      const box = DEVICE_BOX[device];
      const next = Math.min((node.clientWidth - 32) / box.w, (node.clientHeight - 32) / box.h);
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
          <div className="xp-design-library">{library}</div>
          <div className="xp-design-controls">
            <label>
              Otel
              <select
                value={selectedHotel?.hotelId ?? ""}
                onChange={(event) => {
                  setSelectedHotelId(event.target.value);
                  setOutletId(availableHotels.find((item) => item.hotelId === event.target.value)?.outlets[0]?.id ?? "");
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
              Outlet
              <select value={activeOutletId} disabled={!selectedHotel} onChange={(event) => { setOutletId(event.target.value); setNotice(null); }}>
                <option value="">Outlet seçin</option>
                {availableTargets.map((item) => (
                  <option key={item.id} value={item.id}>{item.name}</option>
                ))}
              </select>
            </label>
            <label>
              Renk teması
              <select
                value={themeId}
                disabled={rows.length === 0}
                onChange={(event) => commit(design, event.target.value)}
              >
                {rows.map((item) => (
                  <option key={item.id} value={item.id}>{item.name}</option>
                ))}
              </select>
            </label>
          </div>

          <div className="xp-design-calls" hidden={rail !== "cagri"}>
            <CallOptionsPanel outletId={activeOutletId} onChanged={setCallOptions} />
          </div>

          <div className="xp-design-template-list">
            <div className="xp-design-side-title">
              <strong>Hazır şablonlar</strong>
              <span>{DESIGN_TEMPLATES.length}</span>
            </div>
            <p>Şablon; kart düzenini, fotoğrafı ve başlık stilini bir arada uygular. Sonra elle değiştirebilirsiniz.</p>
            {AMBIENCES.map((ambience) => (
              <div key={ambience.id} className="xp-design-ambience">
                <b>{ambience.label}</b>
                {DESIGN_TEMPLATES.filter((item) => item.ambience === ambience.id).map((template) => (
                  <button
                    key={template.id}
                    type="button"
                    className="xp-design-template"
                    data-selected={design.template === template.id || undefined}
                    onClick={() => commit({ ...templatePreset(template.id as TemplateId), layout: design.layout })}
                  >
                    <span className={`xp-design-template-art is-${template.style}`}><i /><i /><i /></span>
                    <strong>{template.name}</strong>
                    <small>{CARD_STYLES.find((item) => item.id === template.options.cardStyle)?.label} · {template.options.showImages ? "fotoğraflı" : "yazı menüsü"}</small>
                  </button>
                ))}
              </div>
            ))}
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
            <div className="xp-design-inspector-palette">
              <span>Arka plan<i style={{ background: selectedTheme.bg }} /></span>
              <span>Vurgu<i style={{ background: selectedTheme.accent }} /></span>
              <span>Yüzey<i style={{ background: selectedTheme.soft }} /></span>
            </div>
            <div className="xp-design-blocks">
              <b>Bölüm sırası</b>
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
            <span><i />{preview.sample ? "ÖRNEK MENÜ" : "CANLI MENÜ"}</span>
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
          <div className="xp-design-canvas" ref={canvasRef} data-locked={zoomLock !== null || undefined}>
            <div className="xp-design-stage" style={{ width: DEVICE_BOX[device].w * zoom, height: DEVICE_BOX[device].h * zoom }}>
              <div className="xp-design-stage-scale" style={{ width: DEVICE_BOX[device].w, height: DEVICE_BOX[device].h, transform: `scale(${zoom})` }}>
                <StudioDevice device={device}>
              <DesignPreviewFrame>
                <NextIntlClientProvider locale="tr" messages={tr}>
                  <GuestFrame
                    token="onizleme"
                    locale="tr"
                    preview
                    theme={selectedTheme}
                    design={design}
                    outletName={outlet?.name ?? "Menü"}
                    tableLabel="Masa 12"
                    footer={
                      <div className="g-footer-actions">
                        <CallWaiterButton token="onizleme" locale="tr" options={callOptions} preview />
                      </div>
                    }
                  >
                    <MenuView menu={preview.menu} locale="tr" />
                  </GuestFrame>
                </NextIntlClientProvider>
              </DesignPreviewFrame>
                </StudioDevice>
              </div>
            </div>
          </div>
          <QualityPanel findings={findings} />
        </div>
      </div>
      {notice ? <p className={notice.startsWith("Tasarım kaydedildi") ? "xp-design-success" : "xp-design-error"} role={notice.startsWith("Tasarım kaydedildi") ? "status" : "alert"}>{notice}</p> : null}
    </section>
  );
}
