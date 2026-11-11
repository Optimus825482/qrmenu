"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { confirm } from "@/shell/confirm";
import { Icon } from "@/components/icons/Icon";
import { HotelBadges } from "@/components/ui/HotelBadge";

interface ProductGroupItem {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  productCount: number;
  createdAt: string;
}

interface ProductItem {
  id: string;
  groupId: string;
  groupName: string;
  code: string | null;
  name: string;
  barcode: string | null;
  unit: string;
  criticalLevel: number;
  purchasePrice: number | null;
  salePrice: number | null;
  isActive: boolean;
  setupItemCount: number;
  hasStock: boolean;
}

interface RoomTypeItem {
  id: string;
  hotelId: string;
  name: string;
  cabinetCount: number;
  isActive: boolean;
  roomCount: number;
  setupCount: number;
  assignedSetups: {
    setupId: string;
    setupName: string;
    isInsideCabinet: boolean;
  }[];
}

interface SetupItemData {
  id: string;
  productId: string;
  productName: string;
  unit: string;
  salePrice: number;
  qty: number;
}

interface SetupItem {
  id: string;
  name: string;
  description: string | null;
  isInsideCabinet: boolean;
  isActive: boolean;
  itemCount: number;
  roomTypeAssignmentCount: number;
  totalNormItems: number;
  items: SetupItemData[];
}

interface RoomTypeSetupItem {
  hotelId: string;
  hotelName: string;
  roomTypeId: string;
  roomTypeName: string;
  setupId: string;
  setupName: string;
  isInsideCabinet: boolean;
  itemCount: number;
  createdAt: string;
}

interface AuditLogItem {
  id: string;
  action: string;
  entity: string;
  entityId: string | null;
  userName: string;
  hotelName: string;
  before: unknown;
  after: unknown;
  ip: string | null;
  createdAt: string;
}

interface HotelOption {
  id: string;
  name: string;
  code: string;
}

