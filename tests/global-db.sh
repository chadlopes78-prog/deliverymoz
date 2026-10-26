#!/usr/bin/env bash
# Aplica as migrações na base de dados de testes antes de correr os testes.
set -euo pipefail
URL="${TEST_DATABASE_URL:-postgresql://deliverymoz:deliverymoz@localhost:5432/deliverymoz_test}"
DATABASE_URL="$URL" DIRECT_URL="$URL" npx prisma migrate deploy >/dev/null
