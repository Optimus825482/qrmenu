// Pure model of the editable landing screens (no server imports): which blocks a screen is made of,
// what an administrator may change per role, and how a stored layout is repaired into a usable one.
// The pages (/kat, /depo, Komuta Merkezi) and the "Ekranlar" editor both read the screen from here.
import { z } from "zod";
import type { IconName } from "@/components/icons/paths";

export const LAYOUT_SCREENS = ["kat", "depo", "komuta"] as const;
export type LayoutScreenKey = (typeof LAYOUT_SCREENS)[number];

/** How the editor's canvas sketches a block. */
export type BlockSketch = "kpis" | "bar" | "banner" | "cards" | "buttons" | "list" | "chips" | "note";

export type BlockItemDef = {
  id: string;
  label: string;
  tone?: "ok" | "warn" | "danger" | "accent";
  /** The window (shell app id) this item opens; the user must be allowed to open it. */
  app?: string;
  icon?: IconName;
  /** Offered in the editor but not on the built-in screen. */
  off?: boolean;
};
export type BlockStyleDef = { id: string; label: string };

/** Half-width blocks that follow each other share a row. */
export const BLOCK_WIDTHS = ["tam", "yarim"] as const;
export type BlockWidth = (typeof BLOCK_WIDTHS)[number];
export const BLOCK_WIDTH_LABELS: Record<BlockWidth, string> = { tam: "Tam genişlik", yarim: "Yarım (yan yana)" };

export const BLOCK_SIZES = ["kucuk", "normal", "buyuk"] as const;
export type BlockSize = (typeof BLOCK_SIZES)[number];
export const BLOCK_SIZE_LABELS: Record<BlockSize, string> = { kucuk: "Küçük", normal: "Normal", buyuk: "Büyük" };
/** CSS `zoom` of a block per size. */
export const BLOCK_SIZE_ZOOM: Record<BlockSize, number> = { kucuk: 0.88, normal: 1, buyuk: 1.15 };

export const BLOCK_TITLE_MAX = 40;

export type BlockDef = {
  id: string;
  label: string;
  description: string;
  sketch: BlockSketch;
  /** The screen cannot work without it: it can be moved and restyled, never hidden. */
  required?: boolean;
  /** Display styles; the first one is the default. */
  styles?: readonly BlockStyleDef[];
  /** Parts of the block that can be hidden and reordered one by one. */
  items?: readonly BlockItemDef[];
  /** Column counts the block's grid can be fixed to; without it the block has no column setting. */
  columns?: readonly number[];
  /** Width on the built-in screen ("tam" when omitted). */
  defaultWidth?: BlockWidth;
};

const QUICK_STYLES = [
  { id: "satir", label: "Düğme satırı" },
  { id: "kutu", label: "Büyük kutular" },
] as const;

export type ScreenLayoutDef = {
  key: LayoutScreenKey;
  title: string;
  /** Where the screen lives; shown in the editor. */
  path: string;
  /** Catalogue screens that open this page: a role landing on one of them lands here. */
  screenCodes: readonly string[];
  device: "tablet" | "pencere";
  blocks: readonly BlockDef[];
};

