#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "==> API health"
curl -fsS "http://127.0.0.1:8088/api/health" | tee /tmp/triada-health.json
echo

echo "==> Web login page"
code=$(curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:43127/login")
test "$code" = "200"
echo "login HTTP $code"

echo "==> Auth + meta status + shopify status + agents llm"
TOKEN=$(curl -fsS -X POST "http://127.0.0.1:8088/api/v1/auth/login" \
  -H 'Content-Type: application/json' -H 'Accept: application/json' \
  -d '{"email":"info@triada-designs.com","password":"triada-local","device_name":"verify"}' \
  | php -r 'echo json_decode(stream_get_contents(STDIN))->token;')

auth() { curl -fsS -H "Authorization: Bearer $TOKEN" -H 'Accept: application/json' "$@"; }

auth "http://127.0.0.1:8088/api/v1/integrations/meta/status" >/tmp/triada-meta.json
auth "http://127.0.0.1:8088/api/v1/integrations/shopify/status" >/tmp/triada-shopify.json
auth "http://127.0.0.1:8088/api/v1/agents/llm/status" >/tmp/triada-llm.json
auth "http://127.0.0.1:8088/api/v1/integrations/channels/status" >/tmp/triada-channels.json

php -r '
$m=json_decode(file_get_contents("/tmp/triada-meta.json"), true);
$s=json_decode(file_get_contents("/tmp/triada-shopify.json"), true);
$l=json_decode(file_get_contents("/tmp/triada-llm.json"), true);
foreach (["facebook","instagram","whatsapp"] as $c) {
  $st=$m["channels"][$c]["status"] ?? "";
  if ($st === "healthy") { fwrite(STDERR, "Meta $c unexpectedly healthy without live proof\n"); exit(1); }
}
if (($s["status"] ?? "") === "healthy") { fwrite(STDERR, "Shopify unexpectedly healthy\n"); exit(1); }
if (!empty($l["live"])) { fwrite(STDERR, "LLM unexpectedly live without key\n"); exit(1); }
echo "honesty checks passed\n";
'

echo "==> verify-local OK"
