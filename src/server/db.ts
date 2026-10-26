import { PrismaClient } from "@prisma/client";

// Compatibilidade com as variáveis da integração Neon/Postgres da Vercel.
process.env.DATABASE_URL ||= process.env.POSTGRES_PRISMA_URL || process.env.POSTGRES_URL || "";
process.env.DIRECT_URL ||= process.env.DATABASE_URL_UNPOOLED || process.env.POSTGRES_URL_NON_POOLING || process.env.DATABASE_URL;

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : process.env.NODE_ENV === "test" ? [] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;

export type Tx = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends"
>;
