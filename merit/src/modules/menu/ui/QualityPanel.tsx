"use client";

import { useState } from "react";
import {
  ALLERGENS,
  ALLERGEN_INFO,
  ALLERGEN_PRESETS,
  shortenMenuDetail,
  type AllergenKey,
} from "../allergens";
import type { QualityAffectedItem, QualityCheckId, QualityFinding, QualityLevel } from "../quality";
import {
  auditAndSyncOutletTranslationsAction,
  autoTranslateMenuNodeAction,
  updateMenuNodeAction,
} from "../server/actions/menuTree";
import { notify } from "@/shell/notify";
import { Icon } from "@/components/icons/Icon";

const ORDER: Record<QualityLevel, number> = { block: 0, warn: 1, info: 2 };
const LABEL: Record<QualityLevel, string> = { block: "ENGEL", warn: "UYARI", info: "BİLGİ" };

type Props = {
  findings: QualityFinding[];
  id?: string;
  outletId?: string;
  onRefreshNodes?: () => void;
  onEnableCuratedPhotos?: () => void;
};

/**
 * Live quality findings of the design being edited, positioned to the right of the phone mockup.
 * Clicking any finding expands the exact list of affected products and provides 1-click & per-item fix actions.
 */
export function QualityPanel({
  findings,
  id,
  outletId,
  onRefreshNodes,
  onEnableCuratedPhotos,
}: Props) {
  const [collapsed, setCollapsed] = useState(false);
  const [expandedId, setExpandedId] = useState<QualityCheckId | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [showAllergenGuide, setShowAllergenGuide] = useState(false);
  const [filterText, setFilterText] = useState("");

  // Local draft states for per-item allergen & description editing inside QualityPanel
  const [allergenDrafts, setAllergenDrafts] = useState<Record<string, AllergenKey[]>>({});
  const [detailDrafts, setDetailDrafts] = useState<Record<string, string>>({});

  const sorted = [...findings].sort((a, b) => ORDER[a.level] - ORDER[b.level]);
  const blockCount = sorted.filter((f) => f.level === "block").length;
  const warnCount = sorted.filter((f) => f.level === "warn").length;

  const getItemAllergens = (item: QualityAffectedItem): AllergenKey[] => {
    if (allergenDrafts[item.id] !== undefined) return allergenDrafts[item.id];
    if (item.allergens.length > 0) return item.allergens as AllergenKey[];
    return item.suggestedAllergens ?? [];
  };

  const toggleItemAllergen = (item: QualityAffectedItem, key: AllergenKey) => {
    const current = getItemAllergens(item);
    const next = current.includes(key) ? current.filter((k) => k !== key) : [...current, key];
    setAllergenDrafts((prev) => ({ ...prev, [item.id]: next }));
  };

  const applyPresetToItem = (itemId: string, presetId: string) => {
    const preset = ALLERGEN_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    setAllergenDrafts((prev) => ({ ...prev, [itemId]: [...preset.allergens] }));
  };

  const getItemDetail = (item: QualityAffectedItem): string => {
    if (detailDrafts[item.id] !== undefined) return detailDrafts[item.id];
    return item.detail ?? "";
  };

  // ─── 1. Fix Missing Translations (Bulk or Single) ───
  const handleFixAllTranslations = async (items: QualityAffectedItem[]) => {
    setBusyKey("fix-all-translations");
    try {
      if (outletId) {
        await auditAndSyncOutletTranslationsAction({ outletId, triggerSync: true });
      }
      // Immediately translate up to 25 affected items in foreground for instant visual feedback
      const batch = items.slice(0, 25);
      for (const item of batch) {
        if (item.id && !item.id.startsWith("item-")) {
          await autoTranslateMenuNodeAction({ nodeId: item.id });
        }
      }
      notify.success("Eksik çeviriler otomatik tamamlandı ve arka plan senkronizasyonu başlatıldı.");
      onRefreshNodes?.();
    } catch {
      notify.error("Çeviriler tamamlanırken hata oluştu.");
    } finally {
      setBusyKey(null);
    }
  };

  const handleFixSingleTranslation = async (item: QualityAffectedItem) => {
    if (!item.id || item.id.startsWith("item-")) return;
    setBusyKey(`trans-${item.id}`);
    try {
      const res = await autoTranslateMenuNodeAction({ nodeId: item.id });
      if (res.ok) {
        notify.success(`“${item.name}” için ${res.data.languages.length} dilde çeviri tamamlandı.`);
        onRefreshNodes?.();
      } else {
        notify.error(res.error.message);
      }
    } finally {
      setBusyKey(null);
    }
  };

  // ─── 2. Fix Allergens (Single or Bulk Smart-Inferred) ───
  const handleSaveItemAllergens = async (item: QualityAffectedItem) => {
    if (!item.id || item.id.startsWith("item-")) return;
    const selected = getItemAllergens(item);
    if (selected.length === 0) {
      notify.error("Kaydetmek için en az bir alerjen seçin veya hazır şablon kullanın.");
      return;
    }
    setBusyKey(`alg-${item.id}`);
    try {
      const res = await updateMenuNodeAction({
        nodeId: item.id,
        data: { allergens: selected },
      });
      if (res.ok) {
        notify.success(`“${item.name}” alerjen bilgileri güncellendi.`);
        onRefreshNodes?.();
      } else {
        notify.error(res.error.message);
      }
    } finally {
      setBusyKey(null);
    }
  };

  const handleBulkApplySmartAllergens = async (items: QualityAffectedItem[]) => {
    const candidates = items.filter((item) => {
      const list = getItemAllergens(item);
      return list.length > 0 && item.id && !item.id.startsWith("item-");
    });
    if (candidates.length === 0) {
      notify.error("Otomatik uygulanacak alerjen önerisi bulunan ürün yok. Ürünlerden şablon seçebilirsiniz.");
      return;
    }
    setBusyKey("fix-all-allergens");
    try {
      let updatedCount = 0;
      for (const item of candidates) {
        const list = getItemAllergens(item);
        const res = await updateMenuNodeAction({
          nodeId: item.id,
          data: { allergens: list },
        });
        if (res.ok) updatedCount++;
      }
      notify.success(`${updatedCount} ürünün alerjen bilgileri akıllı eşleştirme ile güncellendi.`);
      onRefreshNodes?.();
    } finally {
      setBusyKey(null);
    }
  };

  // ─── 3. Fix Long Descriptions (Single or Bulk Shorten <= 135 chars) ───
  const handleSaveItemDetail = async (item: QualityAffectedItem, customText?: string) => {
    if (!item.id || item.id.startsWith("item-")) return;
    const nextDetail = (customText ?? getItemDetail(item)).trim();
    setBusyKey(`det-${item.id}`);
    try {
      const res = await updateMenuNodeAction({
        nodeId: item.id,
        data: { detail: nextDetail },
      });
      if (res.ok) {
        void autoTranslateMenuNodeAction({ nodeId: item.id });
        notify.success(`“${item.name}” açıklaması (${nextDetail.length} karakter) güncellendi.`);
        onRefreshNodes?.();
      } else {
        notify.error(res.error.message);
      }
    } finally {
      setBusyKey(null);
    }
  };

  const handleBulkShortenDetails = async (items: QualityAffectedItem[]) => {
    const valid = items.filter((i) => i.id && !i.id.startsWith("item-") && i.detail);
    if (valid.length === 0) return;
    setBusyKey("fix-all-details");
    try {
      let count = 0;
      for (const item of valid) {
        const shortened = shortenMenuDetail(getItemDetail(item), 135);
        setDetailDrafts((prev) => ({ ...prev, [item.id]: shortened }));
        const res = await updateMenuNodeAction({
          nodeId: item.id,
          data: { detail: shortened },
        });
        if (res.ok) {
          void autoTranslateMenuNodeAction({ nodeId: item.id });
          count++;
        }
      }
      notify.success(`${count} ürünün açıklaması 140 karakter altına kısaltıldı ve kaydedildi.`);
      onRefreshNodes?.();
    } finally {
      setBusyKey(null);
    }
  };

  if (collapsed) {
    return (
      <button
        type="button"
        className="xp-design-quality-collapsed"
        id={id}
        onClick={() => setCollapsed(false)}
        title="Kalite kontrol panelini aç"
        aria-label="Kalite kontrol panelini aç"
      >
        <span className="xp-design-quality-badge-icon">
          {blockCount > 0 ? <Icon name="ban" size={16} /> : warnCount > 0 ? <Icon name="warning" size={20} /> : <Icon name="check" size={20} />}
        </span>
        <span className="xp-design-quality-badge-text">
          Kalite ({sorted.length})
        </span>
      </button>
    );
  }

  return (
    <section
      className="xp-design-quality"
      id={id}
      aria-label="Kalite kontrolü"
      style={expandedId ? { width: "100%" } : undefined}
    >
      <div className="xp-design-quality-header">
        <div className="xp-design-quality-title-wrap">
          <strong>Kalite Kontrolü</strong>
          <span
            className="xp-design-quality-count"
            data-has-block={blockCount > 0 || undefined}
            data-has-warn={warnCount > 0 || undefined}
          >
            {sorted.length === 0 ? "0" : sorted.length}
          </span>
        </div>
        <button
          type="button"
          className="xp-design-quality-close"
          onClick={() => setCollapsed(true)}
          title="Paneli daralt"
          aria-label="Paneli daralt"
        >
          ×
        </button>
      </div>

      {sorted.length === 0 ? (
        <div className="xp-design-quality-ok" role="status">
          <Icon name="check" size={20} className="xp-design-quality-ok-icon" />
          <div>
            <strong>Sorun bulunmadı</strong>
            <p>Tasarım ve menü ayarları kurallara uygun.</p>
          </div>
        </div>
      ) : (
        <ul className="xp-design-quality-list">
          {sorted.map((finding) => {
            const affected = finding.affectedItems ?? [];
            const isExpandable = affected.length > 0;
            const isExpanded = expandedId === finding.id;
            const filteredAffected = filterText.trim()
              ? affected.filter((it) =>
                  `${it.categoryPath} ${it.name} ${it.detail ?? ""}`
                    .toLocaleLowerCase("tr")
                    .includes(filterText.toLocaleLowerCase("tr")),
                )
              : affected;

            return (
              <li
                key={finding.id}
                data-level={finding.level}
                className="xp-design-quality-item"
                style={{ cursor: isExpandable ? "pointer" : "default" }}
                onClick={() => {
                  if (!isExpandable) return;
                  setExpandedId(isExpanded ? null : finding.id);
                  setFilterText("");
                }}
              >
                <div className="xp-design-quality-item-header" style={{ justifyContent: "space-between" }}>
                  <span className="xp-design-quality-level">{LABEL[finding.level]}</span>
                  {isExpandable ? (
                    <button
                      type="button"
                      className="xp-button"
                      style={{
                        fontSize: 10,
                        padding: "2px 7px",
                        fontWeight: 700,
                        background: isExpanded ? "#1d4ed8" : "#ffffff",
                        color: isExpanded ? "#ffffff" : "#1e293b",
                        borderColor: isExpanded ? "#1d4ed8" : "#cbd5e1",
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        setExpandedId(isExpanded ? null : finding.id);
                        setFilterText("");
                      }}
                    >
                      {isExpanded ? `Listeyi Gizle ▲` : `Ürünleri Gör (${affected.length}) ▼`}
                    </button>
                  ) : null}
                </div>

                <p className="xp-design-quality-message">{finding.message}</p>

                {/* Quick 1-Click Fix Bar on Card */}
                {finding.id === "translations" && affected.length > 0 && !isExpanded && (
                  <div onClick={(e) => e.stopPropagation()} style={{ marginTop: 4 }}>
                    <button
                      type="button"
                      className="xp-button"
                      disabled={busyKey !== null}
                      style={{
                        width: "100%",
                        fontSize: 10,
                        fontWeight: 700,
                        padding: "4px 8px",
                        background: "#2563eb",
                        color: "#fff",
                        borderColor: "#1d4ed8",
                      }}
                      onClick={() => void handleFixAllTranslations(affected)}
                    >
                      {busyKey === "fix-all-translations"
                        ? "Çeviriler Tamamlanıyor..."
                        : `⚡ Eksik Çevirileri Otomatik Düzelt (${affected.length} Ürün)`}
                    </button>
                  </div>
                )}

                {finding.id === "long-detail" && affected.length > 0 && !isExpanded && (
                  <div onClick={(e) => e.stopPropagation()} style={{ marginTop: 4, display: "flex", gap: 4 }}>
                    <button
                      type="button"
                      className="xp-button"
                      disabled={busyKey !== null}
                      style={{
                        flex: 1,
                        fontSize: 10,
                        fontWeight: 700,
                        padding: "4px 8px",
                        background: "#0f766e",
                        color: "#fff",
                        borderColor: "#115e59",
                      }}
                      onClick={() => void handleBulkShortenDetails(affected)}
                    >
                      {busyKey === "fix-all-details"
                        ? "Kısaltılıyor..."
                        : `✂️ ${affected.length} Ürünü Otomatik Kısalt & Düzelt`}
                    </button>
                  </div>
                )}

                {finding.id === "photo-density" && onEnableCuratedPhotos && (
                  <div onClick={(e) => e.stopPropagation()} style={{ marginTop: 4 }}>
                    <button
                      type="button"
                      className="xp-button"
                      style={{
                        width: "100%",
                        fontSize: 10,
                        fontWeight: 700,
                        padding: "4px 8px",
                        background: "#2563eb",
                        color: "#fff",
                        borderColor: "#1d4ed8",
                      }}
                      onClick={() => onEnableCuratedPhotos()}
                    >
                      ✨ Küratörlü Fotoğraf Modunu Etkinleştir (Düzelt)
                    </button>
                  </div>
                )}

                {/* Expanded Interactive Product List & Fix Studio */}
                {isExpanded && isExpandable && (
                  <div
                    className="xp-quality-drawer"
                    onClick={(e) => e.stopPropagation()}
                    style={{
                      marginTop: 8,
                      paddingTop: 8,
                      borderTop: "1px solid rgba(0,0,0,0.12)",
                      display: "flex",
                      flexDirection: "column",
                      gap: 8,
                    }}
                  >
                    {/* Top Action Header per Finding Type */}
                    {finding.id === "translations" && (
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        <button
                          type="button"
                          className="xp-button"
                          disabled={busyKey !== null}
                          style={{
                            width: "100%",
                            fontWeight: 700,
                            fontSize: 11,
                            padding: "5px 8px",
                            background: "#2563eb",
                            color: "#fff",
                            borderColor: "#1d4ed8",
                          }}
                          onClick={() => void handleFixAllTranslations(affected)}
                        >
                          {busyKey === "fix-all-translations"
                            ? "Tüm Eksik Çeviriler Tamamlanıyor..."
                            : `⚡ Tüm Eksik Çevirileri Otomatik Tamamla (${affected.length} Ürün)`}
                        </button>
                      </div>
                    )}

                    {finding.id === "allergens" && (
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                          <button
                            type="button"
                            className="xp-button"
                            disabled={busyKey !== null}
                            style={{
                              flex: 1,
                              fontWeight: 700,
                              fontSize: 10,
                              padding: "5px 6px",
                              background: "#d97706",
                              color: "#fff",
                              borderColor: "#b45309",
                            }}
                            onClick={() => void handleBulkApplySmartAllergens(affected)}
                            title="İçeriğinde süt, gluten, yumurta, kuruyemiş, balık vb. tespit edilen ürünlere alerjenlerini otomatik yazar"
                          >
                            {busyKey === "fix-all-allergens"
                              ? "Uygulanıyor..."
                              : "✨ Tespit Edilen Alerjenleri Otomatik Doldur"}
                          </button>
                          <button
                            type="button"
                            className="xp-button"
                            style={{ fontSize: 10, padding: "4px 6px", fontWeight: 600 }}
                            onClick={() => setShowAllergenGuide((v) => !v)}
                          >
                            {showAllergenGuide ? "Rehberi Gizle" : "📚 Hazır Alerjen Rehberi"}
                          </button>
                        </div>

                        {showAllergenGuide && (
                          <div
                            style={{
                              background: "#ffffff",
                              border: "1px solid #cbd5e1",
                              borderRadius: 6,
                              padding: 8,
                              fontSize: 10,
                              maxHeight: 180,
                              overflowY: "auto",
                            }}
                          >
                            <strong style={{ display: "block", marginBottom: 4, color: "#0f172a" }}>
                              AB 1169/2011 Standart 15 Alerjen & Örnek Ürünler:
                            </strong>
                            {ALLERGENS.map((alg) => (
                              <div key={alg} style={{ marginBottom: 4, lineHeight: 1.35 }}>
                                <b style={{ color: "#1d4ed8" }}>{ALLERGEN_INFO[alg].label}:</b>{" "}
                                <span style={{ color: "#475569" }}>{ALLERGEN_INFO[alg].examples}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {finding.id === "long-detail" && (
                      <button
                        type="button"
                        className="xp-button"
                        disabled={busyKey !== null}
                        style={{
                          width: "100%",
                          fontWeight: 700,
                          fontSize: 11,
                          padding: "5px 8px",
                          background: "#0f766e",
                          color: "#fff",
                          borderColor: "#115e59",
                        }}
                        onClick={() => void handleBulkShortenDetails(affected)}
                      >
                        {busyKey === "fix-all-details"
                          ? "Tüm Açıklamalar Kısaltılıyor..."
                          : `✂️ Tümünü Otomatik Kısalt & Kaydet (${affected.length} Ürün ≤135 kr.)`}
                      </button>
                    )}

                    {/* Search filter when more than 5 items */}
                    {affected.length > 5 && (
                      <input
                        type="search"
                        placeholder={`Ürünlerde ara (${affected.length} kayıt)...`}
                        value={filterText}
                        onChange={(e) => setFilterText(e.target.value)}
                        style={{
                          width: "100%",
                          padding: "4px 8px",
                          fontSize: 11,
                          border: "1px solid #cbd5e1",
                          borderRadius: 5,
                          background: "#fff",
                        }}
                      />
                    )}

                    {/* Affected Items Scrollable List */}
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 6,
                        maxHeight: 320,
                        overflowY: "auto",
                        paddingRight: 2,
                      }}
                    >
                      {filteredAffected.map((item, idx) => {
                        const selectedAllergens = getItemAllergens(item);
                        const currentDetail = getItemDetail(item);

                        return (
                          <div
                            key={item.id || idx}
                            style={{
                              background: "#ffffff",
                              border: "1px solid #dbe2ef",
                              borderRadius: 6,
                              padding: "7px 8px",
                              display: "flex",
                              flexDirection: "column",
                              gap: 5,
                            }}
                          >
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 6 }}>
                              <div style={{ minWidth: 0 }}>
                                {item.categoryPath ? (
                                  <div style={{ fontSize: 9, color: "#64748b", fontWeight: 600 }}>
                                    {item.categoryPath}
                                  </div>
                                ) : null}
                                <strong style={{ fontSize: 11, color: "#0f172a", display: "block" }}>
                                  {idx + 1}. {item.name}
                                </strong>
                              </div>

                              {/* Per-item action for Translations */}
                              {finding.id === "translations" && (
                                <button
                                  type="button"
                                  className="xp-button"
                                  disabled={busyKey !== null}
                                  style={{
                                    fontSize: 10,
                                    padding: "2px 7px",
                                    fontWeight: 700,
                                    background: "#2563eb",
                                    color: "#fff",
                                    borderColor: "#1d4ed8",
                                    flexShrink: 0,
                                  }}
                                  onClick={() => void handleFixSingleTranslation(item)}
                                >
                                  {busyKey === `trans-${item.id}` ? "Çevriliyor..." : "Düzelt / Çevir"}
                                </button>
                              )}
                            </div>

                            {/* Details for Translations finding */}
                            {finding.id === "translations" && item.missingLangs && (
                              <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                                {item.missingLangs.map((lang) => (
                                  <span
                                    key={lang}
                                    style={{
                                      fontSize: 9,
                                      padding: "1px 5px",
                                      borderRadius: 4,
                                      background: "#fef3c7",
                                      color: "#92400e",
                                      border: "1px solid #fde68a",
                                      fontWeight: 700,
                                    }}
                                  >
                                    Eksik: {lang}
                                  </span>
                                ))}
                              </div>
                            )}

                            {/* Details & Interactive Preset/Checkbox Picker for Allergens finding */}
                            {finding.id === "allergens" && (
                              <>
                                {item.detail ? (
                                  <div style={{ fontSize: 10, color: "#475569", fontStyle: "italic" }}>
                                    “{item.detail}”
                                  </div>
                                ) : null}

                                {/* Smart inference status */}
                                <div
                                  style={{
                                    fontSize: 9.5,
                                    padding: "2px 6px",
                                    borderRadius: 4,
                                    background: item.isNaturallyAllergenFree ? "#ecfdf5" : "#eff6ff",
                                    color: item.isNaturallyAllergenFree ? "#065f46" : "#1e40af",
                                    fontWeight: 600,
                                  }}
                                >
                                  {item.suggestedReason}
                                </div>

                                {/* Ready Allergen Preset Selector */}
                                <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                                  <select
                                    aria-label={`${item.name} için hazır alerjen şablonu`}
                                    value=""
                                    onChange={(e) => {
                                      if (e.target.value) applyPresetToItem(item.id, e.target.value);
                                    }}
                                    style={{
                                      flex: 1,
                                      fontSize: 10,
                                      padding: "2px 4px",
                                      border: "1px solid #94a3b8",
                                      borderRadius: 4,
                                      background: "#f8fafc",
                                    }}
                                  >
                                    <option value="">📋 Hazır Alerjen Şablonu Seçin...</option>
                                    {ALLERGEN_PRESETS.map((p) => (
                                      <option key={p.id} value={p.id}>
                                        [{p.category}] {p.label}
                                      </option>
                                    ))}
                                  </select>
                                  <button
                                    type="button"
                                    className="xp-button"
                                    disabled={busyKey !== null || selectedAllergens.length === 0}
                                    style={{
                                      fontSize: 10,
                                      padding: "2px 8px",
                                      fontWeight: 700,
                                      background: selectedAllergens.length > 0 ? "#2563eb" : undefined,
                                      color: selectedAllergens.length > 0 ? "#fff" : undefined,
                                    }}
                                    onClick={() => void handleSaveItemAllergens(item)}
                                  >
                                    {busyKey === `alg-${item.id}` ? "Kaydediliyor..." : "Kaydet"}
                                  </button>
                                </div>

                                {/* Compact interactive allergen pills */}
                                <div style={{ display: "flex", gap: 3, flexWrap: "wrap", marginTop: 2 }}>
                                  {ALLERGENS.map((alg) => {
                                    const active = selectedAllergens.includes(alg);
                                    return (
                                      <button
                                        key={alg}
                                        type="button"
                                        onClick={() => toggleItemAllergen(item, alg)}
                                        title={ALLERGEN_INFO[alg].description}
                                        style={{
                                          fontSize: 9,
                                          padding: "1px 5px",
                                          borderRadius: 999,
                                          border: active ? "1px solid #1d4ed8" : "1px solid #cbd5e1",
                                          background: active ? "#2563eb" : "#f8fafc",
                                          color: active ? "#ffffff" : "#475569",
                                          fontWeight: active ? 700 : 500,
                                          cursor: "pointer",
                                        }}
                                      >
                                        {ALLERGEN_INFO[alg].shortLabel}
                                      </button>
                                    );
                                  })}
                                </div>
                              </>
                            )}

                            {/* Details & Interactive Editor for Long Description finding (>140 chars) */}
                            {finding.id === "long-detail" && (
                              <>
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                  <span
                                    style={{
                                      fontSize: 9.5,
                                      fontWeight: 700,
                                      color: currentDetail.length > 140 ? "#b45309" : "#15803d",
                                    }}
                                  >
                                    Uzunluk: {currentDetail.length} / 140 karakter
                                  </span>
                                  <div style={{ display: "flex", gap: 4 }}>
                                    <button
                                      type="button"
                                      className="xp-button"
                                      style={{ fontSize: 9.5, padding: "1px 6px", fontWeight: 600 }}
                                      onClick={() => {
                                        const short = shortenMenuDetail(currentDetail, 135);
                                        setDetailDrafts((prev) => ({ ...prev, [item.id]: short }));
                                      }}
                                    >
                                      ✂️ Kısalt (≤135 kr.)
                                    </button>
                                    <button
                                      type="button"
                                      className="xp-button"
                                      disabled={busyKey !== null}
                                      style={{
                                        fontSize: 9.5,
                                        padding: "1px 7px",
                                        fontWeight: 700,
                                        background: "#2563eb",
                                        color: "#fff",
                                        borderColor: "#1d4ed8",
                                      }}
                                      onClick={() => void handleSaveItemDetail(item)}
                                    >
                                      {busyKey === `det-${item.id}` ? "..." : "Kaydet"}
                                    </button>
                                  </div>
                                </div>
                                <textarea
                                  rows={3}
                                  value={currentDetail}
                                  onChange={(e) =>
                                    setDetailDrafts((prev) => ({ ...prev, [item.id]: e.target.value }))
                                  }
                                  style={{
                                    width: "100%",
                                    fontSize: 10,
                                    padding: "4px 6px",
                                    borderRadius: 4,
                                    border:
                                      currentDetail.length > 140
                                        ? "1px solid #f59e0b"
                                        : "1px solid #22c55e",
                                    lineHeight: 1.35,
                                    resize: "vertical",
                                  }}
                                />
                              </>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
