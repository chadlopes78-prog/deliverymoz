import { defineConfig, devices } from "@playwright/test";

/**
 * Testes E2E: correm contra um servidor ligado a uma base de dados própria (E2E_DATABASE_URL),
 * nunca contra a base de dados comercial.
 */
const port = Number(process.env.E2E_PORT ?? 3100);
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 90_000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: { baseURL: `http://localhost:${port}`, trace: "retain-on-failure", locale: "pt-PT", timezoneId: "Africa/Maputo" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
