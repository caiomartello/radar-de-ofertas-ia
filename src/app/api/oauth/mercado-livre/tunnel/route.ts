import { NextRequest, NextResponse } from "next/server";
import { AppError, limit } from "@/lib/auth";
import {
  checkGatewayKey,
  gatewayProof,
  markTunnelVerified,
} from "@/lib/meli-https";
import { createHandoff } from "@/lib/meli-handoff";
import {
  meliAppUrl,
  MELI_CALLBACK_PATH,
  meliRedirectUri,
} from "@/lib/meli-oauth";
import { run } from "@/lib/db";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = {
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
};
async function handler(req: NextRequest) {
  try {
    checkGatewayKey(req.headers.get("x-radar-gateway-key"));
    const app = meliAppUrl();
    if (!["localhost", "127.0.0.1"].includes(app.hostname))
      throw new AppError(
        "Receptor disponível apenas em instalação local.",
        403,
      );
    if (req.method === "GET")
      return NextResponse.json(
        { proof: gatewayProof(req.nextUrl.searchParams.get("nonce") || "") },
        { headers },
      );
    const reader = req.body?.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    if (!reader) throw new AppError("Conteúdo ausente.");
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.length;
      if (size > 16384) {
        await reader.cancel();
        throw new AppError("Conteúdo muito grande.", 413);
      }
      chunks.push(part.value);
    }
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (body.operation === "verified") {
      markTunnelVerified(body.nonce, body.proof);
      return NextResponse.json({ ok: true }, { headers });
    }
    if (body.operation === "unavailable") {
      run("DELETE FROM radar_runtime WHERE key='meli_https_verified'");
      return NextResponse.json({ ok: true }, { headers });
    }
    if (body.operation !== "callback" || typeof body.query !== "string")
      throw new AppError("Operação inválida.");
    limit("meli:public_callback", 60, 60000);
    const ticket = createHandoff(
      new URLSearchParams(body.query),
      meliRedirectUri(),
    );
    const target = new URL(MELI_CALLBACK_PATH, app);
    target.searchParams.set("handoff", ticket);
    return NextResponse.json({ location: target.href }, { headers });
  } catch (e) {
    return NextResponse.json(
      {
        error:
          "Não foi possível validar o receptor HTTPS. Reinicie a conexão pelo Radar.",
      },
      { status: e instanceof AppError ? e.status : 400, headers },
    );
  }
}
export { handler as GET, handler as POST };
