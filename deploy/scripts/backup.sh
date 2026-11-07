#!/usr/bin/env bash
# Merit OS yedegi: pg_dump (custom format) + uploads dizini. Baglanti bilgileri PG* ortam degiskenlerine ayristirilir (parola komut satirinda gorunmez).
# Ortam: DATABASE_URL (zorunlu; /etc/merit/merit.env), BACKUP_DATABASE_URL (opsiyonel, parolasiz URL + ~/.pgpass), BACKUP_DIR (/var/backups/merit),
#        RETENTION_DAYS (14), UPLOADS_DIR (/var/lib/merit/uploads).
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL tanimli olmali}"
DB_URL="${BACKUP_DATABASE_URL:-$DATABASE_URL}"
# Parola komut satirina yazilmaz (ps/proc ile okunabilir): URL'den yalniz parola cikarilip PGPASSWORD'e alinir;
# kalan URL (sslmode, sslrootcert gibi sorgu parametreleri dahil) oldugu gibi --dbname ile gecer.
_urldecode() { local v="${1//+/ }"; printf '%b' "${v//%/\\x}"; }
_scheme="${DB_URL%%://*}"; _rest="${DB_URL#*://}"
if [[ "$_rest" == *@* ]]; then
  _userinfo="${_rest%%@*}"; _hostpart="${_rest#*@}"
  if [[ "$_userinfo" == *:* ]]; then
    export PGPASSWORD="$(_urldecode "${_userinfo#*:}")"
    _userinfo="${_userinfo%%:*}"
  fi
  DB_URL="${_scheme}://${_userinfo}@${_hostpart}"
fi
# Parola sorgu parametresi olarak verilmisse (password=, sslpassword=) argv'ye sizar: reddet.
if [[ "$DB_URL" =~ [\?\&](ssl)?password= ]]; then
  echo "REDDEDILDI: DATABASE_URL icinde password= sorgu parametresi var; parolayi URL kullanici bilgisine tasiyin." >&2; exit 2
fi
unset _scheme _rest _userinfo _hostpart
BACKUP_DIR="${BACKUP_DIR:-/var/backups/merit}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
UPLOADS_DIR="${UPLOADS_DIR:-/var/lib/merit/uploads}"
STAMP="$(date +%F)"

mkdir -p "$BACKUP_DIR"
umask 077

dump="$BACKUP_DIR/merit-$STAMP.dump"
pg_dump -Fc --dbname="$DB_URL" -f "$dump.tmp"
pg_restore --list "$dump.tmp" > /dev/null
mv "$dump.tmp" "$dump"
echo "dump: $dump ($(du -h "$dump" | cut -f1))"

if [[ -d "$UPLOADS_DIR" ]]; then
  tar -czf "$BACKUP_DIR/merit-uploads-$STAMP.tgz" -C "$(dirname "$UPLOADS_DIR")" "$(basename "$UPLOADS_DIR")"
  echo "uploads: $BACKUP_DIR/merit-uploads-$STAMP.tgz"
else
  echo "UYARI: $UPLOADS_DIR yok, uploads arsivlenmedi" >&2
fi

find "$BACKUP_DIR" -maxdepth 1 \( -name 'merit-*.dump' -o -name 'merit-uploads-*.tgz' \) -mtime "+$RETENTION_DAYS" -delete
echo "tamam (saklama: $RETENTION_DAYS gun)"
