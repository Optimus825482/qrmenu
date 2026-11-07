#!/usr/bin/env bash
# Merit OS yedegi: pg_dump (custom format) + uploads dizini. Baglanti bilgileri PG* ortam degiskenlerine ayristirilir (parola komut satirinda gorunmez).
# Ortam: DATABASE_URL (zorunlu; /etc/merit/merit.env), BACKUP_DATABASE_URL (opsiyonel, parolasiz URL + ~/.pgpass), BACKUP_DIR (/var/backups/merit),
#        RETENTION_DAYS (14), UPLOADS_DIR (/var/lib/merit/uploads).
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL tanimli olmali}"
DB_URL="${BACKUP_DATABASE_URL:-$DATABASE_URL}"
# URL hicbir zaman komut satirina yazilmaz (ps/proc ile okunabilir): parcalanip PG* ortam degiskenlerine aktarilir.
# Bicim: postgres[ql]://kullanici[:parola]@sunucu[:port]/veritabani[?...]
_rest="${DB_URL#*://}"; _rest="${_rest%%\?*}"
_userinfo="${_rest%%@*}"; _hostpart="${_rest#*@}"
if [[ "$_rest" != *@* ]]; then _userinfo=""; _hostpart="$_rest"; fi
_urldecode() { local v="${1//+/ }"; printf '%b' "${v//%/\\x}"; }
export PGUSER="$(_urldecode "${_userinfo%%:*}")"
if [[ "$_userinfo" == *:* ]]; then export PGPASSWORD="$(_urldecode "${_userinfo#*:}")"; fi
_hp="${_hostpart%%/*}"; export PGDATABASE="${_hostpart#*/}"
export PGHOST="${_hp%%:*}"
if [[ "$_hp" == *:* ]]; then export PGPORT="${_hp#*:}"; fi
unset _rest _userinfo _hostpart _hp DB_URL
BACKUP_DIR="${BACKUP_DIR:-/var/backups/merit}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
UPLOADS_DIR="${UPLOADS_DIR:-/var/lib/merit/uploads}"
STAMP="$(date +%F)"

mkdir -p "$BACKUP_DIR"
umask 077

dump="$BACKUP_DIR/merit-$STAMP.dump"
pg_dump -Fc -f "$dump.tmp"
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
