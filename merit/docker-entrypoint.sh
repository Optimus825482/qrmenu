#!/bin/sh
set -e

echo "=================================================="
echo "🚀 Merit QR Menü & Otel Yönetim Sistemi Başlatılıyor"
echo "=================================================="

# Uploads dizinini hazırla
UPLOADS_PATH="${UPLOADS_DIR:-/app/uploads}"
mkdir -p "$UPLOADS_PATH"

# Veritabanı migrasyonlarını otomatik uygula
if [ -n "$DATABASE_URL" ]; then
  echo "📦 Veritabanı şema güncellemeleri kontrol ediliyor (prisma migrate deploy)..."
  npx prisma migrate deploy || {
    echo "⚠️ Uyarı: Veritabanı migrasyonu çalıştırılırken bir hata oluştu veya bağlantı bekleniyor."
  }

  # Eğer RUN_SEED=true verilmişse veya ilk kurulum istenmişse seed çalıştır
  if [ "$RUN_SEED" = "true" ] || [ "$AUTO_SEED" = "true" ]; then
    echo "🌱 İlk kurulum tohum verileri yükleniyor (prisma/seed.ts)..."
    npm run db:seed || echo "⚠️ Seed işlemi tamamlanamadı veya veri zaten mevcut."
  fi
fi

echo "✨ Web sunucusu başlatılıyor (port 3000)..."
exec npm run start
