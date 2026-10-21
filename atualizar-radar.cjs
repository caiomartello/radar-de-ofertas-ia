// Atualização local: preserva .env.local, banco, contas e arquivos pessoais.
const fs = require("node:fs");
const path = require("node:path");
const { createHash } = require("node:crypto");
const { parseEnv } = require("node:util");
const { createInterface } = require("node:readline/promises");
const { spawnSync } = require("node:child_process");
const { createServer } = require("node:net");
const { DatabaseSync, backup } = require("node:sqlite");
function npm(args, cwd) {
  const result =
    process.platform === "win32"
      ? spawnSync("cmd.exe", ["/d", "/c", `npm ${args.join(" ")}`], {
          cwd,
          stdio: "inherit",
        })
      : spawnSync("npm", args, { cwd, stdio: "inherit" });
  if (result.error || result.status !== 0)
    throw new Error(
      "O comando anterior falhou. O backup foi preservado; leia a mensagem exibida acima.",
    );
}
function verifyPath(rel) {
  const normalized = rel.replaceAll("\\", "/");
  const segments = normalized.split("/");
  if (
    path.isAbsolute(rel) ||
    /^[a-z]:/i.test(normalized) ||
    normalized.startsWith("/") ||
    segments.includes("..") ||
    segments.some((s) =>
      ["data", ".git", "node_modules", ".next", ".cache"].includes(s),
    ) ||
    (path.basename(rel).startsWith(".env") && rel !== ".env.example")
  )
    throw new Error(
      "Manifesto contém caminho protegido. Atualização cancelada.",
    );
  return normalized;
}
async function update(target, source = __dirname, install = true) {
  target = fs.realpathSync(target);
  source = fs.realpathSync(source);
  if (target === source)
    throw new Error(
      "Escolha a pasta ANTIGA, onde você já criou sua conta. O atualizador deve ser aberto na pasta NOVA extraída do ZIP.",
    );
  const pkg = JSON.parse(
    fs.readFileSync(path.join(target, "package.json"), "utf8"),
  );
  if (
    pkg.name !== "radar-de-ofertas-ia" ||
    !fs.existsSync(path.join(target, ".env.local"))
  )
    throw new Error(
      "A pasta escolhida não contém uma instalação configurada do Radar. Nada foi alterado.",
    );
  const settings = parseEnv(
    fs.readFileSync(path.join(target, ".env.local"), "utf8"),
  );
  const origin = new URL(settings.APP_URL || "http://localhost:3000");
  if (!["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname))
    throw new Error(
      "Este atualizador é somente para instalação local. Para servidor, siga o guia de manutenção.",
    );
  await new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once("error", () =>
      reject(
        new Error(
          "Feche a janela preta do Radar antigo antes de atualizar. O aplicativo ainda está em execução.",
        ),
      ),
    );
    probe.listen(Number(origin.port) || 3000, "127.0.0.1", () =>
      probe.close(resolve),
    );
  });
  const files = JSON.parse(
    fs.readFileSync(path.join(source, "update-files.json"), "utf8"),
  ).files.map(verifyPath);
  for (const rel of files) {
    const candidate = fs.realpathSync(path.join(source, rel));
    if (!candidate.startsWith(source + path.sep))
      throw new Error("Arquivo de origem fora da pasta esperada.");
    const destination = path.join(target, rel);
    if (
      fs.existsSync(destination) &&
      fs.lstatSync(destination).isSymbolicLink()
    )
      throw new Error(
        "Um arquivo de destino é um link. Atualização cancelada para preservar arquivos externos.",
      );
    let ancestor = path.dirname(destination);
    while (!fs.existsSync(ancestor)) ancestor = path.dirname(ancestor);
    const real = fs.realpathSync(ancestor);
    if (real !== target && !real.startsWith(target + path.sep))
      throw new Error(
        "Um destino aponta para fora da instalação. Nada foi alterado.",
      );
  }
  const databasePath = path.resolve(
    target,
    settings.DATABASE_PATH || "./data/radar.sqlite",
  );
  if (!fs.existsSync(databasePath))
    throw new Error(
      "Banco antigo não encontrado. Nada foi alterado; confira a pasta escolhida.",
    );
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const saved = path.join(
    target,
    "data",
    "backups",
    "antes-da-atualizacao-" + stamp,
  );
  fs.mkdirSync(saved, { recursive: true, mode: 0o700 });
  const connection = new DatabaseSync(databasePath, { readOnly: true });
  try {
    await backup(connection, path.join(saved, "radar.sqlite"));
  } finally {
    connection.close();
  }
  fs.copyFileSync(
    path.join(target, ".env.local"),
    path.join(saved, ".env.local"),
  );
  fs.chmodSync(path.join(saved, ".env.local"), 0o600);
  fs.chmodSync(path.join(saved, "radar.sqlite"), 0o600);
  for (const rel of files) {
    const current = path.join(target, rel);
    if (fs.existsSync(current)) {
      const dst = path.join(saved, "codigo", rel);
      fs.mkdirSync(path.dirname(dst), { recursive: true, mode: 0o700 });
      fs.copyFileSync(current, dst);
    }
  }
  console.log(
    "Backup consistente do banco, da configuração privada e do código anterior concluído. Nenhuma conta será recriada.",
  );
  for (const rel of files) {
    const destination = path.join(target, rel);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(path.join(source, rel), destination);
  }
  if (install) {
    npm(["ci"], target);
    npm(["run", "setup"], target);
    const hash = createHash("sha256")
      .update(fs.readFileSync(path.join(target, "package-lock.json")))
      .digest("hex");
    fs.writeFileSync(
      path.join(target, "node_modules", ".radar-install-lock"),
      hash,
    );
  }
  console.log(
    "Atualização concluída. Abra INICIAR_RADAR.cmd na pasta ANTIGA e entre com o mesmo e-mail e a mesma senha.",
  );
  return { backup: saved };
}
async function main() {
  const [major, minor] = process.versions.node.split(".").map(Number);
  if (major !== 24 || minor < 15)
    throw new Error("Use Node.js 24.15 ou superior da série 24.");
  console.log(
    "Feche o Radar antigo. No Explorador de Arquivos, abra a pasta ANTIGA, copie o caminho da barra de endereços e cole abaixo.",
  );
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  let target;
  try {
    target = (await rl.question("Caminho completo da instalação antiga: "))
      .trim()
      .replace(/^"|"$/g, "");
  } finally {
    rl.close();
  }
  if (!target) throw new Error("Atualização cancelada.");
  await update(target);
}
module.exports = { update, verifyPath };
if (require.main === module)
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
