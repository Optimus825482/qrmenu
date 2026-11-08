#!/bin/sh
set -eu

echo "Merit QR Menü & Otel Yönetim Sistemi başlatılıyor"

UPLOADS_PATH="${UPLOADS_DIR:-/app/uploads}"
mkdir -p "$UPLOADS_PATH"

if [ -z "${DATABASE_URL:-}" ]; then
  echo "HATA: DATABASE_URL tanımlı değil." >&2
  exit 1
fi

# Migrasyon: yalnız bağlantı hatasında yeniden dene (en fazla MAX_RETRIES); başka her hata kalıcıdır.
MAX_RETRIES=30
COUNT=0
LOG="$(mktemp)"
while :; do
  if npx prisma migrate deploy >"$LOG" 2>&1; then
    cat "$LOG"
    echo "Veritabanı migrasyonları tamamlandı."
    break
  fi
  cat "$LOG" >&2
  if grep -qiE "P1001|P1002|P1017|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|ETIMEDOUT|Can't reach database server|Connection terminated" "$LOG"; then
    COUNT=$((COUNT + 1))
    if [ "$COUNT" -ge "$MAX_RETRIES" ]; then
      echo "HATA: Veritabanına $MAX_RETRIES denemede bağlanılamadı." >&2
      exit 1
    fi
    echo "Veritabanı henüz hazır değil ($COUNT/$MAX_RETRIES), 2 saniye bekleniyor..."
    sleep 2
  else
    echo "HATA: prisma migrate deploy başarısız (bağlantı hatası değil); başlatma durduruldu." >&2
    exit 1
  fi
done
rm -f "$LOG"

# RUN_SEED=true: referans veri + (yoksa) admin. Demo veri yalnız SEED_DEMO=true ile. Başarısızlık başlatmayı durdurur.
if [ "${RUN_SEED:-false}" = "true" ]; then
  echo "Seed çalıştırılıyor (prisma/seed.ts, SEED_DEMO=${SEED_DEMO:-false})..."
  npm run db:seed
fi

# SYNC_MERIT_MENUS (varsayılan true): 20 Merit outletini ve gerçek menülerini idempotent olarak senkronize eder.
if [ "${SYNC_MERIT_MENUS:-true}" = "true" ]; then
  echo "Merit outlet ve menüleri senkronize ediliyor..."
  npx tsx prisma/seed/meritMenus.ts
fi

echo "Web sunucusu başlatılıyor (port ${PORT:-3000})..."
exec npm run start
