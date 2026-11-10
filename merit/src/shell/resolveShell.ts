/**
 * Tek kabuk karar noktası (spec 4.1). Saf fonksiyon: tarayıcıya ya da oturuma dokunmaz, böylece
 * hem sunucu (`/baslat`) hem istemci (`OpsShell`, `useShellMode`) aynı kararı verir.
 *
 * Sıra: URL sorgusu > cihaz kaydı > kullanıcı tercihi > ekranın doğal bağlamı > görünüm genişliği.
 * İzin verilmeyen bir aday sessizce atlanır; cihaz kaydı ve sorgu yetki vermez (yetkiyi sunucu denetler).
 */

export type ShellKind = "xp" | "personel" | "pos";
export type ShellRoleKind = "SISTEM" | "YONETIM" | "OUTLET" | "MUTFAK" | "MINIBAR";

export type ShellInput = {
  query?: string | null;
  device?: { shell: ShellKind; outletId?: string; kiosk?: boolean } | null;
  preferred?: ShellKind | null;
  screen: { code: string; context: ShellKind };
  roleKind: ShellRoleKind;
  canUsePos: boolean;
  /** `null` = sunucu (genişlik bilinmez); genişlik kuralı atlanır. */
  viewportWidth: number | null;
  /** Bilinmiyorsa (`null`/verilmemiş) yükseklik kuralı atlanır. */
  viewportHeight?: number | null;
};

export type ShellDecision = {
  shell: ShellKind;
  layout: "desktop" | "android" | "standard";
  source: "query" | "device" | "prefs" | "screen" | "viewport";
  allowed: ShellKind[];
};

/** Bu genişliğin altında XP kabuğu Android yönetici kabuğuna (`MobileShell`) geçer. */
export const XP_ANDROID_MAX_WIDTH = 760;
/**
 * Bu yüksekliğin altında da Android kabuğu kalır: yatay çevrilmiş telefon geniştir (812x375) ama XP
 * masaüstü oraya sığmaz. Dizüstü tarayıcı pencereleri (>= 600) bu sınırın üstündedir.
 */
export const XP_ANDROID_MAX_HEIGHT = 500;
/** Bu genişliğin altında POS kabuğu personel kabuğuna geçer (kasayı telefondan açan şef garson). */
export const POS_MIN_WIDTH = 600;

const SHELLS: readonly ShellKind[] = ["xp", "personel", "pos"];

function isShell(value: unknown): value is ShellKind {
  return typeof value === "string" && (SHELLS as readonly string[]).includes(value);
}

/** Rol türüne göre izin verilen kabuklar (spec 4.1 tablosu); ilk öğe o rolün varsayılanıdır. */
export function allowedShells(roleKind: ShellRoleKind, canUsePos: boolean): ShellKind[] {
  switch (roleKind) {
    case "SISTEM":
    case "YONETIM":
      return ["xp", "personel", "pos"];
    case "OUTLET":
      return canUsePos ? ["personel", "pos"] : ["personel"];
    case "MUTFAK":
      return ["pos", "personel"];
    case "MINIBAR":
      return ["personel"];
  }
}

/**
 * `?mod=xp|personel|pos`, `?kabuk=…` (PWA başlangıcı) ve geriye uyum için `?mobil=1` (= personel).
 * Bilinmeyen değer `null`; `mod` önceliklidir.
 */
export function parseShellQuery(params: URLSearchParams): ShellKind | null {
  for (const key of ["mod", "kabuk"]) {
    const value = params.get(key);
    if (isShell(value)) return value;
  }
  return params.get("mobil") === "1" ? "personel" : null;
}

export function resolveShell(input: ShellInput): ShellDecision {
  const allowed = allowedShells(input.roleKind, input.canUsePos);
  const candidates: Array<[ShellDecision["source"], ShellKind | null | undefined]> = [
    ["query", isShell(input.query) ? input.query : null],
    ["device", input.device?.shell],
    ["prefs", input.preferred],
    ["screen", input.screen.context],
  ];

  let shell: ShellKind = allowed[0];
  let source: ShellDecision["source"] = "screen";
  for (const [from, candidate] of candidates) {
    if (candidate && allowed.includes(candidate)) {
      shell = candidate;
      source = from;
      break;
    }
  }

  const width = input.viewportWidth;
  let layout: ShellDecision["layout"] = "standard";
  if (width !== null) {
    if (shell === "pos" && width < POS_MIN_WIDTH && allowed.includes("personel")) {
      shell = "personel";
      source = "viewport";
    }
    if (shell === "xp") {
      const height = input.viewportHeight ?? null;
      const narrow = width < XP_ANDROID_MAX_WIDTH;
      const short = height !== null && height < XP_ANDROID_MAX_HEIGHT;
      layout = narrow || short ? "android" : "desktop";
    }
  }
  return { shell, layout, source, allowed };
}
