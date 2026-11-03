import { z } from "zod";
import type { ShellKind } from "./resolveShell";

/**
 * Cihaz kaydı: "bu cihaz kasa ekranıdır". Yalnız bir kabuk TERCİHİdir (localStorage): yetki vermez,
 * sunucu her istekte RBAC'i yine denetler. Erişilemeyen ya da bozuk depo `null` döner, hiçbir zaman fırlatmaz
 * (gizli pencere, kapalı site verisi); o durumda varsayılan kabuk kullanılır.
 */
export const DEVICE_KEY = "merit.device";
/** Aynı sekmedeki dinleyiciler için (`storage` olayı yalnız diğer sekmelere gider). */
export const DEVICE_EVENT = "merit:device-changed";

export type DeviceRecord = { shell: ShellKind; outletId?: string; kiosk?: boolean };

const deviceSchema = z.object({
  shell: z.enum(["xp", "personel", "pos"]),
  outletId: z.string().min(1).max(100).optional(),
  kiosk: z.boolean().optional(),
});

/** Ham metinden kayıt; geçersizse `null`. */
export function parseDevice(raw: string | null | undefined): DeviceRecord | null {
  if (!raw) return null;
  try {
    const parsed = deviceSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** Ham depo değeri (abonelik anlık görüntüsü için); erişilemezse boş metin. */
export function readDeviceRaw(): string {
  if (typeof window === "undefined") return "";
  try {
    return window.localStorage.getItem(DEVICE_KEY) ?? "";
  } catch {
    return "";
  }
}

export function readDevice(): DeviceRecord | null {
  return parseDevice(readDeviceRaw());
}

function announce(): void {
  try {
    window.dispatchEvent(new Event(DEVICE_EVENT));
  } catch {
    /* sunucu ya da kısıtlı ortam */
  }
}

/** `true`: kayıt yazıldı. Depo yazılamıyorsa `false` (çağıran kuruluma devam eder, kayıt kalıcı olmaz). */
export function writeDevice(record: DeviceRecord): boolean {
  if (typeof window === "undefined") return false;
  const parsed = deviceSchema.safeParse(record);
  if (!parsed.success) return false;
  try {
    window.localStorage.setItem(DEVICE_KEY, JSON.stringify(parsed.data));
  } catch {
    return false;
  }
  announce();
  return true;
}

export function clearDevice(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(DEVICE_KEY);
  } catch {
    /* erişilemez: kaydı zaten okuyamıyoruz */
  }
  announce();
}
