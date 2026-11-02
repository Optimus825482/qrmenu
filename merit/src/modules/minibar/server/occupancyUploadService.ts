import ExcelJS from "exceljs";
import { prisma } from "@/lib/prisma";
import { formatInTimeZone } from "date-fns-tz";
import { GuestRecordKind, TaskType } from "@/generated/prisma/client";
import { DomainError } from "@/lib/result";
import { businessDate, businessDay, TZ } from "@/lib/time";
import { audit } from "@/modules/core/server/audit";

export interface OccupancyUploadResult {
  success: boolean;
  code: string;
  uploadId: string;
  totalRows: number;
  okRows: number;
  errorRows: number;
  tasksCreated: {
    inhouse: number;
    arrivals: number;
    departures: number;
    clashes: number;
  };
  errors: string[];
  warning?: string;
  detectedKind: string;
}

interface ParsedRow {
  roomNumber: string;
  guestName?: string;
  guestCount: number;
  /** Business-day strings ('yyyy-MM-dd'); converted with businessDay() for @db.Date columns. */
  arrivalDate: string;
  arrivalTime?: string;
  departureDate: string;
  departureTime?: string;
  kind: GuestRecordKind;
}

/** Excel upload limits: .xlsx only, at most 10 MB. */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

/** Throws VALIDATION unless the file looks like a small .xlsx (name, size and ZIP magic bytes). */
export function assertXlsxUpload(fileName: string, buffer: Buffer): void {
  if (!/\.xlsx$/i.test(fileName)) {
    throw new DomainError("VALIDATION", "Yalnızca .xlsx uzantılı Excel dosyaları yüklenebilir.");
  }
  if (buffer.length === 0) throw new DomainError("VALIDATION", "Dosya boş.");
  if (buffer.length > MAX_UPLOAD_BYTES) {
    throw new DomainError("VALIDATION", "Dosya en fazla 10 MB olabilir.");
  }
  if (buffer.subarray(0, 2).toString("latin1") !== "PK") {
    throw new DomainError("VALIDATION", "Dosya geçerli bir .xlsx (Excel) dosyası değil.");
  }
}

/**
 * Saat ve tarih yardımcıları
 */
