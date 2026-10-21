"use client";
import { useEffect, useState, type FormEvent } from "react";
import {
  Radar,
  RefreshCw,
  LockKeyhole,
  Clock3,
  AlertTriangle,
} from "lucide-react";
import { dateTime } from "@/lib/domain";

type RadarData = {
  connection: {
    status: string;
    credential_present: number;
    verified_at: string | null;
    last_sync_at: string | null;
    error_message: string | null;
    cooldown_until: string | null;
    rate_limit: string;
  };
  jobs: {
    id: string;
    query: string;
    enabled: number;
    interval_minutes: number;
    last_run_at: string | null;
    next_run_at: string;
    lease_until: string | null;
  }[];
  runs: {
    id: string;
    query: string | null;
    status: string;
    started_at: string;
    finished_at: string | null;
    found_count: number;
    imported_count: number;
    updated_count: number;
    skipped_count: number;
    requests_count: number;
    error_message: string | null;
    details: string;
  }[];
  worker_last_seen: string | null;
  server_time: string;
};
const labels: Record<string, string> = {
  not_configured: "Acesso de API não configurado",
  configured: "Token guardado; autorização não testada",
  active: "Consulta de busca autorizada no último teste",
  permission_denied: "Consulta bloqueada (HTTP 403)",
  reauthorization_required: "Token recusado ou expirado",
  contract_error: "Formato da API exige revisão",
};
async function request<T>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const response = await fetch("/api/radar/" + path, {
    method,
    headers: method === "GET" ? {} : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  const data = await response.json();
  if (!response.ok)
    throw new Error(data.error || "Não foi possível concluir a operação.");
  return data;
}
export function AutomaticRadar({
  owner,
  canRun,
  onSync,
  configuration = false,
  configure,
}: {
  owner: boolean;
  canRun: boolean;
  onSync: () => Promise<unknown>;
  configuration?: boolean;
  configure?: () => void;
}) {
  const [data, setData] = useState<RadarData | null>(null),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState(false);
  async function refresh() {
    setData(await request<RadarData>("state"));
  }
  useEffect(() => {
    let mounted = true;
    request<RadarData>("state")
      .then((d) => {
        if (mounted) setData(d);
      })
      .catch((e) => {
        if (mounted) {
          setMessage(e.message);
          setError(true);
        }
      });
    return () => {
      mounted = false;
    };
  }, []);
  async function action(
    fn: () => Promise<{ message?: string }>,
    success: string,
  ) {
    setBusy(true);
    setMessage("");
    try {
      const result = await fn();
      await refresh();
      await onSync();
      setMessage(result.message || success);
      setError(false);
    } catch (e) {
      setMessage((e as Error).message);
      setError(true);
      try {
        await refresh();
        await onSync();
      } catch {
        /* Manter o erro original. */
      }
    } finally {
      setBusy(false);
    }
  }
  const c = data?.connection;
  const workerActive = !!(
    data?.worker_last_seen &&
    Date.parse(data.server_time) - Date.parse(data.worker_last_seen) < 120000
  );
  function tokenSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const fields = new FormData(form);
    void action(async () => {
      const result = await request<{ message: string }>("credentials", "POST", {
        access_token: String(fields.get("token") || "").trim(),
        authorized: fields.has("authorized"),
      });
      form.reset();
      return result;
    }, "Token guardado.");
  }
  return (
    <section className="panel automatic-radar">
      <div className="panel-title">
        <div>
          <h2>
            <Radar size={20} /> Radar automático · Mercado Livre
          </h2>
          <p>
            Consultas pela API oficial, com histórico de execução. Cada anúncio
            importado volta para revisão.
          </p>
        </div>
        <button
          className="button secondary"
          disabled={busy}
          onClick={() =>
            action(async () => {
              await refresh();
              return {};
            }, "Estado atualizado.")
          }
        >
          <RefreshCw size={15} /> Atualizar estado
        </button>
      </div>
      {message && (
        <div
          className={`notice ${error ? "warning" : ""}`}
          role={error ? "alert" : "status"}
        >
          <AlertTriangle size={18} />
          {message}
        </div>
      )}
      <div className="radar-status">
        <strong>
          {c ? labels[c.status] || c.status : "Consultando estado…"}
        </strong>
        <span>
          Última autorização:{" "}
          {c?.verified_at ? dateTime(c.verified_at) : "Nunca"}
        </span>
        <span>
          Última sincronização:{" "}
          {c?.last_sync_at ? dateTime(c.last_sync_at) : "Nunca"}
        </span>
        <span>
          <Clock3 size={14} /> Agendador:{" "}
          {workerActive
            ? "processo local detectado"
            : "não detectado; use o iniciador atualizado ou npm run radar:worker"}
        </span>
      </div>
      {c?.error_message && (
        <div className="notice warning">{c.error_message}</div>
      )}
      {c?.status !== "active" && (
        <div className="notice warning">
          <LockKeyhole size={19} />
          <div>
            <strong>Conta de afiliado não é autorização de API.</strong>
            <p>
              É necessário cadastrar uma aplicação no DevCenter e confirmar
              permissão para a busca de catálogo. Um token pode ser recusado
              mesmo com conta de afiliado. Nenhuma oferta será criada até a API
              aceitar a consulta.
            </p>
            <a
              href="https://developers.mercadolivre.com.br/pt_br/autenticacao-e-autorizacao"
              target="_blank"
              rel="noopener noreferrer"
            >
              Consultar documentação oficial
            </a>
            {!configuration && owner && configure && (
              <button className="text-button" onClick={configure}>
                Abrir Integrações
              </button>
            )}
          </div>
        </div>
      )}
      {configuration && owner && (
        <>
          <form onSubmit={tokenSubmit}>
            <h3>Credencial da API (somente administrador)</h3>
            <label className="field">
              <span>
                Access token obtido pelo fluxo autorizado da plataforma
              </span>
              <input
                aria-label="Access token obtido pelo fluxo autorizado da plataforma"
                name="token"
                type="password"
                autoComplete="off"
                required
                minLength={10}
                maxLength={10000}
              />
              <small>
                Não é sua senha do Mercado Livre, código de afiliado ou link de
                produto. Guardado cifrado e nunca devolvido à interface.
              </small>
            </label>
            <label className="check-field">
              <input name="authorized" type="checkbox" required /> Confirmo que
              tenho autorização para usar este token e consultar dados pela API.
            </label>
            <button className="button primary" disabled={busy}>
              Cifrar e salvar token
            </button>
          </form>
          <div className="button-row">
            <button
              className="button secondary"
              disabled={busy || !c?.credential_present}
              onClick={() =>
                action(
                  () => request("test", "POST", {}),
                  "Teste concluído. Nenhum resultado foi simulado.",
                )
              }
            >
              Testar autorização de busca
            </button>
            <button
              className="button danger"
              disabled={busy || !c?.credential_present}
              onClick={() => {
                if (
                  window.confirm(
                    "Desconectar o Mercado Livre e desligar os agendamentos? Ofertas e histórico serão mantidos.",
                  )
                )
                  void action(
                    () => request("disconnect", "POST", {}),
                    "Conector desconectado. Dados preservados.",
                  );
              }}
            >
              Desconectar
            </button>
          </div>
          <p className="muted">
            A renovação automática por OAuth ainda não está implementada. Se o
            token expirar, cadastre um novo token obtido pelo fluxo oficial. Não
            há geração automática de links de afiliados.
          </p>
        </>
      )}
      {owner && (
        <form
          className="radar-job-form"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            void action(
              () =>
                request("jobs", "POST", {
                  query: String(f.get("query") || ""),
                  interval_minutes: Number(f.get("interval_minutes")),
                }),
              "Busca salva.",
            );
          }}
        >
          <h3>Salvar uma busca</h3>
          <div className="form-grid">
            <label className="field">
              <span>Termo de busca</span>
              <input
                name="query"
                required
                minLength={2}
                maxLength={100}
                placeholder="Ex.: cafeteira, ferramentas, perfume"
              />
            </label>
            <label className="field">
              <span>Intervalo de atualização</span>
              <select name="interval_minutes" defaultValue="60">
                <option value="30">A cada 30 minutos</option>
                <option value="60">A cada 1 hora</option>
                <option value="120">A cada 2 horas</option>
                <option value="360">A cada 6 horas</option>
                <option value="1440">Uma vez por dia</option>
              </select>
            </label>
          </div>
          <button className="button secondary" disabled={busy}>
            Salvar busca com agendamento desligado
          </button>
        </form>
      )}
      <div className="radar-jobs">
        {data?.jobs.map((job) => (
          <article key={job.id}>
            <div>
              <strong>{job.query}</strong>
              <small>
                {job.enabled
                  ? "Agendamento habilitado"
                  : "Agendamento desligado"}{" "}
                · intervalo de {job.interval_minutes} min · última execução:{" "}
                {job.last_run_at ? dateTime(job.last_run_at) : "Nunca"}
              </small>
            </div>
            <div className="button-row">
              {canRun && (
                <button
                  className="button primary"
                  disabled={
                    busy ||
                    c?.status !== "active" ||
                    !!(job.lease_until && job.lease_until > data.server_time)
                  }
                  onClick={() =>
                    action(
                      () => request("run/" + job.id, "POST", {}),
                      "Busca concluída.",
                    )
                  }
                >
                  Buscar agora na API
                </button>
              )}
              {owner && (
                <button
                  className="button secondary"
                  disabled={busy || (!job.enabled && c?.status !== "active")}
                  onClick={() => {
                    if (
                      !job.enabled &&
                      !window.confirm(
                        "Confirma que sua aplicação permite consultas recorrentes e autoriza este agendamento? O processo local precisa permanecer aberto.",
                      )
                    )
                      return;
                    void action(
                      () =>
                        request("jobs/" + job.id, "PATCH", {
                          enabled: !job.enabled,
                          authorized: !job.enabled,
                        }),
                      "Agendamento atualizado.",
                    );
                  }}
                >
                  {job.enabled
                    ? "Desligar agendamento"
                    : "Habilitar agendamento"}
                </button>
              )}
            </div>
          </article>
        ))}
      </div>
      {!data?.jobs.length && (
        <p className="muted">
          Nenhuma busca salva. Salvar a configuração não executa uma consulta
          externa.
        </p>
      )}
      <p className="muted">
        {c?.rate_limit} Não são chamados serviços pagos por este aplicativo.
        Limites e autorização da plataforma continuam aplicáveis. Links comuns
        não são transformados em afiliados.
      </p>
      <details>
        <summary>
          Histórico das últimas execuções ({data?.runs.length ?? 0})
        </summary>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Horário</th>
                <th>Busca</th>
                <th>Resultado</th>
                <th>Recebidos / novos / atualizados / ignorados</th>
                <th>Requisições</th>
              </tr>
            </thead>
            <tbody>
              {data?.runs.map((r) => (
                <tr key={r.id}>
                  <td>{dateTime(r.started_at)}</td>
                  <td>{r.query || "Teste de autorização"}</td>
                  <td>
                    {(
                      {
                        success: "Concluída",
                        failed: "Falhou",
                        running: "Em execução",
                        interrupted: "Interrompida",
                      } as Record<string, string>
                    )[r.status] || r.status}
                    {r.error_message && <small>{r.error_message}</small>}
                    <details>
                      <summary>Detalhes</summary>
                      <pre>{r.details}</pre>
                    </details>
                  </td>
                  <td>
                    {r.found_count} / {r.imported_count} / {r.updated_count} /{" "}
                    {r.skipped_count}
                  </td>
                  <td>{r.requests_count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  );
}
