#!/usr/bin/env bash
# Checks reachability of KSeF environments (test and production).
# Usage:
#   ./scripts/check-ksef.sh           # checks both environments
#   ./scripts/check-ksef.sh test       # checks test only
#   ./scripts/check-ksef.sh production # checks production only

set -uo pipefail

KSEF_TEST_HOST="api-test.ksef.mf.gov.pl"
KSEF_PROD_HOST="api.ksef.mf.gov.pl"
CHALLENGE_PATH="/api/v2/auth/challenge"
# Dummy NIP — we only care whether the server responds at all.
# A 200 with a challenge JSON means KSeF is up and reachable.
CHALLENGE_BODY='{"contextIdentifier":{"type":"onip","identifier":"0000000000"}}'
TIMEOUT=10
RESPONSE_FILE="/tmp/ksef_probe_response.json"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
RESET='\033[0m'

check_environment() {
  local label="$1"
  local host="$2"
  local url="https://${host}${CHALLENGE_PATH}"

  echo -e "${CYAN}${BOLD}── ${label} (${host}) ──${RESET}"

  # 1. DNS resolution
  printf "  DNS resolution ... "
  resolved=$(dig +short "$host" 2>/dev/null | grep -E '^[0-9]+\.' | head -1)
  if [[ -n "$resolved" ]]; then
    echo -e "${GREEN}OK${RESET} (${resolved})"
  else
    echo -e "${RED}FAILED${RESET} — cannot resolve ${host}"
    echo -e "  ${RED}Result: KSeF ${label} is UNREACHABLE (DNS failure)${RESET}"
    echo
    return
  fi

  # 2. TCP handshake on port 443
  printf "  TCP/TLS (port 443) ... "
  if nc -z -w "$TIMEOUT" "$host" 443 2>/dev/null; then
    echo -e "${GREEN}OK${RESET}"
  else
    echo -e "${RED}FAILED${RESET} — port 443 unreachable"
    echo -e "  ${RED}Result: KSeF ${label} is UNREACHABLE (TCP failure)${RESET}"
    echo
    return
  fi

  # 3. HTTP probe — any HTTP response (even 400/403/500) means the service is up.
  #    A connection error or empty reply means it is down.
  printf "  HTTP probe (AuthorisationChallenge) ... "

  http_status=$(curl \
    --silent \
    --max-time "$TIMEOUT" \
    --http1.1 \
    --write-out "%{http_code}" \
    --output "$RESPONSE_FILE" \
    -X POST "$url" \
    -H "Content-Type: application/json" \
    -d "$CHALLENGE_BODY" \
    2>/dev/null) || true

  body=$(cat "$RESPONSE_FILE" 2>/dev/null || echo "")
  rm -f "$RESPONSE_FILE"

  if [[ -z "$http_status" || "$http_status" == "000" ]]; then
    echo -e "${RED}NO RESPONSE${RESET}"
    echo -e "  ${RED}Result: KSeF ${label} is DOWN or blocking requests (WAF/empty reply)${RESET}"
  elif echo "$body" | grep -qi '<html'; then
    # WAF or CDN returned an HTML page instead of a JSON API response
    echo -e "${YELLOW}HTTP ${http_status} (HTML — WAF/CDN intercept)${RESET}"
    echo -e "  ${YELLOW}Result: KSeF ${label} endpoint is blocked or redirected by WAF${RESET}"
    title=$(echo "$body" | grep -oi '<title>[^<]*</title>' | sed 's/<[^>]*>//g' | head -1)
    [[ -n "$title" ]] && echo -e "  Page title: ${title}"
  elif [[ "$http_status" =~ ^[2345] ]]; then
    echo -e "${GREEN}HTTP ${http_status}${RESET}"
    if echo "$body" | grep -qiE '"exception|"timestamp|"challenge|"code'; then
      echo -e "  ${GREEN}Result: KSeF ${label} is UP${RESET} (challenge endpoint responded with JSON)"
    else
      echo -e "  ${GREEN}Result: KSeF ${label} is UP${RESET} (HTTP ${http_status})"
    fi
    [[ -n "$body" ]] && echo -e "  Response: $(echo "$body" | head -c 200)"
  else
    echo -e "${YELLOW}HTTP ${http_status}${RESET}"
    echo -e "  ${YELLOW}Result: KSeF ${label} returned unexpected status ${http_status}${RESET}"
  fi

  echo
}

filter="${1:-both}"

echo
echo -e "${BOLD}KSeF availability check${RESET}"
echo -e "$(date '+%Y-%m-%d %H:%M:%S %Z')"
echo

if [[ "$filter" == "both" || "$filter" == "test" ]]; then
  check_environment "TEST" "$KSEF_TEST_HOST"
fi

if [[ "$filter" == "both" || "$filter" == "production" ]]; then
  check_environment "PRODUCTION" "$KSEF_PROD_HOST"
fi
