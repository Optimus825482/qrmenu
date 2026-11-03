import { truncate } from "./db";
import { resetReferenceData } from "./fixtures";

/** Empties everything a full migration writes and re-seeds hotels, roles, settings and the seed admin. */
export async function resetMigrationTarget(): Promise<void> {
  await resetReferenceData();
  await truncate(
    "legacy_id_map",
    "legacy_personel_zimmet",
    "products",
    "product_groups",
    "setups",
    "room_types",
    "email_settings",
    "email_logs",
    "notifications",
    "stock_requests",
    "mybar_requests",
    "minibar_transactions",
    "room_checks",
    "hotel_stocks",
    "hotel_stock_movements",
    "occupancy_uploads",
    "guest_records",
    "upload_tasks",
    "daily_tasks",
    "room_dnds",
    "qr_scan_logs",
    "audit_logs",
  );
}

/** [legacy, created, existing, dropped, failed, fark] of a report table row. */
export function reportRow(report: string, name: string): number[] {
  const m = new RegExp(`\\| ${name} \\| (\\d+) \\| (\\d+) \\| (\\d+) \\| (\\d+) \\| (\\d+) \\| (-?\\d+) \\|`).exec(report);
  if (!m) throw new Error(`rapor satırı yok: ${name}`);
  return m.slice(1).map(Number);
}

export function reportWarnCount(report: string, code: string): number {
  const m = new RegExp(`\\*\\*${code}\\*\\* \\((\\d+)\\)`).exec(report);
  return m ? Number(m[1]) : 0;
}
