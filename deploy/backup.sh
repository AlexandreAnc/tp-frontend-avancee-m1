#!/usr/bin/env bash
# Sauvegarde de la base et des fichiers des utilisateurs, 14 jours conservés.
# Cron (root) : 30 3 * * * /opt/dashia/deploy/backup.sh >> /var/log/dashia-backup.log 2>&1
# À copier ensuite hors du VPS (restic, rclone, scp…) : une sauvegarde sur le même disque ne protège pas d'une panne.
set -euo pipefail
cd "$(dirname "$0")/.."
compose() { docker compose -f docker-compose.prod.yml "$@"; }

DEST="${BACKUP_DIR:-/var/backups/dashia}"
STAMP=$(date +%Y-%m-%d_%H%M)
mkdir -p "$DEST"
chmod 700 "$DEST"

compose exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom' > "$DEST/db_$STAMP.dump"
compose exec -T web tar -C /data -czf - files > "$DEST/files_$STAMP.tar.gz"

find "$DEST" -type f -mtime +14 -delete
echo "$(date -Is) sauvegarde $STAMP : $(du -sh "$DEST" | cut -f1) au total"
