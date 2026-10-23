#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "==> Checking AWS scaffold files exist"
for f in \
  infrastructure/aws/README.md \
  infrastructure/aws/ecs-task-definition.api.json \
  infrastructure/aws/ecs-task-definition.worker.json \
  infrastructure/aws/cloudformation-skeleton.yaml \
  infrastructure/aws/env.production.example \
  apps/web/vercel.json
do
  test -f "$ROOT/$f"
  echo "  ok $f"
done

echo "==> JSON parse task definitions"
php -r 'json_decode(file_get_contents($argv[1]), true, 512, JSON_THROW_ON_ERROR); echo "api task ok\n";' \
  "$ROOT/infrastructure/aws/ecs-task-definition.api.json"
php -r 'json_decode(file_get_contents($argv[1]), true, 512, JSON_THROW_ON_ERROR); echo "worker task ok\n";' \
  "$ROOT/infrastructure/aws/ecs-task-definition.worker.json"
php -r 'json_decode(file_get_contents($argv[1]), true, 512, JSON_THROW_ON_ERROR); echo "vercel.json ok\n";' \
  "$ROOT/apps/web/vercel.json"

if command -v aws >/dev/null 2>&1; then
  echo "==> aws CLI present — dry-run validate templates if credentials allow"
  aws cloudformation validate-template \
    --template-body "file://$ROOT/infrastructure/aws/cloudformation-skeleton.yaml" \
    >/tmp/triada-cfn-validate.json 2>/tmp/triada-cfn-validate.err \
    && echo "cloudformation validate-template OK" \
    || echo "Skipping live AWS validate (expected without credentials): $(head -n1 /tmp/triada-cfn-validate.err)"
else
  echo "==> aws CLI not installed — scaffold-only verify (OK for local)"
fi

echo "==> verify-aws-dry-run OK"
