#!/bin/sh
# Runs every minute from blockyrts-update.timer. Pulls the latest bundle and
# server images from the registry and restarts only what changed.
set -eu
exec 9>/run/blockyrts-update.lock
flock -n 9 || exit 0

# The database and its password live on the volume; wait until it is mounted.
mountpoint -q /mnt/blockyrts-data || exit 0

cd /opt/blockyrts
set -a
# shellcheck source=/dev/null
. ./.env
secrets=/mnt/blockyrts-data/secrets.env
if [ ! -s "$secrets" ]; then
  umask 077
  printf 'DB_PASSWORD=%s\nSESSION_SECRET=%s\n' "$(openssl rand -hex 24)" "$(openssl rand -hex 32)" >"$secrets"
fi
# shellcheck source=/dev/null
. "$secrets"
set +a

# Nothing to run until the first deploy has pushed the bundle.
docker pull -q "$REGISTRY:bundle-live" >/dev/null 2>&1 || exit 0
id=$(docker create "$REGISTRY:bundle-live")
rm -rf bundle.new
docker cp "$id:/bundle" bundle.new
docker rm "$id" >/dev/null
chmod +x bundle.new/backup.sh
rm -rf bundle
mv bundle.new bundle

docker compose -f bundle/compose.yml --project-directory . pull -q
docker compose -f bundle/compose.yml --project-directory . up -d --remove-orphans
docker image prune -f >/dev/null