export const SCREEN_LAYOUT_DEFS: { [K in LayoutScreenKey]: ScreenLayoutDef } = {
  kat: {
    key: "kat",
    title: "Kat Planı (Minibar Garson)",
    path: "/kat",
    screenCodes: ["MB-KAT", "MB-TUK", "MB-PERS", "MB-DND"],
    device: "tablet",
    blocks: [
      {
        id: "ozet",
        label: "Günün özeti",
        description: "Günlük görev sayıları: toplam, tamamlanan, bekleyen, DND, çakışma.",
        sketch: "kpis",
        styles: [
          { id: "kutu", label: "Büyük kutular" },
          { id: "serit", label: "Tek satır şerit" },
        ],
        items: [
          { id: "toplam", label: "Toplam Görev" },
          { id: "tamamlanan", label: "Tamamlanan", tone: "ok" },
          { id: "bekleyen", label: "Bekleyen", tone: "warn" },
          { id: "dnd", label: "DND Bekleyen", tone: "accent" },
          { id: "cakisma", label: "Kritik Çakışma", tone: "danger" },
        ],
        columns: [2, 3, 4, 5],
      },
      {
        id: "ilerleme",
        label: "Tamamlanma oranı",
        description: "Günlük görevlerin yüzde kaçının bittiğini gösteren çubuk.",
        sketch: "bar",
      },
      {
        id: "kritikStok",
        label: "Kritik stok uyarısı",
        description: "Otel deposunda kritik seviyenin altına düşen ürün varsa görünen uyarı bandı.",
        sketch: "banner",
      },
      {
        id: "katlar",
        label: "Kat planı",
        description: "Katların doluluk, giriş/çıkış ve uyarı özetleri; odalara buradan girilir.",
        sketch: "cards",
        required: true,
        styles: [
          { id: "kart", label: "Kartlar" },
          { id: "liste", label: "Sıkı liste" },
        ],
        columns: [1, 2, 3, 4],
      },
    ],
  },
  depo: {
    key: "depo",
    title: "Depo Panosu",
    path: "/depo",
    screenCodes: [],
    device: "tablet",
    blocks: [
      {
        id: "rutin",
        label: "Günlük rutin",
        description: "Kullanıcının bugün yapması beklenen işlerin kartı.",
        sketch: "note",
      },
      {
        id: "kpi",
        label: "Durum göstergeleri",
        description: "Doluluk yükleme, bekleyen talep, kritik stok ve aktif DND sayıları.",
        sketch: "kpis",
        styles: [
          { id: "kutu", label: "Büyük kutular" },
          { id: "serit", label: "Tek satır şerit" },
        ],
        columns: [2, 3, 4],
        items: [
          { id: "doluluk", label: "Doluluk Yükleme" },
          { id: "talep", label: "Bekleyen Talep", tone: "warn" },
          { id: "kritik", label: "Kritik Stok", tone: "danger" },
          { id: "dnd", label: "Aktif DND", tone: "accent" },
        ],
      },
      {
        id: "kartlar",
        label: "Ekran kısayolları",
        description: "Depo ekranlarına giden kartlar. Kullanıcının yetkisi olmayan kart zaten görünmez.",
        sketch: "cards",
        required: true,
        styles: [
          { id: "kart", label: "Kartlar" },
          { id: "liste", label: "Sıkı liste" },
        ],
        columns: [1, 2, 3],
        items: [
          { id: "stok", label: "Minibar Stok & Talepler" },
          { id: "gorevler", label: "Günlük Görevler" },
          { id: "doluluk", label: "Doluluk Excel Yükleme" },
          { id: "raporlar", label: "Minibar Raporları" },
          { id: "tanimlar", label: "Minibar Tanımları" },
          { id: "duzeltme", label: "Geçmiş Kayıt Düzeltme Onayları" },
        ],
      },
    ],
  },
  komuta: {
    key: "komuta",
    title: "Komuta Merkezi",
    path: "/admin",
    screenCodes: ["CR-KOM"],
    device: "pencere",
    blocks: [
      {
        id: "cipler",
        label: "Canlı gösterge çipleri",
        description: "Radar verisinden gelen, tıklanınca ilgili pencereyi açan göstergeler.",
        sketch: "chips",
      },
      {
        id: "kpi",
        label: "Genel sayılar",
        description: "Otel sayısı, çevrimiçi kullanıcı ve bugünkü bildirim.",
        sketch: "kpis",
        columns: [1, 2, 3],
        items: [
          { id: "otel", label: "Otel" },
          { id: "online", label: "Online kullanıcı" },
          { id: "bildirim", label: "Bugünkü bildirim" },
        ],
      },
      {
        id: "radar",
        label: "Canlı Komuta Radarı",
        description: "Doluluk, MyBar talepleri, geciken sipariş ve kasa kuyruğu kartları.",
        sketch: "kpis",
        columns: [1, 2, 3, 4],
        items: [
          { id: "doluluk", label: "Canlı Doluluk" },
          { id: "mybar", label: "MyBar Talepleri", tone: "warn" },
          { id: "geciken", label: "Geciken Sipariş", tone: "danger" },
          { id: "kasa", label: "Açık Kasa Kuyruğu" },
        ],
      },
      {
        id: "hizliOutlet",
        label: "Outlet pencereleri",
        description: "Outlet operasyonunun iç işlevlerini açan düğmeler. Kullanıcının yetkisi olmayan pencere görünmez.",
        sketch: "buttons",
        styles: QUICK_STYLES,
        columns: [2, 3, 4],
        items: [
          { id: "tanim", label: "Outlet & Masa Tanımları", app: "core.outlet-tanim", icon: "building" },
          { id: "menu", label: "Menü Yönetimi", app: "menu.yonetim", icon: "clipboard" },
          { id: "tema", label: "Menü Tasarım Stüdyosu", app: "menu.tema", icon: "palette" },
          { id: "masaqr", label: "Masa QR Kodları", app: "menu.masaqr", icon: "phone" },
          { id: "yazicilar", label: "Yazıcılar", app: "order.yazicilar", icon: "list", off: true },
        ],
      },
      {
        id: "hizliOda",
        label: "Oda Servisi pencereleri",
        description: "Oda servisi operasyonunun iç işlevlerini açan düğmeler. Kullanıcının yetkisi olmayan pencere görünmez.",
        sketch: "buttons",
        styles: QUICK_STYLES,
        columns: [2, 3, 4],
        items: [
          { id: "menu", label: "Oda Servisi Menü Yönetimi", app: "rs.menu", icon: "concierge" },
          { id: "tema", label: "Menü Tasarım Stüdyosu", app: "rs.tema", icon: "palette" },
          { id: "kayitlar", label: "Oda Servisi Kayıtları", app: "rs.kayitlar", icon: "clipboard" },
          { id: "rapor", label: "SLA & Operasyon Raporları", app: "rs.rapor", icon: "trending" },
          { id: "sinirlar", label: "Oda Servisi Sınırları", app: "rs.sinirlar", icon: "settings", off: true },
          { id: "otellerArasi", label: "Oteller Arası Oda Servisi", app: "rs.oteller-arasi", icon: "building", off: true },
          { id: "ayarlar", label: "Oda Servisi Ayarları", app: "rs.ayarlar", icon: "settings", off: true },
        ],
      },
      {
        id: "hizliMinibar",
        label: "Minibar pencereleri",
        description: "Minibar operasyonunun iç işlevlerini açan düğmeler. Kullanıcının yetkisi olmayan pencere görünmez.",
        sketch: "buttons",
        styles: QUICK_STYLES,
        columns: [2, 3, 4],
        items: [
          { id: "kat", label: "Minibar Kat Operasyon", app: "minibar.kat", icon: "minibar" },
          { id: "tanim", label: "Minibar & Setup Tanımları", app: "minibar.tanim", icon: "settings" },
          { id: "stok", label: "Otel Deposu Stoğu", app: "minibar.stok", icon: "box" },
          { id: "doluluk", label: "Excel Doluluk Girişi", app: "minibar.doluluk", icon: "chart" },
          { id: "rapor", label: "Tüketim & Görev Raporları", app: "minibar.rapor", icon: "trending" },
          { id: "odaqr", label: "Oda QR Kodları & Baskı", app: "minibar.odaqr", icon: "phone", tone: "ok" },
          { id: "anormal", label: "Anormal Tüketim Takibi", app: "minibar.rapor", icon: "warning", tone: "danger" },
          { id: "mybar", label: "MyBar Talepleri", app: "minibar.mybar", icon: "phone", off: true },
          { id: "onaylar", label: "Bekleyen Talepler ve Onaylar", app: "minibar.onaylar", icon: "clipboard", off: true },
          { id: "tedarik", label: "Merkez Depo Tedarik", app: "minibar.tedarik", icon: "box", off: true },
        ],
      },
      {
        id: "hizliSistem",
        label: "Sistem & Kullanıcı pencereleri",
        description: "Sistem ve kullanıcı yönetiminin iç işlevlerini açan düğmeler. Kullanıcının yetkisi olmayan pencere görünmez.",
        sketch: "buttons",
        styles: QUICK_STYLES,
        columns: [2, 3, 4],
        items: [
          { id: "tanimlar", label: "Otel & Genel Tanımlamalar", app: "core.tanimlar", icon: "building" },
          { id: "kullanici", label: "Kullanıcı & Rol Yönetimi", app: "core.kullanici", icon: "users" },
          { id: "ekipler", label: "Ekip Yönetimi", app: "core.ekipler", icon: "users" },
          { id: "rapor", label: "Rapor Merkezi", app: "core.rapor", icon: "chart", tone: "accent" },
          { id: "ayarlar", label: "Denetim Masası", app: "core.ayarlar", icon: "monitor" },
          { id: "denetim", label: "Denetim Günlüğü (Audit Log)", app: "core.denetim", icon: "list" },
          { id: "online", label: "Online Kullanıcılar", app: "core.online", icon: "users", off: true },
        ],
      },
      {
        id: "kurulum",
        label: "Kurulum yüzdesi",
        description: "Otellerin kurulum ilerlemesi.",
        sketch: "bar",
      },
      {
        id: "online",
        label: "Otellere göre online",
        description: "Her otelde kaç kullanıcının çevrimiçi olduğu.",
        sketch: "list",
        defaultWidth: "yarim",
      },
      {
        id: "akis",
        label: "Canlı akış",
        description: "Sistemde olan son olayların listesi.",
        sketch: "list",
        defaultWidth: "yarim",
      },
    ],
  },
};

