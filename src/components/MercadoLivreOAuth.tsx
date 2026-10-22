"use client";
import { useEffect, useState, type FormEvent } from "react";
import { dateTime } from "@/lib/domain";

type OAuthStatus = {
  configured: boolean;
  client_id: string;
  secret_present: boolean;
  redirect_uri: string | null;
  https_ready: boolean;
  callback_mode: "tunnel" | "direct";
  local_http: boolean;
  connected: boolean;
  needs_reconnection: boolean;
  account_id: string | null;
  expires_at: string | null;
  refresh_supported: boolean;
  error: string | null;
};
async function api<T>(operation: string, payload?: unknown): Promise<T> {
  const res = await fetch("/api/oauth/mercado-livre/" + operation, {
    method: payload === undefined ? "GET" : "POST",
    cache: "no-store",
    headers:
      payload === undefined ? {} : { "Content-Type": "application/json" },
    body: payload === undefined ? undefined : JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok)
    throw new Error(data.error || "Não foi possível concluir a conexão.");
  return data;
}
export function MercadoLivreOAuth({
  onChange,
}: {
  onChange: () => Promise<unknown>;
}) {
  const [data, setData] = useState<OAuthStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState(false);
  useEffect(() => {
    let mounted = true;
    const load = () =>
      api<OAuthStatus>("config")
        .then((d) => {
          if (mounted) setData(d);
        })
        .catch(() => {
          if (mounted) {
            setError(true);
            setMessage("Não foi possível ler a configuração OAuth.");
          }
        });
    void load();
    const timer = setInterval(() => void load(), 15000);
    return () => {
      mounted = false;
      clearInterval(timer);
    };
  }, []);
  async function action(fn: () => Promise<{ message?: string }>) {
    setBusy(true);
    setMessage("");
    try {
      const result = await fn();
      setData(await api<OAuthStatus>("config"));
      await onChange();
      setError(false);
      setMessage(result.message || "Concluído.");
    } catch (e) {
      setError(true);
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function connect() {
    setBusy(true);
    setMessage("");
    try {
      const result = await api<{ authorization_url: string }>("start", {});
      window.location.assign(result.authorization_url);
    } catch (e) {
      setBusy(false);
      setError(true);
      setMessage((e as Error).message);
    }
  }
  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    void action(async () => {
      try {
        return await api<{ message: string }>("config", {
          client_id: String(values.get("client_id") || ""),
          client_secret: String(values.get("client_secret") || ""),
        });
      } finally {
        const secret = form.elements.namedItem(
          "client_secret",
        ) as HTMLInputElement;
        secret.value = "";
      }
    });
  }
  return (
    <div className="oauth-connection">
      <h3>Conectar com Mercado Livre por OAuth</h3>
      <p>
        Preencha os dados da sua aplicação somente aqui. O Client Secret fica
        cifrado no servidor e não é devolvido ao navegador.
      </p>
      {data && (
        <>
          <label className="field">
            <span>URI de redirect para cadastrar no DevCenter</span>
            <input
              readOnly
              value={data.redirect_uri || ""}
              placeholder="Disponível após verificar o callback HTTPS"
              onFocus={(e) => e.currentTarget.select()}
            />
          </label>
          {!data.https_ready && (
            <p className="notice warning">
              O DevCenter exige HTTPS. Feche a janela atual e abra
              INICIAR_RADAR_HTTPS.cmd. Aguarde “CALLBACK HTTPS VERIFICADO” e
              volte aqui. A URI só aparece depois que o retorno chega ao Radar.
            </p>
          )}
          {data.https_ready && data.callback_mode === "tunnel" && (
            <p className="notice">
              Callback HTTPS verificado nesta abertura. Somente o retorno OAuth
              passa pelo túnel; continue usando o dashboard local. Ao reiniciar
              o túnel, atualize a URI no DevCenter.
            </p>
          )}
          <p>
            {data.connected
              ? data.needs_reconnection
                ? `Reconecte a conta ${data.account_id}.`
                : `Conta conectada: ${data.account_id}.`
              : "Nenhuma conta conectada por OAuth."}{" "}
            {data.expires_at &&
              `Expiração do token: ${dateTime(data.expires_at)}.`}{" "}
            {data.connected &&
              (data.refresh_supported
                ? "A API forneceu renovação; o Radar renova antes das consultas quando necessário."
                : "A API não forneceu refresh token; reconecte quando expirar.")}
          </p>
          {data.error && <p className="notice warning">{data.error}</p>}
        </>
      )}
      {message && (
        <p
          className={`notice ${error ? "warning" : ""}`}
          role={error ? "alert" : "status"}
        >
          {message}
        </p>
      )}
      <form onSubmit={save}>
        <div className="form-grid">
          <label className="field">
            <span>Client ID da aplicação</span>
            <input
              name="client_id"
              inputMode="numeric"
              pattern="[0-9]{5,30}"
              required
              key={data?.client_id || "empty"}
              defaultValue={data?.client_id || ""}
              autoComplete="off"
            />
          </label>
          <label className="field">
            <span>Client Secret da aplicação</span>
            <input
              name="client_secret"
              type="password"
              minLength={10}
              maxLength={1000}
              required
              autoComplete="new-password"
            />
          </label>
        </div>
        <button className="button secondary" disabled={busy}>
          Salvar aplicação com segurança
        </button>
        {data?.secret_present && (
          <small>
            Client Secret já guardado. Para substituí-lo, preencha novamente os
            dois campos.
          </small>
        )}
      </form>
      <div className="button-row">
        <button
          className="button primary"
          disabled={busy || !data?.configured || !data.https_ready}
          onClick={() => void connect()}
        >
          Conectar com Mercado Livre
        </button>
        <button
          className="button secondary"
          disabled={busy}
          onClick={() =>
            void action(async () => ({
              message: "Estado do receptor HTTPS atualizado.",
            }))
          }
        >
          Atualizar verificação HTTPS
        </button>
        <button
          className="button secondary"
          disabled={busy || !data?.refresh_supported}
          onClick={() => void action(() => api("refresh", {}))}
        >
          Renovar token agora
        </button>
      </div>
      <p className="muted">
        A autorização abre no site oficial. Depois do retorno, use “Testar
        autorização de busca” abaixo. OAuth não garante acesso à busca de
        produtos e não gera links de afiliados. Não compartilhe segredos pelo
        chat.
      </p>
    </div>
  );
}
