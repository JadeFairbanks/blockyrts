#!/bin/sh
# Nightly database dump to the R2 bucket, under backups/. Runs from
# blockyrts-backup.timer; keeps every dump (a few kB each at test scale).
set -eu
cd /opt/blockyrts
set -a
# shellcheck source=/dev/null
. ./.env
set +a

dump=/tmp/blockyrts-db.sql.gz
docker compose -f bundle/compose.yml --project-directory . exec -T db \
  pg_dump -U blockyrts blockyrts | gzip >"$dump"
docker run --rm -v "$dump:/dump.sql.gz:ro" \
  -e AWS_ACCESS_KEY_ID="$S3_ACCESS_KEY_ID" \
  -e AWS_SECRET_ACCESS_KEY="$S3_SECRET_ACCESS_KEY" \
  -e AWS_REQUEST_CHECKSUM_CALCULATION=when_required \
  -e AWS_RESPONSE_CHECKSUM_VALIDATION=when_required \
  amazon/aws-cli --endpoint-url "$S3_ENDPOINT" --region auto \
  s3 cp /dump.sql.gz "s3://$S3_BUCKET/backups/db-$(date -u +%Y-%m-%d).sql.gz"
rm -f "$dump"
