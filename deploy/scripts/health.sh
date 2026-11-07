#!/usr/bin/env bash
# Kullanim: health.sh [taban-url] [bekleme-saniyesi]
# /api/health 200 donene ve ok:true olana kadar bekler. Varsayilan: http://127.0.0.1:3000, 0 sn (tek deneme).
set -euo pipefail

BASE_URL="${1:-${HEALTH_URL:-http://127.0.0.1:3000}}"
WAIT="${2:-0}"
deadline=$((SECONDS + WAIT))

while true; do
  if body="$(curl -fsS --max-time 5 "${BASE_URL%/}/api/health" 2>/dev/null)" && [[ "$body" == *'"ok":true'* ]]; then
    echo "SAGLIKLI: $body"
    exit 0
  fi
  if (( SECONDS >= deadline )); then
    echo "SAGLIKSIZ: ${BASE_URL%/}/api/health yanit vermedi veya ok:true degil" >&2
    exit 1
  fi
  sleep 2
done
