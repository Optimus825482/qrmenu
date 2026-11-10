#!/usr/bin/env bash
# Merit OS (Coolify / Docker) yedegi: konteyner icinden pg_dump (custom format) + uploads birimi.
# Sunucuda (host) root veya docker grubundaki kullaniciyla calisir. Parola kullanilmaz: pg_dump konteyner
# icinde yerel soketle baglanir, komut satirinda sir gorunmez.
# Ortam: BACKUP_DIR (/var/backups/merit), RETENTION_DAYS (14),
#        PG_CONTAINER / APP_CONTAINER (verilmezse compose servis etiketinden bulunur).
# Zamanlama ornegi (/etc/cron.d/merit-yedek):
#   15 3 * * * root /opt/merit/yedek.sh >> /var/log/merit-yedek.log 2>&1
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/var/backups/merit}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
STAMP="$(date +%F)"

# Coolify'in kendi veritabani da "postgres" servisidir (coolify-db); o haric tutulur.
find_container() {
  local service="$1" names count
  names="$(docker ps --filter "label=com.docker.compose.service=${service}" --format '{{.Names}}' | grep -v '^coolify' || true)"
  count="$(grep -c . <<<"$names" || true)"
  if [[ "$count" -ne 1 ]]; then
    echo "HATA: '${service}' servisi icin calisan ${count} konteyner bulundu; adini acikca verin." >&2
    echo "      Ornek: PG_CONTAINER=<ad> APP_CONTAINER=<ad> $0   (adlar: docker ps)" >&2
    exit 1
  fi
  printf '%s' "$names"
}

PG_CONTAINER="${PG_CONTAINER:-$(find_container postgres)}"
APP_CONTAINER="${APP_CONTAINER:-$(find_container app)}"

mkdir -p "$BACKUP_DIR"
umask 077

dump="$BACKUP_DIR/merit-$STAMP.dump"
# shellcheck disable=SC2016
docker exec "$PG_CONTAINER" sh -c 'pg_dump -Fc -U "$POSTGRES_USER" -d "$POSTGRES_DB"' > "$dump.tmp"
# Bozuk/yarim dokum yedek sayilmaz: icindekiler listelenebiliyorsa kabul edilir.
docker exec -i "$PG_CONTAINER" pg_restore --list < "$dump.tmp" > /dev/null
mv "$dump.tmp" "$dump"
echo "dump: $dump ($(du -h "$dump" | cut -f1))"

uploads="$BACKUP_DIR/merit-uploads-$STAMP.tgz"
docker exec "$APP_CONTAINER" tar -czf - -C /app uploads > "$uploads.tmp"
gzip -t "$uploads.tmp"
mv "$uploads.tmp" "$uploads"
echo "uploads: $uploads ($(du -h "$uploads" | cut -f1))"

find "$BACKUP_DIR" -maxdepth 1 \( -name 'merit-*.dump' -o -name 'merit-uploads-*.tgz' \) -mtime "+$RETENTION_DAYS" -delete
echo "tamam (saklama: $RETENTION_DAYS gun). Yedekleri baska bir makineye de kopyalayin."
