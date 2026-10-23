#!/usr/bin/env bash
# Génère les fichiers d'environnement de production avec des secrets aléatoires (une seule fois).
# Usage : bash deploy/init-env.sh <domaine> <email-admin>
set -euo pipefail
cd "$(dirname "$0")/.."

DOMAIN="${1:?Usage : deploy/init-env.sh <domaine> <email-admin>}"
ADMIN_EMAIL="${2:?Usage : deploy/init-env.sh <domaine> <email-admin>}"

if [[ -e .env || -e apps/web/.env ]]; then
  echo ".env ou apps/web/.env existe déjà : rien n'est écrasé." >&2
  exit 1
fi

umask 077
cat > .env <<ENV
DOMAIN=$DOMAIN
POSTGRES_USER=app
POSTGRES_PASSWORD=$(openssl rand -hex 24)
POSTGRES_DB=app
ENV

# Clés VAPID (P-256, format web-push) générées avec le crypto de Node, sans dépendance.
VAPID=$(docker run --rm node:24-alpine node -e "
  const ecdh = require('node:crypto').createECDH('prime256v1');
  ecdh.generateKeys();
  const priv = ecdh.getPrivateKey();
  console.log(ecdh.getPublicKey('base64url'));
  console.log(Buffer.concat([Buffer.alloc(32 - priv.length), priv]).toString('base64url'));
")
VAPID_PUBLIC=$(echo "$VAPID" | sed -n 1p)
VAPID_PRIVATE=$(echo "$VAPID" | sed -n 2p)

cat > apps/web/.env <<ENV
# Production. DATABASE_URL, BETTER_AUTH_URL et STORAGE_DIR sont fournis par docker-compose.prod.yml.
BETTER_AUTH_SECRET=$(openssl rand -base64 32)
ENCRYPTION_KEY=$(openssl rand -base64 32)
VAPID_PUBLIC_KEY=$VAPID_PUBLIC
VAPID_PRIVATE_KEY=$VAPID_PRIVATE
VAPID_SUBJECT=mailto:$ADMIN_EMAIL
EMBED_MODEL=bge-m3
ADMIN_EMAILS=$ADMIN_EMAIL

# Connecteurs optionnels. URI de redirection : https://$DOMAIN/api/connectors/<google|hue>/callback
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
HUE_CLIENT_ID=
HUE_CLIENT_SECRET=
ENV

echo "Écrit : .env et apps/web/.env (droits 600). Suite : deploy/deploy.sh"
