#!/usr/bin/env bash
# Met en production : images, migrations, redémarrage.
# - CD (GitHub Actions) : IMAGE_TAG=<sha> → images récupérées sur GHCR, le dépôt est déjà à ce commit.
# - Manuel, sur le VPS : sans IMAGE_TAG → git pull puis build local (2 Go de swap conseillés).
set -euo pipefail
cd "$(dirname "$0")/.."
compose() { docker compose -f docker-compose.prod.yml --profile tools "$@"; }

if [[ -n "${IMAGE_TAG:-}" ]]; then
  compose pull migrate web
else
  git pull --ff-only
  compose build migrate web
fi
compose up -d db
compose run --rm migrate
compose up -d --remove-orphans web caddy
# Config Caddy éventuellement modifiée par ce déploiement : rechargée sans coupure.
compose exec -T caddy caddy reload --config /etc/caddy/Caddyfile --force >/dev/null
docker image prune -f >/dev/null

echo "Déployé : https://$(grep '^DOMAIN=' .env | cut -d= -f2)"
echo "Rappel : l'agent doit avoir la même version du protocole (git pull + redémarrage sur sa machine)."
