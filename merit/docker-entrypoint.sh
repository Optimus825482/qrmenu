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
  # Seed odaları QR kodsuz oluşturur; basılı oda kartlarındaki kodlar (assets/qr-templates) burada yazılır.
  # Yalnız kodu boş ya da farklı odaları düzeltir; başarısızlık başlatmayı durdurmaz, günlükte görünür.
  echo "Basılı oda QR kodları yazılıyor (scripts/oda-qr-dogrula.ts --yaz)..."
  npx tsx scripts/oda-qr-dogrula.ts --yaz || echo "UYARI: oda QR kodları basılı kartlarla tam eşleşmedi; yukarıdaki raporu inceleyin." >&2
fi

# Merit outlet ve menü senkronu her açılışta çalışır (kapatmak için SYNC_MERIT_MENUS=false). Ayar gerekmez:
# bir outlet'in menüsü yalnız boşsa ya da prisma/seed/data/merit-menus.json içindeki menüsü değiştiyse yeniden
# kurulur; dosya aynıysa hiçbir şeye dokunulmaz (panelden yapılan düzenlemeler kalır). Siparişlere dokunulmaz:
# eski siparişlerde geçen ürünler pasif bir arşiv kategorisine alınır. Senkron hatası başlatmayı durdurmaz.
if [ "${SYNC_MERIT_MENUS:-true}" = "true" ]; then
  echo "Merit outlet ve menüleri senkronize ediliyor..."
  npx tsx prisma/seed/meritMenus.ts || echo "UYARI: Merit menü senkronu tamamlanamadı; site mevcut menülerle açılıyor. Yukarıdaki hatayı inceleyin." >&2
fi

# Eski minibar verisinin TEK SEFERLİK aktarımı: yalnız LEGACY_DATABASE_URL tanımlıysa çalışır. Arka planda yürür
# (yaklaşık 10 dakika; sağlık denetimi beklemesin diye site önce açılır). Temiz bitince veritabanına işaret yazılır
# ve sonraki açılışlarda atlanır; hata başlatmayı durdurmaz, sonraki açılışta kaldığı yerden yeniden denenir.
if [ -n "${LEGACY_DATABASE_URL:-}" ]; then
  echo "Eski veri aktarımı denetleniyor (tek seferlik, arka planda)..."
  (npx tsx scripts/migrate-from-minibarlatest/once.ts || echo "UYARI: Eski veri aktarımı tamamlanamadı; site çalışıyor. Yukarıdaki raporu inceleyin." >&2) &
fi

# Diamond F&B personelinin TEK SEFERLİK tanımlanması (13.11.2026 listesi, 50 kişi; standart geçici şifre, ilk girişte
# değiştirilir). Tamamlanınca veritabanına işaret yazılır ve bir daha çalışmaz; sonradan silinen ya da adı değişen
# kişi geri gelmez. Hata başlatmayı durdurmaz, sonraki açılışta yeniden denenir (var olan kişiler atlanır).
# Kapatmak için SEED_DIAMOND_STAFF=false.
if [ "${SEED_DIAMOND_STAFF:-true}" = "true" ]; then
  npx tsx scripts/diamond-personel-tanimla.ts --once || echo "UYARI: Diamond personel tanımlama tamamlanamadı; site çalışıyor. Yukarıdaki hatayı inceleyin." >&2
fi

echo "Web sunucusu başlatılıyor (port ${PORT:-3000})..."
exec npm run start
