import { getHeapStatistics } from "node:v8";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { getSetting } from "@/lib/settings";
import { isMailConfigured, sendMail } from "@/lib/mailer";
import type {
  DiagnosticIncidentData,
  DiagnosticIncidentRow,
  DiagnosticModule,
  DiagnosticProbeResult,
  DiagnosticSeverity,
  SystemHealthReport,
  SystemMemoryStats,
} from "./types";

const DIAGNOSTIC_ACTION = "DIAGNOSTIC_INCIDENT";
const DIAGNOSTIC_ENTITY = "SystemDiagnostic";

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const parts: string[] = [];
  if (d > 0) parts.push(`${d}g`);
  if (h > 0 || d > 0) parts.push(`${h}sa`);
  if (m > 0 || h > 0 || d > 0) parts.push(`${m}dk`);
  parts.push(`${s}sn`);
  return parts.join(" ");
}

export function getMemoryStats(): SystemMemoryStats {
  const mem = process.memoryUsage();
  const rssMb = Math.round((mem.rss / 1024 / 1024) * 10) / 10;
  const heapUsedMb = Math.round((mem.heapUsed / 1024 / 1024) * 10) / 10;
  const heapTotalMb = Math.round((mem.heapTotal / 1024 / 1024) * 10) / 10;
  const externalMb = Math.round((mem.external / 1024 / 1024) * 10) / 10;
  // heapTotal is what V8 has reserved so far and grows on demand, so used/total sits near 100% on a
  // healthy process. Pressure is measured against the real ceiling (--max-old-space-size).
  const limit = getHeapStatistics().heap_size_limit;
  const heapLimitMb = Math.round((limit / 1024 / 1024) * 10) / 10;
  const heapUsagePct = Math.round((mem.heapUsed / limit) * 100);
  return { rssMb, heapUsedMb, heapTotalMb, heapLimitMb, externalMb, heapUsagePct };
}

/**
 * Diagnostic Root-Cause Analyzer: Maps raw error stacks and messages to human-readable root causes
 * and actionable solutions.
 */
