-- CreateEnum
CREATE TYPE "ModuleKey" AS ENUM ('CORE', 'MINIBAR', 'QR_MENU', 'QR_ORDER', 'ROOM_SERVICE');

-- CreateEnum
CREATE TYPE "OutletType" AS ENUM ('HAVUZ', 'BAR', 'SAHIL', 'SALON', 'BAHCE', 'SPA', 'CABANA', 'ODA_SERVISI', 'GENEL');

-- CreateEnum
CREATE TYPE "PriceDisplay" AS ENUM ('INHERIT', 'SHOW', 'HIDE');

-- CreateEnum
CREATE TYPE "RoleKind" AS ENUM ('SISTEM', 'YONETIM', 'OUTLET', 'MUTFAK', 'MINIBAR');

-- CreateEnum
CREATE TYPE "SessionStatus" AS ENUM ('ONLINE', 'UYARI', 'CIKTI', 'DUSURULDU');

-- CreateEnum
CREATE TYPE "LogoutReason" AS ENUM ('MANUEL', 'SURE_ASIMI', 'HAREKETSIZLIK', 'ZORUNLU', 'TEK_CIHAZ', 'SISTEM');

-- CreateEnum
CREATE TYPE "ScanKind" AS ENUM ('MISAFIR', 'PERSONEL', 'SISTEM');

-- CreateEnum
CREATE TYPE "StockMovementType" AS ENUM ('GIRIS', 'IADE', 'KULLANIM', 'MYBAR', 'DUZELTME', 'GOC');

-- CreateEnum
CREATE TYPE "MinibarTxType" AS ENUM ('SETUP_KONTROL', 'SARFIYAT_YOK', 'MYBAR_KARSILAMA', 'LEGACY');

-- CreateEnum
CREATE TYPE "RoomCheckType" AS ENUM ('URUN_EKLENDI', 'SARFIYAT_YOK', 'DND', 'ACIK');

-- CreateEnum
CREATE TYPE "DndStatus" AS ENUM ('AKTIF', 'TAMAMLANDI', 'IPTAL', 'EKSIK');

-- CreateEnum
CREATE TYPE "MybarStatus" AS ENUM ('BEKLEMEDE', 'TAMAMLANDI', 'IPTAL');

-- CreateEnum
CREATE TYPE "GuestRecordKind" AS ENUM ('IN_HOUSE', 'ARRIVAL', 'DEPARTURE');

-- CreateEnum
CREATE TYPE "UploadStatus" AS ENUM ('YUKLENDI', 'ISLENIYOR', 'TAMAMLANDI', 'HATA', 'SILINDI');

-- CreateEnum
CREATE TYPE "TaskType" AS ENUM ('INHOUSE_KONTROL', 'ARRIVAL_KONTROL', 'DEPARTURE_KONTROL');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('BEKLIYOR', 'DEVAM', 'TAMAMLANDI', 'DND_BEKLIYOR', 'EKSIK');

-- CreateEnum
CREATE TYPE "StockRequestStatus" AS ENUM ('BEKLEMEDE', 'ONAYLANDI', 'TESLIM_EDILDI', 'REDDEDILDI', 'IPTAL');

-- CreateEnum
CREATE TYPE "Urgency" AS ENUM ('NORMAL', 'ACIL');

-- CreateEnum
CREATE TYPE "EmailStatus" AS ENUM ('GONDERILDI', 'HATA', 'BEKLEMEDE');

-- CreateEnum
CREATE TYPE "MenuNodeKind" AS ENUM ('KATEGORI', 'ALT_KATEGORI', 'GRUP', 'OGE');

-- CreateEnum
CREATE TYPE "OrderKind" AS ENUM ('MASA', 'ODA_SERVISI');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('GONDERILDI', 'TEYIT_BEKLIYOR', 'ONAYLANDI', 'HAZIR', 'YOLDA', 'SERVIS_EDILDI', 'TESLIM_EDILDI', 'REDDEDILDI', 'IPTAL');

-- CreateEnum
CREATE TYPE "CallType" AS ENUM ('GARSON', 'HESAP', 'DIGER');

-- CreateEnum
CREATE TYPE "CallStatus" AS ENUM ('ACIK', 'YANITLANDI', 'KAPANDI');

-- CreateEnum
CREATE TYPE "PrintJobKind" AS ENUM ('FIS', 'TEST');

-- CreateEnum
CREATE TYPE "PrintJobStatus" AS ENUM ('KUYRUKTA', 'BASILIYOR', 'BASILDI', 'HATA');

