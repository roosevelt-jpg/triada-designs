#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "==> Frontend build dry-run"
cd "$ROOT/apps/web"
npm run lint
npm run build

echo "==> API test suite"
cd "$ROOT/apps/api"
php artisan test

echo "==> AWS/Vercel scaffold verify"
"$ROOT/scripts/verify-aws-dry-run.sh"

echo "==> deploy-dry-run OK (no cloud accounts required)"