export default function MinibarTanimlarPage() {
  const [activeTab, setActiveTab] = useState<
    "GROUPS" | "PRODUCTS" | "ROOM_TYPES" | "SETUPS" | "ASSIGNMENTS" | "AUDIT"
  >("PRODUCTS");

  const [hotels, setHotels] = useState<HotelOption[]>([]);
  const [selectedHotelId, setSelectedHotelId] = useState<string>("");
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Data states
  const [groups, setGroups] = useState<ProductGroupItem[]>([]);
  const [products, setProducts] = useState<ProductItem[]>([]);
  const [roomTypes, setRoomTypes] = useState<RoomTypeItem[]>([]);
  const [setups, setSetups] = useState<SetupItem[]>([]);
  const [assignments, setAssignments] = useState<RoomTypeSetupItem[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogItem[]>([]);

  // Search & Filters
  const [productSearch, setProductSearch] = useState<string>("");
  const [selectedGroupFilter, setSelectedGroupFilter] = useState<string>("");

  // Modal states
  const [modalMode, setModalMode] = useState<
    | "NONE"
    | "GROUP_FORM"
    | "PRODUCT_FORM"
    | "ROOM_TYPE_FORM"
    | "SETUP_FORM"
    | "SETUP_ITEMS"
    | "ASSIGN_FORM"
    | "AUDIT_DIFF"
  >("NONE");

  // Form states
  const [currentGroup, setCurrentGroup] = useState<{ id?: string; name: string; description: string; isActive: boolean }>({
    name: "",
    description: "",
    isActive: true,
  });

  const [currentProduct, setCurrentProduct] = useState<{
    id?: string;
    groupId: string;
    name: string;
    code: string;
    barcode: string;
    unit: string;
    criticalLevel: number;
    purchasePrice: string;
    salePrice: string;
    isActive: boolean;
  }>({
    groupId: "",
    name: "",
    code: "",
    barcode: "",
    unit: "Adet",
    criticalLevel: 10,
    purchasePrice: "0",
    salePrice: "0",
    isActive: true,
  });

  const [currentRoomType, setCurrentRoomType] = useState<{
    id?: string;
    name: string;
    cabinetCount: number;
    isActive: boolean;
  }>({
    name: "",
    cabinetCount: 1,
    isActive: true,
  });

  const [currentSetup, setCurrentSetup] = useState<{
    id?: string;
    name: string;
    description: string;
    isInsideCabinet: boolean;
    isActive: boolean;
  }>({
    name: "",
    description: "",
    isInsideCabinet: true,
    isActive: true,
  });

  // Setup Items Modal state
  const [activeSetupForItems, setActiveSetupForItems] = useState<SetupItem | null>(null);
  const [selectedProductToAdd, setSelectedProductToAdd] = useState<string>("");
  const [selectedQtyToAdd, setSelectedQtyToAdd] = useState<number>(2);

  // Assignment Modal state
  const [assignForm, setAssignForm] = useState<{ roomTypeId: string; setupId: string }>({
    roomTypeId: "",
    setupId: "",
  });

  // Audit Diff state
  const [activeAuditLog, setActiveAuditLog] = useState<AuditLogItem | null>(null);

  // 1. Initial Load of Hotels and Reference Data
  const loadInitialData = useCallback(async () => {
    try {
      setIsLoading(true);
      setErrorMsg(null);

      // Otelleri al
      const hRes = await fetch("/api/minibar/depo/stock");
      if (hRes.ok) {
        const hData = await hRes.json();
        setHotels(hData.hotels || []);
        if (hData.selectedHotelId) setSelectedHotelId(hData.selectedHotelId);
      }

      // Gruplar ve Ürünler
      const [gRes, pRes, sRes] = await Promise.all([
        fetch("/api/minibar/definitions/product-groups"),
        fetch("/api/minibar/definitions/products"),
        fetch("/api/minibar/definitions/setups"),
      ]);

      if (gRes.ok) {
        const gData = await gRes.json();
        setGroups(gData.groups || []);
      }
      if (pRes.ok) {
        const pData = await pRes.json();
        setProducts(pData.products || []);
      }
      if (sRes.ok) {
        const sData = await sRes.json();
        setSetups(sData.setups || []);
      }
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Tanımlamalar yüklenemedi.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadInitialData();
    }, 0);
    return () => clearTimeout(timer);
  }, [loadInitialData]);

  // 2. Load Hotel Dependent Data (RoomTypes, Assignments)
  const loadHotelSpecificData = useCallback(async (hotelId: string) => {
    if (!hotelId) return;
    try {
      const [rtRes, rtsRes] = await Promise.all([
        fetch(`/api/minibar/definitions/room-types?hotelId=${encodeURIComponent(hotelId)}`),
        fetch(`/api/minibar/definitions/room-type-setups?hotelId=${encodeURIComponent(hotelId)}`),
      ]);

      if (rtRes.ok) {
        const rtData = await rtRes.json();
        setRoomTypes(rtData.roomTypes || []);
      }
      if (rtsRes.ok) {
        const rtsData = await rtsRes.json();
        setAssignments(rtsData.assignments || []);
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (selectedHotelId) {
      const t = setTimeout(() => void loadHotelSpecificData(selectedHotelId), 0);
      return () => clearTimeout(t);
    }
  }, [selectedHotelId, loadHotelSpecificData]);

  // 3. Load Audit Logs on Tab Select
  const loadAuditLogs = useCallback(async () => {
    try {
      const res = await fetch("/api/minibar/definitions/audit-logs?limit=150");
      if (res.ok) {
        const data = await res.json();
        setAuditLogs(data.logs || []);
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (activeTab === "AUDIT") {
      const t = setTimeout(() => void loadAuditLogs(), 0);
      return () => clearTimeout(t);
    }
  }, [activeTab, loadAuditLogs]);

  // Flash message helper
  const notifySuccess = (msg: string) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(null), 4000);
  };

  // ─────────────────────────────────────────────────────────────────────────
  // PRODUCT GROUP ACTIONS
  // ─────────────────────────────────────────────────────────────────────────
  const handleSaveGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setErrorMsg(null);
      const isEdit = Boolean(currentGroup.id);
      const url = "/api/minibar/definitions/product-groups";
      const method = isEdit ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(currentGroup),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Grup kaydedilemedi.");

      notifySuccess(isEdit ? "Ürün grubu güncellendi." : "Yeni ürün grubu oluşturuldu.");
      setModalMode("NONE");
      void loadInitialData();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "İşlem hatası.");
    }
  };

  const handleDeleteGroup = async (id: string, name: string) => {
    if (!(await confirm({ title: `"${name}" silinsin mi?`, message: "Ürün grubu silinir.", danger: true, confirmLabel: "Sil" }))) return;
    try {
      setErrorMsg(null);
      const res = await fetch(`/api/minibar/definitions/product-groups?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Grup silinemedi.");

      notifySuccess(data.message || "Grup silindi.");
      void loadInitialData();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Silme hatası.");
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // PRODUCT ACTIONS
  // ─────────────────────────────────────────────────────────────────────────
  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setErrorMsg(null);
      const isEdit = Boolean(currentProduct.id);
      const url = "/api/minibar/definitions/products";
      const method = isEdit ? "PUT" : "POST";

      const payload = {
        ...currentProduct,
        purchasePrice: parseFloat(currentProduct.purchasePrice) || 0,
        salePrice: parseFloat(currentProduct.salePrice) || 0,
      };

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Ürün kaydedilemedi.");

      notifySuccess(isEdit ? "Ürün güncellendi." : "Yeni ürün başarıyla tanımlandı.");
      setModalMode("NONE");
      void loadInitialData();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "İşlem hatası.");
    }
  };

  const handleDeleteProduct = async (id: string, name: string) => {
    if (!(await confirm({ title: `"${name}" silinsin mi?`, message: "Ürün silinir; kullanımdaysa pasife alınır.", danger: true, confirmLabel: "Sil" }))) return;
    try {
      setErrorMsg(null);
      const res = await fetch(`/api/minibar/definitions/products?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Ürün silinemedi.");

      notifySuccess(data.message || "Ürün silindi.");
      void loadInitialData();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Silme hatası.");
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // ROOM TYPE ACTIONS
  // ─────────────────────────────────────────────────────────────────────────
  const handleSaveRoomType = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setErrorMsg(null);
      const isEdit = Boolean(currentRoomType.id);
      const url = "/api/minibar/definitions/room-types";
      const method = isEdit ? "PUT" : "POST";

      const payload = {
        hotelId: selectedHotelId,
        ...currentRoomType,
      };

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Oda tipi kaydedilemedi.");

      notifySuccess(isEdit ? "Oda tipi güncellendi." : "Yeni oda tipi tanımlandı.");
      setModalMode("NONE");
      void loadHotelSpecificData(selectedHotelId);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "İşlem hatası.");
    }
  };

  const handleDeleteRoomType = async (id: string, name: string) => {
    if (!(await confirm({ title: `"${name}" silinsin mi?`, message: "Oda tipi silinir.", danger: true, confirmLabel: "Sil" }))) return;
    try {
      setErrorMsg(null);
      const res = await fetch(`/api/minibar/definitions/room-types?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Oda tipi silinemedi.");

      notifySuccess(data.message || "Oda tipi silindi.");
      void loadHotelSpecificData(selectedHotelId);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Silme hatası.");
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // SETUP ACTIONS
  // ─────────────────────────────────────────────────────────────────────────
  const handleSaveSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setErrorMsg(null);
      const isEdit = Boolean(currentSetup.id);
      const url = "/api/minibar/definitions/setups";
      const method = isEdit ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(currentSetup),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Setup kaydedilemedi.");

      notifySuccess(isEdit ? "Setup güncellendi." : "Yeni setup konsepti oluşturuldu.");
      setModalMode("NONE");
      void loadInitialData();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "İşlem hatası.");
    }
  };

  const handleDeleteSetup = async (id: string, name: string) => {
    if (!(await confirm({ title: `"${name}" silinsin mi?`, message: "Setup silinir.", danger: true, confirmLabel: "Sil" }))) return;
    try {
      setErrorMsg(null);
      const res = await fetch(`/api/minibar/definitions/setups?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Setup silinemedi.");

      notifySuccess(data.message || "Setup silindi.");
      void loadInitialData();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Silme hatası.");
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // SETUP ITEM (İÇERİK) ACTIONS
  // ─────────────────────────────────────────────────────────────────────────
  const handleAddSetupItem = async () => {
    if (!activeSetupForItems || !selectedProductToAdd) return;
    try {
      setErrorMsg(null);
      const res = await fetch("/api/minibar/definitions/setup-items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          setupId: activeSetupForItems.id,
          productId: selectedProductToAdd,
          qty: selectedQtyToAdd,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Setup içeriği eklenemedi.");

      notifySuccess("Ürün setup normuna eklendi.");
      setSelectedProductToAdd("");
      setSelectedQtyToAdd(2);

      // Refresh setups
      const sRes = await fetch("/api/minibar/definitions/setups");
      if (sRes.ok) {
        const sData = await sRes.json();
        setSetups(sData.setups || []);
        const updated = (sData.setups as SetupItem[]).find((s) => s.id === activeSetupForItems.id);
        if (updated) setActiveSetupForItems(updated);
      }
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Ekleme hatası.");
    }
  };

  const handleDeleteSetupItem = async (setupItemId: string) => {
    try {
      setErrorMsg(null);
      const res = await fetch(`/api/minibar/definitions/setup-items?id=${encodeURIComponent(setupItemId)}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Setup öğesi silinemedi.");

      notifySuccess("Ürün setup normundan çıkarıldı.");

      // Refresh setups
      const sRes = await fetch("/api/minibar/definitions/setups");
      if (sRes.ok) {
        const sData = await sRes.json();
        setSetups(sData.setups || []);
        if (activeSetupForItems) {
          const updated = (sData.setups as SetupItem[]).find((s) => s.id === activeSetupForItems.id);
          if (updated) setActiveSetupForItems(updated);
        }
      }
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Silme hatası.");
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // ROOM TYPE SETUP ATAMA ACTIONS
  // ─────────────────────────────────────────────────────────────────────────
  const handleAssignSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setErrorMsg(null);
      const res = await fetch("/api/minibar/definitions/room-type-setups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hotelId: selectedHotelId,
          roomTypeId: assignForm.roomTypeId,
          setupId: assignForm.setupId,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Atama yapılamadı.");

      notifySuccess("Oda tipine setup ataması başarıyla yapıldı.");
      setModalMode("NONE");
      setAssignForm({ roomTypeId: "", setupId: "" });
      void loadHotelSpecificData(selectedHotelId);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Atama hatası.");
    }
  };

  const handleRemoveAssignment = async (roomTypeId: string, setupId: string) => {
    if (!(await confirm({ title: "Setup ataması kaldırılsın mı?", message: "Oda tipinden bu setup kaldırılır.", danger: true, confirmLabel: "Kaldır" }))) return;
    try {
      setErrorMsg(null);
      const params = new URLSearchParams({
        hotelId: selectedHotelId,
        roomTypeId,
        setupId,
      });

      const res = await fetch(`/api/minibar/definitions/room-type-setups?${params.toString()}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Atama kaldırılamadı.");

      notifySuccess("Setup ataması kaldırıldı.");
      void loadHotelSpecificData(selectedHotelId);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Kaldırma hatası.");
    }
  };

  // Filtered Products
  const filteredProducts = products.filter((p) => {
    if (selectedGroupFilter && p.groupId !== selectedGroupFilter) return false;
    if (!productSearch) return true;
    const q = productSearch.toLowerCase();
    return (
      p.name.toLowerCase().includes(q) ||
      (p.code && p.code.toLowerCase().includes(q)) ||
      (p.barcode && p.barcode.toLowerCase().includes(q))
    );
  });

  return (
    <div className="depo-touch min-h-screen bg-bg text-text flex flex-col font-sans select-none">
      {/* Üst Navigasyon */}
      <header className="sticky top-0 z-40 bg-surface backdrop-blur border-b border-border px-4 py-3 shadow-md">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link
              href="/kat"
              className="p-2 bg-bg hover:bg-border text-text rounded-lg transition"
              title="Dashboard"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
            </Link>
            <div>
              <h1 className="text-lg md:text-xl font-bold tracking-tight text-text flex items-center gap-2">
                <span><Icon name="settings" size={20} /> Minibar & Sistem Tanımlamaları</span>
              </h1>
              <p className="text-xs text-muted">
                Ürün Grupları • Ürünler • Oda Tipleri • Setuplar • <Icon name="shield" size={20} /> Silinemez Denetim Kaydı
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {hotels.length > 0 && (
              <select
                aria-label="Otel"
                value={selectedHotelId}
                onChange={(e) => {
                  const id = e.target.value;
                  setSelectedHotelId(id);
                  void loadHotelSpecificData(id);
                }}
                className="bg-bg text-warn border border-border rounded-lg px-3 py-1.5 text-xs font-semibold focus:outline-none focus:border-warn/40"
              >
                {hotels.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.name}
                  </option>
                ))}
              </select>
            )}

            <Link
              href="/depo/stok"
              className="px-3 py-1.5 bg-surface hover:bg-success/20 text-success border border-success/40 rounded-lg text-xs font-semibold transition"
            >
              <Icon name="box" size={20} /> Stok Havuzu
            </Link>

            <Link
              href="/kat/tavsiye-is-plani"
              className="px-3 py-1.5 bg-warn/10 hover:bg-warn/20 text-warn border border-warn/40 rounded-lg text-xs font-semibold transition"
            >
              <Icon name="lightbulb" size={20} /> Tavsiye Planı
            </Link>

            <Link
              href="/depo/raporlar"
              className="px-3 py-1.5 bg-info/10 hover:bg-info/20 text-info border border-info/40 rounded-lg text-xs font-semibold transition"
            >
              <Icon name="trending" size={20} /> Raporlar
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto w-full p-4 md:p-6 space-y-6">
        {/* Bildirim Mesajları */}
        {errorMsg && (
          <div className="p-4 bg-danger/10 border border-danger/40 rounded-xl text-danger text-xs flex items-center justify-between">
            <span><Icon name="warning" size={20} /> {errorMsg}</span>
            <button aria-label="Kapat" onClick={() => setErrorMsg(null)} className="text-danger hover:text-text ml-2">
              <Icon name="close" size={20} />
            </button>
          </div>
        )}

        {successMsg && (
          <div role="status" className="p-4 bg-surface border border-success/40 rounded-xl text-success text-xs flex items-center justify-between">
            <span><Icon name="check" size={20} /> {successMsg}</span>
            <button aria-label="Kapat" onClick={() => setSuccessMsg(null)} className="text-success hover:text-text ml-2">
              <Icon name="close" size={20} />
            </button>
          </div>
        )}

        {/* Ana Sekmeler */}
        <div data-guide="tanim-sekmeleri" className="flex items-center gap-2 overflow-x-auto pb-1 border-b border-border text-xs font-bold">
          <button
            onClick={() => setActiveTab("PRODUCTS")}
            className={`px-4 py-2.5 rounded-xl transition flex items-center gap-1.5 shrink-0 ${
              activeTab === "PRODUCTS"
                ? "bg-warn text-bg shadow-md font-bold"
                : "bg-surface text-muted hover:text-text border border-border"
            }`}
          >
            <Icon name="minibar" size={20} />
            <span>Ürünler ({products.length})</span>
          </button>

          <button
            onClick={() => setActiveTab("GROUPS")}
            className={`px-4 py-2.5 rounded-xl transition flex items-center gap-1.5 shrink-0 ${
              activeTab === "GROUPS"
                ? "bg-warn text-bg shadow-md font-bold"
                : "bg-surface text-muted hover:text-text border border-border"
            }`}
          >
            <Icon name="tag" size={20} />
            <span>Ürün Grupları ({groups.length})</span>
          </button>

          <button
            onClick={() => setActiveTab("SETUPS")}
            className={`px-4 py-2.5 rounded-xl transition flex items-center gap-1.5 shrink-0 ${
              activeTab === "SETUPS"
                ? "bg-warn text-bg shadow-md font-bold"
                : "bg-surface text-muted hover:text-text border border-border"
            }`}
          >
            <Icon name="box" size={20} />
            <span>Setup Konseptleri ({setups.length})</span>
          </button>

          <button
            onClick={() => setActiveTab("ROOM_TYPES")}
            className={`px-4 py-2.5 rounded-xl transition flex items-center gap-1.5 shrink-0 ${
              activeTab === "ROOM_TYPES"
                ? "bg-warn text-bg shadow-md font-bold"
                : "bg-surface text-muted hover:text-text border border-border"
            }`}
          >
            <Icon name="bed" size={20} />
            <span>Oda Tipleri ({roomTypes.length})</span>
          </button>

          <button
            onClick={() => setActiveTab("ASSIGNMENTS")}
            className={`px-4 py-2.5 rounded-xl transition flex items-center gap-1.5 shrink-0 ${
              activeTab === "ASSIGNMENTS"
                ? "bg-warn text-bg shadow-md font-bold"
                : "bg-surface text-muted hover:text-text border border-border"
            }`}
          >
            <Icon name="link" size={20} />
            <span>Oda Tipi Setup Atamaları ({assignments.length})</span>
          </button>

          <button
            onClick={() => setActiveTab("AUDIT")}
            className={`px-4 py-2.5 rounded-xl transition flex items-center gap-1.5 shrink-0 ${
              activeTab === "AUDIT"
                ? "bg-info text-white shadow-md font-bold"
                : "bg-surface text-info hover:text-text border border-info/40"
            }`}
          >
            <Icon name="shield" size={20} />
            <span>Silinemez Audit Logları</span>
          </button>
        </div>

        {/* ─────────────────────────────────────────────────────────────────
            1. ÜRÜNLER SEKMESİ
        ───────────────────────────────────────────────────────────────── */}
        {activeTab === "PRODUCTS" && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2 flex-wrap">
                <input
                  type="text"
                  placeholder="Ürün adı, kod veya barkod ara..."
                  value={productSearch}
                  onChange={(e) => setProductSearch(e.target.value)}
                  className="bg-surface border border-border rounded-xl px-3 py-2 text-xs text-text placeholder-muted focus:outline-none focus:border-warn/40 w-full sm:w-64"
                />

                <select
                  aria-label="Ürün grubu filtresi"
                  value={selectedGroupFilter}
                  onChange={(e) => setSelectedGroupFilter(e.target.value)}
                  className="bg-surface text-text border border-border rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-warn/40"
                >
                  <option value="">Tüm Gruplar</option>
                  {groups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </select>
              </div>

              <button
                data-guide="yeni-kayit"
                onClick={() => {
                  setCurrentProduct({
                    groupId: groups[0]?.id || "",
                    name: "",
                    code: "",
                    barcode: "",
                    unit: "Adet",
                    criticalLevel: 10,
                    purchasePrice: "0",
                    salePrice: "0",
                    isActive: true,
                  });
                  setModalMode("PRODUCT_FORM");
                }}
                className="px-4 py-2.5 bg-warn hover:opacity-90 text-bg rounded-xl text-xs font-bold transition shadow-md flex items-center justify-center gap-1.5"
              >
                <Icon name="plus" size={20} />
                <span>Yeni Ürün Tanımla</span>
              </button>
            </div>

            <div className="bg-surface border border-border rounded-2xl shadow-xl overflow-hidden">
              {isLoading ? (
                <div className="py-16 text-center text-muted text-sm">Ürünler yükleniyor...</div>
              ) : filteredProducts.length === 0 ? (
                <div className="py-16 text-center text-muted text-sm">Ürün bulunamadı.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-border text-muted font-semibold uppercase tracking-wider bg-bg/40">
                        <th className="py-3 px-4">Ürün Adı</th>
                        <th className="py-3 px-4">Grup</th>
                        <th className="py-3 px-4">Barkod / Kod</th>
                        <th className="py-3 px-4 text-center">Birim</th>
                        <th className="py-3 px-4 text-center">Kritik Seviye</th>
                        <th className="py-3 px-4 text-center">Durum</th>
                        <th className="py-3 px-4 text-right">İşlemler</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border text-text">
                      {filteredProducts.map((p, pIdx) => (
                        <tr key={p.id} className="hover:bg-border transition">
                          <td className="py-3 px-4 font-bold text-text text-sm">
                            {p.name}
                          </td>
                          <td className="py-3 px-4">
                            <span className="px-2 py-0.5 rounded bg-bg text-warn text-xs font-semibold">
                              {p.groupName}
                            </span>
                          </td>
                          <td className="py-3 px-4 font-mono text-muted">
                            {p.barcode || p.code || "-"}
                          </td>
                          <td className="py-3 px-4 text-center">{p.unit}</td>
                          <td className="py-3 px-4 text-center font-mono">{p.criticalLevel}</td>
                          <td className="py-3 px-4 text-center">
                            <span
                              className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                                p.isActive
                                  ? "bg-success/20 text-success border border-success/40"
                                  : "bg-border text-muted"
                              }`}
                            >
                              {p.isActive ? "Aktif" : "Pasif"}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                data-guide={pIdx === 0 ? "duzenle" : undefined}
                                onClick={() => {
                                  setCurrentProduct({
                                    id: p.id,
                                    groupId: p.groupId,
                                    name: p.name,
                                    code: p.code || "",
                                    barcode: p.barcode || "",
                                    unit: p.unit,
                                    criticalLevel: p.criticalLevel,
                                    purchasePrice: String(p.purchasePrice || 0),
                                    salePrice: String(p.salePrice || 0),
                                    isActive: p.isActive,
                                  });
                                  setModalMode("PRODUCT_FORM");
                                }}
                                className="px-2.5 py-1 bg-bg hover:bg-border text-text rounded-lg transition"
                                title="Düzenle"
                              >
                                Düzenle
                              </button>
                              <button
                                onClick={() => handleDeleteProduct(p.id, p.name)}
                                className="px-2.5 py-1 bg-danger/10 hover:bg-danger/20 text-danger border border-danger/40 rounded-lg transition"
                                title="Sil"
                              >
                                Sil
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ─────────────────────────────────────────────────────────────────
            2. ÜRÜN GRUPLARI SEKMESİ
        ───────────────────────────────────────────────────────────────── */}
        {activeTab === "GROUPS" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted">
                Minibar ürünlerini kategorilendirmek ve raporlamak için ürün gruplarını yönetin.
              </p>
              <button
                onClick={() => {
                  setCurrentGroup({ name: "", description: "", isActive: true });
                  setModalMode("GROUP_FORM");
                }}
                className="px-4 py-2 bg-warn hover:opacity-90 text-bg rounded-xl text-xs font-bold transition shadow-md flex items-center gap-1.5"
              >
                <Icon name="plus" size={20} />
                <span>Yeni Ürün Grubu</span>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {groups.map((g) => (
                <div
                  key={g.id}
                  className="bg-surface border border-border rounded-2xl p-5 shadow-lg flex flex-col justify-between gap-3 hover:border-border transition"
                >
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <h3 className="font-bold text-text text-base">{g.name}</h3>
                      <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-warn/10 text-warn border border-warn/40">
                        {g.productCount} Ürün
                      </span>
                    </div>
                    <p className="text-xs text-muted line-clamp-2">
                      {g.description || "Açıklama belirtilmemiş."}
                    </p>
                  </div>

                  <div className="flex items-center justify-between pt-3 border-t border-border text-xs">
                    <span
                      className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                        g.isActive
                          ? "bg-success/20 text-success"
                          : "bg-border text-muted"
                      }`}
                    >
                      {g.isActive ? "Aktif" : "Pasif"}
                    </span>

                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => {
                          setCurrentGroup({
                            id: g.id,
                            name: g.name,
                            description: g.description || "",
                            isActive: g.isActive,
                          });
                          setModalMode("GROUP_FORM");
                        }}
                        className="px-2.5 py-1 bg-bg hover:bg-border text-text rounded-lg transition"
                      >
                        Düzenle
                      </button>
                      <button
                        onClick={() => handleDeleteGroup(g.id, g.name)}
                        className="px-2.5 py-1 bg-danger/10 hover:bg-danger/20 text-danger border border-danger/40 rounded-lg transition"
                      >
                        Sil
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ─────────────────────────────────────────────────────────────────
            3. SETUP KONSEPTLERİ SEKMESİ
        ───────────────────────────────────────────────────────────────── */}
        {activeTab === "SETUPS" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted">
                Oda tiplerine atanacak minibar setup konseptlerini ve her konseptin norm hedef içeriklerini yönetin.
              </p>
              <button
                onClick={() => {
                  setCurrentSetup({
                    name: "",
                    description: "",
                    isInsideCabinet: true,
                    isActive: true,
                  });
                  setModalMode("SETUP_FORM");
                }}
                className="px-4 py-2 bg-warn hover:opacity-90 text-bg rounded-xl text-xs font-bold transition shadow-md flex items-center gap-1.5"
              >
                <Icon name="plus" size={20} />
                <span>Yeni Setup Konsepti</span>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {setups.map((s) => (
                <div
                  key={s.id}
                  className="bg-surface border border-border rounded-2xl p-5 shadow-lg flex flex-col justify-between gap-3 hover:border-border transition"
                >
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <h3 className="font-bold text-text text-base">{s.name}</h3>
                      <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-info/20 text-info border border-info/40">
                        {s.isInsideCabinet ? "Dolap İçi" : "Açıkta"}
                      </span>
                    </div>

                    <p className="text-xs text-muted line-clamp-2">
                      {s.description || "Açıklama belirtilmemiş."}
                    </p>

                    <div className="mt-3 p-3 bg-bg/60 rounded-xl border border-border space-y-1 text-xs">
                      <div className="flex justify-between text-muted">
                        <span>Farklı Ürün Sayısı:</span>
                        <strong className="text-text">{s.itemCount} Çeşit</strong>
                      </div>
                      <div className="flex justify-between text-muted">
                        <span>Toplam Setup Norm Adedi:</span>
                        <strong className="text-warn">{s.totalNormItems} Adet</strong>
                      </div>
                      <div className="flex justify-between text-muted">
                        <span>Atandığı Oda Tipi Sayısı:</span>
                        <strong className="text-text">{s.roomTypeAssignmentCount}</strong>
                      </div>
                    </div>
                  </div>

                  <div className="pt-2 flex items-center justify-between gap-2">
                    <button
                      onClick={() => {
                        setActiveSetupForItems(s);
                        setModalMode("SETUP_ITEMS");
                      }}
                      className="flex-1 py-2 bg-warn hover:opacity-90 text-bg font-bold rounded-xl text-xs transition shadow-md flex items-center justify-center gap-1.5"
                    >
                      <Icon name="clipboard" size={20} />
                      <span>İçerik Normu Düzenle</span>
                    </button>

                    <button
                      onClick={() => {
                        setCurrentSetup({
                          id: s.id,
                          name: s.name,
                          description: s.description || "",
                          isInsideCabinet: s.isInsideCabinet,
                          isActive: s.isActive,
                        });
                        setModalMode("SETUP_FORM");
                      }}
                      className="p-2 bg-bg hover:bg-border text-text rounded-xl transition"
                      title="Setup Düzenle"
                    >
                      <Icon name="settings" size={20} />
                    </button>

                    <button
                      onClick={() => handleDeleteSetup(s.id, s.name)}
                      className="p-2 bg-danger/10 hover:bg-danger/20 text-danger border border-danger/40 rounded-xl transition"
                      title="Setup Sil"
                    >
                      <Icon name="trash" size={20} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ─────────────────────────────────────────────────────────────────
            4. ODA TİPLERİ SEKMESİ
        ───────────────────────────────────────────────────────────────── */}
        {activeTab === "ROOM_TYPES" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted">
                Seçili oteldeki oda tiplerini ve dolap kapasitelerini yönetin.
              </p>
              <button
                onClick={() => {
                  setCurrentRoomType({
                    name: "",
                    cabinetCount: 1,
                    isActive: true,
                  });
                  setModalMode("ROOM_TYPE_FORM");
                }}
                className="px-4 py-2 bg-warn hover:opacity-90 text-bg rounded-xl text-xs font-bold transition shadow-md flex items-center gap-1.5"
              >
                <Icon name="plus" size={20} />
                <span>Yeni Oda Tipi Tanımla</span>
              </button>
            </div>

            <div className="bg-surface border border-border rounded-2xl shadow-xl overflow-hidden">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-border text-muted font-semibold uppercase tracking-wider bg-bg/40">
                    <th className="py-3 px-4">Oda Tipi Adı</th>
                    <th className="py-3 px-4 text-center">Dolap Sayısı</th>
                    <th className="py-3 px-4 text-center">Oteldeki Oda Sayısı</th>
                    <th className="py-3 px-4">Atanmış Minibar Setupları</th>
                    <th className="py-3 px-4 text-center">Durum</th>
                    <th className="py-3 px-4 text-right">İşlemler</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border text-text">
                  {roomTypes.map((rt) => (
                    <tr key={rt.id} className="hover:bg-border transition">
                      <td className="py-3.5 px-4 font-bold text-text text-sm">{rt.name}</td>
                      <td className="py-3.5 px-4 text-center font-mono font-bold text-warn">
                        {rt.cabinetCount} Dolap
                      </td>
                      <td className="py-3.5 px-4 text-center font-bold text-text">
                        {rt.roomCount} Oda
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="flex flex-wrap gap-1.5">
                          {rt.assignedSetups.length > 0 ? (
                            rt.assignedSetups.map((s) => (
                              <span
                                key={s.setupId}
                                className="px-2 py-0.5 rounded bg-info/20 text-info border border-info/40 text-xs"
                              >
                                {s.setupName}
                              </span>
                            ))
                          ) : (
                            <span className="text-muted italic">Henüz setup atanmadı</span>
                          )}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <span
                          className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                            rt.isActive
                              ? "bg-success/20 text-success"
                              : "bg-border text-muted"
                          }`}
                        >
                          {rt.isActive ? "Aktif" : "Pasif"}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => {
                              setCurrentRoomType({
                                id: rt.id,
                                name: rt.name,
                                cabinetCount: rt.cabinetCount,
                                isActive: rt.isActive,
                              });
                              setModalMode("ROOM_TYPE_FORM");
                            }}
                            className="px-2.5 py-1 bg-bg hover:bg-border text-text rounded-lg transition"
                          >
                            Düzenle
                          </button>
                          <button
                            onClick={() => handleDeleteRoomType(rt.id, rt.name)}
                            className="px-2.5 py-1 bg-danger/10 hover:bg-danger/20 text-danger border border-danger/40 rounded-lg transition"
                          >
                            Sil
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ─────────────────────────────────────────────────────────────────
            5. ODA TİPİ - SETUP ATAMA SEKMESİ
        ───────────────────────────────────────────────────────────────── */}
        {activeTab === "ASSIGNMENTS" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted">
                Hangi oda tipinde hangi minibar setup konseptinin geçerli olacağını belirleyin.
              </p>
              <button
                onClick={() => {
                  setAssignForm({
                    roomTypeId: roomTypes[0]?.id || "",
                    setupId: setups[0]?.id || "",
                  });
                  setModalMode("ASSIGN_FORM");
                }}
                className="px-4 py-2 bg-warn hover:opacity-90 text-bg rounded-xl text-xs font-bold transition shadow-md flex items-center gap-1.5"
              >
                <Icon name="plus" size={20} />
                <span>Oda Tipine Setup Ata</span>
              </button>
            </div>

            <div className="bg-surface border border-border rounded-2xl shadow-xl overflow-hidden">
              {assignments.length === 0 ? (
                <div className="py-16 text-center text-muted text-sm">
                  Henüz bu otel için bir oda tipi - setup ataması yapılmamış.
                </div>
              ) : (
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-border text-muted font-semibold uppercase tracking-wider bg-bg/40">
                      <th className="py-3 px-4">Otel</th>
                      <th className="py-3 px-4">Oda Tipi</th>
                      <th className="py-3 px-4">Atanan Setup Konsepti</th>
                      <th className="py-3 px-4 text-center">Konum</th>
                      <th className="py-3 px-4 text-center">İçerik Çeşidi</th>
                      <th className="py-3 px-4 text-right">İşlem</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border text-text">
                    {assignments.map((a, idx) => (
                      <tr key={idx} className="hover:bg-border transition">
                        <td className="py-3.5 px-4 font-medium text-text"><HotelBadges names={[a.hotelName]} /></td>
                        <td className="py-3.5 px-4 font-bold text-text text-sm">{a.roomTypeName}</td>
                        <td className="py-3.5 px-4 font-bold text-warn">{a.setupName}</td>
                        <td className="py-3.5 px-4 text-center">
                          <span className="px-2 py-0.5 rounded bg-bg text-text text-xs">
                            {a.isInsideCabinet ? "Dolap İçi" : "Açıkta"}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-center font-bold text-text">
                          {a.itemCount} Ürün
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          <button
                            onClick={() => handleRemoveAssignment(a.roomTypeId, a.setupId)}
                            className="px-2.5 py-1 bg-danger/10 hover:bg-danger/20 text-danger border border-danger/40 rounded-lg transition"
                          >
                            Atamayı Kaldır
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {/* ─────────────────────────────────────────────────────────────────
            6. SİLİNEMEZ AUDIT LOGLARI SEKMESİ
        ───────────────────────────────────────────────────────────────── */}
        {activeTab === "AUDIT" && (
          <div className="space-y-4">
            <div className="p-4 bg-info/10 border border-info/40 rounded-2xl flex items-center justify-between gap-3 text-info text-xs">
              <div className="flex items-center gap-2.5">
                <Icon name="shield" size={24} />
                <div>
                  <span className="font-bold">Silinemez Tarih-Saat Damgalı Denetim Kaydı (Immutable Audit Trail):</span> Sistemdeki tüm Ekleme, Güncelleme, Silme ve Atama işlemleri bu alana mühürlenir. Silinen veya güncellenen kayıtların eski içerikleri (`before`) ve yeni içerikleri (`after`) kalıcı olarak saklanır.
                </div>
              </div>
              <button
                onClick={() => void loadAuditLogs()}
                className="px-3 py-1.5 bg-info/10 hover:bg-info/10 text-text rounded-lg transition shrink-0"
              >
                Yenile
              </button>
            </div>

            <div className="bg-surface border border-border rounded-2xl shadow-xl overflow-hidden">
              {auditLogs.length === 0 ? (
                <div className="py-16 text-center text-muted text-sm">Henüz denetim kaydı bulunamadı.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-border text-muted font-semibold uppercase tracking-wider bg-bg/40">
                        <th className="py-3 px-4">Tarih / Saat Damgası</th>
                        <th className="py-3 px-4 text-center">İşlem (Action)</th>
                        <th className="py-3 px-4">Varlık (Entity)</th>
                        <th className="py-3 px-4">Kullanıcı</th>
                        <th className="py-3 px-4">IP Adresi</th>
                        <th className="py-3 px-4 text-right">Eski vs Yeni Veri</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border text-text">
                      {auditLogs.map((log) => {
                        const isDelete = log.action === "DELETE" || log.action === "DEACTIVATE";
                        const isUpdate = log.action === "UPDATE";

                        return (
                          <tr key={log.id} className="hover:bg-border transition">
                            <td className="py-3 px-4 font-mono text-muted">
                              {new Date(log.createdAt).toLocaleString("tr-TR", {
                                dateStyle: "short",
                                timeStyle: "medium",
                              })}
                            </td>
                            <td className="py-3 px-4 text-center">
                              <span
                                className={`px-2 py-0.5 rounded text-xs font-bold ${
                                  isDelete
                                    ? "bg-danger/20 text-danger border border-danger/40"
                                    : isUpdate
                                    ? "bg-warn/20 text-warn border border-warn/40"
                                    : "bg-success/20 text-success border border-success/40"
                                }`}
                              >
                                {log.action}
                              </span>
                            </td>
                            <td className="py-3 px-4 font-bold text-text">
                              {log.entity}
                              {log.entityId && (
                                <span className="block font-mono text-xs text-muted truncate max-w-[120px]">
                                  {log.entityId}
                                </span>
                              )}
                            </td>
                            <td className="py-3 px-4 text-text font-medium">{log.userName}</td>
                            <td className="py-3 px-4 font-mono text-muted text-xs">{log.ip || "-"}</td>
                            <td className="py-3 px-4 text-right">
                              <button
                                onClick={() => {
                                  setActiveAuditLog(log);
                                  setModalMode("AUDIT_DIFF");
                                }}
                                className="px-2.5 py-1 bg-info/20 hover:bg-info/30 text-info border border-info/40 rounded-lg text-xs font-semibold transition"
                              >
                                <Icon name="search" size={20} /> Snapshot Gör
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* ─────────────────────────────────────────────────────────────────
          MODAL 1: ÜRÜN GRUBU FORMU
      ───────────────────────────────────────────────────────────────── */}
      {modalMode === "GROUP_FORM" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-md bg-surface border border-border rounded-2xl p-6 shadow-2xl space-y-4">
            <h3 className="font-bold text-base text-text">
              {currentGroup.id ? "Ürün Grubunu Düzenle" : "Yeni Ürün Grubu"}
            </h3>

            <form onSubmit={handleSaveGroup} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-text mb-1">Grup Adı</label>
                <input
                  type="text"
                  required
                  value={currentGroup.name}
                  onChange={(e) => setCurrentGroup({ ...currentGroup, name: e.target.value })}
                  placeholder="Örn: Meşrubat, Alkol & Şarap, Atıştırmalık"
                  className="w-full bg-bg border border-border rounded-xl px-3 py-2 text-xs text-text focus:outline-none focus:border-warn/40"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-text mb-1">Açıklama (Opsiyonel)</label>
                <textarea
                  rows={3}
                  value={currentGroup.description}
                  onChange={(e) => setCurrentGroup({ ...currentGroup, description: e.target.value })}
                  className="w-full bg-bg border border-border rounded-xl px-3 py-2 text-xs text-text focus:outline-none focus:border-warn/40"
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="grpActive"
                  checked={currentGroup.isActive}
                  onChange={(e) => setCurrentGroup({ ...currentGroup, isActive: e.target.checked })}
                  className="rounded border-border text-warn focus:ring-0"
                />
                <label htmlFor="grpActive" className="text-xs text-text">
                  Aktif Grup
                </label>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setModalMode("NONE")}
                  className="px-4 py-2 bg-bg hover:bg-border text-text rounded-xl text-xs font-semibold"
                >
                  İptal
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-warn hover:opacity-90 text-bg rounded-xl text-xs font-bold"
                >
                  Kaydet
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────
          MODAL 2: ÜRÜN FORMU
      ───────────────────────────────────────────────────────────────── */}
      {modalMode === "PRODUCT_FORM" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-lg bg-surface border border-border rounded-2xl p-6 shadow-2xl space-y-4">
            <h3 className="font-bold text-base text-text">
              {currentProduct.id ? "Ürünü Düzenle" : "Yeni Ürün Tanımla"}
            </h3>

            <form onSubmit={handleSaveProduct} className="space-y-3.5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-text mb-1">Ürün Grubu</label>
                  <select
                    required
                    value={currentProduct.groupId}
                    onChange={(e) => setCurrentProduct({ ...currentProduct, groupId: e.target.value })}
                    className="w-full bg-bg border border-border rounded-xl px-3 py-2 text-xs text-text focus:outline-none focus:border-warn/40"
                  >
                    <option value="">Seçiniz...</option>
                    {groups.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-text mb-1">Ürün Adı</label>
                  <input
                    type="text"
                    required
                    placeholder="Örn: Coca Cola 330ml"
                    value={currentProduct.name}
                    onChange={(e) => setCurrentProduct({ ...currentProduct, name: e.target.value })}
                    className="w-full bg-bg border border-border rounded-xl px-3 py-2 text-xs text-text focus:outline-none focus:border-warn/40"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-text mb-1">Ürün Kodu</label>
                  <input
                    type="text"
                    placeholder="Örn: KOLA-330"
                    value={currentProduct.code}
                    onChange={(e) => setCurrentProduct({ ...currentProduct, code: e.target.value })}
                    className="w-full bg-bg border border-border rounded-xl px-3 py-2 text-xs text-text focus:outline-none focus:border-warn/40"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-text mb-1">Barkod</label>
                  <input
                    type="text"
                    placeholder="8690..."
                    value={currentProduct.barcode}
                    onChange={(e) => setCurrentProduct({ ...currentProduct, barcode: e.target.value })}
                    className="w-full bg-bg border border-border rounded-xl px-3 py-2 text-xs text-text focus:outline-none focus:border-warn/40"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-text mb-1">Birim</label>
                  <input
                    type="text"
                    value={currentProduct.unit}
                    onChange={(e) => setCurrentProduct({ ...currentProduct, unit: e.target.value })}
                    className="w-full bg-bg border border-border rounded-xl px-3 py-2 text-xs text-text focus:outline-none focus:border-warn/40"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-text mb-1">Kritik Stok Seviyesi</label>
                  <input
                    type="number"
                    value={currentProduct.criticalLevel}
                    onChange={(e) =>
                      setCurrentProduct({ ...currentProduct, criticalLevel: parseInt(e.target.value, 10) || 0 })
                    }
                    className="w-full bg-bg border border-border rounded-xl px-3 py-2 text-xs text-text focus:outline-none focus:border-warn/40"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="prodActive"
                  checked={currentProduct.isActive}
                  onChange={(e) => setCurrentProduct({ ...currentProduct, isActive: e.target.checked })}
                  className="rounded border-border text-warn focus:ring-0"
                />
                <label htmlFor="prodActive" className="text-xs text-text">
                  Aktif Ürün
                </label>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setModalMode("NONE")}
                  className="px-4 py-2 bg-bg hover:bg-border text-text rounded-xl text-xs font-semibold"
                >
                  İptal
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-warn hover:opacity-90 text-bg rounded-xl text-xs font-bold"
                >
                  Kaydet
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────
          MODAL 3: SETUP FORMU
      ───────────────────────────────────────────────────────────────── */}
      {modalMode === "SETUP_FORM" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-md bg-surface border border-border rounded-2xl p-6 shadow-2xl space-y-4">
            <h3 className="font-bold text-base text-text">
              {currentSetup.id ? "Setup Konseptini Düzenle" : "Yeni Setup Konsepti"}
            </h3>

            <form onSubmit={handleSaveSetup} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-text mb-1">Setup Adı</label>
                <input
                  type="text"
                  required
                  placeholder="Örn: Standart Minibar, VIP Setup, Suite Konsept"
                  value={currentSetup.name}
                  onChange={(e) => setCurrentSetup({ ...currentSetup, name: e.target.value })}
                  className="w-full bg-bg border border-border rounded-xl px-3 py-2 text-xs text-text focus:outline-none focus:border-warn/40"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-text mb-1">Açıklama</label>
                <textarea
                  rows={3}
                  value={currentSetup.description}
                  onChange={(e) => setCurrentSetup({ ...currentSetup, description: e.target.value })}
                  className="w-full bg-bg border border-border rounded-xl px-3 py-2 text-xs text-text focus:outline-none focus:border-warn/40"
                />
              </div>

              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 text-xs text-text cursor-pointer">
                  <input
                    type="checkbox"
                    checked={currentSetup.isInsideCabinet}
                    onChange={(e) => setCurrentSetup({ ...currentSetup, isInsideCabinet: e.target.checked })}
                    className="rounded border-border text-warn focus:ring-0"
                  />
                  <span>Dolap İçi Ürünler</span>
                </label>

                <label className="flex items-center gap-2 text-xs text-text cursor-pointer">
                  <input
                    type="checkbox"
                    checked={currentSetup.isActive}
                    onChange={(e) => setCurrentSetup({ ...currentSetup, isActive: e.target.checked })}
                    className="rounded border-border text-warn focus:ring-0"
                  />
                  <span>Aktif</span>
                </label>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setModalMode("NONE")}
                  className="px-4 py-2 bg-bg hover:bg-border text-text rounded-xl text-xs font-semibold"
                >
                  İptal
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-warn hover:opacity-90 text-bg rounded-xl text-xs font-bold"
                >
                  Kaydet
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────
          MODAL 4: SETUP İÇERİK NORMU YÖNETİMİ
      ───────────────────────────────────────────────────────────────── */}
      {modalMode === "SETUP_ITEMS" && activeSetupForItems && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-2xl bg-surface border border-border rounded-2xl p-6 shadow-2xl space-y-4 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div>
                <h3 className="font-bold text-base text-text flex items-center gap-2">
                  <span><Icon name="clipboard" size={20} /> {activeSetupForItems.name}</span>
                  <span className="text-xs px-2 py-0.5 rounded bg-info/20 text-info">
                    Setup İçerik Normu
                  </span>
                </h3>
                <p className="text-xs text-muted">
                  Kat görevlilerinin odada eksik tamamlaması gereken hedef minibar norm sayıları
                </p>
              </div>
              <button aria-label="Kapat" onClick={() => setModalMode("NONE")} className="text-muted hover:text-text p-1">
                <Icon name="close" size={20} />
              </button>
            </div>

            {/* Yeni Ürün Ekleme Çubuğu */}
            <div className="p-3 bg-bg/80 rounded-xl border border-border flex flex-wrap items-center gap-2">
              <select
                aria-label="Eklenecek ürün"
                value={selectedProductToAdd}
                onChange={(e) => setSelectedProductToAdd(e.target.value)}
                className="flex-1 bg-surface border border-border rounded-lg px-3 py-2 text-xs text-text focus:outline-none focus:border-warn/40 min-w-[200px]"
              >
                <option value="">Setup&apos;a eklenecek ürünü seçin...</option>
                {products
                  .filter((p) => p.isActive)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.groupName})
                    </option>
                  ))}
              </select>

              <div className="flex items-center gap-1.5">
                <span className="text-xs text-muted">Norm Adet:</span>
                <input
                  type="number"
                  min="1"
                  max="50"
                  value={selectedQtyToAdd}
                  onChange={(e) => setSelectedQtyToAdd(parseInt(e.target.value, 10) || 1)}
                  className="w-16 bg-surface border border-border rounded-lg px-2 py-2 text-xs text-center text-text font-bold"
                />
              </div>

              <button
                type="button"
                onClick={handleAddSetupItem}
                disabled={!selectedProductToAdd}
                className="px-4 py-2 bg-warn hover:opacity-90 disabled:opacity-50 text-bg font-bold rounded-lg text-xs transition"
              >
                + Ekle
              </button>
            </div>

            {/* Mevcut Liste */}
            <div className="flex-1 overflow-y-auto space-y-2 pr-1">
              {activeSetupForItems.items.length === 0 ? (
                <div className="py-12 text-center text-muted text-sm">
                  Bu setup konseptinde henüz tanımlı ürün yok. Yukarıdan ürün seçerek ekleyebilirsiniz.
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {activeSetupForItems.items.map((it) => (
                    <div key={it.id} className="py-2.5 flex items-center justify-between gap-3">
                      <div>
                        <p className="font-bold text-text text-xs">{it.productName}</p>
                        <span className="text-xs text-muted">Birim: {it.unit}</span>
                      </div>

                      <div className="flex items-center gap-3">
                        <span className="px-3 py-1 rounded-full bg-warn/10 border border-warn/40 text-warn font-black text-xs">
                          Setup: {it.qty} {it.unit}
                        </span>

                        <button
                          type="button"
                          onClick={() => handleDeleteSetupItem(it.id)}
                          className="px-2 py-1 bg-danger/10 hover:bg-danger/20 text-danger border border-danger/40 rounded-lg text-xs"
                          title="Çıkar"
                        >
                          <Icon name="close" size={20} /> Kaldır
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="border-t border-border pt-3 flex justify-end">
              <button
                type="button"
                onClick={() => setModalMode("NONE")}
                className="px-5 py-2 bg-bg hover:bg-border text-text font-bold rounded-xl text-xs"
              >
                Tamamla
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────
          MODAL 5: ODA TİPİ FORMU
      ───────────────────────────────────────────────────────────────── */}
      {modalMode === "ROOM_TYPE_FORM" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-md bg-surface border border-border rounded-2xl p-6 shadow-2xl space-y-4">
            <h3 className="font-bold text-base text-text">
              {currentRoomType.id ? "Oda Tipini Düzenle" : "Yeni Oda Tipi"}
            </h3>

            <form onSubmit={handleSaveRoomType} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-text mb-1">Oda Tipi Adı</label>
                <input
                  type="text"
                  required
                  placeholder="Örn: Standard King, Deluxe Suite, Presidential"
                  value={currentRoomType.name}
                  onChange={(e) => setCurrentRoomType({ ...currentRoomType, name: e.target.value })}
                  className="w-full bg-bg border border-border rounded-xl px-3 py-2 text-xs text-text focus:outline-none focus:border-warn/40"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-text mb-1">
                  Odadaki Minibar Dolap Sayısı
                </label>
                <input
                  type="number"
                  min="0"
                  max="10"
                  value={currentRoomType.cabinetCount}
                  onChange={(e) =>
                    setCurrentRoomType({ ...currentRoomType, cabinetCount: parseInt(e.target.value, 10) || 0 })
                  }
                  className="w-full bg-bg border border-border rounded-xl px-3 py-2 text-xs text-text focus:outline-none focus:border-warn/40"
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="rtActive"
                  checked={currentRoomType.isActive}
                  onChange={(e) => setCurrentRoomType({ ...currentRoomType, isActive: e.target.checked })}
                  className="rounded border-border text-warn focus:ring-0"
                />
                <label htmlFor="rtActive" className="text-xs text-text">
                  Aktif Oda Tipi
                </label>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setModalMode("NONE")}
                  className="px-4 py-2 bg-bg hover:bg-border text-text rounded-xl text-xs font-semibold"
                >
                  İptal
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-warn hover:opacity-90 text-bg rounded-xl text-xs font-bold"
                >
                  Kaydet
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────
          MODAL 6: ODA TİPİNE SETUP ATAMA FORMU
      ───────────────────────────────────────────────────────────────── */}
      {modalMode === "ASSIGN_FORM" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-md bg-surface border border-border rounded-2xl p-6 shadow-2xl space-y-4">
            <h3 className="font-bold text-base text-text">Oda Tipine Setup Konsepti Ata</h3>

            <form onSubmit={handleAssignSetup} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-text mb-1">Oda Tipi</label>
                <select
                  required
                  value={assignForm.roomTypeId}
                  onChange={(e) => setAssignForm({ ...assignForm, roomTypeId: e.target.value })}
                  className="w-full bg-bg border border-border rounded-xl px-3 py-2 text-xs text-text focus:outline-none focus:border-warn/40"
                >
                  <option value="">Oda tipi seçiniz...</option>
                  {roomTypes.map((rt) => (
                    <option key={rt.id} value={rt.id}>
                      {rt.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-text mb-1">Atanacak Setup Konsepti</label>
                <select
                  required
                  value={assignForm.setupId}
                  onChange={(e) => setAssignForm({ ...assignForm, setupId: e.target.value })}
                  className="w-full bg-bg border border-border rounded-xl px-3 py-2 text-xs text-text focus:outline-none focus:border-warn/40"
                >
                  <option value="">Setup seçiniz...</option>
                  {setups.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.isInsideCabinet ? "Dolap İçi" : "Açık"})
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setModalMode("NONE")}
                  className="px-4 py-2 bg-bg hover:bg-border text-text rounded-xl text-xs font-semibold"
                >
                  İptal
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-warn hover:opacity-90 text-bg rounded-xl text-xs font-bold"
                >
                  Atamayı Kaydet
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────
          MODAL 7: SİLİNEMEZ AUDIT DIFF SNAPSHOT GÖRÜNTÜLEYİCİ
      ───────────────────────────────────────────────────────────────── */}
      {modalMode === "AUDIT_DIFF" && activeAuditLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-2xl bg-surface border border-info/40 rounded-2xl p-6 shadow-2xl space-y-4 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div>
                <h3 className="font-bold text-base text-text flex items-center gap-2">
                  <span><Icon name="shield" size={20} /> Denetim Kaydı Snapshot</span>
                  <span className="text-xs px-2 py-0.5 rounded bg-info/20 text-info font-mono">
                    {activeAuditLog.action} • {activeAuditLog.entity}
                  </span>
                </h3>
                <p className="text-xs text-muted">
                  {new Date(activeAuditLog.createdAt).toLocaleString("tr-TR")} • İşlemi Yapan:{" "}
                  <strong className="text-text">{activeAuditLog.userName}</strong> • IP:{" "}
                  {activeAuditLog.ip || "Yerel"}
                </p>
              </div>
              <button aria-label="Kapat" onClick={() => setModalMode("NONE")} className="text-muted hover:text-text p-1">
                <Icon name="close" size={20} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-3 pr-1 text-xs font-mono">
              {/* BEFORE */}
              <div>
                <div className="flex items-center justify-between bg-danger/10 border border-danger/40 px-3 py-1.5 rounded-t-xl text-danger font-bold">
                  <span><Icon name="arrow-left" size={20} /> ÖNCEKİ DEĞER (BEFORE / SİLİNEN KAYIT)</span>
                  <span>{activeAuditLog.before ? "Mevcut" : "Yok (Yeni Kayıt)"}</span>
                </div>
                <pre className="p-3 bg-black/60 border border-t-0 border-border rounded-b-xl text-danger overflow-x-auto text-xs max-h-48">
                  {activeAuditLog.before
                    ? JSON.stringify(activeAuditLog.before, null, 2)
                    : "// Bu işlem yeni bir kayıt oluşturma olduğundan önceki değer bulunmuyor."}
                </pre>
              </div>

              {/* AFTER */}
              <div>
                <div className="flex items-center justify-between bg-surface border border-success/40 px-3 py-1.5 rounded-t-xl text-success font-bold">
                  <span><Icon name="arrow-right" size={20} /> SONRAKİ DEĞER (AFTER / GÜNCEL KAYIT)</span>
                  <span>{activeAuditLog.after ? "Mevcut" : "Yok (Silinmiş Kayıt)"}</span>
                </div>
                <pre className="p-3 bg-black/60 border border-t-0 border-border rounded-b-xl text-success overflow-x-auto text-xs max-h-48">
                  {activeAuditLog.after
                    ? JSON.stringify(activeAuditLog.after, null, 2)
                    : "// Bu işlem silme işlemi olduğundan sonraki değer bulunmuyor."}
                </pre>
              </div>
            </div>

            <div className="border-t border-border pt-3 flex justify-end">
              <button
                type="button"
                onClick={() => setModalMode("NONE")}
                className="px-5 py-2 bg-bg hover:bg-border text-text font-bold rounded-xl text-xs"
              >
                Kapat
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
