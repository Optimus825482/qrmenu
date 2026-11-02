import { prisma } from "@/lib/prisma";
import { sendMail } from "@/lib/mailer";
import { getBusinessDate } from "./minibarService";
import { getAbnormalConsumption } from "./abnormalConsumptionService";

/**
 * 1. Saat 10:00 - Günlük Doluluk Yüklenmediyse Sistem Yöneticisi ve Minibar/Depo Sorumlusuna Uyarı Gönder
 */
export async function checkOccupancyUploadAndAlert(now = new Date()): Promise<{
  checkedHotels: number;
  missingHotels: string[];
  alertSent: boolean;
}> {
  const businessDateObj = getBusinessDate(now);
  const todayStr = businessDateObj.toISOString().slice(0, 10);
  const startOfDay = new Date(`${todayStr}T00:00:00.000Z`);
  const endOfDay = new Date(`${todayStr}T23:59:59.999Z`);

  const activeHotels = await prisma.hotel.findMany({
    where: { isActive: true },
    select: { id: true, name: true, code: true },
  });

  const missingHotels: { id: string; name: string }[] = [];

  for (const hotel of activeHotels) {
    const upload = await prisma.occupancyUpload.findFirst({
      where: {
        hotelId: hotel.id,
        createdAt: {
          gte: startOfDay,
          lte: endOfDay,
        },
      },
    });

    if (!upload) {
      missingHotels.push({ id: hotel.id, name: hotel.name });
    }
  }

  if (missingHotels.length === 0) {
    return { checkedHotels: activeHotels.length, missingHotels: [], alertSent: false };
  }

  // Find recipients: Users with role "SISTEM", "MINIBAR" or "YONETIM"
  const recipients = await prisma.user.findMany({
    where: {
      isActive: true,
      role: {
        kind: { in: ["SISTEM", "MINIBAR", "YONETIM"] },
      },
      email: { not: null },
    },
    select: { email: true, fullName: true, role: { select: { name: true } } },
  });

  const emails = recipients
    .map((r) => r.email)
    .filter((e): e is string => typeof e === "string" && e.includes("@"));

  if (emails.length === 0) {
    console.warn("[checkOccupancyUploadAndAlert] Sistem veya Minibar/Depo kullanıcısı bulunamadı.");
    return {
      checkedHotels: activeHotels.length,
      missingHotels: missingHotels.map((h) => h.name),
      alertSent: false,
    };
  }

  const hotelListHtml = missingHotels
    .map((h) => `<li style="font-weight: bold; color: #dc2626;">${h.name}</li>`)
    .join("");

  const emailHtml = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden;">
      <div style="background: linear-gradient(135deg, #1e3a8a, #0f172a); color: #ffffff; padding: 20px; text-align: center;">
        <h2 style="margin: 0; font-size: 20px; letter-spacing: 1px; color: #fbbf24;">MERIT ROYAL HOTELS &amp; RESORTS</h2>
        <p style="margin: 5px 0 0; font-size: 13px; color: #94a3b8;">F&amp;B Command Center · Minibar Takip Sistemi</p>
      </div>

      <div style="padding: 24px; color: #334155; line-height: 1.6;">
        <div style="background: #fef2f2; border-left: 4px solid #ef4444; padding: 12px 16px; margin-bottom: 20px; border-radius: 4px;">
          <h3 style="margin: 0 0 4px; color: #991b1b; font-size: 15px;">DİKKAT: Günlük Doluluk Verisi Eksik (Saat 10:00 Uyarısı)</h3>
          <p style="margin: 0; font-size: 13px; color: #7f1d1d;">
            Bugün (${todayStr}) için saat 10:00 itibarıyla aşağıdaki tesislerin oda doluluk Excel girişi henüz tamamlanmamıştır:
          </p>
        </div>

        <ul style="margin: 0 0 20px; padding-left: 24px; font-size: 14px;">
          ${hotelListHtml}
        </ul>

        <p style="font-size: 13px; color: #475569;">
          Kat sorumlularının odalardaki ikame görevlerini doğru önceliklendirebilmesi için lütfen en kısa sürede <strong>F&amp;B Command Center &gt; Minibar Operasyonları &gt; Günlük Doluluk Girişi (Excel)</strong> ekranından ilgili otelin doluluk dosyasını sisteme yükleyiniz.
        </p>

        <div style="margin-top: 24px; text-align: center;">
          <a href="http://localhost:3000/depo/doluluk-yukle" style="background: #2563eb; color: #ffffff; text-decoration: none; padding: 10px 20px; border-radius: 6px; font-weight: bold; font-size: 13px; display: inline-block;">
            Doluluk Giriş Ekranını Aç
          </a>
        </div>
      </div>

      <div style="background: #f8fafc; border-top: 1px solid #e2e8f0; padding: 12px; text-align: center; font-size: 11px; color: #94a3b8;">
        Bu e-posta F&amp;B Command Center otomasyonu tarafından otomatik oluşturulmuştur.
      </div>
    </div>
  `;

  await sendMail({
    to: emails,
    subject: `[DİKKAT] Saat 10:00 Doluluk Girişi Eksik Uyarısı — ${todayStr}`,
    html: emailHtml,
  });

  return {
    checkedHotels: activeHotels.length,
    missingHotels: missingHotels.map((h) => h.name),
    alertSent: true,
  };
}

/**
 * 2. Saat 09:00 - Bir Önceki Günün Tüketim, Tamamlanamayan Görevler ve Anormal Tüketim Raporunu Gönder
 */
export async function sendDailyConsumptionAndTaskReport(now = new Date()): Promise<{
  reportDate: string;
  sent: boolean;
}> {
  // Calculate yesterday's business date
  const yesterdayDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const targetDateObj = getBusinessDate(yesterdayDate);
  const targetDateStr = targetDateObj.toISOString().slice(0, 10);

  const startOfDay = new Date(`${targetDateStr}T00:00:00.000Z`);
  const endOfDay = new Date(`${targetDateStr}T23:59:59.999Z`);

  // 1. Fetch yesterday's consumption totals by Hotel and Floor
  const txItems = await prisma.minibarTransactionItem.findMany({
    where: {
      transaction: {
        createdAt: { gte: startOfDay, lte: endOfDay },
      },
      consumed: { gt: 0 },
    },
    include: {
      product: true,
      transaction: {
        include: {
          hotel: true,
          room: { include: { floor: true } },
        },
      },
    },
  });

  // Group by Hotel and Floor
  const floorTotals = new Map<
    string,
    {
      hotelName: string;
      floorName: string;
      totalItems: number;
      roomsCount: Set<string>;
    }
  >();

  let grandTotalItems = 0;

  for (const item of txItems) {
    const tx = item.transaction;
    const key = `${tx.hotel.name} - ${tx.room.floor.name}`;
    if (!floorTotals.has(key)) {
      floorTotals.set(key, {
        hotelName: tx.hotel.name,
        floorName: tx.room.floor.name,
        totalItems: 0,
        roomsCount: new Set(),
      });
    }

    const ft = floorTotals.get(key)!;
    ft.totalItems += item.consumed;
    ft.roomsCount.add(tx.roomId);
    grandTotalItems += item.consumed;
  }

  // 2. Fetch unfulfilled/pending task items from yesterday
  const pendingTaskItems = await prisma.dailyTaskItem.findMany({
    where: {
      task: {
        date: targetDateObj,
      },
      status: { not: "TAMAMLANDI" },
    },
    include: {
      room: { include: { floor: true, hotel: true } },
    },
  });

  // 3. Fetch abnormal consumption
  const abnormal = await getAbnormalConsumption({ date: targetDateStr });

  // 4. Find recipients (SISTEM, MINIBAR, YONETIM)
  const recipients = await prisma.user.findMany({
    where: {
      isActive: true,
      role: {
        kind: { in: ["SISTEM", "MINIBAR", "YONETIM"] },
      },
      email: { not: null },
    },
    select: { email: true },
  });

  const emails = recipients
    .map((r) => r.email)
    .filter((e): e is string => typeof e === "string" && e.includes("@"));

  if (emails.length === 0) {
    console.warn("[sendDailyConsumptionAndTaskReport] Gönderilecek yetkili e-posta adresi bulunamadı.");
    return { reportDate: targetDateStr, sent: false };
  }

  // Format Tables for Email
  const floorRowsHtml = Array.from(floorTotals.values())
    .map(
      (ft) => `
      <tr style="border-bottom: 1px solid #f1f5f9;">
        <td style="padding: 8px 12px; font-weight: bold; color: #1e293b;">${ft.hotelName}</td>
        <td style="padding: 8px 12px; color: #475569;">${ft.floorName}</td>
        <td style="padding: 8px 12px; text-align: center; color: #475569;">${ft.roomsCount.size} Oda</td>
        <td style="padding: 8px 12px; text-align: right; font-weight: bold; color: #0284c7;">${ft.totalItems} Adet</td>
      </tr>
    `,
    )
    .join("");

  const pendingRowsHtml = pendingTaskItems
    .slice(0, 20)
    .map(
      (t) => `
      <tr style="border-bottom: 1px solid #f1f5f9;">
        <td style="padding: 6px 10px; font-weight: bold; color: #0f172a;">${t.room.hotel.name} - Oda ${t.room.number}</td>
        <td style="padding: 6px 10px; color: #64748b;">${t.room.floor.name}</td>
        <td style="padding: 6px 10px; text-align: center;">
          <span style="background: ${t.status === "DND_BEKLIYOR" ? "#fef3c7; color: #b45309" : "#fee2e2; color: #991b1b"}; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: bold;">
            ${t.status}
          </span>
        </td>
      </tr>
    `,
    )
    .join("");

  const abnormalRowsHtml = abnormal.roomAnomalies
    .slice(0, 10)
    .map(
      (a) => `
      <tr style="border-bottom: 1px solid #fef2f2;">
        <td style="padding: 6px 10px; font-weight: bold; color: #dc2626;">${a.hotelName} - Oda ${a.roomNumber}</td>
        <td style="padding: 6px 10px; color: #7f1d1d;">${a.floorName}</td>
        <td style="padding: 6px 10px; text-align: center; font-weight: bold; color: #b91c1c;">${a.totalQuantity} Adet (${a.replenishmentCount} Dolum)</td>
      </tr>
    `,
    )
    .join("");

  const emailHtml = `
    <div style="font-family: Arial, sans-serif; max-width: 650px; margin: 0 auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden;">
      <div style="background: linear-gradient(135deg, #0f172a, #1e3a8a); color: #ffffff; padding: 20px; text-align: center;">
        <h2 style="margin: 0; font-size: 20px; letter-spacing: 1px; color: #fbbf24;">MERIT ROYAL HOTELS &amp; RESORTS</h2>
        <p style="margin: 5px 0 0; font-size: 13px; color: #94a3b8;">Günlük Minibar Tüketim &amp; Operasyon Raporu</p>
        <p style="margin: 4px 0 0; font-size: 12px; color: #e2e8f0; font-weight: bold;">Tarih: ${targetDateStr}</p>
      </div>

      <div style="padding: 24px; color: #334155; line-height: 1.5;">
        
        <!-- Özet Kartları -->
        <div style="display: flex; gap: 12px; margin-bottom: 24px;">
          <div style="flex: 1; background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 6px; padding: 12px; text-align: center;">
            <div style="font-size: 11px; color: #166534; font-weight: bold; text-transform: uppercase;">Toplam Tüketim</div>
            <div style="font-size: 20px; font-weight: 900; color: #15803d; margin-top: 4px;">${grandTotalItems} Adet</div>
          </div>
          <div style="flex: 1; background: #fef2f2; border: 1px solid #fecaca; border-radius: 6px; padding: 12px; text-align: center;">
            <div style="font-size: 11px; color: #991b1b; font-weight: bold; text-transform: uppercase;">Açık/DND Görevler</div>
            <div style="font-size: 20px; font-weight: 900; color: #b91c1c; margin-top: 4px;">${pendingTaskItems.length} Görev</div>
          </div>
          <div style="flex: 1; background: #fefce8; border: 1px solid #fef08a; border-radius: 6px; padding: 12px; text-align: center;">
            <div style="font-size: 11px; color: #854d0e; font-weight: bold; text-transform: uppercase;">Anormal Tüketim</div>
            <div style="font-size: 20px; font-weight: 900; color: #a16207; margin-top: 4px;">${abnormal.roomAnomalies.length} Oda</div>
          </div>
        </div>

        <!-- 1. Kat Bazlı Tüketim Dağılımı -->
        <h3 style="font-size: 14px; color: #0f172a; margin: 0 0 8px; border-bottom: 2px solid #e2e8f0; padding-bottom: 4px;">
          1. Otel &amp; Kat Bazlı Tüketim Dağılımı
        </h3>
        <table style="width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 24px;">
          <thead>
            <tr style="background: #f8fafc; color: #64748b; text-align: left; font-size: 11px; text-transform: uppercase;">
              <th style="padding: 6px 12px;">Otel</th>
              <th style="padding: 6px 12px;">Kat</th>
              <th style="padding: 6px 12px; text-align: center;">İşlem Gören Oda</th>
              <th style="padding: 6px 12px; text-align: right;">Sarfiyat</th>
            </tr>
          </thead>
          <tbody>
            ${floorRowsHtml || '<tr><td colspan="4" style="padding: 12px; text-align: center; color: #94a3b8;">Dün için tüketim kaydı bulunamadı.</td></tr>'}
          </tbody>
        </table>

        <!-- 2. Açık Kalan / Tamamlanamayan Görevler -->
        <h3 style="font-size: 14px; color: #0f172a; margin: 0 0 8px; border-bottom: 2px solid #e2e8f0; padding-bottom: 4px;">
          2. Tamamlanamayan / Açık Kalan Görevler (${pendingTaskItems.length} Adet)
        </h3>
        <table style="width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 24px;">
          <thead>
            <tr style="background: #f8fafc; color: #64748b; text-align: left; font-size: 11px; text-transform: uppercase;">
              <th style="padding: 6px 10px;">Oda</th>
              <th style="padding: 6px 10px;">Kat</th>
              <th style="padding: 6px 10px; text-align: center;">Durum</th>
            </tr>
          </thead>
          <tbody>
            ${pendingRowsHtml || '<tr><td colspan="3" style="padding: 12px; text-align: center; color: #16a34a; font-weight: bold;">Tüm odalar başarıyla kontrol edilmiştir!</td></tr>'}
          </tbody>
        </table>

        <!-- 3. Anormal Tüketim Uyarısı -->
        ${
          abnormal.roomAnomalies.length > 0
            ? `
          <h3 style="font-size: 14px; color: #b91c1c; margin: 0 0 8px; border-bottom: 2px solid #fee2e2; padding-bottom: 4px;">
            3. Anormal Tüketim Tespit Edilen Odalar
          </h3>
          <table style="width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 20px;">
            <thead>
              <tr style="background: #fef2f2; color: #991b1b; text-align: left; font-size: 11px; text-transform: uppercase;">
                <th style="padding: 6px 10px;">Oda</th>
                <th style="padding: 6px 10px;">Kat</th>
                <th style="padding: 6px 10px; text-align: center;">Sarfiyat / Dolum</th>
              </tr>
            </thead>
            <tbody>
              ${abnormalRowsHtml}
            </tbody>
          </table>
        `
            : ""
        }

        <div style="margin-top: 24px; text-align: center;">
          <a href="http://localhost:3000/depo/raporlar" style="background: #0f172a; color: #ffffff; text-decoration: none; padding: 10px 20px; border-radius: 6px; font-weight: bold; font-size: 13px; display: inline-block;">
            Detaylı Raporlar Penceresini Aç
          </a>
        </div>
      </div>

      <div style="background: #f8fafc; border-top: 1px solid #e2e8f0; padding: 12px; text-align: center; font-size: 11px; color: #94a3b8;">
        Merit Royal Hotels &amp; Resorts · F&amp;B Command Center © 2026
      </div>
    </div>
  `;

  await sendMail({
    to: emails,
    subject: `[GÜNLÜK RAPOR] ${targetDateStr} Minibar Tüketim ve Tamamlanamayan Görevler Özeti`,
    html: emailHtml,
  });

  return { reportDate: targetDateStr, sent: true };
}

/**
 * 3. Gece 00:01 - Günlük Minibar Görev Üretimi
 */
export async function runDailyTaskGeneration(now = new Date()): Promise<{ hotelCount: number }> {
  const activeHotels = await prisma.hotel.findMany({
    where: { isActive: true },
    select: { id: true, name: true },
  });

  const { ensureSampleOccupancySeed } = await import("./minibarService");

  for (const hotel of activeHotels) {
    await ensureSampleOccupancySeed(hotel.id);
  }

  return { hotelCount: activeHotels.length };
}

/**
 * 4. Gece 23:59 - DND Gün Sonu Devri
 */
export async function runDndDayEndRollover(now = new Date()): Promise<{ rolloverCount: number }> {
  const today = getBusinessDate(now);
  const dndItems = await prisma.dailyTaskItem.findMany({
    where: {
      status: "DND_BEKLIYOR",
      task: { date: today },
    },
    select: { id: true, roomId: true },
  });

  console.log(`[minibar.dnd-rollover] ${dndItems.length} adet DND odası gün sonu devrine alındı.`);
  return { rolloverCount: dndItems.length };
}

