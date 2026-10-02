#!/usr/bin/env bash
# One-time (and safe to re-run) setup of the test server. Called by the
# "Set up test server" workflow with the repository secrets in the
# environment. Every step finds what already exists before creating it.
#
# Needs: DOMAIN, CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID,
# R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, RESEND_API_KEY, DROPLET_SIZE,
# REPLACE_SERVER (true/false), and doctl already logged in. RESEND_API_KEY is
# optional: without it the server runs with password-reset email turned off.
set -euo pipefail

for key in DOMAIN CLOUDFLARE_API_TOKEN R2_ACCESS_KEY_ID \
  R2_SECRET_ACCESS_KEY DROPLET_SIZE REPLACE_SERVER; do
  if [ -z "${!key:-}" ]; then
    echo "::error::$key is not set. Add it under Settings > Secrets and variables > Actions (see deploy/README.md)."
    exit 1
  fi
done

here=$(cd "$(dirname "$0")" && pwd)
region=tor1
bucket=blockyrts-saves
cf=https://api.cloudflare.com/client/v4
acct=${CLOUDFLARE_ACCOUNT_ID:-}

# Cloudflare API call; fails the run with Cloudflare's own error text.
cfapi() {
  local method=$1 path=$2 body=${3:-}
  local out
  if [ -n "$body" ]; then
    out=$(curl -sS -X "$method" "$cf$path" -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
      -H 'Content-Type: application/json' --data "$body")
  else
    out=$(curl -sS -X "$method" "$cf$path" -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN")
  fi
  if [ "$(jq -r '.success' <<<"$out")" != true ]; then
    echo "::error::Cloudflare $method $path failed: $(jq -c '.errors' <<<"$out")" >&2
    return 1
  fi
  printf '%s' "$out"
}

# Create or update a proxied CNAME.
cname() {
  local name=$1 target=$2 id
  id=$(cfapi GET "/zones/$zone/dns_records?type=CNAME&name=$name" | jq -r '.result[0].id // empty')
  local body
  body=$(jq -nc --arg n "$name" --arg t "$target" '{type:"CNAME",name:$n,content:$t,proxied:true}')
  if [ -n "$id" ]; then
    cfapi PUT "/zones/$zone/dns_records/$id" "$body" >/dev/null
  else
    cfapi POST "/zones/$zone/dns_records" "$body" >/dev/null
  fi
  echo "DNS: $name -> $target"
}

echo "::group::Cloudflare"
zones=$(cfapi GET "/zones?name=$DOMAIN")
zone=$(jq -r '.result[0].id // empty' <<<"$zones")
if [ -z "$zone" ]; then
  echo "::error::$DOMAIN is not a site in this Cloudflare account, or the token lacks Zone Read on it."
  exit 1
fi
if [ -z "$acct" ]; then
  # The account ID is not secret; when it was not saved, take it from the zone.
  acct=$(jq -r '.result[0].account.id' <<<"$zones")
  echo "Cloudflare account taken from the $DOMAIN zone: $acct"
fi

tunnel=$(cfapi GET "/accounts/$acct/cfd_tunnel?name=blockyrts&is_deleted=false" | jq -r '.result[0].id // empty')
if [ -z "$tunnel" ]; then
  tunnel=$(cfapi POST "/accounts/$acct/cfd_tunnel" '{"name":"blockyrts","config_src":"cloudflare"}' | jq -r '.result.id')
  echo "Tunnel created: $tunnel"
fi
tunnel_token=$(cfapi GET "/accounts/$acct/cfd_tunnel/$tunnel/token" | jq -r '.result')
echo "::add-mask::$tunnel_token"
cfapi PUT "/accounts/$acct/cfd_tunnel/$tunnel/configurations" "$(jq -nc --arg h "api.$DOMAIN" \
  '{config:{ingress:[{hostname:$h,service:"http://server:8080"},{service:"http_status:404"}]}}')" >/dev/null
cname "api.$DOMAIN" "$tunnel.cfargotunnel.com"

if ! pages=$(cfapi GET "/accounts/$acct/pages/projects/blockyrts" 2>/dev/null); then
  pages=$(cfapi POST "/accounts/$acct/pages/projects" '{"name":"blockyrts","production_branch":"main"}')
  echo "Pages project created"
fi
pages_host=$(jq -r '.result.subdomain' <<<"$pages")
if ! cfapi GET "/accounts/$acct/pages/projects/blockyrts/domains/play.$DOMAIN" >/dev/null 2>&1; then
  cfapi POST "/accounts/$acct/pages/projects/blockyrts/domains" "$(jq -nc --arg n "play.$DOMAIN" '{name:$n}')" >/dev/null
fi
cname "play.$DOMAIN" "$pages_host"
echo "::endgroup::"

echo "::group::DigitalOcean registry"
if ! registry_name=$(doctl registry get --format Name --no-header 2>/dev/null); then
  uuid=$(doctl account get --format UUID --no-header)
  registry_name="blockyrts-${uuid:0:8}"
  doctl registry create "$registry_name" --subscription-tier starter >/dev/null
  echo "Registry created: $registry_name"
fi
registry="registry.digitalocean.com/$registry_name/blockyrts"
docker_config=$(doctl registry docker-config --read-write=false | jq -c .)
echo "::add-mask::$(jq -r '.auths[].auth' <<<"$docker_config")"
echo "::endgroup::"

echo "::group::DigitalOcean volume, firewall and Droplet"
volume=$(doctl compute volume list --format ID,Name --no-header | awk '$2=="blockyrts-data"{print $1}')
if [ -z "$volume" ]; then
  volume=$(doctl compute volume create blockyrts-data --region "$region" --size 10GiB \
    --fs-type ext4 --desc "blockyrts database" --format ID --no-header)
  echo "Volume created: $volume"
fi

if [ -z "$(doctl compute firewall list --format Name --no-header | grep -x blockyrts || true)" ]; then
  # No inbound rules: the server is only reached through the Cloudflare tunnel.
  doctl compute firewall create --name blockyrts --tag-names blockyrts \
    --outbound-rules "protocol:tcp,ports:all,address:0.0.0.0/0,address:::/0 protocol:udp,ports:all,address:0.0.0.0/0,address:::/0 protocol:icmp,address:0.0.0.0/0,address:::/0" \
    >/dev/null
  echo "Firewall created"
fi

existing=$(doctl compute droplet list --tag-name blockyrts --format ID --no-header)
if [ -n "$existing" ]; then
  if [ "$REPLACE_SERVER" != true ]; then
    echo "The test server already exists (Droplet $existing). Nothing else to do."
    echo "To rebuild it with new settings, run this workflow again with 'Replace the server' ticked. The database is on the volume and is kept."
    echo "::endgroup::"
    exit 0
  fi
  echo "Replacing Droplet $existing (the volume and its database are kept)"
  doctl compute droplet delete --force "$existing"
  for _ in $(seq 60); do
    [ "$(doctl compute volume get "$volume" --format DropletIDs --no-header | tr -d '[] ')" = "" ] && break
    sleep 5
  done
fi

# R2_* come from the repository secrets (checked at the top).
# shellcheck disable=SC2153
export DOMAIN REGISTRY="$registry" TUNNEL_TOKEN="$tunnel_token" \
  S3_ENDPOINT="https://$acct.r2.cloudflarestorage.com" S3_BUCKET="$bucket" \
  S3_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID" S3_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY" \
  EMAIL_API_KEY="${RESEND_API_KEY:-}" EMAIL_FROM="no-reply@mail.$DOMAIN" \
  REGISTRY_DOCKER_CONFIG="$docker_config"
user_data=$(mktemp)
python3 "$here/render-cloud-init.py" >"$user_data"
doctl compute droplet create blockyrts-1 --region "$region" --size "$DROPLET_SIZE" \
  --image ubuntu-24-04-x64 --volumes "$volume" --tag-name blockyrts \
  --enable-monitoring --user-data-file "$user_data" --wait --format ID,Name,PublicIPv4,Status
rm -f "$user_data"
echo "::endgroup::"

{
  echo "## Test server is set up"
  echo
  echo "- Game page: https://play.$DOMAIN (live after the first Deploy run)"
  echo "- Server: https://api.$DOMAIN, Droplet size $DROPLET_SIZE in Toronto"
  if [ -z "${RESEND_API_KEY:-}" ]; then
    echo "- Password-reset email is off (no RESEND_API_KEY). Add the secret and re-run with 'Replace the server' to turn it on."
  fi
  echo "- Next: run the **Deploy** workflow."
} >>"${GITHUB_STEP_SUMMARY:-/dev/stdout}"
