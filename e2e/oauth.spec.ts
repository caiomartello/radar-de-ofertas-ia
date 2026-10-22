import { test, expect } from "@playwright/test";
import { createCallbackGateway, verifyCallback } from "../callback-https.cjs";
import type { AddressInfo } from "node:net";
const publicOrigin = "https://radar-browser-fixture.trycloudflare.com";

test("OAuth no navegador: callback HTTPS isolado e retorno cancelado com cookie Lax local", async ({
  page,
}, testInfo) => {
  // Gateway HTTP real; a borda HTTPS e o provedor são interceptados somente neste teste.
  const key = "8".repeat(64),
    appOrigin = "http://localhost:3100";
  const gateway = createCallbackGateway({ appOrigin, key });
  await new Promise<void>((r) => gateway.listen(0, "127.0.0.1", r));
  const port = (gateway.address() as AddressInfo).port;
  const toGateway: typeof fetch = (input, init) => {
    const url = new URL(
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url,
    );
    return fetch(`http://127.0.0.1:${port}` + url.pathname + url.search, init);
  };
  try {
    await verifyCallback({
      origin: publicOrigin,
      appOrigin,
      key,
      publicRequest: toGateway,
    });
    await page.route(publicOrigin + "/**", async (route) => {
      const response = await toGateway(route.request().url(), {
        redirect: "manual",
      });
      await route.fulfill({
        status: response.status,
        headers: Object.fromEntries(response.headers),
        body: await response.text(),
      });
    });
    await page.goto("/");
    await page.getByLabel("E-mail", { exact: true }).fill("e2e@example.test");
    await page
      .getByLabel("Senha", { exact: true })
      .fill("Fixture-e2e-somente-testes-123!");
    await page.getByRole("button", { name: "Entrar no radar" }).click();
    if (testInfo.project.name === "mobile")
      await page
        .getByRole("button", { name: "Abrir menu", exact: true })
        .click();
    await page
      .getByRole("navigation", { name: "Menu principal" })
      .getByRole("button", { name: "Integrações", exact: true })
      .click();
    const redirect = page.getByLabel(
      "URI de redirect para cadastrar no DevCenter",
      { exact: true },
    );
    await expect(redirect).toHaveValue(
      publicOrigin + "/api/oauth/mercado-livre/callback",
    );
    await page
      .getByLabel("Client ID da aplicação", { exact: true })
      .fill("1234567890123456");
    const secretInput = page.getByLabel("Client Secret da aplicação", {
      exact: true,
    });
    await secretInput.fill("FIXTURE-SEM-SEGREDO-REAL-123456");
    const saved = page.waitForResponse(
      (r) =>
        r.url().endsWith("/api/oauth/mercado-livre/config") &&
        r.request().method() === "POST",
    );
    await page
      .getByRole("button", {
        name: "Salvar aplicação com segurança",
        exact: true,
      })
      .click();
    const saveResponse = await saved;
    expect(saveResponse.status()).toBe(200);
    expect(await saveResponse.text()).not.toContain("FIXTURE-SEM-SEGREDO");
    await expect(secretInput).toHaveValue("");
    await expect(
      page.getByRole("button", {
        name: "Conectar com Mercado Livre",
        exact: true,
      }),
    ).toBeEnabled();
    await expect(
      page.getByRole("button", { name: "Renovar token agora", exact: true }),
    ).toBeDisabled();
    let callbackCookies: Promise<Record<string, string>> | undefined;
    page.on("request", (req) => {
      if (
        new URL(req.url()).hostname === "localhost" &&
        new URL(req.url()).pathname === "/api/oauth/mercado-livre/callback"
      )
        callbackCookies = req.allHeaders();
    });
    // Site externo interceptado no navegador; não usa conta, token ou serviço real.
    await page.route("https://auth.mercadolivre.com.br/**", async (route) => {
      const auth = new URL(route.request().url());
      expect(auth.pathname).toBe("/authorization");
      expect(auth.searchParams.get("code_challenge_method")).toBe("S256");
      const returned = new URL(auth.searchParams.get("redirect_uri")!);
      returned.searchParams.set("state", auth.searchParams.get("state")!);
      returned.searchParams.set("error", "access_denied");
      await route.fulfill({
        contentType: "text/html; charset=utf-8",
        body: `<html><body><a href="${returned.href.replaceAll("&", "&amp;")}">Cancelar autorização de teste</a></body></html>`,
      });
    });
    await page
      .getByRole("button", { name: "Conectar com Mercado Livre", exact: true })
      .click();
    await page
      .getByRole("link", { name: "Cancelar autorização de teste", exact: true })
      .click();
    await expect(
      page.getByText(
        "Autorização cancelada no Mercado Livre. A conexão anterior foi preservada.",
        { exact: true },
      ),
    ).toBeVisible();
    const sent = await callbackCookies!;
    expect(sent.cookie).toContain("radar_meli_oauth=");
    expect(sent.cookie).not.toContain("radar_session=");
    await expect(redirect).toBeVisible();
    expect(new URL(page.url()).searchParams.has("code")).toBe(false);
    expect(new URL(page.url()).searchParams.has("state")).toBe(false);
    expect(new URL(page.url()).searchParams.has("meli_oauth")).toBe(false);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  } finally {
    gateway.closeAllConnections();
    await new Promise<void>((r) => gateway.close(() => r()));
  }
});
