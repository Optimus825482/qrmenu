export interface FloorSummary {
  id: string;
  number: number;
  name: string;
  totalRooms: number;
  occupiedRooms: number;
  emptyRooms: number;
  occupancyRate: number; // 0 - 100
  arrivalCount: number;
  departureCount: number;
  checkedCount: number;
  dndCount: number;
  mybarCount: number;
}

export interface TaskSummary {
  total: number;
  completed: number;
  pending: number;
  dnd: number;
  completionRate: number; // 0 - 100
  clashCount: number; // Departure-Arrival clashes
}

export interface RoomCardData {
  id: string;
  number: string;
  floorId: string;
  floorName: string;
  roomTypeId: string | null;
  roomTypeName: string | null;
  status: "in_house" | "arrival" | "departure" | "clash" | "empty";
  statusLabel: string;
  guestName?: string | null;
  arrivalTime?: string | null;
  departureTime?: string | null;
  checkStatus: "pending" | "completed" | "dnd";
  lastCheckAt?: string | null;
  dndCount: number;
  lastDndAt?: string | null;
  hasMybarRequest: boolean;
  mybarDetails?: {
    id: string;
    requestedAt: string;
    items: { productName: string; qty: number }[];
    notes?: string | null;
  } | null;
}

export interface SetupInspectionItem {
  setupId: string;
  setupName: string;
  isInsideCabinet: boolean;
  items: {
    productId: string;
    productName: string;
    unit: string;
    groupName: string;
    targetQty: number; // Target quantity defined in setup
    hotelStockQty: number; // Current available consignment stock in hotel pool
    addedQty: number; // Quantity replenished in this check
    replenishedToday?: number; // already replenished in this room today (daily cap guidance)
  }[];
}

export interface PriorityTaskPlanItem {
  taskId: string;
  roomId: string;
  roomNumber: string;
  floorId: string;
  floorNumber: number;
  floorName: string;
  priorityRank: number; // 1 (highest), 2, ...
  urgencyType: "CLASH" | "ARRIVAL" | "IN_HOUSE" | "DEPARTURE" | "DND_RETRY";
  urgencyBadge: string;
  targetTime?: string | null;
  minutesRemaining?: number | null;
  explanation: string;
  isCompleted: boolean;
}

export interface PriorityRoutePlan {
  summary: {
    total: number;
    critical: number;
    normal: number;
    clashCount: number;
  };
  recommendedStartFloor: {
    floorNumber: number;
    floorName: string;
    firstRoomNumber: string;
    reason: string;
  } | null;
  floorSequence: {
    floorNumber: number;
    floorName: string;
    taskCount: number;
    criticalCount: number;
  }[];
  tasks: PriorityTaskPlanItem[];
  briefing: string;
}

export interface RoomCheckHistoryItem {
  id: string; // transactionId
  roomId: string;
  roomNumber: string;
  floorId: string;
  floorNumber: number;
  floorName: string;
  roomTypeName: string;
  type: string;
  typeLabel: string;
  typeBadgeColor: "emerald" | "slate" | "amber" | "yellow";
  note: string | null;
  occurredAt: string;
  dateStr: string;
  isToday: boolean;
  canEditDirectly: boolean; // true if isToday === true
  items: {
    productId: string;
    productName: string;
    consumed: number;
    added: number;
    groupName: string;
    maxTargetQty?: number;
    stockQty?: number;
  }[];
  totalItemsCount: number;
  pendingCorrection?: {
    id: string;
    actionType: "SILME" | "DUZELTME";
    reason: string;
    status: "BEKLIYOR" | "ONAYLANDI" | "REDDEDILDI";
    requestedByName: string;
    createdAt: string;
  } | null;
}

export interface CorrectionRequestItem {
  id: string;
  transactionId: string | null;
  roomNumber: string;
  floorName: string;
  occurredAt: string;
  actionType: "SILME" | "DUZELTME";
  reason: string;
  status: "BEKLIYOR" | "ONAYLANDI" | "REDDEDILDI";
  requestedById: string;
  requestedByName: string;
  approvedById?: string | null;
  approvedByName?: string | null;
  proposedData?: Record<string, number> | null;
  createdAt: string;
  resolvedAt?: string | null;
  items: {
    productName: string;
    qty: number;
  }[];
}
