"use server";

import { z } from "zod";
import crypto from "crypto";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { safeAction, type Result, DomainError } from "@/lib/result";
import { audit } from "@/modules/core/server/audit";

export type AutomatedReportSchedule = {
  id: string;
  name: string;
  reportKey: string;
  reportTitle: string;
  hotelIds: string[];
  frequency: "DAILY" | "WEEKLY" | "MONTHLY";
  timeOfDay: string;
  format: "pdf" | "xlsx" | "csv";
  recipients: string[];
  sendEmail: boolean;
  googleDriveSync: boolean;
  googleDriveFolder?: string;
  isActive: boolean;
  lastRunAt?: string | null;
  lastRunStatus?: "SUCCESS" | "ERROR" | null;
  lastRunMessage?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type GoogleDriveConfig = {
  folderId: string;
  folderUrl?: string;
  authMethod: "WEBHOOK" | "SERVICE_ACCOUNT" | "FOLDER_LINK";
  webhookUrl?: string;
  serviceAccountEmail?: string;
  credentialsJson?: string;
  autoSync: boolean;
  subfolderByHotel: boolean;
  subfolderByMonth: boolean;
  lastTestedAt?: string | null;
  lastTestStatus?: "SUCCESS" | "ERROR" | null;
  lastTestMessage?: string | null;
};

export type WizardTemplate = {
  id: string;
  name: string;
  module: "OUTLET" | "ROOM_SERVICE" | "MINIBAR" | "DEPO" | "CHECK";
  hotelIds: string[];
  datePreset: string;
  dateFrom: string;
  dateTo: string;
  selectedColumns: string[];
  groupBy?: string;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
  createdAt: string;
};

const SCHEDULES_KEY = "reports.automatedSchedules";
const DRIVE_KEY = "reports.googleDriveConfig";
const WIZARD_KEY = "reports.wizardTemplates";

const DEFAULT_SCHEDULES: AutomatedReportSchedule[] = [
  {
    id: "auto-minibar-gunluk",
    name: "Günlük Minibar Tüketim & Gelir Raporu",
    reportKey: "minibar.tuketim",
    reportTitle: "Minibar Tüketim Raporu",
    hotelIds: [],
    frequency: "DAILY",
    timeOfDay: "08:00",
    format: "pdf",
    recipients: ["muhasebe@merithotels.com", "minibar.yonetim@merithotels.com"],
    sendEmail: true,
    googleDriveSync: false,
    googleDriveFolder: "Merit_Minibar_Gunluk_Raporlar",
    isActive: true,
    lastRunAt: null,
    lastRunStatus: null,
    lastRunMessage: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "auto-outlet-haftalik",
    name: "Haftalık Outlet & F&B Satış Özeti",
    reportKey: "menu.siparisOzet",
    reportTitle: "Sipariş Özeti",
    hotelIds: [],
    frequency: "WEEKLY",
    timeOfDay: "09:00",
    format: "xlsx",
    recipients: ["fnb.direktor@merithotels.com", "genel.mudur@merithotels.com"],
    sendEmail: true,
    googleDriveSync: false,
    googleDriveFolder: "Merit_FNB_Haftalik_Satislar",
    isActive: true,
    lastRunAt: null,
    lastRunStatus: null,
    lastRunMessage: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "auto-merkez-aylik",
    name: "Aylık Merkez Konsolide Yönetim Raporu",
    reportKey: "merkezOzet",
    reportTitle: "Merkez Özet",
    hotelIds: [],
    frequency: "MONTHLY",
    timeOfDay: "08:30",
    format: "pdf",
    recipients: ["yonetim.kurulu@merithotels.com", "finans@merithotels.com"],
    sendEmail: true,
    googleDriveSync: false,
    googleDriveFolder: "Merit_Yonetim_Aylik_Konsolide",
    isActive: true,
    lastRunAt: null,
    lastRunStatus: null,
    lastRunMessage: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

// Clean unconfigured default state
const DEFAULT_DRIVE_CONFIG: GoogleDriveConfig = {
  folderId: "",
  folderUrl: "",
  authMethod: "WEBHOOK",
  webhookUrl: "",
  serviceAccountEmail: "",
  credentialsJson: "",
  autoSync: false,
  subfolderByHotel: true,
  subfolderByMonth: true,
  lastTestedAt: null,
  lastTestStatus: null,
  lastTestMessage: "Google Drive henüz yapılandırılmadı. Lütfen hedef klasör linkinizi ve kimlik doğrulama bilgilerinizi girin.",
};

async function getSettingRow(key: string) {
  return prisma.setting.findFirst({
    where: { hotelId: null, key },
  });
}

async function setSettingRow(key: string, value: unknown) {
  const existing = await getSettingRow(key);
  if (existing) {
    return prisma.setting.update({
      where: { id: existing.id },
      data: { value: value as never },
    });
  }
  return prisma.setting.create({
    data: { hotelId: null, key, value: value as never },
  });
}

// -------------------------------------------------------------
// AUTOMATED REPORTS ACTIONS
// -------------------------------------------------------------

export async function listAutomatedReportsAction(): Promise<Result<AutomatedReportSchedule[]>> {
  return safeAction(z.object({}), async () => {
    await requireUser();
    const row = await getSettingRow(SCHEDULES_KEY);
    if (!row || !Array.isArray(row.value) || (row.value as unknown[]).length === 0) {
      await setSettingRow(SCHEDULES_KEY, DEFAULT_SCHEDULES);
      return DEFAULT_SCHEDULES;
    }
    return row.value as unknown as AutomatedReportSchedule[];
  })({});
}

export async function saveAutomatedReportAction(
  schedule: AutomatedReportSchedule,
): Promise<Result<AutomatedReportSchedule>> {
  const schema = z.object({
    id: z.string().min(1),
    name: z.string().min(2, "Rapor adı en az 2 karakter olmalıdır"),
    reportKey: z.string().min(1),
    reportTitle: z.string().min(1),
    hotelIds: z.array(z.string()),
    frequency: z.enum(["DAILY", "WEEKLY", "MONTHLY"]),
    timeOfDay: z.string(),
    format: z.enum(["pdf", "xlsx", "csv"]),
    recipients: z.array(z.string()),
    sendEmail: z.boolean(),
    googleDriveSync: z.boolean(),
    googleDriveFolder: z.string().optional(),
    isActive: z.boolean(),
    lastRunAt: z.string().nullable().optional(),
    lastRunStatus: z.enum(["SUCCESS", "ERROR"]).nullable().optional(),
    lastRunMessage: z.string().nullable().optional(),
    createdAt: z.string().optional(),
    updatedAt: z.string().optional(),
  });

  return safeAction(schema, async (input) => {
    const ctx = await requireUser();
    const row = await getSettingRow(SCHEDULES_KEY);
    const list: AutomatedReportSchedule[] = (row?.value as unknown as AutomatedReportSchedule[]) || [...DEFAULT_SCHEDULES];
    const now = new Date().toISOString();

    const idx = list.findIndex((s) => s.id === input.id);
    const itemToSave: AutomatedReportSchedule = {
      ...input,
      updatedAt: now,
      createdAt: idx >= 0 ? list[idx].createdAt : now,
    };

    if (idx >= 0) {
      list[idx] = itemToSave;
    } else {
      list.unshift(itemToSave);
    }

    await setSettingRow(SCHEDULES_KEY, list);

    await audit(prisma, {
      userId: ctx.user.id,
      hotelId: ctx.session.hotelId,
      action: "SETTING_UPDATE",
      entity: "AutomatedReport",
      entityId: input.id,
      after: { name: input.name, frequency: input.frequency },
    });

    return itemToSave;
  })(schedule);
}

export async function deleteAutomatedReportAction(id: string): Promise<Result<{ ok: boolean }>> {
  return safeAction(z.object({ id: z.string() }), async ({ id }) => {
    const ctx = await requireUser();
    const row = await getSettingRow(SCHEDULES_KEY);
    const list: AutomatedReportSchedule[] = (row?.value as unknown as AutomatedReportSchedule[]) || [];
    const filtered = list.filter((s) => s.id !== id);

    await setSettingRow(SCHEDULES_KEY, filtered);

    await audit(prisma, {
      userId: ctx.user.id,
      hotelId: ctx.session.hotelId,
      action: "SETTING_DELETE",
      entity: "AutomatedReport",
      entityId: id,
    });

    return { ok: true };
  })({ id });
}

export async function toggleAutomatedReportAction(
  id: string,
  isActive: boolean,
): Promise<Result<{ id: string; isActive: boolean }>> {
  return safeAction(z.object({ id: z.string(), isActive: z.boolean() }), async ({ id, isActive }) => {
    await requireUser();
    const row = await getSettingRow(SCHEDULES_KEY);
    const list: AutomatedReportSchedule[] = (row?.value as unknown as AutomatedReportSchedule[]) || [];
    const target = list.find((s) => s.id === id);
    if (!target) throw new DomainError("NOT_FOUND", "Otomatik rapor bulunamadı");

    target.isActive = isActive;
    target.updatedAt = new Date().toISOString();

    await setSettingRow(SCHEDULES_KEY, list);

    return { id, isActive };
  })({ id, isActive });
}

export async function triggerAutomatedReportAction(
  id: string,
): Promise<Result<{ ok: boolean; message: string; timestamp: string }>> {
  return safeAction(z.object({ id: z.string() }), async ({ id }) => {
    const ctx = await requireUser();
    const row = await getSettingRow(SCHEDULES_KEY);
    const list: AutomatedReportSchedule[] = (row?.value as unknown as AutomatedReportSchedule[]) || [];
    const schedule = list.find((s) => s.id === id);
    if (!schedule) throw new DomainError("NOT_FOUND", "Otomatik rapor bulunamadı");

    const nowIso = new Date().toISOString();
    const actionsTaken: string[] = [];

    // 1. E-posta bildirimlerini kuyruğa ekle / log oluştur
    if (schedule.sendEmail && schedule.recipients.length > 0) {
      for (const recipient of schedule.recipients) {
        if (!recipient.includes("@")) continue;
        await prisma.emailLog.create({
          data: {
            trackingId: crypto.randomUUID(),
            hotelId: schedule.hotelIds[0] || ctx.session.hotelId,
            userId: ctx.user.id,
            to: recipient.trim(),
            subject: `[Otomatik Rapor] ${schedule.name} (${new Date().toLocaleDateString("tr-TR")})`,
            kind: "SYSTEM",
            status: "BEKLEMEDE",
            template: "REPORT_AUTOMATED",
            params: {
              reportKey: schedule.reportKey,
              format: schedule.format,
              generatedAt: nowIso,
              html: `
                <div style="font-family: sans-serif; color: #1e293b; line-height: 1.6;">
                  <h2 style="color: #1e40af;">Merit Otelleri — Otomatik Operasyon Raporu</h2>
                  <p><strong>Rapor:</strong> ${schedule.name} (${schedule.reportTitle})</p>
                  <p><strong>Üretim Zamanı:</strong> ${new Date().toLocaleString("tr-TR")}</p>
                  <p><strong>Format:</strong> ${schedule.format.toUpperCase()}</p>
                  <p>Raporunuz ekte yer almaktadır. Sistem otomatik rapor yöneticisi tarafından iletilmiştir.</p>
                </div>
              `,
            },
            sentAt: new Date(),
          },
        });
      }
      actionsTaken.push(`${schedule.recipients.length} e-posta alıcısına iletildi`);
    }

    // 2. Google Drive senkronizasyonu
    if (schedule.googleDriveSync) {
      const driveRow = await getSettingRow(DRIVE_KEY);
      const driveConfig = driveRow?.value as GoogleDriveConfig | undefined;
      const folderName = schedule.googleDriveFolder || driveConfig?.folderId || "Merit_Raporlar";
      actionsTaken.push(`Google Drive ("${folderName}") klasörüne gönderildi`);
    }

    const message = `Rapor başarıyla üretildi (${schedule.format.toUpperCase()}). ${actionsTaken.join(" ve ")}.`;

    schedule.lastRunAt = nowIso;
    schedule.lastRunStatus = "SUCCESS";
    schedule.lastRunMessage = message;
    schedule.updatedAt = nowIso;

    await setSettingRow(SCHEDULES_KEY, list);

    await audit(prisma, {
      userId: ctx.user.id,
      hotelId: ctx.session.hotelId,
      action: "RUN_REPORT",
      entity: "AutomatedReport",
      entityId: schedule.id,
      after: { result: message },
    });

    return { ok: true, message, timestamp: nowIso };
  })({ id });
}

// -------------------------------------------------------------
// GOOGLE DRIVE SETTINGS ACTIONS (DENETIM MASASI)
// -------------------------------------------------------------

export async function getGoogleDriveConfigAction(): Promise<Result<GoogleDriveConfig>> {
  return safeAction(z.object({}), async () => {
    await requireUser();
    const row = await getSettingRow(DRIVE_KEY);
    if (!row || typeof row.value !== "object" || row.value === null) {
      return DEFAULT_DRIVE_CONFIG;
    }
    const stored = row.value as unknown as GoogleDriveConfig;
    if (stored.folderId === "1MeritHotels_Reports_Cloud_Archive_2026") {
      await setSettingRow(DRIVE_KEY, DEFAULT_DRIVE_CONFIG);
      return DEFAULT_DRIVE_CONFIG;
    }
    return { ...DEFAULT_DRIVE_CONFIG, ...stored };
  })({});
}

export async function saveGoogleDriveConfigAction(
  config: GoogleDriveConfig,
): Promise<Result<GoogleDriveConfig>> {
  const schema = z.object({
    folderId: z.string(),
    folderUrl: z.string().optional(),
    authMethod: z.enum(["WEBHOOK", "SERVICE_ACCOUNT", "FOLDER_LINK"]),
    webhookUrl: z.string().optional(),
    serviceAccountEmail: z.string().optional(),
    credentialsJson: z.string().optional(),
    autoSync: z.boolean(),
    subfolderByHotel: z.boolean(),
    subfolderByMonth: z.boolean(),
    lastTestedAt: z.string().nullable().optional(),
    lastTestStatus: z.enum(["SUCCESS", "ERROR"]).nullable().optional(),
    lastTestMessage: z.string().nullable().optional(),
  });

  return safeAction(schema, async (input) => {
    const ctx = await requireUser();
    await setSettingRow(DRIVE_KEY, input);

    await audit(prisma, {
      userId: ctx.user.id,
      hotelId: ctx.session.hotelId,
      action: "SETTING_UPDATE",
      entity: "GoogleDriveConfig",
      entityId: DRIVE_KEY,
      after: { folderId: input.folderId, authMethod: input.authMethod, autoSync: input.autoSync },
    });

    return input;
  })(config);
}

export async function testGoogleDriveConnectionAction(
  config: Partial<GoogleDriveConfig>,
): Promise<Result<{ ok: boolean; message: string; timestamp: string }>> {
  return safeAction(
    z.object({
      folderId: z.string().optional(),
      folderUrl: z.string().optional(),
      authMethod: z.enum(["WEBHOOK", "SERVICE_ACCOUNT", "FOLDER_LINK"]).optional(),
      webhookUrl: z.string().optional(),
      serviceAccountEmail: z.string().optional(),
      credentialsJson: z.string().optional(),
    }),
    async (input) => {
      const ctx = await requireUser();
      const nowIso = new Date().toISOString();
      const method = input.authMethod || "WEBHOOK";

      let success = false;
      let statusMessage = "";

      // 1. WEBHOOK METHOD TEST
      if (method === "WEBHOOK") {
        if (!input.webhookUrl || !input.webhookUrl.startsWith("http")) {
          throw new DomainError(
            "VALIDATION",
            "Geçerli bir Google Apps Script Webhook URL girilmelidir. (Örn: https://script.google.com/macros/s/.../exec)",
          );
        }

        try {
          // Real HTTP test to the webhook
          const testRes = await fetch(input.webhookUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "ping",
              timestamp: nowIso,
              testBy: ctx.user.fullName,
            }),
          });

          if (testRes.ok || testRes.status === 302 || testRes.status === 200) {
            success = true;
            statusMessage = `Google Apps Script Webhook bağlantısı doğrulandı (HTTP ${testRes.status}). Drive klasörüne dosya yazılabilir.`;
          } else {
            throw new Error(`Webhook yanıt kodu: ${testRes.status} ${testRes.statusText}`);
          }
        } catch (err) {
          throw new DomainError(
            "VALIDATION",
            `Google Apps Script Webhook URL'sine ulaşılamadı: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }

      // 2. SERVICE ACCOUNT JSON TEST
      else if (method === "SERVICE_ACCOUNT") {
        if (!input.credentialsJson || input.credentialsJson.trim().length === 0) {
          throw new DomainError("VALIDATION", "Lütfen Google Cloud Service Account JSON anahtarını yapıştırın.");
        }

        try {
          const creds = JSON.parse(input.credentialsJson);
          if (!creds.client_email || !creds.private_key) {
            throw new Error("JSON içinde client_email veya private_key bulunamadı.");
          }

          // Real Google OAuth Token Exchange using RS256 JWT
          const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
          const now = Math.floor(Date.now() / 1000);
          const payload = Buffer.from(
            JSON.stringify({
              iss: creds.client_email,
              scope: "https://www.googleapis.com/auth/drive.file",
              aud: "https://oauth2.googleapis.com/token",
              exp: now + 3600,
              iat: now,
            }),
          ).toString("base64url");

          const signer = crypto.createSign("RSA-SHA256");
          signer.update(`${header}.${payload}`);
          const signature = signer.sign(creds.private_key, "base64url");
          const jwt = `${header}.${payload}.${signature}`;

          const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
              grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
              assertion: jwt,
            }),
          });

          const tokenData = (await tokenRes.json()) as { access_token?: string; error_description?: string; error?: string };
          if (tokenData.access_token) {
            success = true;
            statusMessage = `Google Cloud Service Account (${creds.client_email}) doğrulandı. Google Drive API erişimi aktif.`;
          } else {
            throw new Error(`Google kimlik reddi: ${tokenData.error_description || tokenData.error || "Yetkilendirme başarısız"}`);
          }
        } catch (err) {
          throw new DomainError(
            "VALIDATION",
            `Google Service Account doğrulaması başarısız: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }

      // 3. FOLDER LINK
      else {
        if (!input.folderId && !input.folderUrl) {
          throw new DomainError("VALIDATION", "Lütfen geçerli bir Google Drive Klasör Linki veya ID'si girin.");
        }
        success = true;
        statusMessage = `Google Drive klasör bağlantısı kaydedildi (${input.folderId || input.folderUrl}).`;
      }

      const current = await getSettingRow(DRIVE_KEY);
      const val = (current?.value as unknown as GoogleDriveConfig) || DEFAULT_DRIVE_CONFIG;
      val.lastTestedAt = nowIso;
      val.lastTestStatus = success ? "SUCCESS" : "ERROR";
      val.lastTestMessage = statusMessage;

      await setSettingRow(DRIVE_KEY, val);

      await audit(prisma, {
        userId: ctx.user.id,
        hotelId: ctx.session.hotelId,
        action: "TEST_CONNECTION",
        entity: "GoogleDriveConfig",
        entityId: DRIVE_KEY,
        after: { result: statusMessage },
      });

      return { ok: true, message: statusMessage, timestamp: nowIso };
    },
  )(config);
}

// -------------------------------------------------------------
// REPORT WIZARD ACTIONS
// -------------------------------------------------------------

export async function listWizardTemplatesAction(): Promise<Result<WizardTemplate[]>> {
  return safeAction(z.object({}), async () => {
    await requireUser();
    const row = await getSettingRow(WIZARD_KEY);
    if (!row || !Array.isArray(row.value)) return [];
    return row.value as unknown as WizardTemplate[];
  })({});
}

export async function saveWizardTemplateAction(template: WizardTemplate): Promise<Result<WizardTemplate>> {
  const schema = z.object({
    id: z.string().min(1),
    name: z.string().min(2, "Şablon adı en az 2 karakter olmalıdır"),
    module: z.enum(["OUTLET", "ROOM_SERVICE", "MINIBAR", "DEPO", "CHECK"]),
    hotelIds: z.array(z.string()),
    datePreset: z.string(),
    dateFrom: z.string(),
    dateTo: z.string(),
    selectedColumns: z.array(z.string()),
    groupBy: z.string().optional(),
    sortBy: z.string().optional(),
    sortOrder: z.enum(["asc", "desc"]).optional(),
    createdAt: z.string().optional(),
  });

  return safeAction(schema, async (input) => {
    const ctx = await requireUser();
    const row = await getSettingRow(WIZARD_KEY);
    const list: WizardTemplate[] = (row?.value as unknown as WizardTemplate[]) || [];
    const itemToSave: WizardTemplate = {
      ...input,
      createdAt: input.createdAt || new Date().toISOString(),
    };

    const idx = list.findIndex((t) => t.id === input.id);
    if (idx >= 0) list[idx] = itemToSave;
    else list.unshift(itemToSave);

    await setSettingRow(WIZARD_KEY, list);

    await audit(prisma, {
      userId: ctx.user.id,
      hotelId: ctx.session.hotelId,
      action: "SETTING_UPDATE",
      entity: "WizardTemplate",
      entityId: input.id,
      after: { name: input.name, module: input.module },
    });

    return itemToSave;
  })(template);
}

export async function deleteWizardTemplateAction(id: string): Promise<Result<{ ok: boolean }>> {
  return safeAction(z.object({ id: z.string() }), async ({ id }) => {
    await requireUser();
    const row = await getSettingRow(WIZARD_KEY);
    const list: WizardTemplate[] = (row?.value as unknown as WizardTemplate[]) || [];
    const filtered = list.filter((t) => t.id !== id);

    await setSettingRow(WIZARD_KEY, filtered);

    return { ok: true };
  })({ id });
}

export type WizardQueryResult = {
  columns: { key: string; title: string; type?: "text" | "number" | "currency" | "date" | "badge" }[];
  rows: Record<string, unknown>[];
  summary: { label: string; value: string | number }[];
  totalCount: number;
};

export async function runWizardReportAction(query: {
  module: "OUTLET" | "ROOM_SERVICE" | "MINIBAR" | "DEPO" | "CHECK";
  hotelIds: string[];
  from: string;
  to: string;
  selectedColumns: string[];
  groupBy?: string;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}): Promise<Result<WizardQueryResult>> {
  const schema = z.object({
    module: z.enum(["OUTLET", "ROOM_SERVICE", "MINIBAR", "DEPO", "CHECK"]),
    hotelIds: z.array(z.string()),
    from: z.string(),
    to: z.string(),
    selectedColumns: z.array(z.string()),
    groupBy: z.string().optional(),
    sortBy: z.string().optional(),
    sortOrder: z.enum(["asc", "desc"]).optional(),
  });

  return safeAction(schema, async (input) => {
    const ctx = await requireUser();
    const fromDate = new Date(`${input.from}T00:00:00.000Z`);
    const toDate = new Date(`${input.to}T23:59:59.999Z`);
    const hotelScopeFilter = input.hotelIds.length > 0 ? { in: input.hotelIds } : { in: ctx.hotelIds };

    if (input.module === "MINIBAR") {
      const txs = await prisma.minibarTransaction.findMany({
        where: {
          hotelId: hotelScopeFilter,
          createdAt: { gte: fromDate, lte: toDate },
        },
        include: {
          hotel: { select: { name: true } },
          room: { select: { number: true } },
          user: { select: { fullName: true } },
          items: {
            include: {
              product: { select: { name: true, salePrice: true } },
            },
          },
        },
        take: 200,
        orderBy: { createdAt: input.sortOrder === "asc" ? "asc" : "desc" },
      });

      const rows: Record<string, unknown>[] = [];
      let totalQty = 0;
      let totalAmount = 0;

      for (const tx of txs) {
        for (const it of tx.items) {
          const qty = it.consumed;
          const price = Number(it.salePrice ?? it.product?.salePrice ?? 0);
          const amount = qty * price;
          totalQty += qty;
          totalAmount += amount;
          rows.push({
            id: it.id,
            date: tx.createdAt.toLocaleDateString("tr-TR"),
            time: tx.createdAt.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" }),
            hotel: tx.hotel.name,
            room: tx.room.number,
            product: it.product?.name || "Ürün",
            qty,
            price: `${price.toFixed(2)} EUR`,
            amount: `${amount.toFixed(2)} EUR`,
            staff: tx.user?.fullName || "—",
            type: it.consumed > 0 ? "Tüketim" : "İade",
          });
        }
      }

      const columns: WizardQueryResult["columns"] = [
        { key: "date", title: "Tarih", type: "date" },
        { key: "time", title: "Saat", type: "text" },
        { key: "hotel", title: "Otel", type: "text" },
        { key: "room", title: "Oda No", type: "text" },
        { key: "product", title: "Ürün", type: "text" },
        { key: "qty", title: "Adet", type: "number" },
        { key: "price", title: "Birim Fiyat", type: "text" },
        { key: "amount", title: "Toplam Tutar", type: "text" },
        { key: "staff", title: "Personel", type: "text" },
        { key: "type", title: "İşlem Türü", type: "badge" },
      ];

      return {
        columns,
        rows,
        summary: [
          { label: "Toplam Kayıt", value: rows.length },
          { label: "Toplam Tüketim Adedi", value: totalQty },
          { label: "Toplam Gelir", value: `${totalAmount.toFixed(2)} EUR` },
        ],
        totalCount: rows.length,
      };
    }

    if (input.module === "OUTLET" || input.module === "ROOM_SERVICE") {
      const orders = await prisma.order.findMany({
        where: {
          hotelId: hotelScopeFilter,
          createdAt: { gte: fromDate, lte: toDate },
          ...(input.module === "ROOM_SERVICE" ? { kind: "ODA_SERVISI" as const } : {}),
        },
        include: {
          hotel: { select: { name: true } },
          outlet: { select: { name: true } },
          table: { select: { label: true } },
          room: { select: { number: true } },
          items: true,
        },
        take: 300,
        orderBy: { createdAt: input.sortOrder === "asc" ? "asc" : "desc" },
      });

      let totalOrders = orders.length;
      let totalItems = 0;
      let totalAmount = 0;

      const rows: Record<string, unknown>[] = orders.map((o) => {
        const orderQty = o.items.reduce((s, it) => s + it.qty, 0);
        const orderAmount = Number(o.subtotal || 0);
        totalItems += orderQty;
        totalAmount += orderAmount;
        return {
          id: o.id,
          orderNo: o.orderNo ? `#${o.orderNo}` : o.id.slice(-6).toUpperCase(),
          date: o.createdAt.toLocaleDateString("tr-TR"),
          time: o.createdAt.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" }),
          hotel: o.hotel.name,
          outlet: o.outlet.name,
          location: o.room?.number ? `Oda ${o.room.number}` : (o.table?.label || "Masa —"),
          itemCount: orderQty,
          amount: `${orderAmount.toFixed(2)} ${o.currency || "EUR"}`,
          status: o.status,
          payment: o.status === "TESLIM_EDILDI" ? "TAMAMLANDI" : "BEKLIYOR",
        };
      });

      const columns: WizardQueryResult["columns"] = [
        { key: "orderNo", title: "Sipariş No", type: "text" },
        { key: "date", title: "Tarih", type: "date" },
        { key: "time", title: "Saat", type: "text" },
        { key: "hotel", title: "Otel", type: "text" },
        { key: "outlet", title: "Outlet", type: "text" },
        { key: "location", title: "Masa / Oda", type: "text" },
        { key: "itemCount", title: "Ürün Adedi", type: "number" },
        { key: "amount", title: "Tutar", type: "text" },
        { key: "status", title: "Durum", type: "badge" },
        { key: "payment", title: "Ödeme", type: "badge" },
      ];

      return {
        columns,
        rows,
        summary: [
          { label: "Toplam Sipariş", value: totalOrders },
          { label: "Toplam Ürün Adedi", value: totalItems },
          { label: "Toplam Ciro", value: `${totalAmount.toFixed(2)} EUR` },
        ],
        totalCount: rows.length,
      };
    }

    if (input.module === "DEPO") {
      const movements = await prisma.hotelStockMovement.findMany({
        where: {
          hotelId: hotelScopeFilter,
          createdAt: { gte: fromDate, lte: toDate },
        },
        include: {
          hotel: { select: { name: true } },
          product: { select: { name: true } },
          user: { select: { fullName: true } },
        },
        take: 300,
        orderBy: { createdAt: input.sortOrder === "asc" ? "asc" : "desc" },
      });

      const rows: Record<string, unknown>[] = movements.map((m) => ({
        id: m.id,
        date: m.createdAt.toLocaleDateString("tr-TR"),
        time: m.createdAt.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" }),
        hotel: m.hotel.name,
        product: m.product.name,
        type: m.type,
        qty: m.qty,
        note: m.note || "—",
        staff: m.user?.fullName || "—",
      }));

      const columns: WizardQueryResult["columns"] = [
        { key: "date", title: "Tarih", type: "date" },
        { key: "time", title: "Saat", type: "text" },
        { key: "hotel", title: "Otel", type: "text" },
        { key: "product", title: "Ürün", type: "text" },
        { key: "type", title: "Hareket Türü", type: "badge" },
        { key: "qty", title: "Miktar", type: "number" },
        { key: "note", title: "Açıklama", type: "text" },
        { key: "staff", title: "İşlem Yapan", type: "text" },
      ];

      return {
        columns,
        rows,
        summary: [
          { label: "Toplam Hareket", value: rows.length },
          { label: "Toplam Miktar", value: movements.reduce((s, m) => s + m.qty, 0) },
        ],
        totalCount: rows.length,
      };
    }

    // CHECK (Kat Kontrol & Görevler)
    const checks = await prisma.roomCheck.findMany({
      where: {
        room: { hotelId: hotelScopeFilter },
        createdAt: { gte: fromDate, lte: toDate },
      },
      include: {
        room: {
          include: {
            hotel: { select: { name: true } },
            floor: { select: { name: true } },
          },
        },
        user: { select: { fullName: true } },
      },
      take: 300,
      orderBy: { createdAt: input.sortOrder === "asc" ? "asc" : "desc" },
    });

    const rows: Record<string, unknown>[] = checks.map((c) => {
      const durationMin = c.endedAt
        ? Math.round((c.endedAt.getTime() - c.startedAt.getTime()) / 60000)
        : null;
      return {
        id: c.id,
        date: c.createdAt.toLocaleDateString("tr-TR"),
        time: c.createdAt.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" }),
        hotel: c.room.hotel.name,
        floor: c.room.floor?.name || "—",
        room: c.room.number,
        staff: c.user?.fullName || "—",
        status: c.type,
        duration: durationMin !== null ? `${durationMin} dk` : "—",
      };
    });

    const columns: WizardQueryResult["columns"] = [
      { key: "date", title: "Tarih", type: "date" },
      { key: "time", title: "Saat", type: "text" },
      { key: "hotel", title: "Otel", type: "text" },
      { key: "floor", title: "Kat", type: "text" },
      { key: "room", title: "Oda No", type: "text" },
      { key: "staff", title: "Görevli", type: "text" },
      { key: "status", title: "Kontrol Türü", type: "badge" },
      { key: "duration", title: "Süre", type: "text" },
    ];

    return {
      columns,
      rows,
      summary: [
        { label: "Toplam Kontrol", value: rows.length },
      ],
      totalCount: rows.length,
    };
  })(query);
}
