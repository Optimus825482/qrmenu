import { prisma } from "@/lib/prisma";
import { getSetting } from "@/lib/settings";

/** Mail templates (`EmailLog.template`). `TEST` bypasses the policy. */
export const MAIL_TEMPLATES = ["GOREV", "SARFIYAT", "YUKLEME_UYARI", "TEST"] as const;
export type MailTemplate = (typeof MAIL_TEMPLATES)[number];

/** `EmailLog.kind` for a template (MAIL_KINDS in reporting/constants). */
export const KIND_OF_TEMPLATE: Record<MailTemplate, string> = {
  GOREV: "RAPOR_GOREV",
  SARFIYAT: "RAPOR_SARFIYAT",
  YUKLEME_UYARI: "UYARI_YUKLEME",
  TEST: "TEST",
};

/** The screen whose `R` (report) permission entitles a user to receive the template. */
export const TEMPLATE_SCREEN: Record<MailTemplate, string> = {
  GOREV: "MB-RAP",
  SARFIYAT: "MB-RAP",
  YUKLEME_UYARI: "MB-RAP",
  TEST: "CR-SYS",
};

export type PolicyResult = { allowed: boolean; reason?: string };

/**
 * Is the hotel allowed to send this template at all? hotel active AND master flag
 * `Hotel.emailNotifyEnabled` AND the per-type hotel flag AND the (hotel→system→false) setting.
 */
export async function mailPolicy(template: MailTemplate, hotelId: string): Promise<PolicyResult> {
  if (template === "TEST") return { allowed: true };
  const hotel = await prisma.hotel.findUnique({
    where: { id: hotelId },
    select: { isActive: true, emailNotifyEnabled: true, emailReportEnabled: true, emailAlertEnabled: true },
  });
  if (!hotel || !hotel.isActive) return { allowed: false, reason: "Otel pasif" };
  if (!hotel.emailNotifyEnabled) return { allowed: false, reason: "Otelde e-posta ana anahtarı kapalı" };
  const report = template !== "YUKLEME_UYARI";
  if (!(report ? hotel.emailReportEnabled : hotel.emailAlertEnabled)) {
    return { allowed: false, reason: report ? "Otelde rapor e-postaları kapalı" : "Otelde uyarı e-postaları kapalı" };
  }
  const on = await getSetting(report ? "email.reportEnabled" : "email.alertEnabled", hotelId);
  if (on !== true) {
    return { allowed: false, reason: report ? "Sistem genelinde rapor e-postaları kapalı" : "Sistem genelinde uyarı e-postaları kapalı" };
  }
  return { allowed: true };
}

export type MailRecipient = { userId: string; email: string; fullName: string };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Users who may receive `template` for `hotelId`: active, not deleted, `emailOptIn`, a valid
 * e-mail, bound to the hotel (`User.hotelId` ∪ `UserHotel`; SISTEM roles reach every hotel) and
 * holding `R` on the template's screen in that hotel (hotel row first, system row second; the
 * screen's module open for the hotel AND the role — same resolution as `rbac.can`). Deduplicated
 * by lower-cased address, ordered by e-mail.
 */
export async function usersEntitledTo(template: MailTemplate, hotelId: string): Promise<MailRecipient[]> {
  const screen = await prisma.appScreen.findFirst({
    where: { code: TEMPLATE_SCREEN[template], isActive: true },
    select: { id: true, moduleKey: true },
  });
  if (!screen) return [];
  const users = await prisma.user.findMany({
    where: {
      isActive: true,
      deletedAt: null,
      emailOptIn: true,
      email: { not: null },
      OR: [{ hotelId }, { userHotels: { some: { hotelId } } }, { role: { kind: "SISTEM" } }],
    },
    select: { id: true, email: true, fullName: true, roleId: true },
    orderBy: { email: "asc" },
  });
  if (users.length === 0) return [];
  const roleIds = [...new Set(users.map((u) => u.roleId))];
  const [perms, access, hotelModule] = await Promise.all([
    prisma.roleScreenPermission.findMany({
      where: { screenId: screen.id, roleId: { in: roleIds }, OR: [{ hotelId }, { hotelId: null }] },
      select: { roleId: true, hotelId: true, canReport: true },
    }),
    screen.moduleKey === "CORE"
      ? Promise.resolve([])
      : prisma.roleModuleAccess.findMany({
          where: { moduleKey: screen.moduleKey, roleId: { in: roleIds }, OR: [{ hotelId }, { hotelId: null }] },
          select: { roleId: true, hotelId: true, enabled: true },
        }),
    screen.moduleKey === "CORE"
      ? Promise.resolve({ enabled: true })
      : prisma.hotelModule.findFirst({ where: { hotelId, moduleKey: screen.moduleKey }, select: { enabled: true } }),
  ]);
  if (hotelModule?.enabled !== true) return [];
  const firstRow = <T extends { roleId: string; hotelId: string | null }>(rows: T[], roleId: string) =>
    rows.find((r) => r.roleId === roleId && r.hotelId === hotelId) ?? rows.find((r) => r.roleId === roleId && r.hotelId === null);
  const entitled = new Set(
    roleIds.filter((id) => {
      if (screen.moduleKey !== "CORE" && firstRow(access, id)?.enabled !== true) return false;
      return firstRow(perms, id)?.canReport === true;
    }),
  );
  const seen = new Set<string>();
  const out: MailRecipient[] = [];
  for (const u of users) {
    const email = u.email?.trim().toLowerCase();
    if (!email || !EMAIL.test(email) || !entitled.has(u.roleId) || seen.has(email)) continue;
    seen.add(email);
    out.push({ userId: u.id, email, fullName: u.fullName });
  }
  return out;
}
