#!/bin/sh
set -e

echo "=================================================="
echo "🚀 Merit QR Menü & Otel Yönetim Sistemi Başlatılıyor"
echo "=================================================="

# Uploads dizinini hazırla
UPLOADS_PATH="${UPLOADS_DIR:-/app/uploads}"
mkdir -p "$UPLOADS_PATH"

# Veritabanı bağlantısını bekle ve migrasyonları uygula
if [ -n "$DATABASE_URL" ]; then
  echo "⏳ Veritabanı bağlantısı test ediliyor..."
  MAX_RETRIES=30
  COUNT=0
  until npx prisma migrate deploy || [ $COUNT -eq $MAX_RETRIES ]; do
    COUNT=$((COUNT + 1))
    echo "🔄 Veritabanı henüz hazır değil ($COUNT/$MAX_RETRIES), 2 saniye bekleniyor..."
    sleep 2
  done

  if [ $COUNT -eq $MAX_RETRIES ]; then
    echo "⚠️ Uyarı: Veritabanına 60 saniye boyunca bağlanılamadı. Uygulama yine de başlatılıyor."
  else
    echo "✅ Veritabanı migrasyonları başarıyla tamamlandı."
  fi

  # RUN_SEED=true verilmişse veya varsayılan kurulumdaysa tohumlama çalıştır
  if [ "$RUN_SEED" != "false" ]; then
    echo "🌱 Örnek veriler ve başlangıç menüleri yükleniyor (prisma/seed.ts)..."
    npm run db:seed || echo "⚠️ Seed işlemi tamamlanamadı veya veriler zaten mevcut."
  fi
fi

echo "✨ Web sunucusu başlatılıyor (port 3000)..."
exec npm run start