function analyzeRootCause(error: unknown): {
  module: DiagnosticModule;
  severity: DiagnosticSeverity;
  rootCause: string;
  recommendation: string;
} {
  const err = error as Error & { code?: string; meta?: Record<string, unknown> };
  const msg = (err?.message || String(error)).toLowerCase();
  const code = err?.code || "";
  const name = err?.name || "";

  // 1. Database Connection & Migration Errors
  if (code === "P1001" || code === "P1002" || msg.includes("can't reach database server") || msg.includes("connection refused")) {
    return {
      module: "DATABASE",
      severity: "CRITICAL",
      rootCause: "PostgreSQL veritabanı sunucusuna erişilemiyor veya bağlantı havuzu tükendi.",
      recommendation: "Veritabanı servisinin (Postgres/Cloud SQL) çalıştığından ve DATABASE_URL portunun erişilebilir olduğundan emin olun.",
    };
  }
  if (code === "P2002") {
    return {
      module: "DATABASE",
      severity: "MEDIUM",
      rootCause: `Benzersiz alan kısıtlaması ihlali (Unique constraint): ${JSON.stringify(err.meta?.target ?? "kayıt zaten mevcut")}.`,
      recommendation: "Aynı kod veya kullanıcı adına sahip mükerrer kayıt oluşturulmaya çalışıldı. Veri girişini kontrol edin.",
    };
  }
  if (code === "P2025") {
    return {
      module: "DATABASE",
      severity: "MEDIUM",
      rootCause: "İşlem yapılmak istenen kayıt veritabanında bulunamadı veya daha önce silinmiş.",
      recommendation: "Kayıt kimliğini ve silinme durumunu (soft delete) kontrol edin.",
    };
  }
  if (code === "P2003") {
    return {
      module: "DATABASE",
      severity: "HIGH",
      rootCause: "Yabancı anahtar (Foreign Key) ilişkisi kısıtlaması ihlal edildi.",
      recommendation: "Bağlı alt kayıtlar varken ana kaydı silmeye veya var olmayan bir otele/kullanıcıya bağlamaya çalışılmadığından emin olun.",
    };
  }

  // 2. Memory & Resource Exhaustion
  if (msg.includes("heap out of memory") || msg.includes("allocation failed") || msg.includes("enomem")) {
    return {
      module: "CORE",
      severity: "CRITICAL",
      rootCause: "Node.js bellek limiti (Heap Memory Exhaustion) aşıldı.",
      recommendation: "Sunucunun RAM kapasitesini veya Node.js --max-old-space-size parametresini artırın; bellek sızıntısı yaratan döngüleri kontrol edin.",
    };
  }

  // 3. Mail & SMTP Errors
  if (msg.includes("smtp") || msg.includes("nodemailer") || code === "ECONNREFUSED" && msg.includes("mail")) {
    return {
      module: "MAIL",
      severity: "HIGH",
      rootCause: "SMTP sunucusuna bağlanılamadı veya kimlik doğrulama başarısız oldu.",
      recommendation: "Denetim Masası -> E-posta sekmesinden SMTP host, port, parola ve güvenlik ayarlarını (SSL/TLS) test edin.",
    };
  }

  // 4. Google Drive & Storage Errors
  if (msg.includes("drive") || msg.includes("google") || msg.includes("oauth") || msg.includes("gserviceaccount")) {
    return {
      module: "DRIVE",
      severity: "HIGH",
      rootCause: "Google Drive bulut entegrasyonu veya servis hesabı erişim yetkisi hatası.",
      recommendation: "Denetim Masası -> Google Drive sekmesinden Servis Hesabı e-postasının hedef klasöre 'Düzenleyen' yetkisiyle eklendiğini doğrulayın.",
    };
  }

  // 5. Auth & Session Errors
  if (msg.includes("unauthorized") || msg.includes("session") || msg.includes("token") || msg.includes("yetki")) {
    return {
      module: "AUTH",
      severity: "MEDIUM",
      rootCause: "Kullanıcı oturum veya yetkilendirme doğrulaması başarısız.",
      recommendation: "Kullanıcının geçerli bir role ve otele atanmış olduğundan, oturum çerezinin bozulmadığından emin olun.",
    };
  }

  // 6. Network / Fetch / Printer Errors
  if (code === "ETIMEDOUT" || code === "ECONNRESET" || msg.includes("network error") || msg.includes("fetch failed")) {
    return {
      module: "NETWORK",
      severity: "HIGH",
      rootCause: "Uzak ağ servisi bağlantısı zaman aşımına uğradı veya bağlantı koptu.",
      recommendation: "Ağ geçidi bağlantısını, yazıcı IP adresini veya güvenlik duvarı kurallarını denetleyin.",
    };
  }

  // Default fallback for general application exceptions
  return {
    module: "CORE",
    severity: "HIGH",
    rootCause: `Uygulama çalışma zamanı istisnası: ${name ? `${name} - ` : ""}${err?.message || "Bilinmeyen hata"}`,
    recommendation: "Hata yığınını (stack trace) inceleyerek ilgili sunucu eylemindeki (Server Action) parametreleri ve veri tiplerini kontrol edin.",
  };
}

/**
 * Executes live diagnostics across all system components and returns a comprehensive health report.
 */
