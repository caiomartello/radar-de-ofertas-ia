import { randomBytes } from "node:crypto";
import {
  AppError,
  hashToken,
  encryptCredential,
  decryptCredential,
} from "./auth";
import { one, run, transaction, now } from "./db";

// O domínio público nunca recebe cookies de login. A troca de código só acontece depois do retorno ao navegador local.
export function createHandoff(params: URLSearchParams, redirectUri: string) {
  const states = params.getAll("state");
  if (states.length !== 1 || !/^[A-Za-z0-9_-]{43}$/.test(states[0]))
    throw new AppError("Retorno inválido.");
  const codes = params.getAll("code"),
    errors = params.getAll("error");
  if (
    (codes.length === 1) === (errors.length === 1) ||
    codes.length > 1 ||
    errors.length > 1 ||
    (codes.length &&
      (!codes[0] || codes[0].length > 4096 || /\s/.test(codes[0])))
  )
    throw new AppError("Retorno inválido.");
  const clean = new URLSearchParams({ state: states[0] });
  if (codes.length) clean.set("code", codes[0]);
  else clean.set("error", "access_denied");
  return transaction(() => {
    run("DELETE FROM meli_oauth_handoffs WHERE expires_at<=?", now());
    const state = one<{ expires_at: string }>(
      "SELECT expires_at FROM meli_oauth_states WHERE state_hash=? AND redirect_uri=? AND expires_at>?",
      hashToken(states[0]),
      redirectUri,
      now(),
    );
    if (!state) throw new AppError("Retorno inválido ou expirado.");
    const count = one<{ total: number }>(
      "SELECT count(*) total FROM meli_oauth_handoffs WHERE state_hash=?",
      hashToken(states[0]),
    )!;
    if (count.total >= 5)
      throw new AppError("Reinicie a conexão pelo Radar.", 429);
    const ticket = randomBytes(32).toString("base64url");
    run(
      "INSERT INTO meli_oauth_handoffs VALUES (?,?,?,?)",
      hashToken(ticket),
      hashToken(states[0]),
      encryptCredential(clean.toString()),
      state.expires_at,
    );
    return ticket;
  });
}
export function consumeHandoff(ticket: string, browser: string | undefined) {
  if (
    !/^[A-Za-z0-9_-]{43}$/.test(ticket) ||
    !browser ||
    !/^[A-Za-z0-9_-]{43}$/.test(browser)
  )
    throw new AppError("Retorno local inválido.");
  return transaction(() => {
    const h = one<{ params_ciphertext: string }>(
      "SELECT h.params_ciphertext FROM meli_oauth_handoffs h JOIN meli_oauth_states s ON s.state_hash=h.state_hash WHERE h.ticket_hash=? AND h.expires_at>? AND s.expires_at>? AND s.browser_hash=?",
      hashToken(ticket),
      now(),
      now(),
      hashToken(browser),
    );
    if (!h) throw new AppError("Retorno local inválido, expirado ou usado.");
    run(
      "DELETE FROM meli_oauth_handoffs WHERE ticket_hash=?",
      hashToken(ticket),
    );
    return new URLSearchParams(decryptCredential(h.params_ciphertext));
  });
}
