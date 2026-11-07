// Reporting & e-mail constants (P7). Client-safe: no server imports.

/** `EmailLog.kind` values written by the mail pipeline. */
export const MAIL_KINDS = ["RAPOR_GOREV", "RAPOR_SARFIYAT", "UYARI_YUKLEME", "TEST"] as const;
export type MailKind = (typeof MAIL_KINDS)[number];

/** Rows shown on screen / written to Excel / printed to PDF before the export is cut short. */
export const SCREEN_ROW_LIMIT = 500;
export const XLSX_ROW_LIMIT = 50_000;
export const PDF_ROW_LIMIT = 2_000;
/** Longest report date range, in days (closed interval). */
export const MAX_RANGE_DAYS = 366;
/** `EmailLog` rows older than this are removed by the cleanup job. */
export const MAIL_LOG_RETENTION_DAYS = 90;
/** Report exports per minute and user. */
export const EXPORT_RATE_PER_MINUTE = 10;
