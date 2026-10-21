import { backup } from "node:sqlite";
import { mkdirSync, chmodSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { loadEnvConfig } from "@next/env";
import { db } from "../src/lib/db";
loadEnvConfig(process.cwd());
async function main() {
  const destination = resolve(
    process.argv[2] ||
      `data/backups/radar-${new Date().toISOString().replace(/[:.]/g, "-")}.sqlite`,
  );
  mkdirSync(dirname(destination), { recursive: true, mode: 0o700 });
  if (existsSync(destination))
    throw new Error("Escolha um arquivo de destino que ainda não exista.");
  await backup(db(), destination);
  chmodSync(destination, 0o600);
  console.log(
    `Backup consistente salvo em ${destination}. Guarde também a chave de criptografia, em local separado e seguro.`,
  );
}
main().catch(() => {
  console.error(
    "Não foi possível criar o backup. Confira o destino e as permissões.",
  );
  process.exitCode = 1;
});