export async function runSelfDiagnostics(): Promise<SystemHealthReport> {
  const probes: DiagnosticProbeResult[] = [];
  let score = 100;
  const memory = getMemoryStats();

  // 1. Veritabanı Probu
  const dbStart = Date.now();
  let dbLatencyMs = 0;
  try {
    await prisma.$queryRaw`SELECT 1`;
    dbLatencyMs = Date.now() - dbStart;
    if (dbLatencyMs > 250) {
      score -= 15;
      probes.push({
        name: "PostgreSQL Veritabanı Gecikmesi",
        category: "DATABASE",
        status: "WARN",
        message: `Veritabanı yanıt süresi yüksek (${dbLatencyMs} ms)`,
        latencyMs: dbLatencyMs,
        recommendation: "Veritabanı sunucu kaynaklarını ve aktif bağlantı havuzu yükünü kontrol edin.",
      });
    } else {
      probes.push({
        name: "PostgreSQL Veritabanı Bağlantısı",
        category: "DATABASE",
        status: "PASS",
        message: `Veritabanı bağlantısı aktif ve hızlı (${dbLatencyMs} ms)`,
        latencyMs: dbLatencyMs,
      });
    }
  } catch (err) {
    score -= 40;
    dbLatencyMs = Date.now() - dbStart;
    probes.push({
      name: "PostgreSQL Veritabanı Bağlantısı",
      category: "DATABASE",
      status: "FAIL",
      message: `Veritabanı bağlantı hatası: ${(err as Error).message}`,
      latencyMs: dbLatencyMs,
      recommendation: "Veritabanı sunucusunun aktif ve erişilebilir olduğunu doğrulayın.",
    });
  }

  // 2. Bellek (Memory Pressure) Probu
  if (memory.heapUsagePct > 90) {
    score -= 25;
    probes.push({
      name: "Bellek Tüketimi (Heap)",
      category: "MEMORY",
      status: "FAIL",
      message: `Kritik bellek kullanımı: %${memory.heapUsagePct} (${memory.heapUsedMb} MB / ${memory.heapLimitMb} MB)`,
      recommendation: "Sistem belleği tükenmek üzere. Node.js servisini yeniden başlatın veya bellek sınırını yükseltin.",
    });
  } else if (memory.heapUsagePct > 75) {
    score -= 10;
    probes.push({
      name: "Bellek Tüketimi (Heap)",
      category: "MEMORY",
      status: "WARN",
      message: `Yüksek bellek kullanımı: %${memory.heapUsagePct} (${memory.heapUsedMb} MB / ${memory.heapLimitMb} MB)`,
      recommendation: "Bellek kullanımını izleyin; yoğun raporlama işlemleri belleği artırmış olabilir.",
    });
  } else {
    probes.push({
      name: "Bellek Tüketimi (Heap)",
      category: "MEMORY",
      status: "PASS",
      message: `Normal seviyede: %${memory.heapUsagePct} (${memory.heapUsedMb} MB / ${memory.heapLimitMb} MB)`,
    });
  }

  // 3. E-posta (SMTP) Servisi Probu
  try {
    const mailOk = await isMailConfigured();
    const mailEnabled = await getSetting("email.systemEnabled");
    if (!mailOk) {
      probes.push({
        name: "E-posta & Bildirim Servisi",
        category: "MAIL",
        status: "WARN",
        message: "SMTP sunucusu yapılandırılmamış (E-posta bildirimleri gönderilemez)",
        recommendation: "Denetim Masası -> E-posta sekmesinden SMTP bilgilerinizi tanımlayın.",
      });
    } else if (!mailEnabled) {
      probes.push({
        name: "E-posta & Bildirim Servisi",
        category: "MAIL",
        status: "WARN",
        message: "SMTP tanımlı ancak 'Sistem e-postaları' devre dışı",
        recommendation: "Denetim Masası -> E-posta sekmesinden sistem e-postalarını aktifleştirin.",
      });
    } else {
      probes.push({
        name: "E-posta & Bildirim Servisi",
        category: "MAIL",
        status: "PASS",
        message: "SMTP hazır ve sistem e-postaları aktif",
      });
    }
  } catch {
    probes.push({
      name: "E-posta & Bildirim Servisi",
      category: "MAIL",
      status: "WARN",
      message: "SMTP ayarları kontrol edilirken hata oluştu",
    });
  }

  // 4. Google Drive Probu
  try {
    const driveSetting = await prisma.setting.findFirst({
      where: { key: "reports.googleDriveConfig", hotelId: null },
    });
    const driveVal = driveSetting?.value as { folderId?: string } | null;
    const driveFolderId = driveVal?.folderId;
    if (driveFolderId && typeof driveFolderId === "string" && driveFolderId.trim().length > 0) {
      probes.push({
        name: "Google Drive Bulut Arşivi",
        category: "DRIVE",
        status: "PASS",
        message: `Bulut arşivleme hedefi tanımlı (${driveFolderId.slice(0, 16)}…)`,
      });
    } else {
      probes.push({
        name: "Google Drive Bulut Arşivi",
        category: "DRIVE",
        status: "WARN",
        message: "Google Drive hedef klasör ID henüz belirlenmemiş",
        recommendation: "Raporların otomatik yedeklenmesi için Denetim Masası'ndan Google Drive ayarını tamamlayın.",
      });
    }
  } catch {
    // optional probe
  }

  // 5. Aktif Oturumlar ve Otel Bütünlüğü Probu
  let activeOnlineSessions = 0;
  try {
    const activeHotels = await prisma.hotel.count({ where: { isActive: true } });
    activeOnlineSessions = await prisma.userSession.count({
      where: { status: { in: ["ONLINE", "UYARI"] } },
    });

    if (activeHotels === 0) {
      score -= 30;
      probes.push({
        name: "Otel & Tesis Yapılandırması",
        category: "MODULES",
        status: "FAIL",
        message: "Sistemde aktif hiçbir otel kaydı bulunmuyor",
        recommendation: "Tanımlamalar ekranından en az bir aktif otel tanımlayın.",
      });
    } else {
      probes.push({
        name: "Otel & Tesis Yapılandırması",
        category: "MODULES",
        status: "PASS",
        message: `${activeHotels} aktif otel, ${activeOnlineSessions} canlı personel oturumu`,
      });
    }
  } catch {
    score -= 10;
  }

  score = Math.max(0, Math.min(100, score));
  const overallStatus = score >= 90 ? "HEALTHY" : score >= 60 ? "DEGRADED" : "CRITICAL";
  const uptimeSeconds = Math.round(process.uptime());

  // Count active unresolved incidents in DB
  let activeAlertsCount = 0;
  try {
    activeAlertsCount = await prisma.auditLog.count({
      where: {
        action: DIAGNOSTIC_ACTION,
        entity: DIAGNOSTIC_ENTITY,
      },
    });
  } catch {
    // non-fatal
  }

  return {
    overallStatus,
    healthScore: score,
    timestamp: new Date().toISOString(),
    uptimeSeconds,
    uptimeFormatted: formatUptime(uptimeSeconds),
    memory,
    dbLatencyMs,
    activeOnlineSessions,
    probes,
    activeAlertsCount,
  };
}

