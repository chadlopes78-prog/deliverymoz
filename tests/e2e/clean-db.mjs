// Limpa a base de dados E2E dedicada (nunca a comercial): só corre se a URL contiver "e2e".
import { PrismaClient } from "@prisma/client";
const url = process.env.DATABASE_URL ?? "";
if (!/e2e/i.test(url)) {
  console.error("Recusado: DATABASE_URL não é uma base de dados E2E.");
  process.exit(1);
}
const db = new PrismaClient();
const tables = await db.$queryRaw`SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
if (tables.length) await db.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(", ")} CASCADE`);
await db.$disconnect();
console.log(`Base E2E limpa (${tables.length} tabelas).`);
