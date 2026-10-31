#!/usr/bin/env bash
# Restore an encrypted Sehatra backup (made by .github/workflows/backup.yml) into a database.
#   BACKUP_PASSPHRASE=… scripts/restore-backup.sh sehatra-2026-11-01T2030Z.dump.enc "postgres://…target…"
# Restore into a NEW, empty database (e.g. a fresh Neon branch) and point the app at it after checking —
# never straight over the live database. Needs docker (or pg_restore 18+ on PATH) and openssl.
set -euo pipefail
file="${1:?usage: restore-backup.sh <backup.dump.enc> <target database url>}"
target="${2:?usage: restore-backup.sh <backup.dump.enc> <target database url>}"
: "${BACKUP_PASSPHRASE:?set BACKUP_PASSPHRASE to the backup passphrase}"
umask 077
tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
openssl enc -d -aes-256-cbc -pbkdf2 -iter 600000 -pass env:BACKUP_PASSPHRASE -in "$file" -out "$tmp/backup.dump"
echo "Decrypted. Restoring into the target database…"
if command -v pg_restore >/dev/null && pg_restore --version | grep -Eq ' (1[89]|[2-9][0-9])\.'; then
  pg_restore --no-owner --no-privileges --dbname="$target" "$tmp/backup.dump"
else
  docker run --rm -v "$tmp:/b" -e TARGET="$target" postgres:18 sh -c 'pg_restore --no-owner --no-privileges --dbname="$TARGET" /b/backup.dump'
fi
echo "Restored. Check the data, then set DATABASE_URL to this database and restart the app."
