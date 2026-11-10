import { effectiveViewport, gridPosition, type WindowStore } from "./windowStore";

/** Sürüm yalnız burada, sıralı göçlerin sonunda bir kez yazılır. */
export type ShortcutMigration = { version: number; run: () => void };

type Deps = {
  /** Canlı store durumu (her çağrıda taze okunur; önceki göçlerin eklediği simgeler görünür). */
  state: () => WindowStore;
  /** Kullanıcının görebildiği uygulama kimlikleri. */
  visible: string[];
  /** Temiz masaüstündeki ana klasörler, sırayla. */
  primaryDesktopApps: string[];
};

/**
 * Masaüstü kısayol göçleri. Sürüm numarası artan sırada tutulur; bir kayıtta bulunan sürümden büyük olanlar
 * sırayla çalışır. Kullanıcı bir kısayolu bilerek kaldırdıysa, sürüm yazıldıktan sonra geri gelmez.
 */
export function buildShortcutMigrations({ state, visible, primaryDesktopApps }: Deps): ShortcutMigration[] {
  const addIfMissing = (appId: string) => {
    const s = state();
    if (visible.includes(appId) && !s.icons.some((icon) => icon.appId === appId)) {
      const pos = gridPosition(s.icons.length, effectiveViewport(s));
      s.addIcon(appId, pos.x, pos.y);
    }
  };
  return [
    // Bağımsız kullanıcı penceresi sonradan geldi.
    { version: 1, run: () => addIfMissing("core.kullanici") },
    // Menü Tasarım Merkezi ayrı bir uygulama.
    { version: 2, run: () => addIfMissing("menu.tema") },
    // Ana kategori klasörleriyle sade masaüstü: Komuta Merkezi + klasörler.
    {
      version: 5,
      run: () => {
        const s = state();
        s.setIcons(
          primaryDesktopApps
            .filter((appId) => visible.includes(appId))
            .map((appId, idx) => ({ appId, ...gridPosition(idx, effectiveViewport(s)) })),
        );
      },
    },
    // Operasyon Radarı klasörü sade masaüstünden sonra geldi; sona eklenir, kullanıcı sırası bozulmaz.
    { version: 6, run: () => addIfMissing("folder.radar") },
    // Raporlar masaüstüne doğrudan kısayol olarak geldi (CR-RAP).
    { version: 7, run: () => addIfMissing("core.rapor") },
  ];
}

/**
 * `current` sürümünden büyük göçleri sırayla çalıştırır. Hiçbiri çalışmadıysa null; aksi halde yazılacak
 * son sürüm (store'a bir kez yazması çağıranın işidir).
 */
export function runShortcutMigrations(current: number, migrations: ShortcutMigration[]): number | null {
  let applied: number | null = null;
  for (const m of [...migrations].sort((a, b) => a.version - b.version)) {
    if (current >= m.version) continue;
    m.run();
    applied = m.version;
  }
  return applied;
}
