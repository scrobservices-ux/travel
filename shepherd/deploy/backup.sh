#!/bin/sh
# Nightly backup of the congregation's database. Add to cron:
#   0 2 * * * /opt/shepherd/deploy/backup.sh /var/backups/shepherd
set -eu
DATA="${DATA:-/opt/shepherd/server/data}"
DEST="${1:-/var/backups/shepherd}"
KEEP="${KEEP:-30}"

mkdir -p "$DEST"
STAMP=$(date +%Y-%m-%d-%H%M)
tar -czf "$DEST/shepherd-$STAMP.tar.gz" -C "$(dirname "$DATA")" "$(basename "$DATA")"

# keep the most recent $KEEP archives
ls -1t "$DEST"/shepherd-*.tar.gz 2>/dev/null | tail -n +$((KEEP + 1)) | xargs -r rm --

echo "Backed up to $DEST/shepherd-$STAMP.tar.gz"
