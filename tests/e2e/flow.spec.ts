import { test, expect, type Browser } from "@playwright/test";
import fs from "node:fs";
import sharp from "sharp";

/**
 * Fluxo completo com dados sintéticos numa base de dados E2E:
 * proprietário → login administrativo → restaurante e produtos pelo admin → cliente encomenda → restaurante processa → avaliação.
 */
const OWNER = { name: "Proprietário Teste", email: "owner@e2e.test", phone: "841000001", password: "SenhaForte12345" };
const CUSTOMER = { name: "Cliente Teste", email: "cliente@e2e.test", phone: "842000002", password: "Cliente12345" };
const STATE_DIR = "test-results/state";

/** Imagem PNG gerada no momento (dados sintéticos de teste). */
function testImage(color: string) {
  return sharp({ create: { width: 64, height: 64, channels: 3, background: color } }).png().toBuffer();
}

async function newPage(browser: Browser, state?: string) {
  const ctx = await browser.newContext(state ? { storageState: state } : {});
  const page = await ctx.newPage();
  // Aceita as confirmações (window.confirm) das ações destrutivas
  page.on("dialog", (d) => void d.accept());
  return page;
}

test.describe.serial("fluxo completo", () => {
  test("estado inicial vazio e elegante", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("Ainda não existem restaurantes disponíveis nesta região.")).toBeVisible();
    // O admin tem login próprio, fora do site público (sem seletor de localização)
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/admin\/login\?next=%2Fadmin/);
    await expect(page.getByRole("heading", { name: "Criar a conta do proprietário" })).toBeVisible();
    await expect(page.getByText("Escolher localização")).toHaveCount(0);
    await page.goto("/admin/produtos");
    await expect(page).toHaveURL(/\/admin\/login\?next=%2Fadmin%2Fprodutos/);
  });

  test("criação segura da conta do proprietário e login administrativo", async ({ page }) => {
    await page.goto("/configuracao");
    await expect(page).toHaveURL(/\/admin\/login/);
    await page.getByLabel("Código de configuração").fill("errado-errado-errado");
    await page.getByLabel("Nome").fill(OWNER.name);
    await page.getByLabel("E-mail").fill(OWNER.email);
    await page.getByLabel("Telefone").fill(OWNER.phone);
    await page.getByLabel("Palavra-passe").fill(OWNER.password);
    await page.getByRole("button", { name: "Criar conta e entrar no painel" }).click();
    await expect(page.getByText("Código de configuração inválido.")).toBeVisible();
    await page.getByLabel("Código de configuração").fill("e2e-setup-token-0123456789");
    await page.getByRole("button", { name: "Criar conta e entrar no painel" }).click();
    await page.waitForURL((u) => u.pathname === "/admin");
    await expect(page.getByRole("heading", { name: "Visão geral" })).toBeVisible();
    // Menu agrupado
    for (const section of ["Gestão comercial", "Operações", "Financeiro", "Marketing", "Administração", "Suporte"]) {
      await expect(page.getByText(section, { exact: true }).first()).toBeAttached();
    }
    // Terminar sessão e voltar a entrar pelo login administrativo
    await page.getByRole("button", { name: "Terminar sessão" }).first().click();
    await page.waitForURL("**/admin/login");
    await expect(page.getByRole("heading", { name: "Painel administrativo" })).toBeVisible();
    await page.getByLabel("E-mail").fill(OWNER.email);
    await page.getByLabel("Palavra-passe").fill("palavra-errada-123");
    await page.getByRole("button", { name: "Entrar no painel" }).click();
    await expect(page.getByText(/incorretos|inválid/i).first()).toBeVisible();
    await page.getByLabel("Palavra-passe").fill(OWNER.password);
    await page.getByRole("button", { name: "Entrar no painel" }).click();
    await page.waitForURL((u) => u.pathname === "/admin");
    await expect(page.getByRole("heading", { name: "Visão geral" })).toBeVisible();
    fs.mkdirSync(STATE_DIR, { recursive: true });
    await page.context().storageState({ path: `${STATE_DIR}/owner.json` });
    // Com sessão, o login administrativo leva diretamente ao painel
    await page.goto("/admin/login");
    await expect(page).toHaveURL(/\/admin$/);
  });

  test("admin configura região e pagamentos, cria e edita restaurante", async ({ browser }) => {
    const page = await newPage(browser, `${STATE_DIR}/owner.json`);
    await page.goto("/admin/configuracoes?tab=localizacoes");
    await page.getByLabel("Cidade").fill("Cidade E2E");
    await page.getByLabel("Bairros").fill("Bairro Um, Bairro Dois");
    await page.getByRole("button", { name: "Adicionar", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Cidade E2E" })).toBeVisible();

    await page.goto("/admin/configuracoes?tab=pagamentos");
    await expect(page.getByText("Em falta: MPESA_API_KEY").first()).toBeVisible();
    const cash = page.locator("form", { has: page.locator('input[name="key"][value="CASH_ON_DELIVERY"]') });
    await cash.getByLabel("Ativar este método").check();
    await cash.getByRole("button", { name: "Guardar" }).click();
    await expect(page.getByText("Método de pagamento atualizado.")).toBeVisible();

    // Estados vazios reais (sem dados de exemplo)
    await page.goto("/admin/produtos");
    await expect(page.getByText("Ainda não adicionaste produtos. Clica em Adicionar produto para começar.")).toBeVisible();
    await page.goto("/admin/restaurantes");
    await expect(page.getByRole("heading", { name: "Gestão de restaurantes" })).toBeVisible();
    await expect(page.getByText("Ainda não existem restaurantes")).toBeVisible();

    await page.getByRole("link", { name: "Adicionar restaurante" }).first().click();
    await page.waitForURL("**/admin/restaurantes/novo");
    await page.getByRole("button", { name: "Criar restaurante" }).click();
    // Validação no navegador e no servidor: nada é criado sem os campos obrigatórios
    await expect(page).toHaveURL(/\/admin\/restaurantes\/novo/);
    await page.getByLabel("Nome comercial").fill("Sabores E2E");
    await page.getByLabel("Nome do responsável").fill("Resp E2E");
    await page.getByLabel("Telefone", { exact: true }).fill("843000003");
    await page.getByLabel("E-mail", { exact: true }).fill("restaurante@e2e.test");
    await page.getByLabel("Descrição").fill("Restaurante de teste automatizado");
    await page.getByLabel("Bairro (opcional)").selectOption({ label: "Bairro Um" });
    await page.getByLabel("Endereço").fill("Av. E2E 100");
    await page.getByLabel("Latitude (opcional)").fill("-25.9692");
    await page.getByLabel("Longitude (opcional)").fill("32.5732");
    await page.getByLabel(/Logótipo/).setInputFiles({ name: "logo.png", mimeType: "image/png", buffer: await testImage("#e11d48") });
    // Horário e estado definidos logo na criação
    for (const day of ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"]) {
      const box = page.locator("div.rounded-2xl").filter({ has: page.getByText(day, { exact: true }) });
      await box.getByRole("button", { name: "Turno" }).click();
      await box.getByLabel(`${day} abre`).fill("00:00");
      await box.getByLabel(`${day} fecha`).fill("23:59");
    }
    await expect(page.getByLabel("Estado do restaurante")).toHaveValue("ACTIVE");
    await page.getByLabel("Conta do proprietário").selectOption("existing");
    await page.getByLabel("E-mail do proprietário").fill(OWNER.email);
    await page.getByRole("button", { name: "Criar restaurante" }).click();
    await page.waitForURL(/\/admin\/restaurantes\/.+criado=1/);
    await expect(page.getByText("Restaurante criado.")).toBeVisible();
    await expect(page.getByText("Em falta").first()).toBeVisible();
    const restaurantUrl = page.url().split("?")[0];
    fs.writeFileSync(`${STATE_DIR}/restaurant.txt`, restaurantUrl.split("/admin/restaurantes/")[1]);

    // A lista mostra o registo gravado na base de dados
    await page.goto("/admin/restaurantes");
    const row = page.locator("tr", { hasText: "Sabores E2E" });
    await expect(row).toContainText("Resp E2E");
    await expect(row).toContainText("Cidade E2E");
    await expect(row).toContainText("Bairro Um");
    await expect(row).toContainText("Ativo");
    await row.getByRole("button", { name: "Pausar" }).click();
    await expect(row).toContainText("Pausado");
    await row.getByRole("button", { name: "Ativar" }).click();
    await expect(row).toContainText("Ativo");
    await page.goto("/admin/restaurantes?estado=PAUSADO");
    await expect(page.getByText("Nenhum restaurante encontrado")).toBeVisible();

    // Edição: dados, horário e zonas de entrega a partir do admin
    await page.goto(`${restaurantUrl}/editar`);
    await page.getByLabel("Descrição").fill("Pratos caseiros (editado)");
    await page.getByLabel(/^Capa/).setInputFiles({ name: "capa.png", mimeType: "image/png", buffer: await testImage("#0ea5e9") });
    await page.getByRole("button", { name: "Guardar restaurante" }).click();
    await expect(page.getByText("Restaurante guardado.")).toBeVisible();
    // O horário definido na criação ficou gravado
    await expect(page.getByLabel("Segunda abre")).toHaveValue("00:00");
    await expect(page.getByLabel("Sábado fecha")).toHaveValue("23:59");
    await page.getByLabel("Bairro", { exact: true }).selectOption({ label: "Bairro Um" });
    await page.getByLabel(/Taxa de entrega/).fill("50");
    await page.getByRole("button", { name: "Adicionar zona" }).click();
    await expect(page.getByText("Zona de entrega guardada.")).toBeVisible();
    await page.reload();
    await expect(page.getByLabel("Descrição")).toHaveValue("Pratos caseiros (editado)");
    await expect(page.getByText("Bairro Um").last()).toBeVisible();
  });

  test("admin gere categorias e produtos com fotografia", async ({ browser }) => {
    const page = await newPage(browser, `${STATE_DIR}/owner.json`);
    await page.goto("/admin/categorias");
    await page.getByLabel("Nome da categoria").fill("Pratos principais");
    await page.getByRole("button", { name: "Criar categoria" }).click();
    await expect(page.getByText("1. Pratos principais")).toBeVisible();

    await page.goto("/admin/produtos");
    await page.getByRole("link", { name: "Adicionar produto" }).first().click();
    await page.waitForURL("**/admin/produtos/novo**");
    await page.getByLabel("Restaurante").selectOption({ label: "Sabores E2E" });
    await page.getByLabel("Nome do produto").fill("Prato E2E");
    await page.getByLabel("Descrição").fill("Prato de teste automatizado");
    await page.getByLabel("Preço (MZN)").fill("340,00");
    await page.getByLabel("Categoria").selectOption({ label: "Pratos principais" });
    await page.getByLabel(/Tempo de preparação/).fill("20");
    await page.getByLabel(/Fotografia/).setInputFiles({ name: "prato.png", mimeType: "image/png", buffer: await testImage("#16a34a") });
    await page.getByRole("button", { name: "Adicionar grupo" }).click();
    await page.getByLabel("Nome do grupo").fill("Tamanho");
    await page.getByLabel("Mínimo").fill("1");
    await page.getByLabel("Nome da opção").fill("Normal");
    await page.getByRole("button", { name: "Criar produto" }).click();
    await page.waitForURL(/\/admin\/produtos\?guardado=/);
    await expect(page.getByText("Produto criado com sucesso.")).toBeVisible();
    const row = page.locator("tr", { hasText: "Prato E2E" });
    await expect(row).toContainText("Sabores E2E");
    await expect(row).toContainText("Pratos principais");
    // A fotografia foi enviada e é servida pelo servidor
    const src = await row.locator("img").getAttribute("src");
    expect((await page.request.get(src!)).status()).toBe(200);

    // Alterar preço, desativar e reativar
    await row.getByLabel("Preço de Prato E2E").fill("350,00");
    await row.getByRole("button", { name: "OK" }).click();
    await expect(page.getByText("Preço atualizado.")).toBeVisible();
    await row.getByRole("button", { name: "Desativar" }).click();
    await expect(row).toContainText("Indisponível");
    await row.getByRole("button", { name: "Ativar" }).click();
    await expect(row).toContainText("Disponível");

    // Editar e confirmar persistência depois de recarregar
    await row.getByRole("link", { name: "Editar" }).click();
    await page.getByLabel("Descrição").fill("Prato de teste (editado)");
    await page.getByRole("button", { name: "Guardar alterações" }).click();
    await expect(page.getByText("Produto guardado.")).toBeVisible();
    await page.reload();
    await expect(page.getByLabel("Descrição")).toHaveValue("Prato de teste (editado)");
    await expect(page.getByLabel("Preço (MZN)")).toHaveValue(/^350[.,]00$/);
    await expect(page.getByLabel(/Tempo de preparação/)).toHaveValue("20");

    // Filtros
    await page.goto("/admin/produtos?disponibilidade=PAUSED");
    await expect(page.getByText("Nenhum produto encontrado")).toBeVisible();

    // O restaurante fica pronto e o proprietário vê o produto no seu painel
    await page.goto("/parceiro");
    await expect(page.getByText("Complete a configuração da loja")).toHaveCount(0);
    await page.goto("/parceiro/cardapio");
    await expect(page.getByText("Prato E2E")).toBeVisible();
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
    // Cliente autenticado não entra no admin, nem em páginas internas
    await other.goto("/admin");
    await expect(other).toHaveURL(/\/admin\/sem-acesso/);
    await expect(other.getByRole("heading", { name: "Acesso recusado" })).toBeVisible();
    await other.goto("/admin/produtos/novo");
    await expect(other).toHaveURL(/\/admin\/sem-acesso/);
    await other.goto("/admin/login");
    await expect(other.getByText("não tem permissões administrativas")).toBeVisible();
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
