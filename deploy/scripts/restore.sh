#!/usr/bin/env bash
# Kullanim: restore.sh <dump-dosyasi> <hedef-veritabani-adi> [--force]
# Hedef veritabani "merit" (uretim) ise --force olmadan reddeder. Hedef yoksa olusturulur; varsa uzerine (--clean) yazilir.
# Baglanti: PGHOST/PGPORT/PGUSER ortam degiskenleri veya ~/.pgpass.
set -euo pipefail

PROD_DB="${PROD_DB_NAME:-merit}"
FORCE=0
args=()
for a in "$@"; do
  if [[ "$a" == "--force" ]]; then FORCE=1; else args+=("$a"); fi
done

if (( ${#args[@]} != 2 )); then
  echo "Kullanim: $0 <dump-dosyasi> <hedef-veritabani-adi> [--force]" >&2
  exit 2
fi
DUMP="${args[0]}"
TARGET="${args[1]}"

[[ -f "$DUMP" ]] || { echo "Dump bulunamadi: $DUMP" >&2; exit 2; }
[[ "$TARGET" =~ ^[A-Za-z0-9_]+$ ]] || { echo "Gecersiz veritabani adi: $TARGET" >&2; exit 2; }

if [[ "$TARGET" == "$PROD_DB" && $FORCE -ne 1 ]]; then
  echo "REDDEDILDI: '$TARGET' uretim veritabani. Gercekten geri yuklenecekse once uygulamayi durdurun ve --force verin." >&2
  exit 3
fi

pg_restore --list "$DUMP" > /dev/null

if ! psql -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='$TARGET'" | grep -q 1; then
  createdb "$TARGET"
fi
pg_restore --clean --if-exists --no-owner --dbname="$TARGET" "$DUMP"
echo "geri yuklendi: $DUMP -> $TARGET"
