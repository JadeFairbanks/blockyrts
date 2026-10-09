#!/bin/sh
# Nightly database dump to the R2 bucket, under backups/. Runs from
# blockyrts-backup.timer; keeps every dump (a few kB each at test scale).
set -eu
# The dump holds account emails: readable by root only while it is on disk.
umask 077
cd /opt/blockyrts
set -a
# shellcheck source=/dev/null
. ./.env
# compose.yml needs the database password, which lives on the volume (made
# by update.sh); without it compose refuses to run and the dump was empty.
# shellcheck source=/dev/null
. /mnt/blockyrts-data/secrets.env
set +a

raw=/tmp/blockyrts-db.sql
dump=$raw.gz
rm -f "$raw" "$dump"
# Dump to a file first, so a failed pg_dump stops here instead of uploading
# an empty backup (sh has no pipefail).
docker compose -f bundle/compose.yml --project-directory . exec -T db \
  pg_dump -U blockyrts blockyrts >"$raw"
if ! grep -q '^CREATE TABLE public.accounts' "$raw"; then
  echo "backup: the dump has no accounts table; not uploading it" >&2
  rm -f "$raw"
  exit 1
fi
gzip "$raw"
docker run --rm -v "$dump:/dump.sql.gz:ro" \
  -e AWS_ACCESS_KEY_ID="$S3_ACCESS_KEY_ID" \
  -e AWS_SECRET_ACCESS_KEY="$S3_SECRET_ACCESS_KEY" \
  -e AWS_REQUEST_CHECKSUM_CALCULATION=when_required \
  -e AWS_RESPONSE_CHECKSUM_VALIDATION=when_required \
  amazon/aws-cli --endpoint-url "$S3_ENDPOINT" --region auto \
  s3 cp /dump.sql.gz "s3://$S3_BUCKET/backups/db-$(date -u +%Y-%m-%d).sql.gz"
rm -f "$dump"
