import { z } from "zod";
import { AppError } from "./auth";
import { safeUrl } from "./schemas";

export const ML_API = "https://api.mercadolibre.com";
export const mlSearchSchema = z.object({
  site_id: z.literal("MLB"),
  paging: z.object({ total: z.number().nonnegative() }),
  results: z
    .array(
      z.object({
        id: z.string().regex(/^MLB\d+$/),
        seller: z.object({ id: z.number().int().positive() }),
      }),
    )
    .max(50),
});
const itemSchema = z.object({
  id: z.string().regex(/^MLB\d+$/),
  site_id: z.literal("MLB"),
  title: z.string().min(1).max(300),
  seller_id: z.number().int().positive(),
  price: z.number().positive().max(10000000),
  currency_id: z.literal("BRL"),
  status: z.string(),
  permalink: z.string(),
  secure_thumbnail: z.string().nullish(),
  thumbnail: z.string().nullish(),
  original_price: z.number().positive().nullish(),
  category_id: z.string().nullish(),
  available_quantity: z.number().int().nonnegative().optional(),
  sold_quantity: z.number().int().nonnegative().optional(),
  official_store_id: z.number().int().nullish(),
  variations: z.array(z.unknown()).optional(),
  catalog_product_id: z.string().nullish(),
});
const sellerSchema = z.object({
  id: z.number().int().positive(),
  nickname: z.string().min(1).max(200),
  seller_reputation: z
    .object({
      level_id: z.string().nullish(),
      power_seller_status: z.string().nullish(),
      transactions: z
        .object({
          total: z.number().nonnegative().optional(),
          completed: z.number().nonnegative().optional(),
          canceled: z.number().nonnegative().optional(),
        })
        .passthrough()
        .optional(),
    })
    .passthrough()
    .nullish(),
  registration_date: z.string().optional(),
});
export type MeliItem = z.infer<typeof itemSchema>;
export type MeliSeller = z.infer<typeof sellerSchema>;
export class ConnectorError extends AppError {
  constructor(
    message: string,
    public kind:
      | "unauthorized"
      | "forbidden"
      | "rate_limited"
      | "network"
      | "invalid_response",
    public upstreamStatus?: number,
    public retryAfterSeconds = 60,
  ) {
    super(message, kind === "rate_limited" ? 429 : 502);
  }
}
export type ApiTransport = (
  url: string,
  init: RequestInit,
) => Promise<Response>;
export class MercadoLivreClient {
  constructor(
    private token: string,
    private transport: ApiTransport = fetch,
    private onRequest: () => void = () => {},
    private renewToken?: () => Promise<string>,
  ) {}
  async get(path: string, allowRefresh = true): Promise<unknown> {
    // Somente caminhos construídos pelo código; nenhuma URL fornecida pelo usuário.
    if (!path.startsWith("/") || path.startsWith("//"))
      throw new Error("Caminho da API inválido.");
    this.onRequest();
    let response: Response;
    try {
      response = await this.transport(ML_API + path, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${this.token}`,
          Accept: "application/json",
        },
        redirect: "error",
        signal: AbortSignal.timeout(12000),
        cache: "no-store",
      });
    } catch {
      throw new ConnectorError(
        "Não foi possível alcançar a API oficial. Confira a conexão e a liberação de api.mercadolibre.com. Nenhuma oferta foi simulada.",
        "network",
      );
    }
    if (!response.ok) {
      if (response.status === 401 && allowRefresh && this.renewToken) {
        this.token = await this.renewToken();
        return this.get(path, false);
      }
      if (response.status === 401)
        throw new ConnectorError(
          "Mercado Livre recusou o token ou ele expirou. O administrador precisa renovar a autorização.",
          "unauthorized",
          401,
        );
      if (response.status === 403)
        throw new ConnectorError(
          response.headers.get("content-type")?.includes("application/json")
            ? "A API negou esta consulta. Conta de afiliado ou token não garantem acesso à busca de catálogo. Confirme a permissão da aplicação no DevCenter."
            : "A plataforma ou a rede negou o acesso com HTTP 403 sem resposta JSON. Pode haver bloqueio de segurança ou de rede. Isso não confirma permissão de busca para sua aplicação.",
          "forbidden",
          403,
        );
      if (response.status === 429) {
        const header = response.headers.get("retry-after") || "";
        const numeric = Number(header);
        const seconds =
          Number.isFinite(numeric) && numeric > 0
            ? numeric
            : (Date.parse(header) - Date.now()) / 1000;
        throw new ConnectorError(
          "Limite da API atingido. As próximas consultas ficarão em espera.",
          "rate_limited",
          429,
          Number.isFinite(seconds) && seconds > 0
            ? Math.min(2147483647, Math.ceil(seconds))
            : 60,
        );
      }
      throw new ConnectorError(
        `A API retornou HTTP ${response.status}. A consulta não foi concluída.`,
        "invalid_response",
        response.status,
      );
    }
    if (!response.headers.get("content-type")?.includes("application/json"))
      throw new ConnectorError(
        "A plataforma não retornou JSON válido para esta operação.",
        "invalid_response",
      );
    const reader = response.body?.getReader();
    let size = 0;
    const chunks: Uint8Array[] = [];
    if (!reader)
      throw new ConnectorError(
        "A API retornou uma resposta vazia.",
        "invalid_response",
      );
    try {
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        size += chunk.value.length;
        if (size > 2_000_000) {
          await reader.cancel();
          throw new ConnectorError(
            "Resposta da API maior que o limite seguro.",
            "invalid_response",
          );
        }
        chunks.push(chunk.value);
      }
    } catch (e) {
      if (e instanceof ConnectorError) throw e;
      throw new ConnectorError(
        "A leitura da resposta da API foi interrompida.",
        "network",
      );
    }
    try {
      return JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch {
      throw new ConnectorError(
        "A plataforma retornou um JSON inválido.",
        "invalid_response",
      );
    }
  }
  async profile() {
    const raw = await this.get("/users/me");
    const result = z
      .object({ id: z.number().int().positive(), site_id: z.literal("MLB") })
      .safeParse(raw);
    if (!result.success)
      throw new ConnectorError(
        "O token não retornou uma conta brasileira no formato esperado.",
        "invalid_response",
      );
    return result.data;
  }
  async search(query: string) {
    const raw = await this.get(
      `/sites/MLB/search?${new URLSearchParams({ q: query, limit: "10" })}`,
    );
    const result = mlSearchSchema.safeParse(raw);
    if (!result.success)
      throw new ConnectorError(
        "O formato atual da busca não corresponde ao contrato suportado. O conector precisa ser revisto; nenhum resultado foi inventado.",
        "invalid_response",
      );
    return result.data;
  }
  async items(ids: string[]) {
    if (!ids.length) return [];
    const raw = await this.get(
      `/items?${new URLSearchParams({ ids: ids.join(",") })}`,
    );
    const result = z
      .array(z.object({ code: z.number(), body: z.unknown() }))
      .max(10)
      .safeParse(raw);
    if (!result.success)
      throw new ConnectorError(
        "Formato inesperado na consulta dos anúncios.",
        "invalid_response",
      );
    return result.data;
  }
  async seller(id: number) {
    const raw = await this.get(`/users/${id}`);
    const result = sellerSchema.safeParse(raw);
    if (!result.success || result.data.id !== id)
      throw new ConnectorError(
        "O vendedor retornado pela API não pôde ser identificado com segurança.",
        "invalid_response",
      );
    return result.data;
  }
}
export function validItem(
  raw: unknown,
  expectedId: string,
  expectedSeller: number,
): { item: MeliItem | null; reason: string | null; unavailable?: MeliItem } {
  const result = itemSchema.safeParse(raw);
  if (!result.success)
    return {
      item: null,
      reason:
        "Anúncio com dados incompletos, moeda incompatível ou formato não suportado.",
    };
  const item = result.data;
  if (item.id !== expectedId || item.seller_id !== expectedSeller)
    return {
      item: null,
      reason:
        "Identidade do anúncio ou vendedor divergiu entre busca e consulta.",
    };
  if (item.status !== "active" || item.available_quantity === 0)
    return {
      item: null,
      unavailable: item,
      reason: "Anúncio inativo ou sem estoque segundo a API.",
    };
  if (item.variations?.length)
    return {
      item: null,
      reason:
        "Anúncio com variações: exige identificação e preço da variação antes de importar.",
    };
  try {
    const url = new URL(item.permalink);
    if (
      ![
        "mercadolivre.com.br",
        "www.mercadolivre.com.br",
        "produto.mercadolivre.com.br",
        "articulo.mercadolivre.com.br",
      ].includes(url.hostname)
    )
      return { item: null, reason: "URL do anúncio fora do domínio esperado." };
    url.protocol = "https:";
    item.permalink = safeUrl.parse(url.toString());
  } catch {
    return { item: null, reason: "URL do anúncio inválida." };
  }
  const image = item.secure_thumbnail || item.thumbnail;
  if (image)
    try {
      const url = new URL(image);
      url.protocol = "https:";
      item.secure_thumbnail = safeUrl.parse(url.toString());
    } catch {
      item.secure_thumbnail = null;
      item.thumbnail = null;
    }
  return { item, reason: null };
}
