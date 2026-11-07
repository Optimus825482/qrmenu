#!/usr/bin/env bash
# Merit OS guncelleme: yedek -> git pull -> npm ci -> prisma migrate deploy -> build -> restart -> saglik denetimi.
# Kullanim: update.sh [git-ref]   (varsayilan: mevcut dalin origin'i, --ff-only)
# Ortam: APP_ROOT (/opt/merit), SERVICE (merit), HEALTH_URL (http://127.0.0.1:3000)
# Calistiran kullanici: merit (DATABASE_URL icin /etc/merit/merit.env okunur; systemctl restart icin sudoers kurali, bkz. README).
set -euo pipefail

APP_ROOT="${APP_ROOT:-/opt/merit}"
SERVICE="${SERVICE:-merit}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:3000}"
REF="${1:-}"

set -a
# shellcheck disable=SC1091
source /etc/merit/merit.env
set +a

cd "$APP_ROOT"
PREV="$(git rev-parse HEAD)"
echo "onceki surum: $PREV"

"$APP_ROOT/deploy/scripts/backup.sh"

if [[ -n "$REF" ]]; then
  git fetch --tags origin
  git checkout "$REF"
else
  git pull --ff-only
fi

cd "$APP_ROOT/merit"
npm ci
npx prisma migrate deploy
npm run build

sudo systemctl restart "$SERVICE"

if "$APP_ROOT/deploy/scripts/health.sh" "$HEALTH_URL" 60; then
  echo "guncelleme tamam: $(git -C "$APP_ROOT" rev-parse --short HEAD)"
  exit 0
fi

cat >&2 <<MSG
GUNCELLEME BASARISIZ: saglik denetimi gecmedi.
Geri donus: cd $APP_ROOT && git checkout $PREV && (cd merit && npm ci && npm run build) && sudo systemctl restart $SERVICE
Migration yikiciysa (kolon/tablo dusurme) kodu geri almak yetmez: servisi durdurun ve
  $APP_ROOT/deploy/scripts/restore.sh /var/backups/merit/merit-<tarih>.dump merit --force
ile guncelleme oncesi dokumu geri yukleyin.
MSG
exit 1
