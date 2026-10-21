import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { AppError, authenticate, requirePermission, limit } from "./auth";
import {
  MELI_FLOW_COOKIE,
  MELI_CALLBACK_PATH,
  meliAppUrl,
  meliOAuthStatus,
  saveMeliOAuthConfig,
  beginMeliOAuth,
  finishMeliOAuth,
  refreshMeliToken,
} from "./meli-oauth";
import type { ApiTransport } from "./mercado-livre";

const headers = {
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
  Pragma: "no-cache",
};
const flowCookieOptions = () => ({
  httpOnly: true,
  sameSite: "lax" as const,
  secure: meliAppUrl().protocol === "https:",
  path: MELI_CALLBACK_PATH,
  maxAge: 600,
});
function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers });
}
async function configBody(req: NextRequest) {
  const reader = req.body?.getReader();
  if (!reader) throw new AppError("Preencha os dados da aplicação.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const part = await reader.read();
    if (part.done) break;
    size += part.value.length;
    if (size > 4096) {
      await reader.cancel();
      throw new AppError("Dados da aplicação muito grandes.", 413);
    }
    chunks.push(part.value);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new AppError("Envie dados JSON válidos.");
  }
}
export async function handleMeliOAuth(
  req: NextRequest,
  operation: "config" | "start" | "callback" | "refresh",
  transport?: ApiTransport,
) {
  try {
    const app = meliAppUrl();
    // Next pode montar req.url com o hostname interno do listener. O Host público deve coincidir com APP_URL.
    if (
      (req.headers.get("host") || req.nextUrl.host).toLowerCase() !==
      app.host.toLowerCase()
    )
      throw new AppError(
        "Abra o Radar pelo endereço configurado em APP_URL.",
        403,
      );
    if (operation === "callback") {
      if (req.method !== "GET")
        return json({ error: "Método não permitido." }, 405);
      let outcome = "failed";
      try {
        outcome = await finishMeliOAuth(
          req.nextUrl.searchParams,
          req.cookies.get(MELI_FLOW_COOKIE)?.value,
          transport,
        );
      } catch {
        /* Nunca refletir code, state, mensagens do provedor ou tokens no retorno. */
      }
      const target = new URL("/", app);
      target.searchParams.set("meli_oauth", outcome);
      const res = NextResponse.redirect(target, { status: 303, headers });
      res.cookies.set(MELI_FLOW_COOKIE, "", {
        ...flowCookieOptions(),
        maxAge: 0,
      });
      return res;
    }
    const session = req.cookies.get("radar_session")?.value;
    const user = authenticate(session);
    requirePermission(user, "integrations.manage");
    if (operation === "config" && req.method === "GET")
      return json(meliOAuthStatus(user));
    if (req.method !== "POST")
      return json({ error: "Método não permitido." }, 405);
    if (req.headers.get("origin") !== app.origin)
      throw new AppError("Origem da solicitação não autorizada.", 403);
    limit(`meli:oauth:write:${user.id}`, 20, 60000);
    if (operation === "config")
      return json(saveMeliOAuthConfig(user, await configBody(req)));
    if (operation === "start") {
      const { authorization_url, browser } = beginMeliOAuth(user, session!);
      const res = json({ authorization_url });
      res.cookies.set(MELI_FLOW_COOKIE, browser, flowCookieOptions());
      return res;
    }
    await refreshMeliToken(transport);
    return json({
      message:
        "Token renovado pela API. A permissão de busca continua independente.",
    });
  } catch (e) {
    if (e instanceof ZodError)
      return json(
        {
          error:
            "Confira o Client ID numérico e o Client Secret. Não envie esses valores pelo chat.",
        },
        400,
      );
    return json(
      {
        error:
          e instanceof AppError
            ? e.message
            : "Não foi possível concluir o OAuth. Confira a configuração e tente conectar novamente.",
      },
      e instanceof AppError ? e.status : 500,
    );
  }
}
