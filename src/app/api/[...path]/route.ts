import { NextRequest, NextResponse } from "next/server";
import { z, ZodError } from "zod";
import {
  all,
  one,
  run,
  id,
  now,
  audit,
  transaction,
  permissions,
  type Permission,
} from "@/lib/db";
import {
  AppError,
  authenticate,
  requirePermission,
  verifyPassword,
  hashPassword,
  createSession,
  hashToken,
  newToken,
  limit,
  encryptCredential,
  publicUser,
  type User,
} from "@/lib/auth";
import { radarAction } from "@/lib/radar";
import { loginSchema, inviteSchema, acceptSchema } from "@/lib/schemas";
import {
  coupons,
  sellers,
  groups,
  offers,
  getOffer,
  saveSeller,
  saveGroup,
  saveCoupon,
  saveOffer,
  seedDemo,
} from "@/lib/repository";
import {
  parseCoupons,
  generateMessage,
  priceHistory,
  sellerMismatch,
} from "@/lib/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const cookieName = "radar_session";
const cookieOptions = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "strict" as const,
  path: "/",
  maxAge: 7 * 86400,
});
function json(data: unknown, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}
async function body(req: NextRequest) {
  const reader = req.body?.getReader();
  if (!reader) return {};
  let size = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > 65536) {
      await reader.cancel();
      throw new AppError("O conteúdo é muito grande. Limite: 64 KB.", 413);
    }
    chunks.push(value);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new AppError("Envie dados JSON válidos.");
  }
}
function csrf(req: NextRequest) {
  const origin = req.headers.get("origin");
  const configured = process.env.APP_URL;
  if (process.env.NODE_ENV === "production" && !configured)
    throw new AppError(
      "Configure APP_URL no servidor antes de utilizar o aplicativo.",
      503,
    );
  const expected = new URL(configured || req.url).origin;
  if (!origin || origin !== expected)
    throw new AppError("Origem da solicitação não autorizada.", 403);
}
async function route(
  req: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  try {
    const parts = (await context.params).path;
    const [resource, key, action] = parts;
    if (parts.length > 3) throw new AppError("Página não encontrada.", 404);
    const method = req.method;
    const requestDemo = req.nextUrl.searchParams.get("dataset") === "demo";
    if (method !== "GET") csrf(req);
    if (resource === "auth" && key === "login" && method === "POST") {
      const input = loginSchema.parse(await body(req));
      limit("login:global", 200);
      limit(`login:${hashToken(input.email)}`, 10);
      const user = one<{ id: string; password_hash: string; active: number }>(
        "SELECT id,password_hash,active FROM users WHERE email=?",
        input.email,
      );
      const dummy = "0".repeat(32) + ":" + "0".repeat(128);
      const valid = verifyPassword(
        input.password,
        user?.password_hash || dummy,
      );
      if (!user || !valid || !user.active)
        throw new AppError("E-mail ou senha incorretos.", 401);
      const token = createSession(user.id);
      audit(user.id, "login", "user", user.id);
      const response = json({ user: publicUser(user.id) });
      response.cookies.set(cookieName, token, cookieOptions());
      return response;
    }
    if (resource === "auth" && key === "accept" && method === "POST") {
      limit("accept:global", 30);
      const input = acceptSchema.parse(await body(req));
      const created = transaction(() => {
        const invitation = one<{ id: string; email: string; name: string }>(
          "SELECT id,email,name FROM invitations WHERE token_hash=? AND used_at IS NULL AND expires_at>?",
          hashToken(input.token),
          now(),
        );
        if (!invitation)
          throw new AppError(
            "Convite inválido, utilizado ou expirado. Peça outro ao administrador.",
          );
        const userId = id();
        run(
          "INSERT INTO users (id,name,email,password_hash,role) VALUES (?,?,?,?,?)",
          userId,
          invitation.name,
          invitation.email,
          hashPassword(input.password),
          "operator",
        );
        run(
          "UPDATE invitations SET used_at=? WHERE id=?",
          now(),
          invitation.id,
        );
        audit(userId, "invitation_accepted", "user", userId);
        return userId;
      });
      const response = json({ user: publicUser(created) }, 201);
      response.cookies.set(cookieName, createSession(created), cookieOptions());
      return response;
    }
    if (resource === "auth" && key === "invitation" && method === "GET") {
      limit("invitation:global", 60);
      const token = z
        .string()
        .regex(/^[a-f0-9]{64}$/)
        .parse(req.nextUrl.searchParams.get("token"));
      const invitation = one(
        "SELECT name,email,expires_at FROM invitations WHERE token_hash=? AND used_at IS NULL AND expires_at>?",
        hashToken(token),
        now(),
      );
      if (!invitation) throw new AppError("Convite inválido ou expirado.", 404);
      return json(invitation);
    }
    const user = authenticate(req.cookies.get(cookieName)?.value);
    if (method !== "GET") limit(`write:${user.id}`, 120, 60000);
    if (resource === "auth" && key === "logout" && method === "POST") {
      run(
        "DELETE FROM sessions WHERE token_hash=?",
        hashToken(req.cookies.get(cookieName)!.value),
      );
      const response = json({ ok: true });
      response.cookies.set(cookieName, "", { ...cookieOptions(), maxAge: 0 });
      return response;
    }
    if (resource === "radar" && requestDemo && method !== "GET")
      throw new AppError(
        "Mude para Ofertas reais antes de configurar ou executar a API.",
      );
    if (resource === "radar")
      return json(
        await radarAction(
          user,
          key,
          action,
          method,
          method === "GET" ? undefined : await body(req),
        ),
      );
    if (resource === "state" && method === "GET")
      return json(
        state(
          user,
          z
            .enum(["real", "demo"])
            .default("real")
            .parse(req.nextUrl.searchParams.get("dataset") || undefined),
        ),
      );
    if (resource === "sellers" && method === "POST") {
      requirePermission(user, "sellers.manage");
      return json(
        { id: saveSeller(user, await body(req), undefined, requestDemo) },
        201,
      );
    }
    if (resource === "sellers" && key && method === "PATCH") {
      requirePermission(user, "sellers.manage");
      return json({ id: saveSeller(user, await body(req), key) });
    }
    if (resource === "groups" && method === "POST") {
      requirePermission(user, "groups.manage");
      return json(
        { id: saveGroup(user, await body(req), undefined, requestDemo) },
        201,
      );
    }
    if (resource === "groups" && key && method === "PATCH") {
      requirePermission(user, "groups.manage");
      return json({ id: saveGroup(user, await body(req), key) });
    }
    if (resource === "coupons" && key === "parse" && method === "POST") {
      requirePermission(user, "coupons.manage");
      const input = z
        .object({ text: z.string().min(1).max(20000) })
        .parse(await body(req));
      return json({
        candidates: parseCoupons(input.text),
        notice:
          "Revise cada cupom antes de salvar. Nenhum cupom foi verificado.",
      });
    }
    if (resource === "coupons" && !key && method === "POST") {
      requirePermission(user, "coupons.manage");
      return json(
        { id: saveCoupon(user, await body(req), undefined, requestDemo) },
        201,
      );
    }
    if (resource === "coupons" && key && !action && method === "PATCH") {
      requirePermission(user, "coupons.manage");
      return json({ id: saveCoupon(user, await body(req), key) });
    }
    if (
      resource === "coupons" &&
      key &&
      action === "verify" &&
      method === "POST"
    ) {
      requirePermission(user, "coupons.manage");
      const data = z
        .object({ evidence: z.string().trim().min(20).max(4000) })
        .parse(await body(req));
      const coupon = coupons().find((c) => c.id === key);
      if (!coupon) throw new AppError("Cupom não encontrado.", 404);
      if (!coupon.rules_reviewed)
        throw new AppError("Revise as regras antes de registrar evidência.");
      transaction(() => {
        run(
          "INSERT INTO coupon_verifications VALUES (?,?,?,?,?)",
          id(),
          key,
          user.id,
          data.evidence,
          now(),
        );
        run("UPDATE coupons SET status='verified' WHERE id=?", key);
        audit(user.id, "verification_declared", "coupon", key, {
          evidence: data.evidence,
        });
      });
      return json({ ok: true });
    }
    if (resource === "offers" && !key && method === "POST") {
      requirePermission(user, "offers.manage");
      return json(
        { id: saveOffer(user, await body(req), undefined, requestDemo) },
        201,
      );
    }
    if (resource === "offers" && key && !action && method === "PATCH") {
      requirePermission(user, "offers.manage");
      return json({ id: saveOffer(user, await body(req), key) });
    }
    if (
      resource === "offers" &&
      key &&
      action === "status" &&
      method === "POST"
    ) {
      const input = z
        .object({
          status: z.enum(["approved", "rejected", "saved", "draft"]),
          reason: z.string().trim().max(2000).default(""),
        })
        .parse(await body(req));
      requirePermission(
        user,
        input.status === "approved" || input.status === "rejected"
          ? "offers.approve"
          : "offers.manage",
      );
      const offer = getOffer(key);
      if (input.status === "approved") {
        if (
          offer.stock_quantity === 0 ||
          (offer.availability_status && offer.availability_status !== "active")
        )
          throw new AppError(
            "A API informou anúncio sem disponibilidade. Aguarde nova consulta com disponibilidade válida.",
          );
        if (offer.score.blocked)
          throw new AppError(
            "Vendedor de risco: aprovação bloqueada. Revise o cadastro e as evidências.",
          );
        if (offer.coupon && offer.calculation.state !== "eligible")
          throw new AppError(
            "Revise as regras do cupom ou remova-o antes de aprovar.",
          );
        if (Date.now() - Date.parse(offer.checked_at) > 86400000)
          throw new AppError(
            "Confira o preço e o vendedor novamente. A conferência tem mais de 24 horas.",
          );
        if (
          ["perfumes", "beleza", "eletronicos"].includes(offer.category) &&
          offer.seller.authenticity === "unknown" &&
          input.reason.length < 10
        )
          throw new AppError(
            "Autenticidade não verificada: registre o motivo da revisão humana (mínimo 10 caracteres).",
          );
        if (
          one(
            "SELECT id FROM alerts WHERE offer_id=? AND dismissed_at IS NULL",
            key,
          )
        )
          throw new AppError(
            "Resolva a divergência de vendedor com uma nova conferência antes de aprovar.",
          );
      }
      transaction(() => {
        run(
          "UPDATE offers SET status=?,updated_at=?,version=version+1 WHERE id=?",
          input.status,
          now(),
          key,
        );
        run(
          "INSERT INTO review_feedback VALUES (?,?,?,?,?,?)",
          id(),
          key,
          user.id,
          input.status,
          input.reason,
          now(),
        );
        audit(user.id, input.status, "offer", key, { reason: input.reason });
      });
      return json({ ok: true });
    }
    if (
      resource === "offers" &&
      key &&
      action === "check" &&
      method === "POST"
    ) {
      requirePermission(user, "offers.manage");
      const input = z
        .object({
          observed_seller_id: z.string().trim().min(1).max(100),
          price_cents: z.number().int().positive().max(1000000000),
          evidence: z.string().trim().min(5).max(2000),
        })
        .parse(await body(req));
      const offer = getOffer(key);
      const mismatch = sellerMismatch(
        offer.seller.platform_seller_id,
        input.observed_seller_id,
      );
      transaction(() => {
        if (mismatch)
          run(
            "INSERT INTO alerts VALUES (?,?,?,?,NULL)",
            id(),
            key,
            `Divergência: vendedor esperado ${offer.seller.platform_seller_id}; observado ${input.observed_seller_id}.`,
            now(),
          );
        else {
          run(
            "UPDATE listings SET price_cents=?,checked_at=?,source='Conferência manual',confidence='manual' WHERE id=?",
            input.price_cents,
            now(),
            offer.listing_id,
          );
          run(
            "INSERT INTO price_observations VALUES (?,?,?,?,?,?,?)",
            id(),
            offer.listing_id,
            input.price_cents,
            offer.shipping_cents,
            input.evidence,
            "manual",
            now(),
          );
          run("UPDATE alerts SET dismissed_at=? WHERE offer_id=?", now(), key);
        }
        run(
          "UPDATE offers SET status='draft',updated_at=?,version=version+1 WHERE listing_id=?",
          now(),
          offer.listing_id,
        );
        audit(user.id, "manual_check", "offer", key, { ...input, mismatch });
      });
      return json({
        ok: !mismatch,
        mismatch,
        message: mismatch
          ? "Vendedor divergente. Oferta voltou para revisão."
          : "Conferência manual registrada. Nenhuma consulta automática foi feita.",
      });
    }
    if (resource === "history" && key && method === "GET") {
      requirePermission(user, "offers.view");
      const offer = getOffer(key);
      const observations = all<{
        price_cents: number;
        observed_at: string;
        source: string;
        confidence: string;
      }>(
        "SELECT price_cents,observed_at,source,confidence FROM price_observations WHERE listing_id=? ORDER BY observed_at DESC",
        offer.listing_id,
      );
      return json({
        observations,
        summary: [30, 90, 180].map((days) => priceHistory(observations, days)),
      });
    }
    if (resource === "drafts" && !key && method === "POST") {
      requirePermission(user, "posts.prepare");
      const input = z
        .object({
          offer_id: z.string(),
          group_id: z.string(),
          style: z
            .enum(["informativo", "empolgado", "comercial"])
            .default("informativo"),
        })
        .parse(await body(req));
      const offer = getOffer(input.offer_id);
      if (!offer.group_ids.includes(input.group_id))
        throw new AppError(
          "Vincule a oferta ao grupo antes de criar a mensagem.",
        );
      if (!one("SELECT id FROM groups WHERE id=? AND active=1", input.group_id))
        throw new AppError("Grupo inativo.");
      const key = id();
      run(
        "INSERT INTO message_drafts (id,offer_id,group_id,content,style,updated_by,updated_at,copied_at,offer_version) VALUES (?,?,?,?,?,?,?,NULL,?)",
        key,
        offer.id,
        input.group_id,
        generateMessage(offer, input.style),
        input.style,
        user.id,
        now(),
        offer.version,
      );
      audit(user.id, "prepared", "message", key);
      return json({ id: key }, 201);
    }
    if (resource === "drafts" && key && method === "PATCH") {
      requirePermission(user, "posts.prepare");
      const input = z
        .object({ content: z.string().trim().min(1).max(12000) })
        .parse(await body(req));
      const draft = one<{ offer_id: string }>(
        "SELECT offer_id FROM message_drafts WHERE id=?",
        key,
      );
      if (!draft) throw new AppError("Mensagem não encontrada.", 404);
      const offer = getOffer(draft.offer_id);
      if (
        !one(
          "SELECT id FROM message_drafts WHERE id=? AND offer_version=?",
          key,
          offer.version,
        )
      )
        throw new AppError(
          "A oferta mudou. Gere uma nova mensagem com os dados atuais.",
        );
      transaction(() => {
        run(
          "UPDATE message_drafts SET content=?,updated_by=?,updated_at=?,copied_at=NULL WHERE id=?",
          input.content,
          user.id,
          now(),
          key,
        );
        audit(user.id, "edited", "message", key);
      });
      return json({ ok: true });
    }
    if (
      resource === "drafts" &&
      key &&
      action === "copy" &&
      method === "POST"
    ) {
      requirePermission(user, "posts.prepare");
      const draft = one<{ offer_id: string; offer_version: number }>(
        "SELECT offer_id,offer_version FROM message_drafts WHERE id=?",
        key,
      );
      if (!draft) throw new AppError("Mensagem não encontrada.", 404);
      if (draft.offer_version !== getOffer(draft.offer_id).version)
        throw new AppError(
          "A oferta mudou. Gere uma nova mensagem antes de copiar.",
        );
      run("UPDATE message_drafts SET copied_at=? WHERE id=?", now(), key);
      audit(user.id, "copy_declared", "message", key);
      return json({
        ok: true,
        notice: "Cópia registrada. Isso não é uma publicação.",
      });
    }
    if (resource === "publications" && method === "POST") {
      requirePermission(user, "posts.publish");
      const input = z
        .object({
          draft_id: z.string(),
          confirm: z.literal(true),
          allow_repeat: z.boolean().default(false),
        })
        .parse(await body(req));
      const draft = one<{
        id: string;
        offer_id: string;
        group_id: string;
        content: string;
        updated_at: string;
        offer_version: number;
      }>("SELECT * FROM message_drafts WHERE id=?", input.draft_id);
      if (!draft) throw new AppError("Mensagem não encontrada.", 404);
      const offer = getOffer(draft.offer_id);
      if (
        offer.stock_quantity === 0 ||
        (offer.availability_status && offer.availability_status !== "active")
      )
        throw new AppError(
          "A API informou anúncio sem disponibilidade. Revise a oferta.",
        );
      if (offer.status !== "approved" || offer.score.blocked)
        throw new AppError(
          "A oferta deve estar aprovada e com vendedor elegível.",
        );
      if (offer.coupon && offer.calculation.state !== "eligible")
        throw new AppError("O cupom deixou de ser elegível. Revise a oferta.");
      if (Date.now() - Date.parse(offer.checked_at) > 86400000)
        throw new AppError(
          "Confira novamente o preço e o vendedor antes de registrar a publicação.",
        );
      if (draft.offer_version !== offer.version)
        throw new AppError("A oferta mudou. Gere e revise uma nova mensagem.");
      if (
        !offer.group_ids.includes(draft.group_id) ||
        !one("SELECT id FROM groups WHERE id=? AND active=1", draft.group_id)
      )
        throw new AppError("O grupo não está ativo ou vinculado à oferta.");
      const repeated = one(
        "SELECT id FROM publications WHERE offer_id=? AND group_id=?",
        offer.id,
        draft.group_id,
      );
      if (repeated && !input.allow_repeat)
        throw new AppError(
          "Esta oferta já foi publicada neste grupo. Confirme conscientemente a republicação.",
          409,
        );
      const publicationId = id();
      transaction(() => {
        run(
          "INSERT INTO publications VALUES (?,?,?,?,?,?,?,?)",
          publicationId,
          offer.id,
          draft.group_id,
          draft.id,
          draft.content,
          user.id,
          now(),
          "manual_declaration",
        );
        audit(
          user.id,
          "manual_publication_declared",
          "publication",
          publicationId,
          { repeated: !!repeated },
        );
      });
      return json({ id: publicationId }, 201);
    }
    if (resource === "users" && key === "invite" && method === "POST") {
      requirePermission(user, "users.manage");
      const input = inviteSchema.parse(await body(req));
      const token = newToken(),
        invitationId = id();
      transaction(() => {
        if (one("SELECT id FROM users WHERE email=?", input.email))
          throw new AppError("Já existe uma conta com este e-mail.");
        run(
          "UPDATE invitations SET used_at=? WHERE email=? AND used_at IS NULL",
          now(),
          input.email,
        );
        run(
          "INSERT INTO invitations VALUES (?,?,?,?,?,?,?)",
          invitationId,
          input.email,
          input.name,
          hashToken(token),
          new Date(Date.now() + 48 * 3600000).toISOString(),
          null,
          user.id,
        );
        audit(user.id, "invited", "user", invitationId, { email: input.email });
      });
      return json(
        {
          url: `${process.env.APP_URL || new URL(req.url).origin}/?convite=${token}`,
          notice:
            "Envie este link ao sócio por um canal privado. Expira em 48 horas; aparece somente agora.",
        },
        201,
      );
    }
    if (
      resource === "users" &&
      key &&
      action === "permissions" &&
      method === "PATCH"
    ) {
      requirePermission(user, "users.manage");
      const input = z
        .object({
          permissions: z
            .array(
              z.object({
                permission: z.enum(permissions),
                allowed: z.boolean(),
              }),
            )
            .max(permissions.length),
          active: z.boolean(),
        })
        .parse(await body(req));
      const target = one<{ role: string }>(
        "SELECT role FROM users WHERE id=?",
        key,
      );
      if (!target) throw new AppError("Usuário não encontrado.", 404);
      if (target.role === "owner")
        throw new AppError(
          "O administrador principal não pode ser alterado por este formulário.",
        );
      if (
        input.permissions.some(
          (p) =>
            p.allowed &&
            ["users.manage", "integrations.manage", "settings.manage"].includes(
              p.permission,
            ),
        )
      )
        throw new AppError(
          "Credenciais, usuários e configurações financeiras são exclusivos do administrador.",
        );
      transaction(() => {
        run("UPDATE users SET active=? WHERE id=?", +input.active, key);
        for (const p of input.permissions)
          run(
            "INSERT INTO user_permissions VALUES (?,?,?) ON CONFLICT(user_id,permission) DO UPDATE SET allowed=excluded.allowed",
            key,
            p.permission,
            +p.allowed,
          );
        run("DELETE FROM sessions WHERE user_id=?", key);
        audit(user.id, "permissions_updated", "user", key, input);
      });
      return json({ ok: true });
    }
    if (
      resource === "users" &&
      key &&
      action === "password" &&
      method === "POST"
    ) {
      requirePermission(user, "users.manage");
      if (!one("SELECT id FROM users WHERE id=?", key))
        throw new AppError("Usuário não encontrado.", 404);
      const input = z
        .object({
          password: z.string().min(12).max(128),
          current_password: z.string().max(128),
        })
        .parse(await body(req));
      const owner = one<{ password_hash: string }>(
        "SELECT password_hash FROM users WHERE id=?",
        user.id,
      )!;
      limit(`password:${user.id}`, 5);
      if (!verifyPassword(input.current_password, owner.password_hash))
        throw new AppError("Senha atual do administrador incorreta.", 403);
      transaction(() => {
        run(
          "UPDATE users SET password_hash=? WHERE id=?",
          hashPassword(input.password),
          key,
        );
        run("DELETE FROM sessions WHERE user_id=?", key);
        audit(user.id, "password_reset", "user", key);
      });
      return json({ ok: true });
    }
    if (resource === "integrations" && key && method === "PATCH") {
      requirePermission(user, "integrations.manage");
      const input = z
        .object({ credential: z.string().trim().min(1).max(10000) })
        .parse(await body(req));
      if (!one("SELECT id FROM integrations WHERE id=?", key))
        throw new AppError("Plataforma não encontrada.", 404);
      const cipher = encryptCredential(input.credential);
      transaction(() => {
        run(
          "UPDATE integrations SET credential_ciphertext=?,status='configured',error_message='Credencial guardada; API ainda não implementada nem validada.' WHERE id=?",
          cipher,
          key,
        );
        audit(user.id, "credential_stored", "integration", key);
      });
      return json({ ok: true });
    }
    if (resource === "demo" && method === "POST") {
      requirePermission(user, "settings.manage");
      seedDemo(user);
      return json({ ok: true }, 201);
    }
    throw new AppError("Operação não encontrada.", 404);
  } catch (error) {
    if (error instanceof AppError)
      return json({ error: error.message }, error.status);
    if (error instanceof ZodError)
      return json(
        {
          error: "Confira os campos informados.",
          fields: error.issues.map((i) => ({
            field: i.path.join("."),
            message: i.message,
          })),
        },
        400,
      );
    if (
      error instanceof Error &&
      /UNIQUE constraint failed/.test(error.message)
    )
      return json(
        {
          error:
            "Este registro já existe. Para ofertas, confira produto, vendedor, variação e a janela diária de duplicidade.",
        },
        409,
      );
    // Não registrar objetos de requisição, senhas, tokens ou parâmetros SQL.
    console.error(
      "Falha interna na operação:",
      error instanceof Error ? error.name : "UnknownError",
    );
    return json(
      {
        error:
          "Não foi possível concluir a operação. Tente novamente ou consulte o administrador.",
      },
      500,
    );
  }
}
function state(user: User, dataset: "real" | "demo" = "real") {
  const demo = dataset === "demo" ? 1 : 0;
  const can = (p: Permission) => user.permissions.includes(p);
  return {
    server_time: now(),
    dataset,
    datasets: {
      real_offers: one<{ count: number }>(
        "SELECT count(*) count FROM offers WHERE demo=0",
      )!.count,
      demo_offers: one<{ count: number }>(
        "SELECT count(*) count FROM offers WHERE demo=1",
      )!.count,
    },
    user,
    offers: can("offers.view") ? offers().filter((o) => o.demo === demo) : [],
    sellers:
      can("offers.view") || can("sellers.manage")
        ? sellers().filter((s) => s.demo === demo)
        : [],
    coupons:
      can("offers.view") || can("coupons.manage")
        ? coupons().filter((c) => c.demo === demo)
        : [],
    groups:
      can("offers.view") || can("groups.manage") || can("posts.prepare")
        ? groups().filter((g) => g.demo === demo)
        : [],
    drafts: can("posts.prepare")
      ? all(
          "SELECT d.*,o.version current_offer_version,g.name group_name,p.title offer_title,o.demo FROM message_drafts d JOIN groups g ON g.id=d.group_id JOIN offers o ON o.id=d.offer_id JOIN listings l ON l.id=o.listing_id JOIN products p ON p.id=l.product_id WHERE o.demo=? ORDER BY d.updated_at DESC",
          demo,
        )
      : [],
    publications:
      can("posts.prepare") || can("posts.publish")
        ? all(
            "SELECT p.*,g.name group_name,u.name operator_name FROM publications p JOIN groups g ON g.id=p.group_id JOIN users u ON u.id=p.declared_by JOIN offers o ON o.id=p.offer_id WHERE o.demo=? ORDER BY p.declared_at DESC",
            demo,
          )
        : [],
    integrations: all(
      "SELECT i.id,p.name,i.status,i.capabilities,i.last_sync_at,i.error_message,i.rate_limit,CASE WHEN i.credential_ciphertext IS NULL THEN 0 ELSE 1 END credential_present FROM integrations i JOIN platforms p ON p.id=i.id",
    ),
    alerts: can("offers.view")
      ? all(
          "SELECT a.* FROM alerts a JOIN offers o ON o.id=a.offer_id WHERE a.dismissed_at IS NULL AND o.demo=? ORDER BY a.created_at DESC",
          demo,
        )
      : [],
    users:
      user.role === "owner"
        ? all<{
            id: string;
            name: string;
            email: string;
            role: string;
            active: number;
          }>("SELECT id,name,email,role,active FROM users").map((u) => ({
            ...u,
            permissions: publicUser(u.id)?.permissions || [],
          }))
        : [],
    invitations:
      user.role === "owner"
        ? all(
            "SELECT id,name,email,expires_at,used_at FROM invitations ORDER BY expires_at DESC",
          )
        : [],
    audit: can("audit.view")
      ? all(
          "SELECT a.*,u.name user_name FROM audit_logs a LEFT JOIN users u ON u.id=a.user_id ORDER BY a.created_at DESC LIMIT 200",
        )
      : [],
  };
}
export { route as GET, route as POST, route as PATCH };
