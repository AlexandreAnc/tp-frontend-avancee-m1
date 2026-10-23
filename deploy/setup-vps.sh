#!/usr/bin/env bash
# Préparation unique d'un VPS Ubuntu / Debian (en root) : swap, pare-feu, Docker.
# Usage : sudo bash deploy/setup-vps.sh
set -euo pipefail

# Conteneur LXC (VPS « léger ») : ni swap ni pare-feu propres, c'est l'hôte qui les gère.
IN_CONTAINER=$(systemd-detect-virt --container >/dev/null 2>&1 && echo 1 || true)

# 2 Go de swap : marge pour un build manuel de l'image sur 4 Go de RAM (la CI, elle, compile ailleurs).
if [[ -n "$IN_CONTAINER" ]]; then
  echo "Conteneur $(systemd-detect-virt --container) : pas de swap possible, ignoré."
elif ! swapon --show | grep -q /swapfile; then
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

# Pare-feu : SSH et HTTP(S) uniquement. Docker publie 80/443 pour Caddy, rien d'autre.
apt-get update
apt-get install -y git curl openssl
if [[ -z "$IN_CONTAINER" ]]; then
  apt-get install -y ufw
  ufw allow OpenSSH
  ufw allow 80/tcp
  ufw allow 443/tcp
  ufw allow 443/udp
  ufw --force enable
else
  echo "Pare-feu : géré par l'hôte du conteneur. Seuls SSH et Caddy (80/443) écoutent."
fi

# Docker Engine + plugin compose (script officiel).
if ! command -v docker >/dev/null; then
  curl -fsSL https://get.docker.com | sh
fi

echo "VPS prêt. Suite : git clone du dépôt, puis deploy/init-env.sh."
