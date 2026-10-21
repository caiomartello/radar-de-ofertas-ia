// Iniciador local separado do aplicativo. Não publica nem contrata serviços.
const fs = require("node:fs");
const path = require("node:path");
const { createHash } = require("node:crypto");
const { spawn, spawnSync } = require("node:child_process");
const { createServer } = require("node:net");
const { setTimeout: delay } = require("node:timers/promises");
const directory = __dirname;
process.chdir(directory);

function npm(args) {
  // Comandos constantes: nenhum texto digitado pelo usuário vai ao shell.
  const result =
    process.platform === "win32"
      ? spawnSync("cmd.exe", ["/d", "/c", `npm ${args.join(" ")}`], {
          cwd: directory,
          stdio: "inherit",
        })
      : spawnSync("npm", args, { cwd: directory, stdio: "inherit" });
  if (result.error || result.status !== 0)
    throw new Error("O comando anterior não terminou. Leia a mensagem acima.");
}
async function main() {
  const [major, minor] = process.versions.node.split(".").map(Number);
  if (major !== 24 || minor < 15)
    throw new Error(
      "Instale Node.js 24 LTS, versão 24.15 ou superior dentro da série 24, pelo site oficial nodejs.org.",
    );
  for (const file of [
    "package.json",
    "package-lock.json",
    "scripts/owner.ts",
    "scripts/config.mjs",
    "migrations/001_initial.sql",
  ]) {
    if (!fs.existsSync(path.join(directory, file)))
      throw new Error(
        "Extraia todo o ZIP antes de abrir INICIAR_RADAR.cmd. Não execute dentro da pasta compactada.",
      );
  }
  if (process.argv.includes("--verificar")) {
    console.log(
      "Node compatível e arquivos necessários presentes. Nenhuma instalação, conta ou serviço foi criado.",
    );
    return;
  }
  await new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once("error", () =>
      reject(
        new Error(
          "A porta 3000 já está em uso. Feche outra execução local do Radar e tente novamente.",
        ),
      ),
    );
    probe.listen(3000, "127.0.0.1", () => probe.close(resolve));
  });
  const lockHash = createHash("sha256")
    .update(fs.readFileSync("package-lock.json"))
    .digest("hex");
  const marker = path.join("node_modules", ".radar-install-lock");
  const nextBinary = path.join(
    directory,
    "node_modules",
    "next",
    "dist",
    "bin",
    "next",
  );
  if (
    !fs.existsSync(nextBinary) ||
    !fs.existsSync(marker) ||
    fs.readFileSync(marker, "utf8") !== lockHash
  ) {
    console.log(
      "Preparando dependências gratuitas. Na primeira abertura isso pode levar alguns minutos.",
    );
    npm(["ci"]);
    fs.writeFileSync(marker, lockHash);
  }
  npm(["run", "setup"]);
  process.loadEnvFile(".env.local");
  const { DatabaseSync } = require("node:sqlite");
  const database = new DatabaseSync(
    process.env.DATABASE_PATH || "./data/radar.sqlite",
  );
  const hasOwner = !!database
    .prepare("SELECT id FROM users WHERE role='owner'")
    .get();
  database.close();
  if (!hasOwner) {
    console.log(
      "Vamos criar sua conta pessoal de administrador. Digite a senha somente neste terminal.",
    );
    npm(["run", "owner"]);
  }
  const origin = "http://localhost:3000";
  if (process.env.APP_URL !== origin)
    throw new Error(
      "Este iniciador usa a configuração local padrão. APP_URL foi alterada; consulte o README antes de iniciar.",
    );
  console.log(
    "Iniciando o Radar apenas neste computador. Mantenha esta janela aberta.",
  );
  const server = spawn(
    process.execPath,
    [nextBinary, "dev", "--hostname", "127.0.0.1", "--port", "3000"],
    {
      cwd: directory,
      stdio: "inherit",
      env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" },
    },
  );
  const worker = spawn(
    process.execPath,
    [
      path.join(directory, "node_modules", "tsx", "dist", "cli.mjs"),
      path.join(directory, "scripts", "radar-worker.ts"),
    ],
    {
      cwd: directory,
      stdio: "inherit",
      env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" },
    },
  );
  worker.on("error", () =>
    console.log(
      "Agendador não iniciou. O histórico e as buscas manuais continuam disponíveis.",
    ),
  );
  server.once("exit", () => worker.kill());
  let ended = false;
  server.once("exit", (code) => {
    ended = true;
    process.exitCode = code || 0;
  });
  server.once("error", () => {
    ended = true;
    process.exitCode = 1;
  });
  for (let attempt = 0; attempt < 90 && !ended; attempt++) {
    try {
      const response = await fetch(origin, {
        signal: AbortSignal.timeout(1500),
      });
      if (
        response.ok &&
        (await response.text()).includes("Radar de Ofertas IA")
      ) {
        console.log(
          "Radar pronto. Entre no navegador com o e-mail e a senha que você escolheu.",
        );
        if (process.platform === "win32") {
          const opener = spawn(
            "cmd.exe",
            ["/d", "/c", 'start "" "http://localhost:3000"'],
            { windowsHide: true, stdio: "ignore" },
          );
          opener.on("error", () =>
            console.log(
              "Abra o navegador e digite o endereço local indicado pelo servidor.",
            ),
          );
        } else
          console.log(
            "Abra o navegador no endereço local indicado pelo servidor.",
          );
        return;
      }
    } catch {
      /* O servidor ainda está iniciando. Não há requisições externas. */
    }
    await delay(1000);
  }
  if (!ended)
    console.log(
      "A inicialização está demorando. Consulte as mensagens nesta janela.",
    );
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