function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** A calendar day ('yyyy-MM-dd') from an Excel cell; null when it is not a real date. */
function parseDateCell(val: unknown): string | null {
  const fromUtc = (d: Date): string | null =>
    Number.isNaN(d.getTime()) ? null : `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
  const fromParts = (y: number, m: number, d: number): string | null => {
    const probe = new Date(Date.UTC(y, m - 1, d));
    return probe.getUTCFullYear() === y && probe.getUTCMonth() === m - 1 && probe.getUTCDate() === d
      ? `${y}-${pad2(m)}-${pad2(d)}`
      : null;
  };
  if (!val) return null;
  // ExcelJS yields date cells as UTC-midnight Dates: the UTC calendar day is the day typed in Excel.
  if (val instanceof Date) return fromUtc(val);
  if (typeof val === "number") {
    // Excel serial date -> calendar day, independent of the server timezone.
    return fromUtc(new Date(Date.UTC(1899, 11, 30) + Math.floor(val) * 86400000));
  }
  if (typeof val === "string") {
    const trimmed = val.trim();
    const dot = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(trimmed);
    if (dot) return fromParts(Number(dot[3]), Number(dot[2]), Number(dot[1]));
    const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(trimmed);
    if (iso) return fromParts(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  }
  return null;
}

function parseTimeCell(val: unknown): string | null {
  if (!val) return null;
  if (typeof val === "string") {
    const trimmed = val.trim();
    const match = trimmed.match(/^(\d{1,2})[:.](\d{2})/);
    if (match) {
      const h = match[1].padStart(2, "0");
      const m = match[2];
      return `${h}:${m}`;
    }
    return trimmed;
  }
  if (val instanceof Date) {
    const h = String(val.getUTCHours()).padStart(2, "0");
    const m = String(val.getUTCMinutes()).padStart(2, "0");
    return `${h}:${m}`;
  }
  if (typeof val === "number") {
    // Fractional day
    const totalMinutes = Math.round(val * 24 * 60);
    const h = String(Math.floor(totalMinutes / 60) % 24).padStart(2, "0");
    const m = String(totalMinutes % 60).padStart(2, "0");
    return `${h}:${m}`;
  }
  return null;
}

/**
 * 09:00 - 10:00 standart yükleme saat kontrolü
 */
export function checkUploadScheduleWindow(now: Date = new Date()): {
  isWithinWindow: boolean;
  currentTimeStr: string;
  message: string;
} {
  // Europe/Nicosia wall-clock time, whatever timezone the server runs in.
  const currentTimeStr = formatInTimeZone(now, TZ, "HH:mm");
  const currentHour = Number(currentTimeStr.slice(0, 2));

  const isWithinWindow = currentHour >= 9 && currentHour < 10;
  const message = isWithinWindow
    ? "Standart doluluk yükleme saat aralığındasınız (09:00 - 10:00)."
    : `Dikkat: Standart doluluk yükleme saati 09:00 - 10:00 arasıdır (Şu an: ${currentTimeStr}). Yönetici yetkiniz ile yüklemeye devam edebilirsiniz.`;

  return { isWithinWindow, currentTimeStr, message };
}

/**
 * Excel dosyasını ayrıştırıp görevleri ve doluluk kayıtlarını oluşturan ana servis
 */
export async function processOccupancyExcel(params: {
  buffer: Buffer;
  fileName: string;
  hotelId: string;
  userId: string;
  forceScheduleOverride?: boolean;
}): Promise<OccupancyUploadResult> {
  const { buffer, fileName, hotelId, userId } = params;
  assertXlsxUpload(fileName, buffer);
  const todayStr = businessDate();
  const today = businessDay(todayStr);

  const code = `OCC-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);

  const parsedRows: ParsedRow[] = [];
  const errors: string[] = [];
  let detectedKind = "GENERAL";

  // Tüm çalışma sayfalarını (worksheets) tara
  workbook.eachSheet((worksheet) => {
    const sheetName = worksheet.name.toLowerCase();
    let headerRowIdx = 1;

    // Header satırını bul (özellikle P4001 formatlarında 1-10. satırlar arasında olabilir)
    const colMap: Record<string, number> = {};
    for (let r = 1; r <= Math.min(worksheet.rowCount, 12); r++) {
      const row = worksheet.getRow(r);
      const headers: string[] = [];
      row.eachCell({ includeEmpty: false }, (cell) => {
        headers.push(String(cell.value || "").trim().toLowerCase());
      });

      const hasRoom = headers.some((h) => h.includes("room") || h.includes("oda") || h === "r.no");
      const hasArrival = headers.some((h) => h.includes("arrival") || h.includes("giris") || h.includes("giriş"));

      if (hasRoom && (hasArrival || headers.length >= 4)) {
        headerRowIdx = r;
        row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
          const raw = String(cell.value || "").trim().toLowerCase();
          if (raw.includes("room") || raw.includes("oda") || raw === "r.no" || raw === "r. no") {
            colMap.room = colNumber;
          } else if (raw.includes("name") || raw.includes("misafir") || raw.includes("guest")) {
            colMap.name = colNumber;
          } else if (raw === "arrival" || raw.includes("giriş") || raw.includes("giris")) {
            colMap.arrival = colNumber;
          } else if (raw === "departure" || raw.includes("çıkış") || raw.includes("cikis")) {
            colMap.departure = colNumber;
          } else if (raw.includes("arr.time") || raw.includes("arr time") || raw.includes("varış")) {
            colMap.arrTime = colNumber;
          } else if (raw.includes("dep.time") || raw.includes("dep time")) {
            colMap.depTime = colNumber;
          } else if (raw.includes("adult") || raw.includes("kişi") || raw === "adl") {
            colMap.adult = colNumber;
          }
        });
        break;
      }
    }

    if (!colMap.room) {
      return; // Bu sayfa doluluk tablosu içermiyor
    }

    // Sheet adına veya header'a göre sayfa tipini tahmin et
    let sheetKind: GuestRecordKind = "IN_HOUSE";
    if (sheetName.includes("arrival") || sheetName.includes("giris")) {
      sheetKind = "ARRIVAL";
      detectedKind = "ARRIVALS";
    } else if (sheetName.includes("depart") || sheetName.includes("cikis")) {
      sheetKind = "DEPARTURE";
      detectedKind = "DEPARTURES";
    }

    // Satırları oku
    for (let r = headerRowIdx + 1; r <= worksheet.rowCount; r++) {
      const row = worksheet.getRow(r);
      const roomCellVal = colMap.room ? row.getCell(colMap.room).value : null;
      if (!roomCellVal) continue;

      const roomNumber = String(roomCellVal).trim().replace(/\.0$/, "");
      if (!roomNumber || roomNumber.length > 10) continue;

      const guestName = colMap.name ? String(row.getCell(colMap.name).value || "").trim() : "";
      const arrivalVal = colMap.arrival ? row.getCell(colMap.arrival).value : null;
      const departureVal = colMap.departure ? row.getCell(colMap.departure).value : null;
      const arrTimeVal = colMap.arrTime ? row.getCell(colMap.arrTime).value : null;
      const depTimeVal = colMap.depTime ? row.getCell(colMap.depTime).value : null;
      const adultVal = colMap.adult ? Number(row.getCell(colMap.adult).value) : 1;

      const arrivalDate = parseDateCell(arrivalVal) || todayStr;
      const departureDate = parseDateCell(departureVal) || todayStr;
      const arrivalTime = parseTimeCell(arrTimeVal);
      const departureTime = parseTimeCell(depTimeVal);

      // Satır bazında akıllı kind tespiti
      let rowKind = sheetKind;
      const arrYMD = arrivalDate;
      const depYMD = departureDate;
      const todayYMD = todayStr;

      if (arrYMD === todayYMD && depYMD !== todayYMD) {
        rowKind = "ARRIVAL";
      } else if (depYMD === todayYMD && arrYMD !== todayYMD) {
        rowKind = "DEPARTURE";
      } else if (arrYMD <= todayYMD && depYMD >= todayYMD) {
        rowKind = "IN_HOUSE";
      }

      parsedRows.push({
        roomNumber,
        guestName,
        guestCount: isNaN(adultVal) || adultVal <= 0 ? 1 : adultVal,
        arrivalDate,
        arrivalTime: arrivalTime || undefined,
        departureDate,
        departureTime: departureTime || undefined,
        kind: rowKind,
      });
    }
  });

  if (parsedRows.length === 0) {
    return {
      success: false,
      code,
      uploadId: "",
      totalRows: 0,
      okRows: 0,
      errorRows: 0,
      tasksCreated: { inhouse: 0, arrivals: 0, departures: 0, clashes: 0 },
      errors: ["Excel dosyasında geçerli oda doluluk satırı bulunamadı. Lütfen dosya formatını kontrol edin."],
      detectedKind,
    };
  }

  // One transaction: a failed upload leaves neither half-written records nor tasks behind.
  const outcome = await prisma.$transaction(
    async (tx) => {
      // Oteldeki mevcut odaları çek
      const existingRooms = await tx.room.findMany({
        where: {
          floor: { hotelId },
        },
        select: { id: true, number: true },
      });

      const roomMap = new Map<string, string>();
      for (const rm of existingRooms) {
        roomMap.set(rm.number.trim(), rm.id);
      }

      // 1. OccupancyUpload kaydı oluştur
      const uploadRecord = await tx.occupancyUpload.create({
        data: {
          hotelId,
          code,
          fileName,
          kind: detectedKind,
          status: "YUKLENDI",
          totalRows: parsedRows.length,
          userId,
        },
      });

      let okRows = 0;
      let errorRows = 0;

      // Oda bazında gruplama (Aynı gün hem çıkış hem giriş olan odaları tespit etmek için)
      const roomGroups = new Map<string, ParsedRow[]>();

      for (const row of parsedRows) {
        const roomId = roomMap.get(row.roomNumber);
        if (!roomId) {
          errorRows++;
          errors.push(`Oda bulunamadı: "${row.roomNumber}". Bu oda otel sistemine kayıtlı değil.`);
          continue;
        }

        try {
          await tx.guestRecord.create({
            data: {
              hotelId,
              roomId,
              uploadId: uploadRecord.id,
              batchCode: code,
              guestCount: row.guestCount,
              arrivalDate: businessDay(row.arrivalDate),
              arrivalTime: row.arrivalTime,
              departureDate: businessDay(row.departureDate),
              departureTime: row.departureTime,
              kind: row.kind,
            },
          });

          const list = roomGroups.get(roomId) || [];
          list.push(row);
          roomGroups.set(roomId, list);
          okRows++;
        } catch (err: unknown) {
          errorRows++;
          errors.push(`Oda ${row.roomNumber} kaydedilirken hata: ${err instanceof Error ? err.message : String(err)}`);
        }
      }

      // 2. DailyTask (INHOUSE_KONTROL, ARRIVAL_KONTROL, DEPARTURE_KONTROL) oluştur veya bul
      const taskTypes: TaskType[] = ["INHOUSE_KONTROL", "ARRIVAL_KONTROL", "DEPARTURE_KONTROL"];
      const dailyTasks = new Map<TaskType, string>();

      for (const tType of taskTypes) {
        let task = await tx.dailyTask.findUnique({
          where: {
            hotelId_date_type: {
              hotelId,
              date: today,
              type: tType,
            },
          },
        });

        if (!task) {
          task = await tx.dailyTask.create({
            data: {
              hotelId,
              date: today,
              type: tType,
              status: "BEKLIYOR",
            },
          });
        }
        dailyTasks.set(tType, task.id);
      }

      // 3. Günlük Görev Öğeleri (DailyTaskItem) oluştur & Öncelik Sıralaması Hesapla
      let inhouseCreated = 0;
      let arrivalsCreated = 0;
      let departuresCreated = 0;
      let clashesCreated = 0;

      for (const [roomId, rows] of roomGroups.entries()) {
        const hasDeparture = rows.some((r) => r.kind === "DEPARTURE");
        const hasArrival = rows.some((r) => r.kind === "ARRIVAL");
        const isClash = hasDeparture && hasArrival;

        const arrivalRow = rows.find((r) => r.kind === "ARRIVAL");
        const departureRow = rows.find((r) => r.kind === "DEPARTURE");

        // En kritik görev tipi hangisi ise ana task'e bağla
        let primaryType: TaskType = "INHOUSE_KONTROL";
        let priorityRank = 30; // Varsayılan: In-house (3. öncelik)

        if (isClash) {
          // 1. ÖNCELİK: Departure + Arrival (Aynı gün çıkış ve yeni misafir gelişi!)
          primaryType = "ARRIVAL_KONTROL";
          priorityRank = 10;
          clashesCreated++;
        } else if (hasArrival) {
          // 2. ÖNCELİK: Boş odaya yeni giriş (Varıştan 1 saat önce hazır olmalı)
          primaryType = "ARRIVAL_KONTROL";
          priorityRank = 20;
          arrivalsCreated++;
        } else if (hasDeparture) {
          // 4. ÖNCELİK: Çıkış yapan oda (Yeni misafir gelmeyecek)
          primaryType = "DEPARTURE_KONTROL";
          priorityRank = 40;
          departuresCreated++;
        } else {
          inhouseCreated++;
        }

        const taskId = dailyTasks.get(primaryType) || dailyTasks.get("INHOUSE_KONTROL")!;

        // Mevcut bekleyen görev var mı kontrol et
        const existingItem = await tx.dailyTaskItem.findFirst({
          where: {
            task: { hotelId, date: today },
            roomId,
          },
        });

        const arrTime = arrivalRow?.arrivalTime || (isClash ? "14:00" : undefined);
        const depTime = departureRow?.departureTime || (isClash ? "12:00" : undefined);

        let note = "";
        if (isClash) {
          note = `⚠️ ÇAKIŞMA: Çıkış (${depTime}) + Giriş (${arrTime})! Girişten 1 saat önce minibar hazır olmalı.`;
        } else if (hasArrival) {
          note = `✈️ Yeni Giriş: Varış ${arrTime || "14:00"}. 1 saat öncesinde minibar hazır olmalı.`;
        } else if (hasDeparture) {
          note = `🚶 Çıkış: Misafir çıkışı ${depTime || "12:00"}. Setup eksikleri tamamlanmalı.`;
        } else {
          note = "In-House günlük periyodik minibar kontrolü.";
        }

        if (existingItem) {
          await tx.dailyTaskItem.update({
            where: { id: existingItem.id },
            data: {
              arrivalTime: arrTime,
              departureTime: depTime,
              priority: priorityRank,
              note,
            },
          });
        } else {
          await tx.dailyTaskItem.create({
            data: {
              taskId,
              roomId,
              status: "BEKLIYOR",
              arrivalTime: arrTime,
              departureTime: depTime,
              priority: priorityRank,
              note,
            },
          });
        }
      }

      // OccupancyUpload durumunu güncelle
      await tx.occupancyUpload.update({
        where: { id: uploadRecord.id },
        data: {
          status: errorRows === 0 ? "TAMAMLANDI" : "HATA",
          okRows,
          errorRows,
          errors: errors.slice(0, 50),
        },
      });

      await audit(tx, {
        userId,
        hotelId,
        action: "OCCUPANCY_UPLOAD",
        entity: "OccupancyUpload",
        entityId: uploadRecord.id,
        after: {
          fileName,
          detectedKind,
          totalRows: parsedRows.length,
          okRows,
          errorRows,
          tasksCreated: {
            inhouse: inhouseCreated,
            arrivals: arrivalsCreated,
            departures: departuresCreated,
            clashes: clashesCreated,
          },
        },
      });

      return { uploadId: uploadRecord.id, okRows, errorRows, inhouseCreated, arrivalsCreated, departuresCreated, clashesCreated };
    },
    { timeout: 120_000, maxWait: 10_000 },
  );
  const { okRows, errorRows, inhouseCreated, arrivalsCreated, departuresCreated, clashesCreated } = outcome;
  const uploadRecord = { id: outcome.uploadId };

  const schedCheck = checkUploadScheduleWindow();

  return {
    success: true,
    code,
    uploadId: uploadRecord.id,
    totalRows: parsedRows.length,
    okRows,
    errorRows,
    tasksCreated: {
      inhouse: inhouseCreated,
      arrivals: arrivalsCreated,
      departures: departuresCreated,
      clashes: clashesCreated,
    },
    errors,
    warning: schedCheck.isWithinWindow ? undefined : schedCheck.message,
    detectedKind,
  };
}