/** The editable page a catalogue screen opens, if it is one. */
export function layoutScreenFor(screenCode: string | null | undefined): LayoutScreenKey | null {
  if (!screenCode) return null;
  return LAYOUT_SCREENS.find((key) => SCREEN_LAYOUT_DEFS[key].screenCodes.includes(screenCode)) ?? null;
}

// --- stored form ----------------------------------------------------------------------------------

const id = z.string().min(1).max(40);
const storedItem = z.object({ id, visible: z.boolean() });
const storedBlock = z.object({
  id,
  visible: z.boolean(),
  style: id.nullish(),
  width: z.enum(BLOCK_WIDTHS).nullish(),
  size: z.enum(BLOCK_SIZES).nullish(),
  columns: z.number().int().min(1).max(8).nullish(),
  title: z.string().max(BLOCK_TITLE_MAX).nullish(),
  items: z.array(storedItem).max(40).optional(),
});
type StoredBlock = z.infer<typeof storedBlock>;
export const storedLayoutSchema = z.object({ blocks: z.array(storedBlock).max(40) });
export type StoredLayout = z.infer<typeof storedLayoutSchema>;

/** Whole settings value: role code → screen → layout. */
export const screenLayoutsSchema = z.object({
  roles: z.record(z.string().min(1).max(20), z.partialRecord(z.enum(LAYOUT_SCREENS), storedLayoutSchema)),
});
export type ScreenLayouts = z.infer<typeof screenLayoutsSchema>;
export const EMPTY_SCREEN_LAYOUTS: ScreenLayouts = { roles: {} };

