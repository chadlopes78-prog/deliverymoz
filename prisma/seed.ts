/**
 * Seed técnico opcional. NÃO cria restaurantes, produtos, clientes, pedidos nem estatísticas.
 * Cria apenas: definições por omissão, categorias de cozinha vazias e registos de configuração
 * dos métodos de pagamento (todos desativados). É idempotente.
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
const CUISINES: [string, string][] = [
  ["Moçambicana", "🇲🇿"], ["Mariscos", "🦐"], ["Frango", "🍗"], ["Lanches", "🍔"], ["Pizza", "🍕"], ["Grelhados", "🥩"],
  ["Pastelaria e padaria", "🥐"], ["Doces e sobremesas", "🍰"], ["Saudável", "🥗"], ["Asiática", "🍜"], ["Indiana", "🍛"],
  ["Portuguesa", "🍷"], ["Bebidas", "🥤"], ["Pequeno-almoço", "☕"],
];
const slug = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

async function main() {
  await db.platformSettings.upsert({ where: { id: 1 }, create: { id: 1 }, update: {} });
  for (const [i, [name, emoji]] of CUISINES.entries()) {
    await db.cuisineCategory.upsert({ where: { slug: slug(name) }, create: { name, slug: slug(name), emoji, position: i }, update: {} });
  }
  const providers = [["MPESA", "M-Pesa"], ["EMOLA", "e-Mola"], ["CARD", "Cartão bancário"], ["CASH_ON_DELIVERY", "Pagamento na entrega (numerário)"]] as const;
  for (const [key, displayName] of providers) {
    await db.paymentProviderConfig.upsert({ where: { key }, create: { key, displayName, enabled: false }, update: {} });
  }
  console.log("Seed técnico aplicado (sem dados comerciais).");
}
main().finally(() => db.$disconnect());
