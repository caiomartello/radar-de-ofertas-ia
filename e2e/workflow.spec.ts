import { test, expect } from "@playwright/test";
const password = "Fixture-e2e-somente-testes-123!";
test("radar real separado dos exemplos, busca salva e bloqueio honesto sem credenciais", async ({
  page,
}, testInfo) => {
  await page.goto("/");
  await page.getByLabel("E-mail", { exact: true }).fill("e2e@example.test");
  await page.getByLabel("Senha", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Entrar no radar" }).click();
  await expect(
    page.getByRole("button", { name: "Ver ofertas reais", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  const nav = async (name: string) => {
    if (testInfo.project.name === "mobile")
      await page
        .getByRole("button", { name: "Abrir menu", exact: true })
        .click();
    await page
      .getByRole("navigation", { name: "Menu principal" })
      .getByRole("button", { name, exact: true })
      .click();
  };
  await nav("Radar de ofertas");
  await expect(
    page.getByText("Acesso de API não configurado", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("textbox", { name: "Termo de busca", exact: true })
    .fill("termo fixture " + testInfo.project.name);
  await page
    .getByRole("button", {
      name: "Salvar busca com agendamento desligado",
      exact: true,
    })
    .click();
  await expect(page.getByRole("status")).toContainText("Busca salva");
  const row = page
    .locator(".radar-jobs article")
    .filter({ hasText: "termo fixture " + testInfo.project.name });
  await expect(
    row.getByRole("button", { name: "Buscar agora na API", exact: true }),
  ).toBeDisabled();
  await expect(
    row.getByRole("button", { name: "Habilitar agendamento", exact: true }),
  ).toBeDisabled();
  await nav("Integrações");
  await page
    .getByText("Opção avançada: token obtido manualmente", { exact: true })
    .click();
  await expect(
    page.getByLabel("Access token obtido pelo fluxo autorizado da plataforma", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: "Testar autorização de busca",
      exact: true,
    }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Ver exemplos", exact: true }).click();
  await expect(
    page.getByText(
      "Mude para Ofertas reais para configurar a conexão com a API.",
      { exact: true },
    ),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Ver ofertas reais", exact: true })
    .click();
  await expect(
    page.getByRole("button", {
      name: "Testar autorização de busca",
      exact: true,
    }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
test("entra, importa quatro cupons, calcula, aprova, edita, copia e registra publicação", async ({
  page,
  context,
}, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/");
  await page.getByLabel("E-mail", { exact: true }).fill("e2e@example.test");
  await page.getByLabel("Senha", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Entrar no radar" }).click();
  await expect(
    page.getByRole("heading", { name: "Olá, Equipe" }),
  ).toBeVisible();
  const nav = async (name: string) => {
    if (testInfo.project.name === "mobile")
      await page
        .getByRole("button", { name: "Abrir menu", exact: true })
        .click();
    await page
      .getByRole("navigation", { name: "Menu principal" })
      .getByRole("button", { name, exact: true })
      .click();
  };
  const suffix = testInfo.project.name.toUpperCase();
  if (
    await page
      .getByRole("button", { name: "Experimentar com exemplos" })
      .isVisible()
  ) {
    await page
      .getByRole("button", { name: "Experimentar com exemplos" })
      .click();
    await expect(
      page.getByText("Exemplos carregados.", { exact: true }),
    ).toBeVisible();
  }
  await page.getByRole("button", { name: "Ver exemplos", exact: true }).click();
  await nav("Central de cupons");
  await page
    .getByLabel("Texto para importar cupons")
    .fill(
      `Cupom CASA${suffix}: 30% limitado a R$ 60 mínimo R$ 100\nCupom PET${suffix}: 10%\nCupom BELEZA${suffix}: 20%\nCupom FIXO${suffix}: R$ 15 de desconto`,
    );
  await page
    .getByRole("button", { name: "Analisar texto", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "4 cupons para revisar" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Revisar e cadastrar" })
    .first()
    .click();
  let dialog = page.getByRole("dialog");
  await dialog
    .getByLabel("Status informado", { exact: true })
    .selectOption("apparently_active");
  await dialog
    .getByLabel("Fonte da informação")
    .fill("Fixture do navegador: regras fictícias revisadas");
  await dialog
    .getByLabel("Início (Brasília)", { exact: true })
    .fill("2020-01-01T00:00");
  await dialog
    .getByLabel("Fim (Brasília)", { exact: true })
    .fill("2099-12-31T23:00");
  await dialog
    .getByLabel("Condições desconhecidas (uma por linha)", { exact: true })
    .fill("");
  await dialog.getByLabel("Casa", { exact: true }).check();
  await dialog
    .getByText(
      "Revisei manualmente as regras, as categorias e os vendedores.",
      { exact: false },
    )
    .click();
  await dialog
    .getByRole("button", { name: "Confirmar e salvar cupom" })
    .click();
  await expect(dialog).not.toBeVisible();
  await nav("Radar de ofertas");
  await page.getByRole("button", { name: "Nova oferta", exact: true }).click();
  dialog = page.getByRole("dialog");
  await dialog
    .getByLabel("Nome do produto", { exact: true })
    .fill(`Produto de teste ${suffix}`);
  await dialog
    .getByLabel("ID do anúncio / produto na plataforma", { exact: true })
    .fill(`E2E-${suffix}`);
  await dialog.getByLabel("Categoria", { exact: true }).selectOption("casa");
  await dialog
    .getByLabel("Vendedor recomendado", { exact: true })
    .selectOption({
      label: "Loja Aurora • Exemplo · Mercado Livre · EXEMPLO-LOJA-01",
    });
  await dialog
    .getByLabel("Cupom opcional", { exact: true })
    .selectOption({ label: `CASA${suffix} · Mercado Livre (exemplo)` });
  await dialog
    .getByLabel("Preço conferido agora (R$)", { exact: true })
    .fill("300");
  await dialog
    .getByLabel("URL original do produto (HTTPS)", { exact: true })
    .fill("https://www.mercadolivre.com.br/");
  await dialog
    .getByLabel("Achadinhos do dia • Exemplo", { exact: true })
    .check();
  await dialog.getByLabel("Plataforma", { exact: true }).selectOption("amazon");
  await dialog
    .getByRole("button", { name: "Salvar oferta em revisão" })
    .click();
  await expect(dialog.getByRole("alert")).toContainText(
    "vendedor da mesma plataforma",
  );
  await dialog
    .getByLabel("Plataforma", { exact: true })
    .selectOption("mercado_livre");
  await dialog
    .getByRole("button", { name: "Salvar oferta em revisão" })
    .click();
  await expect(dialog).not.toBeVisible();
  await page
    .getByRole("button", { name: `Produto de teste ${suffix}`, exact: true })
    .click();
  dialog = page.getByRole("dialog");
  await expect(
    dialog.getByText(/240,00 \(estimativa, não confirmada\)/),
  ).toBeVisible();
  await dialog
    .getByLabel("Justificativa da revisão", { exact: true })
    .fill("Dados de exemplo conferidos no teste do navegador.");
  await dialog.getByRole("button", { name: "Aprovar", exact: true }).click();
  await expect(dialog.getByText("Aprovada", { exact: true })).toBeVisible();
  await dialog
    .getByRole("button", { name: "Gerar mensagem", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByLabel("Grupo de destino", { exact: true })
    .selectOption({ label: "Achadinhos do dia • Exemplo" });
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Gerar rascunho", exact: true })
    .click();
  await expect(
    page.getByLabel("Editar mensagem", { exact: true }),
  ).toBeVisible();
  const editor = page.getByLabel("Editar mensagem", { exact: true });
  await editor.fill(
    (await editor.inputValue()) + "\nMensagem revisada no teste.",
  );
  await page
    .getByRole("button", { name: "Salvar edição", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Mensagem salva.");
  await page
    .getByRole("button", { name: "Copiar mensagem", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Mensagem copiada.");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain(
    "Mensagem revisada no teste.",
  );
  const before = await page.request.get("/api/state?dataset=demo");
  const beforeData = await before.json();
  expect(
    beforeData.publications.filter(
      (p: { offer_id: string }) =>
        p.offer_id ===
        beforeData.drafts.find(
          (d: { offer_title: string }) =>
            d.offer_title === `Produto de teste ${suffix}`,
        ).offer_id,
    ),
  ).toHaveLength(0);
  page.once("dialog", (d) => d.accept());
  await page
    .getByRole("button", { name: "Registrar publicação manual", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "Publicação manual registrada.",
  );
  await nav("Visão geral");
  await expect(
    page.getByRole("heading", { name: "Olá, Equipe" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: `test-results/radar-${testInfo.project.name}.png`,
    fullPage: true,
  });
  expect(errors).toEqual([]);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Olá, Equipe" }),
  ).toBeVisible();
});