// --- usable form ----------------------------------------------------------------------------------

export type LayoutItem = { id: string; visible: boolean };
export type LayoutBlock = {
  id: string;
  visible: boolean;
  style: string | null;
  width: BlockWidth;
  size: BlockSize;
  /** Fixed column count of the block's grid; `null` lets the screen decide. */
  columns: number | null;
  /** Heading that replaces the built-in one; `null` keeps it. */
  title: string | null;
  items: LayoutItem[];
};
/** Every block and item of the screen, in display order, hidden ones included. */
export type Layout = { blocks: LayoutBlock[] };

/** Stored order first (unknown ids dropped), then whatever the screen gained since, visible. */
function merge<T extends { id: string }>(defs: readonly T[], stored: readonly { id: string }[] | undefined): T[] {
  const byId = new Map(defs.map((def) => [def.id, def]));
  const out: T[] = [];
  for (const entry of stored ?? []) {
    const def = byId.get(entry.id);
    if (def && !out.includes(def)) out.push(def);
  }
  for (const def of defs) if (!out.includes(def)) out.push(def);
  return out;
}

/** Komuta's single "Hızlı erişim" block became one block per operation: old row id → new block id. */
const LEGACY_QUICK: Record<string, string> = {
  outlet: "hizliOutlet",
  odaServisi: "hizliOda",
  minibar: "hizliMinibar",
  sistem: "hizliSistem",
};

