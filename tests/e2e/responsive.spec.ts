import { test, expect } from "@playwright/test";
import fs from "node:fs";

/**
 * Verifica que não há scroll horizontal indevido nem elementos fora do ecrã
 * em telemóveis pequenos/grandes, tablets e computadores. Corre depois do fluxo completo.
 */
const VIEWPORTS = [
  { name: "android-pequeno", width: 320, height: 568 },
  { name: "android-grande", width: 412, height: 915 },
  { name: "iphone-se", width: 375, height: 667 },
  { name: "iphone-pro-max", width: 430, height: 932 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "portatil", width: 1366, height: 768 },
  { name: "monitor", width: 1920, height: 1080 },
];

const STATE_DIR = "test-results/state";
const shotsDir = "test-results/screens";

const PUBLIC = ["/", "/restaurantes", "/entrar", "/registar", "/ajuda", "/termos", "/parceiro/registo", "/entregador/registo", "/sacola", "/admin/login", "/entrar/comprador", "/entrar/parceiro"];
const CUSTOMER = ["/minha-conta", "/minha-conta/pedidos", "/minha-conta/enderecos", "/minha-conta/seguranca"];
const OWNER = ["/admin", "/admin/compradores", "/admin/parceiros", "/admin/utilizadores", "/admin/atividade", "/admin/administradores", "/admin/pedidos", "/admin/restaurantes", "/admin/restaurantes/novo", "/admin/produtos", "/admin/produtos/novo", "/admin/categorias", "/admin/aprovacoes", "/admin/vendas", "/admin/transacoes", "/admin/banners", "/admin/reclamacoes", "/admin/financeiro", "/admin/configuracoes?tab=pagamentos", "/admin/cupons", "/parceiro", "/parceiro/pedidos?tab=historico", "/parceiro/cardapio", "/parceiro/horarios", "/parceiro/loja"];

/** Ficha e edição do restaurante criado no fluxo completo. */
function restaurantPages() {
  const f = `${STATE_DIR}/restaurant.txt`;
  if (!fs.existsSync(f)) return [];
  const id = fs.readFileSync(f, "utf8").trim();
  return [`/admin/restaurantes/${id}`, `/admin/restaurantes/${id}/editar`];
}

async function checkNoOverflow(page: import("@playwright/test").Page, label: string) {
  const r = await page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const offenders: string[] = [];
    document.querySelectorAll("body *").forEach((el) => {
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      const style = getComputedStyle(el);
      if (style.position === "fixed" && rect.right <= vw + 1) return;
      // Ignora elementos dentro de contentores com scroll horizontal intencional (carrosséis, tabelas).
      let p = el.parentElement;
      while (p && p !== document.body) {
        const s = getComputedStyle(p);
        if (s.overflowX === "auto" || s.overflowX === "scroll" || s.overflowX === "hidden" || s.overflowX === "clip") return;
        p = p.parentElement;
      }
      if (rect.right > vw + 1 || rect.left < -1) offenders.push(`${el.tagName.toLowerCase()}.${(el.className?.toString() ?? "").slice(0, 60)}`);
    });
    return { scrollWidth: document.documentElement.scrollWidth, vw, offenders: offenders.slice(0, 5) };
  });
  expect(r.scrollWidth, `${label}: scroll horizontal (${r.offenders.join(", ")})`).toBeLessThanOrEqual(r.vw + 1);
  expect(r.offenders, `${label}: elementos fora do ecrã`).toEqual([]);
}

for (const vp of VIEWPORTS) {
  test(`sem scroll horizontal — ${vp.name} (${vp.width}x${vp.height})`, async ({ browser }) => {
    fs.mkdirSync(shotsDir, { recursive: true });
    const sets: [string | undefined, string[]][] = [
      [undefined, PUBLIC],
      [fs.existsSync(`${STATE_DIR}/customer.json`) ? `${STATE_DIR}/customer.json` : undefined, CUSTOMER],
      [fs.existsSync(`${STATE_DIR}/owner.json`) ? `${STATE_DIR}/owner.json` : undefined, [...OWNER, ...restaurantPages()]],
    ];
    const isMobile = vp.width < 500;
    for (const [state, paths] of sets) {
      if (paths !== PUBLIC && !state) continue;
      const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, storageState: state, isMobile, hasTouch: isMobile });
      const page = await ctx.newPage();
      for (const path of paths) {
        await page.goto(path);
        await page.waitForLoadState("networkidle");
        await checkNoOverflow(page, `${vp.name} ${path}`);
        if (["/", "/admin", "/parceiro/pedidos?tab=historico", "/parceiro", "/minha-conta"].includes(path) && (vp.width === 375 || vp.width === 1366)) {
          await page.screenshot({ path: `${shotsDir}/${vp.name}${path.replace(/[/?=]/g, "_") || "_home"}.png`, fullPage: true });
        }
      }
      // Restaurante e checkout com produto (se o fluxo já correu)
      if (state?.includes("customer")) {
        await page.goto("/restaurantes");
        const link = page.getByRole("link", { name: /Sabores E2E/ }).first();
        if (await link.count()) {
          await link.click();
          await page.waitForLoadState("networkidle");
          await checkNoOverflow(page, `${vp.name} restaurante`);
          await page.getByRole("button", { name: /Prato E2E/ }).first().click();
          await expect(page.getByRole("dialog")).toBeVisible();
          const box = await page.getByRole("dialog").boundingBox();
          expect(box!.width).toBeLessThanOrEqual(vp.width + 1);
          expect(box!.height).toBeLessThanOrEqual(vp.height + 1);
          if (vp.width === 375) await page.screenshot({ path: `${shotsDir}/${vp.name}_produto.png` });
          await page.getByRole("button", { name: /Adicionar ·/ }).click();
          await expect(page.getByRole("dialog")).toHaveCount(0);
          await page.goto("/checkout");
          await page.waitForLoadState("networkidle");
          await checkNoOverflow(page, `${vp.name} checkout`);
          if (vp.width === 375) await page.screenshot({ path: `${shotsDir}/${vp.name}_checkout.png`, fullPage: true });
          await page.goto("/sacola");
          await page.getByRole("button", { name: "Esvaziar" }).click({ trial: false }).catch(() => undefined);
        }
      }
      await ctx.close();
    }
  });
}

test("navegação por teclado e etiquetas nos formulários", async ({ page }) => {
  await page.goto("/entrar");
  await page.keyboard.press("Tab");
  const focused = await page.evaluate(() => document.activeElement?.tagName);
  expect(focused).toBeTruthy();
  const unlabeled = await page.evaluate(() =>
    [...document.querySelectorAll("input:not([type=hidden]), select, textarea")].filter((el) => {
      const id = el.getAttribute("id");
      return !(el.getAttribute("aria-label") || (id && document.querySelector(`label[for="${id}"]`)) || el.closest("label"));
    }).length,
  );
  expect(unlabeled).toBe(0);
});
