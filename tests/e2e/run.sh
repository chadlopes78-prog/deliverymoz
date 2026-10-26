#!/usr/bin/env bash
# Prepara uma base de dados E2E limpa, faz build e corre os testes Playwright.
set -euo pipefail
cd "$(dirname "$0")/../.."
export E2E_DATABASE_URL="${E2E_DATABASE_URL:-postgresql://deliverymoz:deliverymoz@localhost:5432/deliverymoz_e2e}"
if [[ "$E2E_DATABASE_URL" != *e2e* ]]; then echo "E2E_DATABASE_URL tem de apontar para uma base de dados E2E"; exit 1; fi
export DATABASE_URL="$E2E_DATABASE_URL" DIRECT_URL="$E2E_DATABASE_URL"
export SETUP_TOKEN="e2e-setup-token-0123456789" CRON_SECRET="e2e-cron" APP_URL="http://localhost:${E2E_PORT:-3100}"
npx prisma migrate deploy >/dev/null
node tests/e2e/clean-db.mjs
if [[ "${SKIP_BUILD:-0}" != "1" ]]; then npx next build >/dev/null; fi
./node_modules/.bin/next start -p "${E2E_PORT:-3100}" > /tmp/e2e-server.log 2>&1 &
SERVER=$!
trap 'kill $SERVER' EXIT
for i in $(seq 1 60); do curl -sf "http://localhost:${E2E_PORT:-3100}/api/health" >/dev/null && break; sleep 1; done
npx playwright test "$@"
