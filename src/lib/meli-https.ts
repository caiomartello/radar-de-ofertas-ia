import { createHmac, timingSafeEqual } from "node:crypto";
import { AppError, hashToken } from "./auth";
import { one, run, now } from "./db";

export function callbackOrigin() {
  const value = process.env.MELI_OAUTH_CALLBACK_ORIGIN;
  if (!value) return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new AppError("Origem do callback HTTPS inválida.", 503);
  }
  if (
    url.protocol !== "https:" ||
    !/^[a-z0-9]+(?:-[a-z0-9]+)*\.trycloudflare\.com$/.test(url.hostname) ||
    url.port ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  )
    throw new AppError(
      "O iniciador precisa fornecer uma origem HTTPS válida do túnel de desenvolvimento.",
      503,
    );
  return url.origin;
}
export function gatewayKey() {
  const key = process.env.MELI_OAUTH_GATEWAY_KEY || "";
  if (!/^[a-f0-9]{64}$/.test(key))
    throw new AppError("Inicie pelo arquivo INICIAR_RADAR_HTTPS.cmd.", 503);
  return key;
}
export function checkGatewayKey(value: string | null) {
  const expected = gatewayKey();
  if (
    !value ||
    value.length !== expected.length ||
    !timingSafeEqual(Buffer.from(value), Buffer.from(expected))
  )
    throw new AppError("Acesso reservado ao receptor local do callback.", 403);
}
export function gatewayProof(nonce: string) {
  if (!/^[a-f0-9]{64}$/.test(nonce))
    throw new AppError("Verificação inválida.");
  return createHmac("sha256", gatewayKey())
    .update(`radar-callback:${callbackOrigin()}:${nonce}`)
    .digest("hex");
}
export function tunnelVerified() {
  const origin = callbackOrigin();
  if (!origin) return false;
  const item = one<{ value: string }>(
    "SELECT value FROM radar_runtime WHERE key='meli_https_verified'",
  );
  try {
    const record = JSON.parse(item?.value || "null");
    return (
      !!record &&
      record.origin === origin &&
      record.key_hash === hashToken(gatewayKey()) &&
      Date.now() - Date.parse(record.checked_at) >= 0 &&
      Date.now() - Date.parse(record.checked_at) < 150000
    );
  } catch {
    return false;
  }
}
export function markTunnelVerified(nonce: string, proof: string) {
  const expected = gatewayProof(nonce);
  if (
    !/^[a-f0-9]{64}$/.test(proof) ||
    !timingSafeEqual(Buffer.from(expected), Buffer.from(proof))
  )
    throw new AppError(
      "A verificação HTTPS não chegou ao receptor esperado.",
      403,
    );
  run(
    "INSERT INTO radar_runtime VALUES ('meli_https_verified',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
    JSON.stringify({
      origin: callbackOrigin(),
      key_hash: hashToken(gatewayKey()),
      checked_at: now(),
    }),
  );
}
