const fs = require("node:fs");
const path = require("node:path");
const { randomBytes } = require("node:crypto");
const { spawn, spawnSync } = require("node:child_process");
const { createServer } = require("node:net");
const { setTimeout: delay } = require("node:timers/promises");
const {
  createCallbackGateway,
  verifyCallback,
  checkOrigin,
  INTERNAL_PATH,
} = require("./callback-https.cjs");
const appOrigin = "http://localhost:3000";
function parseTunnelOrigin(log) {
  if (!log.includes("Your quick Tunnel has been created!")) return null;
  for (const match of log.matchAll(
    /https:\/\/[a-z0-9]+(?:-[a-z0-9]+)*\.trycloudflare\.com\b/g,
  )) {
    const u = new URL(match[0]);
    if (
      !["api.trycloudflare.com", "www.trycloudflare.com"].includes(u.hostname)
    )
      return checkOrigin(u.origin);
  }
  return null;
}
function cloudflaredBinary() {
  const executable =
    process.platform === "win32" ? "cloudflared.exe" : "cloudflared";
  const candidates = [executable];
  if (process.platform === "win32") {
    for (const [base, suffix] of [
      [process.env.LOCALAPPDATA, "Microsoft/WinGet/Links/cloudflared.exe"],
      [process.env.ProgramFiles, "cloudflared/cloudflared.exe"],
      [process.env["ProgramFiles(x86)"], "cloudflared/cloudflared.exe"],
    ])
      if (base) candidates.push(path.join(base, suffix));
  }
  return candidates.find(
    (p) =>
      spawnSync(p, ["--version"], { stdio: "ignore", windowsHide: true })
        .status === 0,
  );
}
async function freePort(port) {
  await new Promise((resolve, reject) => {
    const check = createServer();
    check.once("error", () =>
      reject(
        new Error(
          "Feche a janela preta do Radar antigo: a porta 3000 está em uso.",
        ),
      ),
    );
    check.listen(port, "127.0.0.1", () => check.close(resolve));
  });
}
async function main() {
  process.chdir(__dirname);
  const [major, minor] = process.versions.node.split(".").map(Number);
  if (major !== 24 || minor < 15)
    throw new Error("Use Node.js 24.15 ou superior da série 24.");
  if (!fs.existsSync(".env.local"))
    throw new Error(
      "Primeiro configure o Radar com INICIAR_RADAR.cmd. Depois feche a janela e abra INICIAR_RADAR_HTTPS.cmd.",
    );
  process.loadEnvFile(".env.local");
  if (process.env.APP_URL !== appOrigin)
    throw new Error(
      "Este iniciador exige APP_URL=http://localhost:3000. Não altere a URL do dashboard para o domínio do túnel.",
    );
  await freePort(3000);
  fs.rmSync(path.join(__dirname, "data", "URI_REDIRECT_MERCADO_LIVRE.txt"), {
    force: true,
  });
  let binary = cloudflaredBinary();
  if (!binary && process.platform === "win32") {
    console.log(
      "Instalando o conector gratuito oficial Cloudflare.cloudflared pelo WinGet. Não é necessário criar conta nem fornecer cartão. O Windows pode pedir confirmação.",
    );
    const install = spawnSync(
      "winget.exe",
      [
        "install",
        "--id",
        "Cloudflare.cloudflared",
        "--exact",
        "--source",
        "winget",
      ],
      { stdio: "inherit" },
    );
    if (install.status === 0) binary = cloudflaredBinary();
  }
  if (!binary)
    throw new Error(
      "Cloudflared não encontrado. Consulte docs/HTTPS-WINDOWS.md para instalação gratuita; feche e reabra esta janela após instalar. Nenhuma URI foi liberada.",
    );
  console.log(
    "Será aberto um túnel público temporário SOMENTE para o callback OAuth. Dashboard, login e APIs de trabalho continuam locais. O endereço muda a cada abertura.",
  );
  const key = randomBytes(32).toString("hex");
  const gateway = createCallbackGateway({ appOrigin, key });
  await new Promise((resolve, reject) => {
    gateway.once("error", reject);
    gateway.listen(0, "127.0.0.1", resolve);
  });
  const port = gateway.address().port;
  const children = [];
  let stopping = false,
    timer;
  function stop(code = 0) {
    if (stopping) return;
    stopping = true;
    clearInterval(timer);
    for (const child of children) {
      if (!child.pid) continue;
      if (process.platform === "win32")
        spawnSync("taskkill.exe", ["/pid", String(child.pid), "/t", "/f"], {
          stdio: "ignore",
          windowsHide: true,
        });
      else child.kill();
    }
    gateway.closeAllConnections();
    gateway.close();
    process.exitCode = code;
  }
  for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => stop());
  const tunnel = spawn(
    binary,
    [
      "tunnel",
      "--url",
      `http://127.0.0.1:${port}`,
      "--no-autoupdate",
      "--protocol",
      "http2",
    ],
    { stdio: ["ignore", "pipe", "pipe"], windowsHide: true },
  );
  children.push(tunnel);
  try {
    const origin = await new Promise((resolve, reject) => {
      let tail = "";
      const deadline = setTimeout(
        () =>
          reject(
            new Error(
              "O serviço não forneceu um túnel HTTPS. Verifique internet/firewall; nenhuma URI foi liberada.",
            ),
          ),
        45000,
      );
      const receive = (chunk) => {
        tail = (tail + chunk.toString()).slice(-16000);
        const found = parseTunnelOrigin(tail);
        if (found) {
          clearTimeout(deadline);
          resolve(found);
        }
      };
      tunnel.stdout.on("data", receive);
      tunnel.stderr.on("data", receive);
      tunnel.once("error", () => {
        clearTimeout(deadline);
        reject(new Error("Não foi possível executar o Cloudflared."));
      });
      tunnel.once("exit", () => {
        clearTimeout(deadline);
        reject(
          new Error(
            "O túnel encerrou antes de iniciar. Nenhuma URI foi liberada.",
          ),
        );
      });
    });
    tunnel.once("exit", () => {
      console.error(
        "O túnel foi encerrado. Reabra este iniciador e atualize a URI no DevCenter.",
      );
      stop(1);
    });
    const server = spawn(
      process.execPath,
      [path.join(__dirname, "iniciar-radar.cjs")],
      {
        stdio: "inherit",
        env: {
          ...process.env,
          MELI_OAUTH_CALLBACK_ORIGIN: origin,
          MELI_OAUTH_GATEWAY_KEY: key,
        },
      },
    );
    children.push(server);
    server.once("error", () => stop(1));
    server.once("exit", () => stop());
    let uri;
    console.log(
      "Verificando HTTPS até o callback do Radar. Aguarde antes de cadastrar a URI…",
    );
    const verifyDeadline = Date.now() + 300000;
    for (let n = 0; Date.now() < verifyDeadline && !stopping; n++) {
      try {
        uri = await verifyCallback({ origin, appOrigin, key });
        break;
      } catch {
        await delay(1000);
      }
      if (n % 10 === 9)
        console.log(
          "Ainda aguardando o aplicativo e a confirmação HTTPS. Não cadastre uma URI ainda.",
        );
    }
    if (!uri)
      throw new Error(
        "Não foi possível confirmar o callback HTTPS de ponta a ponta. Verifique firewall/DNS e tente novamente. Nenhuma URI foi liberada.",
      );
    fs.mkdirSync("data", { recursive: true, mode: 0o700 });
    const output = path.join(
      __dirname,
      "data",
      "URI_REDIRECT_MERCADO_LIVRE.txt",
    );
    fs.writeFileSync(
      output,
      `VERIFICADA NESTA ABERTURA: ${new Date().toISOString()}\n${uri}\n\nUse somente enquanto esta janela estiver aberta. O endereço muda ao reiniciar.\nEste arquivo não contém Client Secret nem tokens.\n`,
      { mode: 0o600 },
    );
    console.log(
      "\nCALLBACK HTTPS VERIFICADO. CADASTRE EXATAMENTE ESTA URI NO DEVCENTER:\n" +
        uri +
        "\n\nTambém foi salva em data/URI_REDIRECT_MERCADO_LIVRE.txt.\nAbra http://localhost:3000 → Integrações. Mantenha esta janela aberta.\n",
    );
    let warned = false;
    timer = setInterval(async () => {
      try {
        await verifyCallback({ origin, appOrigin, key });
        if (warned) console.log("Callback HTTPS disponível novamente.");
        warned = false;
      } catch {
        try {
          await fetch(appOrigin + INTERNAL_PATH, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-radar-gateway-key": key,
            },
            body: JSON.stringify({ operation: "unavailable" }),
            signal: AbortSignal.timeout(5000),
          });
        } catch {}
        if (!warned)
          console.error(
            "Callback HTTPS indisponível. Não inicie nova autorização até restabelecer a conexão.",
          );
        warned = true;
      }
    }, 60000);
  } catch (e) {
    stop(1);
    throw e;
  }
}
module.exports = { cloudflaredBinary, freePort, parseTunnelOrigin };
if (require.main === module)
  main().catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  });
