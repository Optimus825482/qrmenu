import ExcelJS from "exceljs";
import { prisma } from "@/lib/prisma";
import { getBusinessDate } from "./minibarService";
import { GuestRecordKind, TaskType } from "@/generated/prisma/client";
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
  arrivalDate: Date;
  arrivalTime?: string;
  departureDate: Date;
  departureTime?: string;
  kind: GuestRecordKind;
}

/**
 * Saat ve tarih yardımcıları
 */
function parseDateCell(val: unknown): Date | null {
  if (!val) return null;
  if (val instanceof Date) return val;
  if (typeof val === "number") {
    // Excel serial date to JS Date
    const excelEpoch = new Date(1899, 11, 30);
    return new Date(excelEpoch.getTime() + val * 86400000);
  }
  if (typeof val === "string") {
    const trimmed = val.trim();
    // Format DD.MM.YYYY veya YYYY-MM-DD
    const dotParts = trimmed.split(".");
    if (dotParts.length === 3) {
      const day = parseInt(dotParts[0], 10);
      const month = parseInt(dotParts[1], 10) - 1;
      const year = parseInt(dotParts[2], 10);
      if (!isNaN(day) && !isNaN(month) && !isNaN(year)) {
        return new Date(year, month, day);
      }
    }
    const parsed = new Date(trimmed);
    if (!isNaN(parsed.getTime())) return parsed;
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
    const h = String(val.getHours()).padStart(2, "0");
    const m = String(val.getMinutes()).padStart(2, "0");
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
export function checkUploadScheduleWindow(): {
  isWithinWindow: boolean;
  currentTimeStr: string;
  message: string;
} {
  const now = new Date();
  const currentHour = now.getHours();
  const currentMinute = now.getMinutes();
  const currentTimeStr = `${String(currentHour).padStart(2, "0")}:${String(currentMinute).padStart(2, "0")}`;

  // Kıbrıs / Türkiye saat diliminde 09:00 - 10:00 arası idealdir
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
  const today = getBusinessDate();

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

      const arrivalDate = parseDateCell(arrivalVal) || today;
      const departureDate = parseDateCell(departureVal) || today;
      const arrivalTime = parseTimeCell(arrTimeVal);
      const departureTime = parseTimeCell(depTimeVal);

      // Satır bazında akıllı kind tespiti
      let rowKind = sheetKind;
      const arrYMD = arrivalDate.toISOString().slice(0, 10);
      const depYMD = departureDate.toISOString().slice(0, 10);
      const todayYMD = today.toISOString().slice(0, 10);

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

  // Oteldeki mevcut odaları çek
  const existingRooms = await prisma.room.findMany({
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
  const uploadRecord = await prisma.occupancyUpload.create({
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
      await prisma.guestRecord.create({
        data: {
          hotelId,
          roomId,
          uploadId: uploadRecord.id,
          batchCode: code,
          guestCount: row.guestCount,
          arrivalDate: row.arrivalDate,
          arrivalTime: row.arrivalTime,
          departureDate: row.departureDate,
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
    let task = await prisma.dailyTask.findUnique({
      where: {
        hotelId_date_type: {
          hotelId,
          date: today,
          type: tType,
        },
      },
    });

    if (!task) {
      task = await prisma.dailyTask.create({
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
    const existingItem = await prisma.dailyTaskItem.findFirst({
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
      await prisma.dailyTaskItem.update({
        where: { id: existingItem.id },
        data: {
          arrivalTime: arrTime,
          departureTime: depTime,
          priority: priorityRank,
          note,
        },
      });
    } else {
      await prisma.dailyTaskItem.create({
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
  await prisma.occupancyUpload.update({
    where: { id: uploadRecord.id },
    data: {
      status: errorRows === 0 ? "TAMAMLANDI" : "HATA",
      okRows,
      errorRows,
      errors: errors.slice(0, 50),
    },
  });

  await audit(prisma, {
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