-- CreateTable
CREATE TABLE "hotels" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "logo_url" TEXT,
    "address" TEXT,
    "phone" TEXT,
    "is_system_default" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "email_notify_enabled" BOOLEAN NOT NULL DEFAULT false,
    "email_alert_enabled" BOOLEAN NOT NULL DEFAULT false,
    "email_report_enabled" BOOLEAN NOT NULL DEFAULT false,
    "email_system_enabled" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hotels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hotel_modules" (
    "id" TEXT NOT NULL,
    "hotel_id" TEXT NOT NULL,
    "module_key" "ModuleKey" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hotel_modules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "floors" (
    "id" TEXT NOT NULL,
    "hotel_id" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "floors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "room_types" (
    "id" TEXT NOT NULL,
    "hotel_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "cabinet_count" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "room_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rooms" (
    "id" TEXT NOT NULL,
    "hotel_id" TEXT NOT NULL,
    "floor_id" TEXT NOT NULL,
    "room_type_id" TEXT,
    "number" TEXT NOT NULL,
    "capacity" INTEGER,
    "qr_token" TEXT,
    "qr_generated_at" TIMESTAMP(3),
    "guest_message" VARCHAR(500),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rooms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outlets" (
    "id" TEXT NOT NULL,
    "hotel_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "OutletType" NOT NULL,
    "has_menu" BOOLEAN NOT NULL DEFAULT true,
    "has_ordering" BOOLEAN NOT NULL DEFAULT false,
    "ordering_enabled" BOOLEAN NOT NULL DEFAULT true,
    "price_display" "PriceDisplay" NOT NULL DEFAULT 'INHERIT',
    "theme_id" TEXT,
    "printer_id" TEXT,
    "kds_enabled" BOOLEAN NOT NULL DEFAULT false,
    "phone_confirm_required" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "outlets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outlet_tables" (
    "id" TEXT NOT NULL,
    "outlet_id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "qr_token" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "outlet_tables_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "role_id" TEXT NOT NULL,
    "hotel_id" TEXT,
    "supervisor_id" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_login_at" TIMESTAMP(3),
    "prefs" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_hotels" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "hotel_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_hotels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outlet_members" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "outlet_id" TEXT NOT NULL,
    "role_id" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "outlet_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "table_assignments" (
    "id" TEXT NOT NULL,
    "outlet_id" TEXT NOT NULL,
    "table_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "table_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "RoleKind" NOT NULL,
    "max_online_minutes" INTEGER,
    "default_screen" TEXT,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_screens" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "module_key" "ModuleKey" NOT NULL,
    "name" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "group" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "app_screens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_screen_permissions" (
    "id" TEXT NOT NULL,
    "role_id" TEXT NOT NULL,
    "screen_id" TEXT NOT NULL,
    "hotel_id" TEXT,
    "can_view" BOOLEAN NOT NULL DEFAULT false,
    "can_create" BOOLEAN NOT NULL DEFAULT false,
    "can_edit" BOOLEAN NOT NULL DEFAULT false,
    "can_approve" BOOLEAN NOT NULL DEFAULT false,
    "can_report" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "role_screen_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_module_accesses" (
    "id" TEXT NOT NULL,
    "role_id" TEXT NOT NULL,
    "hotel_id" TEXT,
    "module_key" "ModuleKey" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "role_module_accesses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_sessions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "hotel_id" TEXT NOT NULL,
    "outlet_id" TEXT,
    "role_id" TEXT NOT NULL,
    "device_label" TEXT,
    "status" "SessionStatus" NOT NULL DEFAULT 'ONLINE',
    "login_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "warned_at" TIMESTAMP(3),
    "logout_at" TIMESTAMP(3),
    "logout_reason" "LogoutReason",
    "ip" TEXT NOT NULL,
    "user_agent" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session_events" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "detail" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "session_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settings" (
    "id" TEXT NOT NULL,
    "hotel_id" TEXT,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "hotel_id" TEXT,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "ref_type" TEXT,
    "ref_id" TEXT,
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "push_subscriptions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "user_agent" TEXT,
    "last_used_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "push_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "user_id" TEXT,
    "hotel_id" TEXT,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entity_id" TEXT,
    "before" JSONB,
    "after" JSONB,
    "ip" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "qr_scan_logs" (
    "id" TEXT NOT NULL,
    "room_id" TEXT,
    "table_id" TEXT,
    "user_id" TEXT,
    "kind" "ScanKind" NOT NULL,
    "ok" BOOLEAN NOT NULL,
    "error" TEXT,
    "ip" TEXT NOT NULL,
    "user_agent" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "qr_scan_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_groups" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" TEXT NOT NULL,
    "group_id" TEXT NOT NULL,
    "code" TEXT,
    "name" TEXT NOT NULL,
    "barcode" TEXT,
    "unit" TEXT NOT NULL DEFAULT 'Adet',
    "critical_level" INTEGER NOT NULL DEFAULT 10,
    "purchase_price" DECIMAL(10,2),
    "sale_price" DECIMAL(10,2),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "setups" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "is_inside_cabinet" BOOLEAN NOT NULL DEFAULT true,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "setups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "setup_items" (
    "id" TEXT NOT NULL,
    "setup_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "qty" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "setup_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "room_type_setups" (
    "hotel_id" TEXT NOT NULL,
    "room_type_id" TEXT NOT NULL,
    "setup_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "room_type_setups_pkey" PRIMARY KEY ("hotel_id","room_type_id","setup_id")
);

-- CreateTable
CREATE TABLE "hotel_stocks" (
    "id" TEXT NOT NULL,
    "hotel_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "total_qty" INTEGER NOT NULL DEFAULT 0,
    "used_qty" INTEGER NOT NULL DEFAULT 0,
    "remaining_qty" INTEGER NOT NULL DEFAULT 0,
    "critical_level" INTEGER NOT NULL DEFAULT 50,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hotel_stocks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hotel_stock_movements" (
    "id" TEXT NOT NULL,
    "hotel_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "type" "StockMovementType" NOT NULL,
    "qty" INTEGER NOT NULL,
    "ref_type" TEXT,
    "ref_id" TEXT,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hotel_stock_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "minibar_transactions" (
    "id" TEXT NOT NULL,
    "hotel_id" TEXT NOT NULL,
    "room_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "type" "MinibarTxType" NOT NULL,
    "legacy_type" TEXT,
    "note" TEXT,
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "minibar_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "minibar_transaction_items" (
    "id" TEXT NOT NULL,
    "transaction_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "setup_id" TEXT,
    "setup_qty" INTEGER NOT NULL DEFAULT 0,
    "start_stock" INTEGER NOT NULL DEFAULT 0,
    "end_stock" INTEGER NOT NULL DEFAULT 0,
    "consumed" INTEGER NOT NULL DEFAULT 0,
    "added" INTEGER NOT NULL DEFAULT 0,
    "purchase_price" DECIMAL(10,2),
    "sale_price" DECIMAL(10,2),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "minibar_transaction_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "room_checks" (
    "id" TEXT NOT NULL,
    "room_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "check_date" DATE NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" TIMESTAMP(3),
    "type" "RoomCheckType" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "room_checks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "room_dnds" (
    "id" TEXT NOT NULL,
    "hotel_id" TEXT NOT NULL,
    "room_id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 1,
    "first_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "DndStatus" NOT NULL DEFAULT 'AKTIF',
    "task_item_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "room_dnds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "room_dnd_checks" (
    "id" TEXT NOT NULL,
    "dnd_id" TEXT NOT NULL,
    "no" INTEGER NOT NULL,
    "user_id" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "room_dnd_checks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mybar_requests" (
    "id" TEXT NOT NULL,
    "hotel_id" TEXT NOT NULL,
    "room_id" TEXT NOT NULL,
    "business_date" DATE NOT NULL,
    "status" "MybarStatus" NOT NULL DEFAULT 'BEKLEMEDE',
    "language" TEXT NOT NULL,
    "note" TEXT,
    "note_tr" TEXT,
    "seen_by_id" TEXT,
    "seen_at" TIMESTAMP(3),
    "completed_by_id" TEXT,
    "completed_at" TIMESTAMP(3),
    "close_note" TEXT,
    "closed_with_missing" BOOLEAN NOT NULL DEFAULT false,
    "cancelled_by_id" TEXT,
    "cancelled_at" TIMESTAMP(3),
    "cancel_note" TEXT,
    "idempotency_key" TEXT NOT NULL,
    "client_ip" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mybar_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mybar_request_items" (
    "id" TEXT NOT NULL,
    "request_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "requested_qty" INTEGER NOT NULL,
    "delivered_qty" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mybar_request_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guest_records" (
    "id" TEXT NOT NULL,
    "hotel_id" TEXT NOT NULL,
    "room_id" TEXT NOT NULL,
    "upload_id" TEXT,
    "batch_code" TEXT NOT NULL,
    "guest_count" INTEGER NOT NULL,
    "arrival_date" DATE NOT NULL,
    "arrival_time" TEXT,
    "departure_date" DATE NOT NULL,
    "departure_time" TEXT,
    "kind" "GuestRecordKind" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "guest_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "occupancy_uploads" (
    "id" TEXT NOT NULL,
    "hotel_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" "UploadStatus" NOT NULL DEFAULT 'YUKLENDI',
    "total_rows" INTEGER NOT NULL DEFAULT 0,
    "ok_rows" INTEGER NOT NULL DEFAULT 0,
    "error_rows" INTEGER NOT NULL DEFAULT 0,
    "errors" JSONB NOT NULL DEFAULT '[]',
    "user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "occupancy_uploads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "upload_tasks" (
    "id" TEXT NOT NULL,
    "hotel_id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "kind" TEXT NOT NULL,
    "status" "UploadStatus" NOT NULL DEFAULT 'YUKLENDI',
    "upload_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "upload_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_tasks" (
    "id" TEXT NOT NULL,
    "hotel_id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "type" "TaskType" NOT NULL,
    "status" "TaskStatus" NOT NULL DEFAULT 'BEKLIYOR',
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "daily_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_task_items" (
    "id" TEXT NOT NULL,
    "task_id" TEXT NOT NULL,
    "room_id" TEXT NOT NULL,
    "guest_record_id" TEXT,
    "status" "TaskStatus" NOT NULL DEFAULT 'BEKLIYOR',
    "arrival_time" TEXT,
    "departure_time" TEXT,
    "priority" INTEGER NOT NULL DEFAULT 999,
    "checked_at" TIMESTAMP(3),
    "dnd_count" INTEGER NOT NULL DEFAULT 0,
    "last_dnd_at" TIMESTAMP(3),
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "daily_task_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_status_logs" (
    "id" TEXT NOT NULL,
    "task_item_id" TEXT NOT NULL,
    "from" "TaskStatus" NOT NULL,
    "to" "TaskStatus" NOT NULL,
    "user_id" TEXT,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_status_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_requests" (
    "id" TEXT NOT NULL,
    "hotel_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "requested_by_id" TEXT NOT NULL,
    "handled_by_id" TEXT,
    "status" "StockRequestStatus" NOT NULL DEFAULT 'BEKLEMEDE',
    "note" TEXT,
    "reject_reason" TEXT,
    "approved_at" TIMESTAMP(3),
    "delivered_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stock_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_request_items" (
    "id" TEXT NOT NULL,
    "request_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "requested_qty" INTEGER NOT NULL,
    "approved_qty" INTEGER,
    "delivered_qty" INTEGER,
    "urgency" "Urgency" NOT NULL DEFAULT 'NORMAL',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stock_request_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_settings" (
    "id" TEXT NOT NULL,
    "smtp_host" TEXT NOT NULL,
    "port" INTEGER NOT NULL,
    "user" TEXT NOT NULL,
    "password_enc" TEXT NOT NULL,
    "tls" BOOLEAN NOT NULL DEFAULT false,
    "ssl" BOOLEAN NOT NULL DEFAULT false,
    "sender_email" TEXT NOT NULL,
    "sender_name" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "email_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_logs" (
    "id" TEXT NOT NULL,
    "to" TEXT NOT NULL,
    "user_id" TEXT,
    "subject" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" "EmailStatus" NOT NULL DEFAULT 'BEKLEMEDE',
    "error" TEXT,
    "tracking_id" TEXT NOT NULL,
    "ref_type" TEXT,
    "ref_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "menu_nodes" (
    "id" TEXT NOT NULL,
    "outlet_id" TEXT NOT NULL,
    "parent_id" TEXT,
    "kind" "MenuNodeKind" NOT NULL,
    "name" TEXT NOT NULL,
    "detail" TEXT,
    "image_url" TEXT,
    "price" DECIMAL(10,2),
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "allergens" TEXT[],
    "is_available" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "menu_nodes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "menu_node_translations" (
    "id" TEXT NOT NULL,
    "node_id" TEXT NOT NULL,
    "lang" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "detail" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "menu_node_translations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "menu_themes" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "bg" TEXT NOT NULL,
    "accent" TEXT NOT NULL,
    "soft" TEXT NOT NULL,
    "text_on_accent" TEXT NOT NULL,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "menu_themes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orders" (
    "id" TEXT NOT NULL,
    "hotel_id" TEXT NOT NULL,
    "outlet_id" TEXT NOT NULL,
    "kind" "OrderKind" NOT NULL,
    "table_id" TEXT,
    "room_id" TEXT,
    "business_date" DATE NOT NULL,
    "order_no" INTEGER NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'GONDERILDI',
    "guest_language" TEXT NOT NULL,
    "prices_shown" BOOLEAN NOT NULL DEFAULT false,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "subtotal" DECIMAL(10,2),
    "note" TEXT,
    "approved_by_id" TEXT,
    "approved_at" TIMESTAMP(3),
    "reject_reason" TEXT,
    "phone_confirmed_by_id" TEXT,
    "phone_confirmed_at" TIMESTAMP(3),
    "ready_at" TIMESTAMP(3),
    "served_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),
    "idempotency_key" TEXT NOT NULL,
    "client_ip" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_items" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "menu_node_id" TEXT NOT NULL,
    "name_snapshot" TEXT NOT NULL,
    "qty" INTEGER NOT NULL,
    "unit_price" DECIMAL(10,2),
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_events" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "user_id" TEXT,
    "from" "OrderStatus",
    "to" "OrderStatus" NOT NULL,
    "note" TEXT,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_counters" (
    "id" TEXT NOT NULL,
    "hotel_id" TEXT NOT NULL,
    "business_date" DATE NOT NULL,
    "last_no" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "order_counters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "waiter_calls" (
    "id" TEXT NOT NULL,
    "outlet_id" TEXT NOT NULL,
    "table_id" TEXT NOT NULL,
    "type" "CallType" NOT NULL,
    "status" "CallStatus" NOT NULL DEFAULT 'ACIK',
    "resolved_by_id" TEXT,
    "resolved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "waiter_calls_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "printers" (
    "id" TEXT NOT NULL,
    "hotel_id" TEXT NOT NULL,
    "outlet_id" TEXT,
    "name" TEXT NOT NULL,
    "ip" TEXT NOT NULL,
    "port" INTEGER NOT NULL DEFAULT 9100,
    "codepage" TEXT NOT NULL DEFAULT 'cp857',
    "paper_width" INTEGER NOT NULL DEFAULT 80,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_seen_at" TIMESTAMP(3),
    "last_status" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "printers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "print_jobs" (
    "id" TEXT NOT NULL,
    "printer_id" TEXT NOT NULL,
    "order_id" TEXT,
    "kind" "PrintJobKind" NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "PrintJobStatus" NOT NULL DEFAULT 'KUYRUKTA',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "printed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "print_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "hotels_code_key" ON "hotels"("code");

-- CreateIndex
CREATE UNIQUE INDEX "hotel_modules_hotel_id_module_key_key" ON "hotel_modules"("hotel_id", "module_key");

-- CreateIndex
CREATE UNIQUE INDEX "floors_hotel_id_number_key" ON "floors"("hotel_id", "number");

-- CreateIndex
CREATE UNIQUE INDEX "room_types_hotel_id_name_key" ON "room_types"("hotel_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "rooms_qr_token_key" ON "rooms"("qr_token");

-- CreateIndex
CREATE UNIQUE INDEX "rooms_hotel_id_number_key" ON "rooms"("hotel_id", "number");

-- CreateIndex
CREATE UNIQUE INDEX "outlets_hotel_id_name_key" ON "outlets"("hotel_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "outlet_tables_qr_token_key" ON "outlet_tables"("qr_token");

-- CreateIndex
CREATE UNIQUE INDEX "outlet_tables_outlet_id_label_key" ON "outlet_tables"("outlet_id", "label");

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "user_hotels_user_id_hotel_id_key" ON "user_hotels"("user_id", "hotel_id");

-- CreateIndex
CREATE UNIQUE INDEX "outlet_members_user_id_outlet_id_key" ON "outlet_members"("user_id", "outlet_id");

-- CreateIndex
CREATE UNIQUE INDEX "roles_code_key" ON "roles"("code");

-- CreateIndex
CREATE UNIQUE INDEX "app_screens_code_key" ON "app_screens"("code");

-- CreateIndex
CREATE UNIQUE INDEX "role_screen_permissions_role_id_screen_id_hotel_id_key" ON "role_screen_permissions"("role_id", "screen_id", "hotel_id");

-- CreateIndex
CREATE UNIQUE INDEX "role_module_accesses_role_id_hotel_id_module_key_key" ON "role_module_accesses"("role_id", "hotel_id", "module_key");

-- CreateIndex
CREATE INDEX "user_sessions_status_expires_at_idx" ON "user_sessions"("status", "expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "settings_hotel_id_key_key" ON "settings"("hotel_id", "key");

-- CreateIndex
CREATE INDEX "notifications_user_id_is_read_created_at_idx" ON "notifications"("user_id", "is_read", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "push_subscriptions_endpoint_key" ON "push_subscriptions"("endpoint");

-- CreateIndex
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");

-- CreateIndex
CREATE INDEX "audit_logs_entity_entity_id_idx" ON "audit_logs"("entity", "entity_id");

-- CreateIndex
CREATE UNIQUE INDEX "product_groups_name_key" ON "product_groups"("name");

-- CreateIndex
CREATE UNIQUE INDEX "products_code_key" ON "products"("code");

-- CreateIndex
CREATE UNIQUE INDEX "products_barcode_key" ON "products"("barcode");

-- CreateIndex
CREATE UNIQUE INDEX "setups_name_key" ON "setups"("name");

-- CreateIndex
CREATE UNIQUE INDEX "setup_items_setup_id_product_id_key" ON "setup_items"("setup_id", "product_id");

-- CreateIndex
CREATE UNIQUE INDEX "hotel_stocks_hotel_id_product_id_key" ON "hotel_stocks"("hotel_id", "product_id");

-- CreateIndex
CREATE INDEX "hotel_stock_movements_hotel_id_product_id_created_at_idx" ON "hotel_stock_movements"("hotel_id", "product_id", "created_at");

-- CreateIndex
CREATE INDEX "minibar_transactions_room_id_occurred_at_idx" ON "minibar_transactions"("room_id", "occurred_at");

-- CreateIndex
CREATE INDEX "minibar_transactions_hotel_id_occurred_at_idx" ON "minibar_transactions"("hotel_id", "occurred_at");

-- CreateIndex
CREATE INDEX "room_checks_room_id_check_date_idx" ON "room_checks"("room_id", "check_date");

-- CreateIndex
CREATE INDEX "room_checks_user_id_check_date_idx" ON "room_checks"("user_id", "check_date");

-- CreateIndex
CREATE UNIQUE INDEX "room_dnds_room_id_date_key" ON "room_dnds"("room_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "mybar_requests_idempotency_key_key" ON "mybar_requests"("idempotency_key");

-- CreateIndex
CREATE INDEX "mybar_requests_hotel_id_status_idx" ON "mybar_requests"("hotel_id", "status");

-- CreateIndex
CREATE INDEX "mybar_requests_room_id_business_date_idx" ON "mybar_requests"("room_id", "business_date");

-- CreateIndex
CREATE UNIQUE INDEX "occupancy_uploads_code_key" ON "occupancy_uploads"("code");

-- CreateIndex
CREATE UNIQUE INDEX "upload_tasks_hotel_id_date_kind_key" ON "upload_tasks"("hotel_id", "date", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "daily_tasks_hotel_id_date_type_key" ON "daily_tasks"("hotel_id", "date", "type");

-- CreateIndex
CREATE UNIQUE INDEX "stock_requests_code_key" ON "stock_requests"("code");

-- CreateIndex
CREATE UNIQUE INDEX "email_logs_tracking_id_key" ON "email_logs"("tracking_id");

-- CreateIndex
CREATE INDEX "menu_nodes_outlet_id_parent_id_idx" ON "menu_nodes"("outlet_id", "parent_id");

-- CreateIndex
CREATE UNIQUE INDEX "menu_node_translations_node_id_lang_key" ON "menu_node_translations"("node_id", "lang");

-- CreateIndex
CREATE UNIQUE INDEX "orders_idempotency_key_key" ON "orders"("idempotency_key");

-- CreateIndex
CREATE INDEX "orders_outlet_id_status_created_at_idx" ON "orders"("outlet_id", "status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "orders_hotel_id_business_date_order_no_key" ON "orders"("hotel_id", "business_date", "order_no");

-- CreateIndex
CREATE UNIQUE INDEX "order_counters_hotel_id_business_date_key" ON "order_counters"("hotel_id", "business_date");

-- AddForeignKey
ALTER TABLE "hotel_modules" ADD CONSTRAINT "hotel_modules_hotel_id_fkey" FOREIGN KEY ("hotel_id") REFERENCES "hotels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "floors" ADD CONSTRAINT "floors_hotel_id_fkey" FOREIGN KEY ("hotel_id") REFERENCES "hotels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "room_types" ADD CONSTRAINT "room_types_hotel_id_fkey" FOREIGN KEY ("hotel_id") REFERENCES "hotels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_hotel_id_fkey" FOREIGN KEY ("hotel_id") REFERENCES "hotels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_floor_id_fkey" FOREIGN KEY ("floor_id") REFERENCES "floors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_room_type_id_fkey" FOREIGN KEY ("room_type_id") REFERENCES "room_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outlets" ADD CONSTRAINT "outlets_hotel_id_fkey" FOREIGN KEY ("hotel_id") REFERENCES "hotels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outlets" ADD CONSTRAINT "outlets_theme_id_fkey" FOREIGN KEY ("theme_id") REFERENCES "menu_themes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outlets" ADD CONSTRAINT "outlets_printer_id_fkey" FOREIGN KEY ("printer_id") REFERENCES "printers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outlet_tables" ADD CONSTRAINT "outlet_tables_outlet_id_fkey" FOREIGN KEY ("outlet_id") REFERENCES "outlets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_hotel_id_fkey" FOREIGN KEY ("hotel_id") REFERENCES "hotels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_supervisor_id_fkey" FOREIGN KEY ("supervisor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_hotels" ADD CONSTRAINT "user_hotels_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_hotels" ADD CONSTRAINT "user_hotels_hotel_id_fkey" FOREIGN KEY ("hotel_id") REFERENCES "hotels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outlet_members" ADD CONSTRAINT "outlet_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outlet_members" ADD CONSTRAINT "outlet_members_outlet_id_fkey" FOREIGN KEY ("outlet_id") REFERENCES "outlets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outlet_members" ADD CONSTRAINT "outlet_members_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "table_assignments" ADD CONSTRAINT "table_assignments_outlet_id_fkey" FOREIGN KEY ("outlet_id") REFERENCES "outlets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "table_assignments" ADD CONSTRAINT "table_assignments_table_id_fkey" FOREIGN KEY ("table_id") REFERENCES "outlet_tables"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "table_assignments" ADD CONSTRAINT "table_assignments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_screen_permissions" ADD CONSTRAINT "role_screen_permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_screen_permissions" ADD CONSTRAINT "role_screen_permissions_screen_id_fkey" FOREIGN KEY ("screen_id") REFERENCES "app_screens"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_screen_permissions" ADD CONSTRAINT "role_screen_permissions_hotel_id_fkey" FOREIGN KEY ("hotel_id") REFERENCES "hotels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_module_accesses" ADD CONSTRAINT "role_module_accesses_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_module_accesses" ADD CONSTRAINT "role_module_accesses_hotel_id_fkey" FOREIGN KEY ("hotel_id") REFERENCES "hotels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_sessions" ADD CONSTRAINT "user_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_sessions" ADD CONSTRAINT "user_sessions_hotel_id_fkey" FOREIGN KEY ("hotel_id") REFERENCES "hotels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_sessions" ADD CONSTRAINT "user_sessions_outlet_id_fkey" FOREIGN KEY ("outlet_id") REFERENCES "outlets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_sessions" ADD CONSTRAINT "user_sessions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_events" ADD CONSTRAINT "session_events_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "user_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settings" ADD CONSTRAINT "settings_hotel_id_fkey" FOREIGN KEY ("hotel_id") REFERENCES "hotels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_hotel_id_fkey" FOREIGN KEY ("hotel_id") REFERENCES "hotels"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_hotel_id_fkey" FOREIGN KEY ("hotel_id") REFERENCES "hotels"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "qr_scan_logs" ADD CONSTRAINT "qr_scan_logs_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "qr_scan_logs" ADD CONSTRAINT "qr_scan_logs_table_id_fkey" FOREIGN KEY ("table_id") REFERENCES "outlet_tables"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "qr_scan_logs" ADD CONSTRAINT "qr_scan_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "product_groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "setup_items" ADD CONSTRAINT "setup_items_setup_id_fkey" FOREIGN KEY ("setup_id") REFERENCES "setups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "setup_items" ADD CONSTRAINT "setup_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "room_type_setups" ADD CONSTRAINT "room_type_setups_hotel_id_fkey" FOREIGN KEY ("hotel_id") REFERENCES "hotels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "room_type_setups" ADD CONSTRAINT "room_type_setups_room_type_id_fkey" FOREIGN KEY ("room_type_id") REFERENCES "room_types"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "room_type_setups" ADD CONSTRAINT "room_type_setups_setup_id_fkey" FOREIGN KEY ("setup_id") REFERENCES "setups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hotel_stocks" ADD CONSTRAINT "hotel_stocks_hotel_id_fkey" FOREIGN KEY ("hotel_id") REFERENCES "hotels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hotel_stocks" ADD CONSTRAINT "hotel_stocks_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hotel_stock_movements" ADD CONSTRAINT "hotel_stock_movements_hotel_id_fkey" FOREIGN KEY ("hotel_id") REFERENCES "hotels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hotel_stock_movements" ADD CONSTRAINT "hotel_stock_movements_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hotel_stock_movements" ADD CONSTRAINT "hotel_stock_movements_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "minibar_transactions" ADD CONSTRAINT "minibar_transactions_hotel_id_fkey" FOREIGN KEY ("hotel_id") REFERENCES "hotels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "minibar_transactions" ADD CONSTRAINT "minibar_transactions_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "minibar_transactions" ADD CONSTRAINT "minibar_transactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "minibar_transaction_items" ADD CONSTRAINT "minibar_transaction_items_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "minibar_transactions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "minibar_transaction_items" ADD CONSTRAINT "minibar_transaction_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "minibar_transaction_items" ADD CONSTRAINT "minibar_transaction_items_setup_id_fkey" FOREIGN KEY ("setup_id") REFERENCES "setups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "room_checks" ADD CONSTRAINT "room_checks_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "room_checks" ADD CONSTRAINT "room_checks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "room_dnds" ADD CONSTRAINT "room_dnds_hotel_id_fkey" FOREIGN KEY ("hotel_id") REFERENCES "hotels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "room_dnds" ADD CONSTRAINT "room_dnds_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "room_dnds" ADD CONSTRAINT "room_dnds_task_item_id_fkey" FOREIGN KEY ("task_item_id") REFERENCES "daily_task_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "room_dnd_checks" ADD CONSTRAINT "room_dnd_checks_dnd_id_fkey" FOREIGN KEY ("dnd_id") REFERENCES "room_dnds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "room_dnd_checks" ADD CONSTRAINT "room_dnd_checks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mybar_requests" ADD CONSTRAINT "mybar_requests_hotel_id_fkey" FOREIGN KEY ("hotel_id") REFERENCES "hotels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mybar_requests" ADD CONSTRAINT "mybar_requests_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mybar_requests" ADD CONSTRAINT "mybar_requests_seen_by_id_fkey" FOREIGN KEY ("seen_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mybar_requests" ADD CONSTRAINT "mybar_requests_completed_by_id_fkey" FOREIGN KEY ("completed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mybar_requests" ADD CONSTRAINT "mybar_requests_cancelled_by_id_fkey" FOREIGN KEY ("cancelled_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mybar_request_items" ADD CONSTRAINT "mybar_request_items_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "mybar_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mybar_request_items" ADD CONSTRAINT "mybar_request_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guest_records" ADD CONSTRAINT "guest_records_hotel_id_fkey" FOREIGN KEY ("hotel_id") REFERENCES "hotels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guest_records" ADD CONSTRAINT "guest_records_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guest_records" ADD CONSTRAINT "guest_records_upload_id_fkey" FOREIGN KEY ("upload_id") REFERENCES "occupancy_uploads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "occupancy_uploads" ADD CONSTRAINT "occupancy_uploads_hotel_id_fkey" FOREIGN KEY ("hotel_id") REFERENCES "hotels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "occupancy_uploads" ADD CONSTRAINT "occupancy_uploads_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "upload_tasks" ADD CONSTRAINT "upload_tasks_hotel_id_fkey" FOREIGN KEY ("hotel_id") REFERENCES "hotels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "upload_tasks" ADD CONSTRAINT "upload_tasks_upload_id_fkey" FOREIGN KEY ("upload_id") REFERENCES "occupancy_uploads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_tasks" ADD CONSTRAINT "daily_tasks_hotel_id_fkey" FOREIGN KEY ("hotel_id") REFERENCES "hotels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_task_items" ADD CONSTRAINT "daily_task_items_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "daily_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_task_items" ADD CONSTRAINT "daily_task_items_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_task_items" ADD CONSTRAINT "daily_task_items_guest_record_id_fkey" FOREIGN KEY ("guest_record_id") REFERENCES "guest_records"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_status_logs" ADD CONSTRAINT "task_status_logs_task_item_id_fkey" FOREIGN KEY ("task_item_id") REFERENCES "daily_task_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_status_logs" ADD CONSTRAINT "task_status_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_requests" ADD CONSTRAINT "stock_requests_hotel_id_fkey" FOREIGN KEY ("hotel_id") REFERENCES "hotels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_requests" ADD CONSTRAINT "stock_requests_requested_by_id_fkey" FOREIGN KEY ("requested_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_requests" ADD CONSTRAINT "stock_requests_handled_by_id_fkey" FOREIGN KEY ("handled_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_request_items" ADD CONSTRAINT "stock_request_items_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "stock_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_request_items" ADD CONSTRAINT "stock_request_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_logs" ADD CONSTRAINT "email_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_nodes" ADD CONSTRAINT "menu_nodes_outlet_id_fkey" FOREIGN KEY ("outlet_id") REFERENCES "outlets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_nodes" ADD CONSTRAINT "menu_nodes_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "menu_nodes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_node_translations" ADD CONSTRAINT "menu_node_translations_node_id_fkey" FOREIGN KEY ("node_id") REFERENCES "menu_nodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_hotel_id_fkey" FOREIGN KEY ("hotel_id") REFERENCES "hotels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_outlet_id_fkey" FOREIGN KEY ("outlet_id") REFERENCES "outlets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_table_id_fkey" FOREIGN KEY ("table_id") REFERENCES "outlet_tables"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_approved_by_id_fkey" FOREIGN KEY ("approved_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_phone_confirmed_by_id_fkey" FOREIGN KEY ("phone_confirmed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_menu_node_id_fkey" FOREIGN KEY ("menu_node_id") REFERENCES "menu_nodes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_events" ADD CONSTRAINT "order_events_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_events" ADD CONSTRAINT "order_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_counters" ADD CONSTRAINT "order_counters_hotel_id_fkey" FOREIGN KEY ("hotel_id") REFERENCES "hotels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "waiter_calls" ADD CONSTRAINT "waiter_calls_outlet_id_fkey" FOREIGN KEY ("outlet_id") REFERENCES "outlets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "waiter_calls" ADD CONSTRAINT "waiter_calls_table_id_fkey" FOREIGN KEY ("table_id") REFERENCES "outlet_tables"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "waiter_calls" ADD CONSTRAINT "waiter_calls_resolved_by_id_fkey" FOREIGN KEY ("resolved_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "printers" ADD CONSTRAINT "printers_hotel_id_fkey" FOREIGN KEY ("hotel_id") REFERENCES "hotels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "printers" ADD CONSTRAINT "printers_outlet_id_fkey" FOREIGN KEY ("outlet_id") REFERENCES "outlets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "print_jobs" ADD CONSTRAINT "print_jobs_printer_id_fkey" FOREIGN KEY ("printer_id") REFERENCES "printers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "print_jobs" ADD CONSTRAINT "print_jobs_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Constraints that Prisma cannot express (design spec §3.1, §3.4)
-- ---------------------------------------------------------------------------

-- Stock can never go negative.
ALTER TABLE "hotel_stocks" ADD CONSTRAINT "hotel_stocks_remaining_qty_check" CHECK ("remaining_qty" >= 0);

-- At most one active assignment per table.
CREATE UNIQUE INDEX "table_assignments_active_table" ON "table_assignments"("table_id") WHERE "is_active";
