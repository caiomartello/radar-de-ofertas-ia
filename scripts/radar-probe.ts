import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());
async function main() {
  console.log(
    "Teste de rede sem token. Não importa ofertas nem altera credenciais.",
  );
  try {
    const response = await fetch(
      "https://api.mercadolibre.com/sites/MLB/search?q=cafeteira&limit=1",
      {
        headers: { Accept: "application/json" },
        redirect: "error",
        signal: AbortSignal.timeout(12000),
      },
    );
    console.log(
      `Resposta HTTP da consulta sem token: ${response.status}. Isso não comprova acesso autenticado nem descoberta operacional.`,
    );
    if (!response.ok) process.exitCode = 1;
  } catch {
    console.error(
      "A API oficial não pôde ser alcançada. Na nuvem, confira a liberação de api.mercadolibre.com. Nenhum resultado foi criado.",
    );
    process.exitCode = 1;
  }
}
void main();
