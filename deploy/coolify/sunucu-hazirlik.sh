#!/usr/bin/env bash
# Merit OS - bos Ubuntu sunucuyu Coolify kurulumuna hazirlar: saat dilimi, takas alani, Docker Engine, Coolify.
# Kullanim (root):  sudo bash sunucu-hazirlik.sh [--ufw] [--docker-only]
#   --ufw          Guvenlik duvarini acar (SSH, 80, 443, 8000, 6001, 6002). Varsayilan: dokunmaz.
#   --docker-only  Yalniz Docker kurar; Coolify kurulumunu atlar.
# Ortam: TIMEZONE (Europe/Nicosia), SWAP_GB (4), SSH_PORT (oturumdan algilanir, yoksa 22).
# Betik yeniden calistirilabilir: kurulu olan adimlari atlar.
set -euo pipefail

ENABLE_UFW=0
DOCKER_ONLY=0
for arg in "$@"; do
  case "$arg" in
    --ufw) ENABLE_UFW=1 ;;
    --docker-only) DOCKER_ONLY=1 ;;
    *) echo "Bilinmeyen secenek: $arg" >&2; exit 2 ;;
  esac
done

TIMEZONE="${TIMEZONE:-Europe/Nicosia}"
SWAP_GB="${SWAP_GB:-4}"

say() { printf '\n== %s\n' "$*"; }
die() { echo "HATA: $*" >&2; exit 1; }

[[ "$(id -u)" -eq 0 ]] || die "root olarak calistirin (sudo bash $0)"
[[ -r /etc/os-release ]] || die "/etc/os-release okunamadi"
# shellcheck disable=SC1091
. /etc/os-release
[[ "${ID:-}" == "ubuntu" ]] || die "bu betik Ubuntu icindir (bulunan: ${ID:-bilinmiyor})"
case "${VERSION_ID:-}" in
  22.04|24.04) ;;
  *) echo "UYARI: Ubuntu ${VERSION_ID:-?} denenmedi; Coolify LTS surum (22.04 / 24.04) onerir." >&2 ;;
esac

say "Sistem ozeti"
CPU="$(nproc)"
RAM_MB="$(awk '/MemTotal/ {print int($2/1024)}' /proc/meminfo)"
DISK_GB="$(df -BG --output=avail / | tail -1 | tr -dc '0-9')"
echo "Ubuntu ${VERSION_ID:-?}, ${CPU} cekirdek, ${RAM_MB} MB bellek, / uzerinde ${DISK_GB} GB bos"
[[ "$CPU" -ge 2 ]] || echo "UYARI: Coolify en az 2 cekirdek ister." >&2
[[ "$RAM_MB" -ge 3500 ]] || echo "UYARI: 4 GB altinda bellek; imaj derlemesi (next build, 3 GB yigin) takas alanina duser ve yavaslar." >&2
[[ "$DISK_GB" -ge 30 ]] || echo "UYARI: 30 GB altinda bos alan; imaj katmanlari, veritabani ve yedekler icin dar." >&2

say "Paketler"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y ca-certificates curl openssl ufw

say "Saat dilimi: $TIMEZONE"
timedatectl set-timezone "$TIMEZONE"
timedatectl set-ntp true || true

say "Takas alani"
if [[ "$(swapon --noheadings | wc -l)" -gt 0 ]]; then
  echo "Takas alani zaten var, atlandi."
elif [[ "$RAM_MB" -ge 7500 ]]; then
  echo "Bellek yeterli (${RAM_MB} MB), takas alani olusturulmadi."
else
  fallocate -l "${SWAP_GB}G" /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  grep -q '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
  echo "${SWAP_GB} GB takas alani olusturuldu."
fi

say "Docker Engine"
if command -v snap >/dev/null 2>&1 && snap list docker >/dev/null 2>&1; then
  die "Docker snap ile kurulu; Coolify bununla calismaz. Once kaldirin: snap remove --purge docker"
fi
if command -v docker >/dev/null 2>&1; then
  echo "Docker zaten kurulu: $(docker --version)"
else
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu ${UBUNTU_CODENAME:-$VERSION_CODENAME} stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -y
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi
systemctl enable --now docker
DOCKER_MAJOR="$(docker version --format '{{.Server.Version}}' | cut -d. -f1)"
[[ "$DOCKER_MAJOR" -ge 24 ]] || die "Docker $DOCKER_MAJOR bulundu; Coolify 24 veya ustunu ister."
docker compose version

if [[ "$ENABLE_UFW" -eq 1 ]]; then
  say "Guvenlik duvari (ufw)"
  SSH_PORT="${SSH_PORT:-$(awk '{print $4}' <<<"${SSH_CONNECTION:-}")}"
  SSH_PORT="${SSH_PORT:-22}"
  ufw allow "${SSH_PORT}/tcp" comment 'SSH'
  ufw allow 80/tcp comment 'HTTP (sertifika + yonlendirme)'
  ufw allow 443/tcp comment 'HTTPS'
  ufw allow 8000/tcp comment 'Coolify paneli'
  ufw allow 6001/tcp comment 'Coolify canli guncelleme'
  ufw allow 6002/tcp comment 'Coolify terminal'
  ufw --force enable
  ufw status verbose
  echo "NOT: Docker'in yayinladigi portlar ufw kurallarini asar. Compose dosyamiz port yayinlamaz (yalniz expose);"
  echo "     veritabani disariya kapalidir. Panel alan adina baglaninca 8000/6001/6002 kurallarini kaldirin."
else
  echo
  echo "Guvenlik duvarina dokunulmadi (acmak icin --ufw). Otel ag guvenlik duvarinda en az 80 ve 443 acik olmali."
fi

if [[ "$DOCKER_ONLY" -eq 1 ]]; then
  say "Bitti (yalniz Docker). Coolify kurulumu atlandi."
  exit 0
fi

say "Coolify"
if [[ -d /data/coolify/source ]]; then
  echo "Coolify zaten kurulu (/data/coolify). Atlandi."
else
  INSTALLER="$(mktemp)"
  curl -fsSL https://cdn.coollabs.io/coolify/install.sh -o "$INSTALLER"
  bash "$INSTALLER"
  rm -f "$INSTALLER"
fi

IP="$(hostname -I | awk '{print $1}')"
say "Hazir"
cat <<EOF
Coolify paneli: http://${IP}:8000

HEMEN yapin: paneli acip yonetici hesabini olusturun. Ilk kaydolan kisi yonetici olur;
panel aga acikken bu adimi bekletmeyin.

Sonraki adimlar: COOLIFY_DEPLOYMENT.md (kok dizin) -> "Sunucuda adim adim".
EOF
