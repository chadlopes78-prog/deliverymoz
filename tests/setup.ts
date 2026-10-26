import "@/server/zod-config";
// Testes usam exclusivamente a base de dados de testes (TEST_DATABASE_URL). Nunca a base de produção.
const url = process.env.TEST_DATABASE_URL ?? "postgresql://deliverymoz:deliverymoz@localhost:5432/deliverymoz_test";
if (!/test/i.test(url)) throw new Error("TEST_DATABASE_URL tem de apontar para uma base de dados de testes.");
process.env.DATABASE_URL = url;
process.env.DIRECT_URL = url;
process.env.DISABLE_RATE_LIMIT = process.env.DISABLE_RATE_LIMIT ?? "1";
process.env.TEST_WEBHOOK_SECRET = "test-webhook-secret";
process.env.SETUP_TOKEN = "test-setup-token-0123456789";
delete process.env.RESEND_API_KEY;
delete process.env.MPESA_API_KEY;
