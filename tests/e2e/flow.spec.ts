import { test, expect, type Browser } from "@playwright/test";
import fs from "node:fs";

/**
 * Fluxo completo com dados sintéticos numa base de dados E2E:
 * proprietário → configuração → restaurante → cardápio → cliente encomenda → restaurante processa → avaliação.
 */
const OWNER = { name: "Proprietário Teste", email: "owner@e2e.test", phone: "841000001", password: "SenhaForte12345" };
const CUSTOMER = { name: "Cliente Teste", email: "cliente@e2e.test", phone: "842000002", password: "Cliente12345" };
const STATE_DIR = "test-results/state";

async function newPage(browser: Browser, state?: string) {
  const ctx = await browser.newContext(state ? { storageState: state } : {});
  return ctx.newPage();
}

test.describe.serial("fluxo completo", () => {
  test("estado inicial vazio e elegante", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("Ainda não existem restaurantes disponíveis nesta região.")).toBeVisible();
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/entrar\?next=%2Fadmin/);
  });

  test("criação segura da conta do proprietário", async ({ page }) => {
    await page.goto("/configuracao");
    await page.getByLabel("Código de configuração").fill("errado-errado-errado");
    await page.getByLabel("Nome").fill(OWNER.name);
    await page.getByLabel("E-mail").fill(OWNER.email);
    await page.getByLabel("Telefone").fill(OWNER.phone);
    await page.getByLabel("Palavra-passe").fill(OWNER.password);
    await page.getByRole("button", { name: "Criar conta do proprietário" }).click();
    await expect(page.getByText("Código de configuração inválido.")).toBeVisible();
    await page.getByLabel("Código de configuração").fill("e2e-setup-token-0123456789");
    await page.getByRole("button", { name: "Criar conta do proprietário" }).click();
    await page.waitForURL("**/admin/configuracoes/inicial");
    await expect(page.getByRole("heading", { name: "Configuração inicial" })).toBeVisible();
    fs.mkdirSync(STATE_DIR, { recursive: true });
    await page.context().storageState({ path: `${STATE_DIR}/owner.json` });
    // A página de configuração deixa de estar disponível
    await page.goto("/configuracao");
    await expect(page).toHaveURL(/\/admin\/configuracoes\/inicial/);
  });

  test("admin configura região, pagamentos e cria restaurante", async ({ browser }) => {
    const page = await newPage(browser, `${STATE_DIR}/owner.json`);
    await page.goto("/admin/configuracoes?tab=localizacoes");
    await page.getByLabel("Cidade").fill("Cidade E2E");
    await page.getByLabel("Bairros").fill("Bairro Um, Bairro Dois");
    await page.getByRole("button", { name: "Adicionar", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Cidade E2E" })).toBeVisible();

    await page.goto("/admin/configuracoes?tab=pagamentos");
    const mpesa = page.locator("div", { has: page.getByRole("heading", { name: "M-Pesa" }) }).last();
    await expect(page.getByText("Em falta: MPESA_API_KEY").first()).toBeVisible();
    const cash = page.locator("form", { has: page.locator('input[name="key"][value="CASH_ON_DELIVERY"]') });
    await cash.getByLabel("Ativar este método").check();
    await cash.getByRole("button", { name: "Guardar" }).click();
    await expect(page.getByText("Método de pagamento atualizado.")).toBeVisible();
    void mpesa;

    await page.goto("/admin/restaurantes/novo");
    await page.getByLabel("Nome comercial").fill("Sabores E2E");
    await page.getByLabel("Nome do responsável").fill("Resp E2E");
    await page.getByLabel("Telefone", { exact: true }).fill("843000003");
    await page.getByLabel("E-mail", { exact: true }).fill("restaurante@e2e.test");
    await page.getByLabel("Endereço").fill("Av. E2E 100");
    await page.getByLabel("Conta do proprietário").selectOption("existing");
    await page.getByLabel("E-mail do proprietário").fill(OWNER.email);
    await page.getByRole("button", { name: "Criar restaurante" }).click();
    await page.waitForURL(/\/admin\/restaurantes\/.+criado=1/);
    await expect(page.getByText("Restaurante criado.")).toBeVisible();
    await expect(page.getByText("Em falta").first()).toBeVisible();
  });

  test("restaurante configura cardápio, horário e zonas", async ({ browser }) => {
    const page = await newPage(browser, `${STATE_DIR}/owner.json`);
    await page.goto("/parceiro");
    await expect(page.getByText("Complete a configuração da loja")).toBeVisible();

    await page.goto("/parceiro/categorias");
    await page.getByLabel("Nome").first().fill("Pratos principais");
    await page.getByRole("button", { name: "Criar" }).click();
    await expect(page.getByText("1. Pratos principais")).toBeVisible();

    await page.goto("/parceiro/cardapio/novo");
    await page.getByLabel("Nome do produto").fill("Prato E2E");
    await page.getByLabel("Descrição").fill("Prato de teste automatizado");
    await page.getByLabel(/Preço/).fill("350,00");
    await page.getByLabel("Categoria").selectOption({ label: "Pratos principais" });
    await page.getByRole("button", { name: "Adicionar grupo" }).click();
    await page.getByLabel("Nome do grupo").fill("Tamanho");
    await page.getByLabel("Mínimo").fill("1");
    await page.getByLabel("Nome da opção").fill("Normal");
    await page.getByRole("button", { name: "Criar produto" }).click();
    await page.waitForURL(/guardado=/);
    await expect(page.getByText("Prato E2E")).toBeVisible();

    await page.goto("/parceiro/horarios");
    for (const day of ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"]) {
      const box = page.locator("form > div").filter({ has: page.getByText(day, { exact: true }) });
      await box.getByRole("button", { name: "Turno" }).click();
      await box.getByLabel(`${day} abre`).fill("00:00");
      await box.getByLabel(`${day} fecha`).fill("23:59");
    }
    await page.getByRole("button", { name: "Guardar horário" }).click();
    await expect(page.getByText("Horário guardado.")).toBeVisible();

    await page.goto("/parceiro/entregas");
    await page.getByLabel("Bairro").selectOption({ label: "Bairro Um" });
    await page.getByLabel(/Taxa de entrega/).fill("50");
    await page.getByRole("button", { name: "Adicionar" }).click();
    await expect(page.getByText("Zona de entrega guardada.")).toBeVisible();

    await page.goto("/parceiro");
    await expect(page.getByText("Complete a configuração da loja")).toHaveCount(0);
  });

  test("cliente regista-se, encomenda e acompanha", async ({ browser }) => {
    const page = await newPage(browser);
    await page.goto("/");
    await expect(page.getByText("Sabores E2E").first()).toBeVisible();
    await page.getByText("Sabores E2E").first().click();
    await page.getByRole("button", { name: /Prato E2E/ }).first().click();
    await page.getByRole("button", { name: /Adicionar ·/ }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);

    await page.goto("/sacola");
    await expect(page.getByText("Prato E2E")).toBeVisible();
    await page.getByRole("link", { name: "Continuar" }).click();
    await page.waitForURL(/\/entrar/);
    await page.getByRole("link", { name: "Criar conta" }).click();
    await page.getByLabel("Nome completo").fill(CUSTOMER.name);
    await page.getByLabel("E-mail").fill(CUSTOMER.email);
    await page.getByLabel("Telefone").fill(CUSTOMER.phone);
    await page.getByLabel("Palavra-passe").fill(CUSTOMER.password);
    await page.getByLabel(/Li e aceito/).check();
    await page.getByRole("button", { name: "Criar conta" }).click();
    await page.waitForURL("**/checkout");

    await page.getByLabel("Bairro").selectOption({ label: "Bairro Um" });
    await page.getByLabel("Rua / avenida e número").fill("Rua do Cliente 5");
    await page.getByLabel("Ponto de referência").fill("Portão azul");
    await expect(page.getByText("Numerário na entrega").or(page.getByText("Pagamento na entrega (numerário)"))).toBeVisible();
    // Total calculado: 350 + 50 de entrega
    await expect(page.getByText(/400,00/).first()).toBeVisible();
    await page.getByRole("button", { name: "Fazer pedido" }).dblclick();
    await page.waitForURL(/\/acompanhar\/.+novo=1/);
    await expect(page.getByText("Pedido enviado com sucesso!")).toBeVisible();
    const code = page.url().split("/acompanhar/")[1].split("?")[0];
    fs.writeFileSync(`${STATE_DIR}/order.txt`, code);
    await page.context().storageState({ path: `${STATE_DIR}/customer.json` });
    await page.goto("/minha-conta/pedidos");
    await expect(page.getByText(`#${code}`)).toHaveCount(1);
  });

  test("restaurante processa o pedido e cliente avalia", async ({ browser }) => {
    const code = fs.readFileSync(`${STATE_DIR}/order.txt`, "utf8");
    const page = await newPage(browser, `${STATE_DIR}/owner.json`);
    await page.goto("/parceiro/pedidos");
    const card = page.locator("li", { hasText: `#${code}` });
    await expect(card).toBeVisible();
    await card.getByRole("button", { name: "Aceitar" }).click();
    await expect(card.getByRole("button", { name: "Iniciar preparação" })).toBeVisible();
    await card.getByRole("button", { name: "Iniciar preparação" }).click();
    await card.getByRole("button", { name: "Marcar pronto" }).click();
    await card.getByRole("button", { name: "Saiu para entrega" }).click();
    await card.getByLabel(/Recebi/).check();
    await card.getByRole("button", { name: "Entregue" }).click();
    await expect(page.locator("li", { hasText: `#${code}` })).toHaveCount(0);

    const customer = await newPage(browser, `${STATE_DIR}/customer.json`);
    await customer.goto(`/acompanhar/${code}`);
    await expect(customer.getByRole("heading", { name: "Entregue" })).toBeVisible();
    await customer.locator("label", { hasText: /^5 estrelas$/ }).click();
    await customer.getByRole("button", { name: "Enviar avaliação" }).click();
    await expect(customer.getByText("Obrigado pela sua avaliação!").or(customer.getByText(/Avaliou este pedido/))).toBeVisible();

    // Isolamento: outro cliente não vê este pedido
    const other = await newPage(browser);
    await other.goto("/registar");
    await other.getByLabel("Nome completo").fill("Outro Cliente");
    await other.getByLabel("E-mail").fill("outro@e2e.test");
    await other.getByLabel("Telefone").fill("845000005");
    await other.getByLabel("Palavra-passe").fill("Outro12345");
    await other.getByLabel(/Li e aceito/).check();
    await other.getByRole("button", { name: "Criar conta" }).click();
    await other.waitForURL((u) => u.pathname === "/");
    const res = await other.goto(`/acompanhar/${code}`);
    expect(res?.status()).toBe(404);
    const adminRes = await other.goto("/admin");
    expect(adminRes?.status()).toBe(404);
    await other.context().storageState({ path: `${STATE_DIR}/other.json` });
  });

  test("dashboards refletem dados reais", async ({ browser }) => {
    const page = await newPage(browser, `${STATE_DIR}/owner.json`);
    await page.goto("/admin");
    await expect(page.getByText("Concluídos").locator("..").locator("..")).toContainText("1");
    await page.goto("/admin/financeiro?tab=liquidacoes");
    await expect(page.getByText("Sabores E2E").first()).toBeVisible();
    const res = await page.request.get("/api/export/orders?periodo=30d");
    expect(res.status()).toBe(200);
    expect(await res.text()).toContain("Sabores E2E");
  });
});
