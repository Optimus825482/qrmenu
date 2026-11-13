import type { JobName } from "../helpers/run-jobs";

/**
 * Traceability map: spec §15 acceptance criterion → evidence. `acceptance` is the dedicated `kNN-*.spec.ts`
 * (empty while the criterion is still open); `supporting` are existing specs that carry the same `@kabul-N` tag;
 * `unit` are the Vitest files that prove the server rules; `jobs` are the scheduled jobs the criterion drives
 * through `tests/e2e/helpers/run-jobs.ts` (never the wall clock). docs/kabul/izlenebilirlik.md renders this table.
 */
export type AcceptanceStatus = "kanıtlı" | "kısmi" | "açık";

export type AcceptanceEntry = {
  n: number;
  title: string;
  /** Dedicated acceptance spec under tests/e2e/acceptance, or null while the criterion is open. */
  acceptance: string | null;
  /** Existing specs (relative to tests/e2e) whose titles carry the criterion's `@kabul-N` tag. */
  supporting: string[];
  unit: string[];
  jobs: JobName[];
  status: AcceptanceStatus;
  /** Which task closes (or owns) the remaining gap. */
  owner?: string;
};

export const ACCEPTANCE_MAP: AcceptanceEntry[] = [
  {
    n: 1,
    title: "3 otel seed'de, silinemez; otel bazlı modül kapatılabilir",
    acceptance: "k01-oteller.spec.ts",
    supporting: ["definitions.spec.ts"],
    unit: ["admin-hotels.test.ts", "seed.test.ts"],
    jobs: [],
    status: "kanıtlı",
  },
  {
    n: 2,
    title: "Yetkisiz ekran/veri erişimi engellenir ve günlüğe yazılır; XP'de yetkisiz simge görünmez",
    acceptance: "k02-yetki.spec.ts",
    supporting: ["shell.spec.ts"],
    unit: ["rbac.test.ts"],
    jobs: [],
    status: "kanıtlı",
  },
  {
    n: 3,
    title: "Oturum: azami süre, uyarı, hareketsizlik, tek cihaz, zorla çıkış; online liste ≤ 2 sn",
    acceptance: "k03-oturum.spec.ts",
    supporting: ["onlineUsers.spec.ts"],
    unit: ["sessionSweeper.test.ts", "sessions.test.ts"],
    jobs: ["session.sweep"],
    status: "kanıtlı",
  },
  {
    n: 4,
    title: "Oda kontrolü: +N → havuz → rapor; setup sınırı; Sarfiyat Yok/DND; 120 dk hatırlatma; gün sonu EKSIK",
    acceptance: "k04-oda-kontrol.spec.ts",
    supporting: ["minibarAcceptance.spec.ts"],
    unit: ["minibar-dnd.test.ts"],
    jobs: ["dnd.recheck", "dnd.endOfDay"],
    status: "kanıtlı",
    owner: "T2",
  },
  {
    n: 5,
    title: "MyBar: günlük tek talep; ≤ 3 sn kat sorumlusunda; eksik kapatma açıklama ister; iptal yalnız depo/yönetim",
    acceptance: "k05-mybar.spec.ts",
    supporting: ["mybarFlow.spec.ts", "mybarGuest.spec.ts"],
    unit: ["mybar-guest-request.test.ts", "mybar-fulfill.test.ts", "mybar-requests.test.ts"],
    jobs: [],
    status: "kanıtlı",
    owner: "T2",
  },
  {
    n: 6,
    title: "Doluluk: 3 dosya yüklenince görevler üretilir; öncelik planı doğru sıralar",
    acceptance: "k06-doluluk.spec.ts",
    supporting: ["minibarAcceptance.spec.ts"],
    unit: ["minibar-occupancy-upload.test.ts", "minibar-occupancy-parse.test.ts"],
    jobs: ["task.generate", "occupancy.cleanup"],
    status: "kanıtlı",
    owner: "T2",
  },
  {
    n: 7,
    title: "QR sipariş: onaysız sipariş KDS/yazıcıya gitmez; fiyat kapalıyken tutar yok; orderingEnabled=false",
    acceptance: "k07-qr-siparis.spec.ts",
    supporting: ["qrOrderAcceptance.spec.ts", "qrOrder.spec.ts"],
    unit: ["guest-order.test.ts"],
    jobs: ["order.escalation", "print.sweep"],
    status: "kanıtlı",
    owner: "T3",
  },
  {
    n: 8,
    title: "Oda servisi: sipariş doğrudan onaya düşer (telefon teyidi yok); durumlar misafir ekranında canlı",
    acceptance: "k08-oda-servisi.spec.ts",
    supporting: ["roomServiceChain.spec.ts", "roomServiceOps.spec.ts", "guestRoomService.spec.ts"],
    unit: ["room-sla.test.ts"],
    jobs: ["rs.sla", "order.escalation"],
    status: "kanıtlı",
    owner: "T3",
  },
  {
    n: 9,
    title: "Göç: satır sayıları ve bakiyeler raporda sıfır fark; eski QR tokenları çalışır",
    acceptance: "k09-goc.spec.ts",
    supporting: [],
    unit: ["migrate-core.test.ts", "migrate-validate.test.ts", "migrate-history.test.ts"],
    jobs: [],
    status: "kanıtlı",
    owner: "T3",
  },
  {
    n: 10,
    title: "Misafir ekranları 5 dilde, AR RTL; XP kabuğu dar ekranda Android görünümüne düşer",
    acceptance: "k10-diller-mobil.spec.ts",
    supporting: ["guestMenu.spec.ts", "guestRoomService.spec.ts", "mobileShell.spec.ts"],
    unit: ["i18n.test.ts"],
    jobs: [],
    status: "kanıtlı",
  },
];
