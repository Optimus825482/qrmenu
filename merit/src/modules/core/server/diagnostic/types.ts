export type DiagnosticSeverity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export type DiagnosticModule =
  | "CORE"
  | "DATABASE"
  | "AUTH"
  | "MINIBAR"
  | "QR_ORDER"
  | "QR_MENU"
  | "ROOM_SERVICE"
  | "MAIL"
  | "DRIVE"
  | "NETWORK";

export interface DiagnosticProbeResult {
  name: string;
  category: "DATABASE" | "MEMORY" | "MAIL" | "DRIVE" | "SERVICES" | "MODULES";
  status: "PASS" | "WARN" | "FAIL";
  message: string;
  latencyMs?: number;
  details?: Record<string, unknown>;
  recommendation?: string;
}

export interface SystemMemoryStats {
  rssMb: number;
  heapUsedMb: number;
  heapTotalMb: number;
  /** V8 heap ceiling (--max-old-space-size); heapUsagePct is measured against this. */
  heapLimitMb: number;
  externalMb: number;
  heapUsagePct: number;
}

export interface SystemHealthReport {
  overallStatus: "HEALTHY" | "DEGRADED" | "CRITICAL";
  healthScore: number; // 0 - 100
  timestamp: string;
  uptimeSeconds: number;
  uptimeFormatted: string;
  memory: SystemMemoryStats;
  dbLatencyMs: number;
  activeOnlineSessions: number;
  probes: DiagnosticProbeResult[];
  activeAlertsCount: number;
}

export interface DiagnosticIncidentData {
  errorId: string;
  module: DiagnosticModule;
  severity: DiagnosticSeverity;
  errorName: string;
  errorMessage: string;
  stackTrace?: string;
  rootCause: string;
  recommendation: string;
  context?: {
    action?: string;
    screenCode?: string;
    hotelId?: string;
    userId?: string;
    path?: string;
    params?: unknown;
  };
  metrics?: {
    heapUsedMb: number;
    dbLatencyMs?: number;
    uptimeSeconds: number;
  };
  mailSent: boolean;
  mailRecipient?: string;
  mailError?: string;
  resolved: boolean;
  resolvedAt?: string;
  resolvedBy?: string;
  resolveNote?: string;
}

export interface DiagnosticIncidentRow {
  id: string;
  createdAt: string;
  hotelId: string | null;
  hotelName?: string;
  userId: string | null;
  userName?: string;
  data: DiagnosticIncidentData;
}
