#!/usr/bin/env bash
# Merit OS - Coolify "Environment Variables" alanina yapistirilacak degerleri uretir (rastgele sirlarla).
# Kullanim:  bash env-uret.sh https://menu.otel.example
# Cikti yalniz ekrana yazilir; dosyaya kaydetmeyin, depoya koymayin. Degerleri parola kasaniza alin:
# SESSION_SECRET / QR_HMAC_SECRET kaybolursa oturumlar ve basilmis QR'lar gecersiz olur.
set -euo pipefail

APP_BASE_URL="${1:-}"
if [[ ! "$APP_BASE_URL" =~ ^https?://[^/]+$ ]]; then
  echo "Kullanim: bash $0 https://menu.otel.example   (sonunda / olmadan)" >&2
  exit 2
fi
command -v openssl >/dev/null 2>&1 || { echo "HATA: openssl gerekli" >&2; exit 1; }

# URL'ye gomulen degerler yalniz harf/rakam icerir (yuzde-kodlama gerekmesin).
alnum() { openssl rand -hex "$1"; }
secret() { openssl rand -base64 "$1" | tr -d '\n'; }

COOKIE_LINE=""
if [[ "$APP_BASE_URL" == http://* ]]; then
  COOKIE_LINE="COOKIE_SECURE=false"
  echo "UYARI: adres HTTP. Oturum cerezi sifresiz gider, PWA kurulumu ve anlik bildirim calismaz; yalniz deneme icindir." >&2
fi

cat <<EOF
# --- Zorunlu ---
POSTGRES_USER=merit
POSTGRES_PASSWORD=$(alnum 24)
POSTGRES_DB=merit
APP_BASE_URL=${APP_BASE_URL}
SESSION_SECRET=$(secret 48)
QR_HMAC_SECRET=$(secret 48)
PRINT_GATEWAY_KEY=$(secret 32)
SETTINGS_SECRET_KEY=$(secret 48)

# --- Yalniz ILK dagitim (admin olusunca RUN_SEED=false yapin, SEED_ADMIN_PASSWORD'u silin) ---
RUN_SEED=true
SEED_ADMIN_PASSWORD=$(alnum 8)
SYNC_MERIT_MENUS=true
${COOKIE_LINE}
EOF
