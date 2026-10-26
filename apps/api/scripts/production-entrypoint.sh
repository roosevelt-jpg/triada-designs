#!/usr/bin/env bash
set -euo pipefail

cd /var/www/html

mkdir -p storage/framework/{cache,sessions,views} storage/logs database
if [[ ! -f database/database.sqlite ]]; then
  touch database/database.sqlite
fi
chmod -R ug+rwx storage bootstrap/cache database || true

if [[ -z "${APP_KEY:-}" ]]; then
  echo "APP_KEY is required for production API boot" >&2
  exit 1
fi

php artisan config:clear || true
php artisan migrate --force --no-interaction
php artisan db:seed --force --no-interaction

exec "$@"
