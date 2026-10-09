#!/usr/bin/env bash
# Emails every account on the live server, through the server itself
# (deploy/README.md, "Emailing players"). Called by the "Email players"
# workflow with DOMAIN, CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID (may be
# empty), R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, MESSAGE (a file in
# deploy/mail/, without .txt) and SEND (true sends; anything else is a dry
# run that only counts).
#
# The Droplet takes no inbound traffic, so the job goes through the save
# bucket: this puts jobs/mail.json, the server takes it within half a minute
# and writes jobs/results/<request>.json. Nothing here prints an email
# address: the repository is public, and so are its run logs.
set -euo pipefail

for key in DOMAIN CLOUDFLARE_API_TOKEN R2_ACCESS_KEY_ID R2_SECRET_ACCESS_KEY MESSAGE; do
  if [ -z "${!key:-}" ]; then
    echo "::error::$key is not set (see deploy/README.md)."
    exit 1
  fi
done

here=$(cd "$(dirname "$0")" && pwd)
bucket=blockyrts-saves
summary=${GITHUB_STEP_SUMMARY:-/dev/null}
# To the run log and the run's summary page alike: counts and the message, never an address.
say() { tee -a "$summary"; }

if ! [[ $MESSAGE =~ ^[a-z0-9][a-z0-9-]{0,63}$ ]]; then
  echo "::error::The message name is lower-case letters, digits and dashes, such as patch-5-live."
  exit 1
fi
file="$here/../mail/$MESSAGE.txt"
if [ ! -f "$file" ]; then
  echo "::error::deploy/mail/$MESSAGE.txt does not exist."
  exit 1
fi
first=$(head -n 1 "$file")
if [[ $first != "Subject: "* ]] || [ -n "$(sed -n 2p "$file")" ]; then
  echo "::error::deploy/mail/$MESSAGE.txt must start with a 'Subject: ' line and then a blank line."
  exit 1
fi
subject=${first#Subject: }
text=$(tail -n +3 "$file")
dry=true
mode='dry run, nothing sent'
if [ "${SEND:-}" = true ]; then
  dry=false
  mode=send
fi

acct=${CLOUDFLARE_ACCOUNT_ID:-}
if [ -z "$acct" ]; then
  # Not secret; when it was not saved, take it from the zone (as setup does).
  acct=$(curl -fsS "https://api.cloudflare.com/client/v4/zones?name=$DOMAIN" \
    -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" | jq -r '.result[0].account.id // empty')
fi
if [ -z "$acct" ]; then
  echo "::error::Could not find the Cloudflare account of $DOMAIN."
  exit 1
fi
export AWS_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID" AWS_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY" \
  AWS_DEFAULT_REGION=auto AWS_REQUEST_CHECKSUM_CALCULATION=when_required \
  AWS_RESPONSE_CHECKSUM_VALIDATION=when_required
r2() { aws --endpoint-url "https://$acct.r2.cloudflarestorage.com" "$@"; }

# 0: the key is there, 1: it is not, 2: R2 did not say.
exists() {
  local out
  if out=$(r2 s3api head-object --bucket "$bucket" --key "$1" 2>&1); then return 0; fi
  if grep -q -e '(404)' -e 'Not Found' <<<"$out"; then return 1; fi
  echo "R2: $out" >&2
  return 2
}

{
  echo "## Email players: $MESSAGE ($mode)"
  echo
  echo "Subject: **$subject**"
  echo
  echo '```text'
  echo "$text"
  echo '```'
  echo
  echo "{username} becomes each player's username."
  echo
} | say

# The newest nightly backup gives a count even while the live server is one
# that does not take mail jobs yet. Streamed, never written to disk.
latest=$(r2 s3 ls "s3://$bucket/backups/" | awk '{print $4}' | grep -E '^db-[0-9-]+\.sql\.gz$' | sort | tail -n 1 || true)
if [ -n "$latest" ]; then
  # The accounts table's rows sit between its COPY line and a line "\.".
  in_backup=$(r2 s3 cp --quiet "s3://$bucket/backups/$latest" - | gunzip -c |
    awk '/^COPY public\.accounts /{on=1; seen=1; next} on && /^\\\.$/{on=0} on{n++}
      END{if (seen) print n+0; else printf "unknown (no accounts table in it: %d lines)", NR}') ||
    in_backup="unknown (the backup could not be read)"
  size=$(r2 s3api head-object --bucket "$bucket" --key "backups/$latest" --query ContentLength --output text || echo '?')
  echo "- Accounts in the newest nightly backup ($latest, $size bytes, taken at 10:00 UTC): $in_backup" | say
fi

request="run-${GITHUB_RUN_ID:-local}-${GITHUB_RUN_ATTEMPT:-1}"
rc=0
exists jobs/mail.json || rc=$?
if [ "$rc" -ne 1 ]; then
  echo "::error::A mail job is already waiting for the server (jobs/mail.json in the bucket); let it finish first."
  exit 1
fi
job=$(mktemp)
jq -n --arg name "$MESSAGE" --arg request "$request" --argjson dryRun "$dry" \
  --arg subject "$subject" --arg text "$text" \
  '{name: $name, request: $request, dryRun: $dryRun, subject: $subject, text: $text}' >"$job"
r2 s3 cp --quiet "$job" "s3://$bucket/jobs/mail.json"
rm -f "$job"
echo "Job $request is in the bucket; waiting for the server to take it."

# The server looks every 30 seconds.
taken=false
for _ in $(seq 18); do
  sleep 10
  rc=0
  exists jobs/mail.json || rc=$?
  if [ "$rc" -eq 1 ]; then
    taken=true
    break
  fi
done
if [ "$taken" != true ]; then
  r2 s3 rm --quiet "s3://$bucket/jobs/mail.json" || true
  echo "- The live server did not take the job within 3 minutes, so it runs a version from before mail jobs; nothing was sent." | say
  if [ "$dry" = true ]; then
    echo "::warning::The live server does not take mail jobs yet; the count above comes from the nightly backup."
    exit 0
  fi
  echo "::error::The live server does not take mail jobs yet; nothing was sent."
  exit 1
fi

# Sending paces itself at under two emails a second.
result=$(mktemp)
got=false
for _ in $(seq 360); do
  if r2 s3 cp --quiet "s3://$bucket/jobs/results/$request.json" "$result" 2>/dev/null; then
    got=true
    break
  fi
  sleep 10
done
if [ "$got" != true ]; then
  echo "::error::The server took the job but wrote no answer within an hour; its log says why (look for 'mail:')."
  exit 1
fi

jq -r '
  if .refused then "- Refused: \(.refused)"
  else
    "- Accounts on the server: \(.accounts)",
    "- Email service on the server: \(if .emailOn then "on" else "off" end)",
    "- Already had this message: \(.alreadySent)",
    (if .unsure > 0 then "- Unsure (a run stopped while sending to them; never sent again): \(.unsure)" else empty end),
    (if .dryRun then "- Would get it now: \(.toSend)"
     else "- Sent now: \(.sent)", "- Failed: \(.failed) (running this again tries them again)" end),
    (.errors[] | "- Mail service said: \(.)")
  end' "$result" | say

if jq -e '.refused or (.failed // 0) > 0' "$result" >/dev/null; then
  exit 1
fi