/** A layout saved with the old block keeps its place, its hidden rows and their order. */
function upgrade(key: LayoutScreenKey, blocks: StoredBlock[]): StoredBlock[] {
  if (key !== "komuta") return blocks;
  return blocks.flatMap((block): StoredBlock[] => {
    if (block.id !== "hizli") return [block];
    const rows = merge(Object.keys(LEGACY_QUICK).map((id) => ({ id })), block.items);
    return rows.map((row) => ({
      id: LEGACY_QUICK[row.id]!,
      visible: block.visible && (block.items?.find((i) => i.id === row.id)?.visible ?? true),
    }));
  });
}

/**
 * Repairs a stored layout against the screen's current definition: a layout saved before a block
 * was added, or hand-edited in the database, still yields a complete, valid screen.
 */
export function normalizeLayout(key: LayoutScreenKey, stored?: unknown): Layout {
  const parsed = storedLayoutSchema.safeParse(stored);
  const saved = parsed.success ? upgrade(key, parsed.data.blocks) : [];
  const blocks = merge(SCREEN_LAYOUT_DEFS[key].blocks, saved).map((def): LayoutBlock => {
    const mine = saved.find((b) => b.id === def.id);
    const style = def.styles
      ? (def.styles.find((s) => s.id === mine?.style)?.id ?? def.styles[0]!.id)
      : null;
    const items = merge(def.items ?? [], mine?.items).map((item) => ({
      id: item.id,
      visible: mine?.items?.find((i) => i.id === item.id)?.visible ?? !item.off,
    }));
    // A block whose every part is hidden would be an empty frame: keep the first part.
    if (items.length > 0 && items.every((item) => !item.visible)) items[0]!.visible = true;
    return {
      id: def.id,
      visible: def.required ? true : (mine?.visible ?? true),
      style,
      width: mine?.width ?? def.defaultWidth ?? "tam",
      size: mine?.size ?? "normal",
      columns: mine?.columns && def.columns?.includes(mine.columns) ? mine.columns : null,
      title: mine?.title?.trim() || null,
      items,
    };
  });
  return { blocks };
}

export const defaultLayout = (key: LayoutScreenKey): Layout => normalizeLayout(key);

/** True when the layout is exactly what the screen shows with nothing stored. */
export function isDefaultLayout(key: LayoutScreenKey, layout: Layout): boolean {
  return JSON.stringify(normalizeLayout(key, layout)) === JSON.stringify(defaultLayout(key));
}

/** The layout of one role's screen out of the whole stored value. */
export function layoutFor(all: ScreenLayouts | null | undefined, roleCode: string | undefined, key: LayoutScreenKey): Layout {
  return normalizeLayout(key, roleCode ? all?.roles[roleCode]?.[key] : undefined);
}

// --- what a page asks ---------------------------------------------------------------------------

/** Visible blocks in order. */
export const visibleBlocks = (layout: Layout): LayoutBlock[] => layout.blocks.filter((block) => block.visible);

