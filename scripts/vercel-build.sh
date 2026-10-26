#!/usr/bin/env bash
# Build na Vercel: aceita as variáveis criadas pela integração Neon/Postgres da Vercel.
set -euo pipefail
export DATABASE_URL="${DATABASE_URL:-${POSTGRES_PRISMA_URL:-${POSTGRES_URL:-}}}"
export DIRECT_URL="${DIRECT_URL:-${DATABASE_URL_UNPOOLED:-${POSTGRES_URL_NON_POOLING:-$DATABASE_URL}}}"
if [ -z "$DATABASE_URL" ]; then
  echo "ERRO: não existe base de dados. Ligue um PostgreSQL ao projeto (Vercel → Storage → Neon) ou defina DATABASE_URL." >&2
  exit 1
fi
npx prisma generate
npx prisma migrate deploy
npx next build