/**
 * Dispatches an automated, rich diagnostic incident email to the system developer / administrator.
 */
export async function sendDeveloperAlertMail(
  incident: DiagnosticIncidentData,
  /** Test alerts only: send to this address instead of the configured one (checks delivery to a mailbox). */
  overrideRecipient?: string,
): Promise<{ ok: boolean; error?: string; recipient?: string }> {
  try {
    const configuredDevEmail = await getSetting("diagnostic.developerEmail");
    const adminUser = await prisma.user.findFirst({
      where: { username: "admin", isActive: true },
      select: { email: true },
    });
    const recipient = overrideRecipient?.trim() || configuredDevEmail?.trim() || adminUser?.email || "erkan.erdem@merithotels.com";

    if (!recipient) {
      return { ok: false, error: "Alıcı e-posta adresi yapılandırılmamış" };
    }

    const severityColor =
      incident.severity === "CRITICAL" ? "#dc2626" : incident.severity === "HIGH" ? "#ea580c" : "#2563eb";
    const severityBadge =
      incident.severity === "CRITICAL"
        ? "KRİTİK SİSTEM HATASI"
        : incident.severity === "HIGH"
          ? "YÜKSEK ÖNCELİKLİ HATA"
          : "SİSTEM UYARISI";

    const html = `
<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="utf-8"/>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f1f5f9; color: #1e293b; margin: 0; padding: 24px; }
    .card { max-width: 680px; margin: 0 auto; background: #ffffff; border-radius: 12px; border: 1px solid #cbd5e1; box-shadow: 0 4px 12px rgba(0,0,0,0.05); overflow: hidden; }
    .header { background: ${severityColor}; color: #ffffff; padding: 20px 24px; }
    .header h1 { margin: 0 0 6px 0; font-size: 20px; font-weight: 700; letter-spacing: -0.5px; }
    .header p { margin: 0; opacity: 0.9; font-size: 13px; }
    .content { padding: 24px; }
    .section-title { font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: #64748b; margin: 18px 0 6px 0; }
    .box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px; margin-bottom: 12px; font-size: 13px; line-height: 1.5; }
    .code-box { background: #0f172a; color: #f8fafc; font-family: Consolas, Monaco, monospace; font-size: 11px; line-height: 1.4; padding: 14px; border-radius: 6px; overflow-x: auto; max-height: 240px; }
    .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 16px; }
    .meta-item { background: #f1f5f9; padding: 10px 12px; border-radius: 6px; font-size: 12px; }
    .meta-label { color: #64748b; font-size: 11px; display: block; margin-bottom: 2px; }
    .meta-val { font-weight: 600; color: #0f172a; }
    .rec-box { background: #eff6ff; border-left: 4px solid #3b82f6; padding: 12px 16px; border-radius: 4px; font-size: 13px; color: #1e40af; margin-top: 14px; }
    .footer { background: #f8fafc; border-top: 1px solid #e2e8f0; padding: 14px 24px; text-align: center; font-size: 11px; color: #64748b; }
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <h1>${severityBadge}</h1>
      <p>Merit Royal F&B Command Center · Otomatik Kendi Kendini Teşhis Motoru</p>
    </div>
    <div class="content">
      <div class="meta-grid">
        <div class="meta-item">
          <span class="meta-label">Etkilenen Modül</span>
          <span class="meta-val">${incident.module}</span>
        </div>
        <div class="meta-item">
          <span class="meta-label">Hata Kimliği (ID)</span>
          <span class="meta-val">#${incident.errorId}</span>
        </div>
        <div class="meta-item">
          <span class="meta-label">Oluşma Zamanı</span>
          <span class="meta-val">${new Date().toLocaleString("tr-TR")}</span>
        </div>
        <div class="meta-item">
          <span class="meta-label">Hata Türü</span>
          <span class="meta-val">${incident.errorName}</span>
        </div>
      </div>

      <div class="section-title">Hata Mesajı</div>
      <div class="box" style="border-left: 4px solid ${severityColor}; font-weight: 500;">
        ${incident.errorMessage}
      </div>

      <div class="section-title">Otomatik Teşhis & Kök Neden Analizi</div>
      <div class="box" style="background: #fffbeb; border-color: #fef3c7; color: #92400e;">
        <strong>Kök Neden:</strong> ${incident.rootCause}
      </div>

      <div class="rec-box">
        <strong>Önerilen Çözüm / Müdahale:</strong><br/>
        ${incident.recommendation}
      </div>

      ${
        incident.stackTrace
          ? `
        <div class="section-title">Teknik Hata Yığını (Stack Trace)</div>
        <pre class="code-box">${incident.stackTrace.slice(0, 1500)}</pre>
      `
          : ""
      }

      ${
        incident.context
          ? `
        <div class="section-title">Olay Bağlamı (Context)</div>
        <div class="box">
          <pre style="margin: 0; font-size: 11px;">${JSON.stringify(incident.context, null, 2)}</pre>
        </div>
      `
          : ""
      }
    </div>
    <div class="footer">
      Bu mesaj Merit Royal F&amp;B Command Center Self-Diagnostic System tarafından otomatik olarak üretilmiş ve sistem geliştiricisine iletilmiştir.
    </div>
  </div>
</body>
</html>
    `;

    const success = await sendMail({
      to: recipient,
      subject: `[${severityBadge}] Merit Royal F&B System Incident: ${incident.module} - #${incident.errorId}`,
      html,
    });

    return { ok: success, recipient, error: success ? undefined : "SMTP gönderimi başarısız oldu" };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

/**
 * Captures an unhandled runtime error or module exception, diagnoses root cause, logs to database
 * and sends an immediate alert to the developer.
 */
export async function captureException(
  error: unknown,
  context?: {
    action?: string;
    screenCode?: string;
    hotelId?: string;
    userId?: string;
    path?: string;
    params?: unknown;
    errorId?: string;
  },
): Promise<string> {
  const errorId = context?.errorId || Math.random().toString(36).substring(2, 10).toUpperCase();
  const err = error as Error;
  const analysis = analyzeRootCause(error);
  const memory = getMemoryStats();

  const incidentData: DiagnosticIncidentData = {
    errorId,
    module: analysis.module,
    severity: analysis.severity,
    errorName: err?.name || "UnhandledError",
    errorMessage: err?.message || String(error),
    stackTrace: err?.stack,
    rootCause: analysis.rootCause,
    recommendation: analysis.recommendation,
    context: {
      action: context?.action,
      screenCode: context?.screenCode,
      hotelId: context?.hotelId,
      userId: context?.userId,
      path: context?.path,
      params: context?.params,
    },
    metrics: {
      heapUsedMb: memory.heapUsedMb,
      uptimeSeconds: Math.round(process.uptime()),
    },
    mailSent: false,
    resolved: false,
  };

  // 1. Veritabanına Kaydet (AuditLog üzerinden güvenli, kalıcı log)
  try {
    await prisma.auditLog.create({
      data: {
        userId: context?.userId || null,
        hotelId: context?.hotelId || null,
        action: DIAGNOSTIC_ACTION,
        entity: DIAGNOSTIC_ENTITY,
        entityId: errorId,
        after: incidentData as unknown as Prisma.InputJsonValue,
      },
    });
  } catch (dbErr) {
    console.error("[DiagnosticService] Veritabanına incident kaydı yazılamadı:", dbErr);
  }

  // 2. Geliştiriciye Otomatik E-posta Bildirimi Gönder
  try {
    const isAutoNotify = await getSetting("diagnostic.autoNotify");
    const minSeverity = await getSetting("diagnostic.minSeverity");

    const severityRanks: Record<DiagnosticSeverity, number> = {
      LOW: 1,
      MEDIUM: 2,
      HIGH: 3,
      CRITICAL: 4,
    };

    const incidentRank = severityRanks[incidentData.severity] ?? 3;
    const thresholdRank = severityRanks[minSeverity as DiagnosticSeverity] ?? 3;

    if (isAutoNotify && incidentRank >= thresholdRank) {
      const mailRes = await sendDeveloperAlertMail(incidentData);
      if (mailRes.ok) {
        incidentData.mailSent = true;
        incidentData.mailTo = mailRes.recipient;
        // Update DB record with mail status
        await prisma.auditLog.updateMany({
          where: { action: DIAGNOSTIC_ACTION, entityId: errorId },
          data: { after: incidentData as unknown as Prisma.InputJsonValue },
        });
      }
    }
  } catch (notifyErr) {
    console.error("[DiagnosticService] Geliştiriciye hata maili gönderilemedi:", notifyErr);
  }

  return errorId;
}

/**
 * Lists diagnostic incidents from database with optional filters.
 */
export async function listDiagnosticIncidents(params?: {
  severity?: DiagnosticSeverity;
  module?: DiagnosticModule;
  resolved?: boolean;
  limit?: number;
}): Promise<DiagnosticIncidentRow[]> {
  const limit = params?.limit ?? 50;

  const rows = await prisma.auditLog.findMany({
    where: {
      action: DIAGNOSTIC_ACTION,
      entity: DIAGNOSTIC_ENTITY,
    },
    include: {
      user: { select: { fullName: true } },
      hotel: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  const parsedRows: DiagnosticIncidentRow[] = [];

  for (const row of rows) {
    const data = row.after as unknown as DiagnosticIncidentData;
    if (!data) continue;

    if (params?.severity && data.severity !== params.severity) continue;
    if (params?.module && data.module !== params.module) continue;
    if (params?.resolved !== undefined && data.resolved !== params.resolved) continue;

    parsedRows.push({
      id: row.id,
      createdAt: row.createdAt.toISOString(),
      hotelId: row.hotelId,
      hotelName: row.hotel?.name,
      userId: row.userId,
      userName: row.user?.fullName,
      data,
    });
  }

  return parsedRows;
}

/**
 * Marks a diagnostic incident as resolved.
 */
export async function resolveDiagnosticIncident(id: string, note?: string, resolvedBy?: string): Promise<boolean> {
  const record = await prisma.auditLog.findUnique({ where: { id } });
  if (!record || !record.after) return false;

  const data = record.after as unknown as DiagnosticIncidentData;
  data.resolved = true;
  data.resolvedAt = new Date().toISOString();
  data.resolvedBy = resolvedBy || "Sistem Yöneticisi";
  data.resolveNote = note || "İncelendi ve çözüldü.";

  await prisma.auditLog.update({
    where: { id },
    data: { after: data as unknown as Prisma.InputJsonValue },
  });

  return true;
}

/**
 * Clears resolved incidents older than 7 days.
 */
export async function clearResolvedIncidents(): Promise<number> {
  const res = await prisma.auditLog.deleteMany({
    where: {
      action: DIAGNOSTIC_ACTION,
      entity: DIAGNOSTIC_ENTITY,
      createdAt: { lt: new Date(Date.now() - 7 * 24 * 3600 * 1000) },
    },
  });
  return res.count;
}
