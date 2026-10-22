// Receptor público mínimo: nunca encaminha login, dashboard ou APIs de trabalho.
const { createServer } = require("node:http");
const { createHmac, randomBytes } = require("node:crypto");
const CALLBACK_PATH = "/api/oauth/mercado-livre/callback";
const INTERNAL_PATH = "/api/oauth/mercado-livre/tunnel";
function checkOrigin(value) {
  const u = new URL(value);
  if (
    u.protocol !== "https:" ||
    !/^[a-z0-9]+(?:-[a-z0-9]+)*\.trycloudflare\.com$/.test(u.hostname) ||
    u.port ||
    u.username ||
    u.password ||
    u.pathname !== "/" ||
    u.search ||
    u.hash
  )
    throw new Error("Endereço de túnel inválido.");
  return u.origin;
}
function localOrigin(value) {
  const u = new URL(value);
  if (
    u.protocol !== "http:" ||
    !["localhost", "127.0.0.1"].includes(u.hostname) ||
    u.username ||
    u.password ||
    u.pathname !== "/" ||
    u.search ||
    u.hash
  )
    throw new Error("O receptor deve apontar somente para o Radar local.");
  return u.origin;
}
function createCallbackGateway({ appOrigin, key, request = fetch }) {
  appOrigin = localOrigin(appOrigin);
  let count = 0,
    resets = 0;
  const server = createServer(async (req, res) => {
    const send = (status, body, extra = {}) => {
      res.writeHead(status, {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
        "Referrer-Policy": "no-referrer",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
        ...extra,
      });
      res.end(body);
    };
    try {
      if (req.method !== "GET") return send(405, "Método não permitido.");
      if ((req.url || "").length > 10000)
        return send(414, "Retorno muito grande.");
      const url = new URL(req.url || "/", "http://127.0.0.1");
      if (url.pathname !== CALLBACK_PATH)
        return send(404, "Este receptor atende somente ao retorno OAuth.");
      if (Date.now() > resets) {
        count = 0;
        resets = Date.now() + 60000;
      }
      if (++count > 60)
        return send(429, "Aguarde para tentar novamente.", {
          "Retry-After": "60",
        });
      const probe = url.searchParams.get("radar_probe");
      if (probe !== null) {
        if (!/^[a-f0-9]{64}$/.test(probe))
          return send(400, "Verificação inválida.");
        const response = await request(
          appOrigin + INTERNAL_PATH + "?nonce=" + probe,
          {
            headers: { "x-radar-gateway-key": key },
            redirect: "error",
            signal: AbortSignal.timeout(8000),
          },
        );
        if (!response.ok)
          return send(503, "O Radar local ainda não confirmou o receptor.");
        const data = await response.json();
        if (!/^[a-f0-9]{64}$/.test(data.proof || ""))
          return send(503, "Resposta de verificação inválida.");
        return send(200, JSON.stringify({ proof: data.proof }), {
          "Content-Type": "application/json",
        });
      }
      const response = await request(appOrigin + INTERNAL_PATH, {
        method: "POST",
        headers: {
          "x-radar-gateway-key": key,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          operation: "callback",
          query: url.searchParams.toString(),
        }),
        redirect: "error",
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok)
        return send(
          400,
          "Retorno inválido ou expirado. Volte ao Radar local e inicie a conexão novamente.",
        );
      const data = await response.json();
      const target = new URL(data.location);
      if (
        target.origin !== appOrigin ||
        target.pathname !== CALLBACK_PATH ||
        !/^[A-Za-z0-9_-]{43}$/.test(target.searchParams.get("handoff") || "") ||
        [...target.searchParams.keys()].some((k) => k !== "handoff")
      )
        return send(503, "Retorno local recusado.");
      return send(303, "Voltando ao Radar local…", { Location: target.href });
    } catch {
      send(
        503,
        "Receptor indisponível. Mantenha o Radar aberto e reinicie a conexão.",
      );
    }
  });
  server.headersTimeout = 10000;
  server.requestTimeout = 10000;
  server.on("upgrade", (_, socket) => socket.destroy());
  return server;
}
async function verifyCallback({
  origin,
  appOrigin,
  key,
  publicRequest = fetch,
  localRequest = fetch,
}) {
  origin = checkOrigin(origin);
  appOrigin = localOrigin(appOrigin);
  const nonce = randomBytes(32).toString("hex");
  const expected = createHmac("sha256", key)
    .update(`radar-callback:${origin}:${nonce}`)
    .digest("hex");
  const response = await publicRequest(
    origin + CALLBACK_PATH + "?radar_probe=" + nonce,
    {
      redirect: "error",
      signal: AbortSignal.timeout(10000),
      cache: "no-store",
    },
  );
  if (
    !response.ok ||
    !response.headers.get("content-type")?.includes("application/json")
  )
    throw new Error("O endereço HTTPS ainda não chegou ao Radar.");
  const result = await response.json();
  if (result.proof !== expected)
    throw new Error(
      "O endereço HTTPS não chegou à instância esperada do Radar.",
    );
  // Confirmar também que a rota final local está instalada, sem consumir uma autorização real.
  const localCallback = await localRequest(appOrigin + CALLBACK_PATH, {
    redirect: "manual",
    signal: AbortSignal.timeout(8000),
    cache: "no-store",
  });
  if (
    localCallback.status !== 303 ||
    localCallback.headers.get("location") !== appOrigin + "/?meli_oauth=failed"
  )
    throw new Error("A rota final do callback local não está pronta.");
  const marked = await localRequest(appOrigin + INTERNAL_PATH, {
    method: "POST",
    headers: { "x-radar-gateway-key": key, "Content-Type": "application/json" },
    body: JSON.stringify({ operation: "verified", nonce, proof: result.proof }),
    redirect: "error",
    signal: AbortSignal.timeout(8000),
  });
  if (!marked.ok)
    throw new Error("O Radar não confirmou a disponibilidade do retorno.");
  return origin + CALLBACK_PATH;
}
module.exports = {
  createCallbackGateway,
  verifyCallback,
  checkOrigin,
  CALLBACK_PATH,
  INTERNAL_PATH,
};