/** Visible item ids of a block in order (empty when the block is hidden or has no parts). */
export function visibleItems(layout: Layout, blockId: string): string[] {
  const block = layout.blocks.find((b) => b.id === blockId);
  return block?.visible ? block.items.filter((item) => item.visible).map((item) => item.id) : [];
}

export const blockStyle = (layout: Layout, blockId: string): string | null =>
  layout.blocks.find((b) => b.id === blockId)?.style ?? null;

export const blockOf = (layout: Layout, blockId: string): LayoutBlock | undefined =>
  layout.blocks.find((b) => b.id === blockId);

/** Visible blocks as screen rows: two half-width blocks that follow each other share one. */
export function layoutRows(layout: Layout): LayoutBlock[][] {
  const rows: LayoutBlock[][] = [];
  for (const block of visibleBlocks(layout)) {
    const last = rows[rows.length - 1];
    if (block.width === "yarim" && last?.length === 1 && last[0]!.width === "yarim") last.push(block);
    else rows.push([block]);
  }
  return rows;
}

/** Inline style of a block's wrapper for its size (nothing at normal size). */
export const blockZoom = (block: LayoutBlock): { zoom: number } | undefined =>
  block.size === "normal" ? undefined : { zoom: BLOCK_SIZE_ZOOM[block.size] };

/** Inline style that fixes a grid to the block's column count (nothing when the screen decides). */
export const blockColumns = (block: LayoutBlock | undefined): { gridTemplateColumns: string } | undefined =>
  block?.columns ? { gridTemplateColumns: `repeat(${block.columns}, minmax(0, 1fr))` } : undefined;

// --- editor moves ---------------------------------------------------------------------------------

function moved<T>(list: readonly T[], index: number, delta: -1 | 1): T[] {
  const target = index + delta;
  if (index < 0 || target < 0 || target >= list.length) return [...list];
  const next = [...list];
  [next[index], next[target]] = [next[target]!, next[index]!];
  return next;
}

export function moveBlock(layout: Layout, blockId: string, delta: -1 | 1): Layout {
  return { blocks: moved(layout.blocks, layout.blocks.findIndex((b) => b.id === blockId), delta) };
}

const patchBlock = (layout: Layout, blockId: string, patch: (block: LayoutBlock) => LayoutBlock): Layout => ({
  blocks: layout.blocks.map((block) => (block.id === blockId ? patch(block) : block)),
});

export const setBlockVisible = (layout: Layout, blockId: string, visible: boolean): Layout =>
  patchBlock(layout, blockId, (block) => ({ ...block, visible }));

export const setBlockStyle = (layout: Layout, blockId: string, style: string): Layout =>
  patchBlock(layout, blockId, (block) => ({ ...block, style }));

export const setBlockWidth = (layout: Layout, blockId: string, width: BlockWidth): Layout =>
  patchBlock(layout, blockId, (block) => ({ ...block, width }));

export const setBlockSize = (layout: Layout, blockId: string, size: BlockSize): Layout =>
  patchBlock(layout, blockId, (block) => ({ ...block, size }));

export const setBlockColumns = (layout: Layout, blockId: string, columns: number | null): Layout =>
  patchBlock(layout, blockId, (block) => ({ ...block, columns }));

/** The text as typed; saving trims it and an empty title falls back to the built-in heading. */
export const setBlockTitle = (layout: Layout, blockId: string, title: string): Layout =>
  patchBlock(layout, blockId, (block) => ({ ...block, title: title.slice(0, BLOCK_TITLE_MAX) || null }));

export const setItemVisible = (layout: Layout, blockId: string, itemId: string, visible: boolean): Layout =>
  patchBlock(layout, blockId, (block) => ({
    ...block,
    items: block.items.map((item) => (item.id === itemId ? { ...item, visible } : item)),
  }));

export const moveItem = (layout: Layout, blockId: string, itemId: string, delta: -1 | 1): Layout =>
  patchBlock(layout, blockId, (block) => ({
    ...block,
    items: moved(block.items, block.items.findIndex((item) => item.id === itemId), delta),
  }));
