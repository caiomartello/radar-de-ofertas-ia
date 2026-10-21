"use client";

import {
  useEffect,
  useId,
  cloneElement,
  isValidElement,
  type ReactElement,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  Radar,
  LayoutDashboard,
  Ticket,
  Store,
  Users,
  MessageSquare,
  ChartNoAxesCombined,
  Plug,
  Settings,
  Search,
  Plus,
  ArrowUpRight,
  ArrowRight,
  LayoutGrid,
  List,
  SlidersHorizontal,
  Check,
  Clock3,
  ShieldCheck,
  ChevronRight,
  X,
  LogOut,
  Menu,
  Copy,
  Send,
  CircleHelp,
  Coffee,
  Headphones,
  Wrench,
  PawPrint,
  Sparkles,
  Package,
  AlertTriangle,
  CheckCircle2,
  FileText,
  Bell,
  RefreshCw,
  Download,
  LockKeyhole,
} from "lucide-react";
import {
  platforms,
  categories,
  categoryNames,
  money,
  dateTime,
  statusNames,
  couponState,
  type Offer,
  type Coupon,
  type Seller,
  type Group,
  type CouponCandidate,
} from "@/lib/domain";
import Image from "next/image";
import { AutomaticRadar } from "./AutomaticRadar";
import type { User } from "@/lib/auth";
import type { Permission } from "@/lib/db";

type Draft = {
  offer_version: number;
  current_offer_version: number;
  id: string;
  offer_id: string;
  group_id: string;
  content: string;
  style: string;
  updated_at: string;
  copied_at: string | null;
  group_name: string;
  offer_title: string;
  demo: number;
};
type Publication = {
  id: string;
  offer_id: string;
  group_id: string;
  group_name: string;
  operator_name: string;
  declared_at: string;
  content: string;
};
type Member = {
  id: string;
  name: string;
  email: string;
  role: string;
  active: number;
  permissions: Permission[];
};
type Integration = {
  id: string;
  name: string;
  status: string;
  capabilities: string;
  last_sync_at: string | null;
  error_message: string | null;
  rate_limit: string;
  credential_present: number;
};
type Audit = {
  id: string;
  user_name: string;
  action: string;
  entity_type: string;
  entity_id: string;
  created_at: string;
  details: string;
};
let currentDataset: "real" | "demo" = "real";
type State = {
  dataset: "real" | "demo";
  datasets: { real_offers: number; demo_offers: number };
  server_time: string;
  user: User;
  offers: Offer[];
  coupons: Coupon[];
  sellers: Seller[];
  groups: Group[];
  drafts: Draft[];
  publications: Publication[];
  integrations: Integration[];
  users: Member[];
  invitations: {
    id: string;
    name: string;
    email: string;
    expires_at: string;
    used_at: string | null;
  }[];
  audit: Audit[];
  alerts: { id: string; message: string }[];
};
type Screen =
  | "overview"
  | "offers"
  | "coupons"
  | "sellers"
  | "groups"
  | "messages"
  | "history"
  | "integrations"
  | "admin";
type Modal =
  | { type: "offer"; value?: Offer }
  | { type: "seller"; value?: Seller }
  | { type: "group"; value?: Group }
  | { type: "coupon"; value?: Coupon; candidate?: CouponCandidate }
  | { type: "detail"; value: Offer }
  | { type: "generate"; value: Offer }
  | { type: "check"; value: Offer }
  | { type: "invite" }
  | { type: "member"; value: Member }
  | { type: "credential"; value: Integration }
  | { type: "verify"; value: Coupon }
  | { type: "password"; value: Member };
type ApiError = Error & { status?: number };
async function api<T = Record<string, unknown>>(
  path: string,
  method = "GET",
  data?: unknown,
): Promise<T> {
  const response = await fetch(
    `/api/${path}${path.includes("?") ? "&" : "?"}dataset=${currentDataset}`,
    {
      method,
      headers: method === "GET" ? {} : { "Content-Type": "application/json" },
      body: data === undefined ? undefined : JSON.stringify(data),
      cache: "no-store",
    },
  );
  const result = await response.json();
  if (!response.ok) {
    const error: ApiError = new Error(
      result.error +
        (result.fields?.length
          ? ` Campos: ${result.fields.map((f: { field: string }) => f.field).join(", ")}.`
          : ""),
    );
    error.status = response.status;
    throw error;
  }
  return result;
}
const navigation: {
  key: Screen;
  label: string;
  icon: typeof Radar;
  permission?: Permission;
}[] = [
  { key: "overview", label: "Visão geral", icon: LayoutDashboard },
  {
    key: "offers",
    label: "Radar de ofertas",
    icon: Radar,
    permission: "offers.view",
  },
  {
    key: "coupons",
    label: "Central de cupons",
    icon: Ticket,
    permission: "coupons.manage",
  },
  {
    key: "sellers",
    label: "Vendedores",
    icon: Store,
    permission: "sellers.manage",
  },
  { key: "groups", label: "Grupos", icon: Users, permission: "groups.manage" },
  {
    key: "messages",
    label: "Mensagens",
    icon: MessageSquare,
    permission: "posts.prepare",
  },
  {
    key: "history",
    label: "Histórico de preços",
    icon: ChartNoAxesCombined,
    permission: "offers.view",
  },
  { key: "integrations", label: "Integrações", icon: Plug },
  { key: "admin", label: "Administração", icon: Settings },
];
const subtitles: Record<Screen, string> = {
  overview: "Uma boa oferta começa com uma boa curadoria.",
  offers: "Encontre, revise e prepare suas próximas recomendações.",
  coupons: "Transforme mensagens em regras claras, com revisão humana.",
  sellers: "Confiança se constrói com informação e evidências.",
  groups: "Cada público, uma curadoria especial.",
  messages: "Da sua curadoria para a conversa. Você dá a palavra final.",
  history: "Seu próprio histórico, construído a cada conferência.",
  integrations: "Conexões transparentes. Você sabe o que está funcionando.",
  admin: "As pessoas e os cuidados por trás do seu radar.",
};
const permissionLabels: Record<Permission, string> = {
  "offers.view": "Ver ofertas",
  "offers.manage": "Cadastrar e editar ofertas",
  "offers.approve": "Aprovar e rejeitar",
  "coupons.manage": "Gerenciar cupons",
  "sellers.manage": "Gerenciar vendedores",
  "groups.manage": "Gerenciar grupos",
  "posts.prepare": "Preparar e copiar mensagens",
  "posts.publish": "Registrar publicação manual",
  "users.manage": "Gerenciar usuários (administrador)",
  "integrations.manage": "Gerenciar credenciais (administrador)",
  "settings.manage": "Configurações (administrador)",
  "audit.view": "Consultar auditoria",
};
const commonPermissions = Object.keys(permissionLabels).filter(
  (p) =>
    !["users.manage", "integrations.manage", "settings.manage"].includes(p),
) as Permission[];
const formData = (e: FormEvent<HTMLFormElement>) => {
  e.preventDefault();
  return new FormData(e.currentTarget);
};
const str = (f: FormData, k: string) => String(f.get(k) || "").trim();
const cents = (f: FormData, k: string) =>
  Math.round(Number(str(f, k).replace(",", ".")) * 100);
const nullableCents = (f: FormData, k: string) =>
  str(f, k) ? cents(f, k) : null;
const array = (f: FormData, k: string) =>
  str(f, k)
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
const localDate = (value: string | null | undefined) =>
  value
    ? new Date(Date.parse(value) - 3 * 3600000).toISOString().slice(0, 16)
    : "";
const utcDate = (value: string) =>
  value ? new Date(`${value}:00-03:00`).toISOString() : null;
function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  const fieldId = useId();
  return (
    <div className="field">
      <label htmlFor={fieldId}>{label}</label>
      {isValidElement(children)
        ? cloneElement(
            children as ReactElement<{
              id: string;
              "aria-describedby"?: string;
            }>,
            {
              id: fieldId,
              "aria-describedby": hint ? `${fieldId}-hint` : undefined,
            },
          )
        : children}
      {hint && <small id={`${fieldId}-hint`}>{hint}</small>}
    </div>
  );
}
function PlatformSelect({
  value = "mercado_livre",
  ...props
}: {
  value?: string;
  id?: string;
  "aria-describedby"?: string;
}) {
  return (
    <select name="platform" defaultValue={value} {...props}>
      {Object.entries(platforms).map(([key, label]) => (
        <option key={key} value={key}>
          {label}
        </option>
      ))}
    </select>
  );
}
function CategorySelect({
  value = "geral",
  name = "category",
  ...props
}: {
  value?: string;
  name?: string;
  id?: string;
  "aria-describedby"?: string;
}) {
  return (
    <select name={name} defaultValue={value} {...props}>
      {categories.map((c) => (
        <option key={c} value={c}>
          {categoryNames[c]}
        </option>
      ))}
    </select>
  );
}
function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: string;
}) {
  return <span className={`badge ${tone}`}>{children}</span>;
}
function Empty({
  icon: Icon = Package,
  title,
  children,
}: {
  icon?: typeof Radar;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="empty">
      <span className="empty-icon">
        <Icon size={28} />
      </span>
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}
function ModalShell({
  title,
  children,
  close,
  feedback,
}: {
  title: string;
  children: ReactNode;
  close: () => void;
  feedback?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className="modal"
      onCancel={close}
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div className="modal-head">
        <h2>{title}</h2>
        <button
          className="icon-button"
          onClick={close}
          aria-label="Fechar janela"
        >
          <X />
        </button>
        {feedback && (
          <div className="modal-feedback" role="alert">
            <AlertTriangle size={16} />
            {feedback}
          </div>
        )}
      </div>
      <div className="modal-body">{children}</div>
    </dialog>
  );
}
function ProductArt({ offer }: { offer: Offer }) {
  const Icon =
    offer.category === "casa"
      ? Coffee
      : offer.category === "eletronicos"
        ? Headphones
        : offer.category === "ferramentas"
          ? Wrench
          : offer.category === "pet"
            ? PawPrint
            : Sparkles;
  return (
    <div className={`product-art art-${offer.category}`}>
      {offer.image_url ? (
        <Image
          src={offer.image_url}
          alt={offer.title}
          width={600}
          height={400}
          unoptimized
          referrerPolicy="no-referrer"
        />
      ) : (
        <>
          <div className="art-ring" />
          <Icon size={78} strokeWidth={1.15} />
          <span>Imagem ilustrativa</span>
        </>
      )}
    </div>
  );
}

export default function RadarApp() {
  const [data, setData] = useState<State | null>(null),
    [loading, setLoading] = useState(true),
    [screen, setScreen] = useState<Screen>("overview"),
    [modal, setModal] = useState<Modal | null>(null),
    [mobileNav, setMobileNav] = useState(false);
  const [toast, setToast] = useState<{ text: string; error?: boolean } | null>(
      null,
    ),
    [busy, setBusy] = useState(false),
    [search, setSearch] = useState(""),
    [platform, setPlatform] = useState(""),
    [category, setCategory] = useState(""),
    [status, setStatus] = useState(""),
    [view, setView] = useState("cards"),
    [advanced, setAdvanced] = useState(false);
  const [groupFilter, setGroupFilter] = useState(""),
    [sellerFilter, setSellerFilter] = useState(""),
    [couponFilter, setCouponFilter] = useState(""),
    [minimum, setMinimum] = useState(""),
    [maximum, setMaximum] = useState(""),
    [minScore, setMinScore] = useState(""),
    [after, setAfter] = useState("");
  const [invitation, setInvitation] = useState(() =>
      typeof window === "undefined"
        ? ""
        : new URLSearchParams(window.location.search).get("convite") || "",
    ),
    [inviteUrl, setInviteUrl] = useState("");
  const [importText, setImportText] = useState(""),
    [candidates, setCandidates] = useState<CouponCandidate[]>([]),
    [selectedDraft, setSelectedDraft] = useState(""),
    [draftText, setDraftText] = useState("");
  const [history, setHistory] = useState<{
      observations: {
        price_cents: number;
        observed_at: string;
        source: string;
        confidence: string;
      }[];
      summary: {
        days: number;
        count: number;
        sufficient: boolean;
        minimum: number | null;
        mean: number | null;
        median: number | null;
      }[];
    } | null>(null),
    [historyOffer, setHistoryOffer] = useState("");
  async function refresh() {
    try {
      const result = await api<State>("state");
      setData(result);
      return result;
    } catch (error) {
      if ((error as ApiError).status === 401) {
        setData(null);
        return null;
      }
      throw error;
    }
  }
  useEffect(() => {
    api<State>("state")
      .then(setData)
      .catch((error) => {
        if (error.status !== 401)
          setToast({ text: error.message, error: true });
      })
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 10000);
    return () => clearTimeout(timer);
  }, [toast]);
  async function perform(
    action: () => Promise<unknown>,
    message: string,
    close = true,
  ) {
    setBusy(true);
    try {
      await action();
      await refresh();
      setToast({ text: message });
      if (close) setModal(null);
      return true;
    } catch (error) {
      setToast({ text: (error as Error).message, error: true });
      return false;
    } finally {
      setBusy(false);
    }
  }
  const can = (p: Permission) => !!data?.user.permissions.includes(p);
  async function submitLogin(e: FormEvent<HTMLFormElement>) {
    const f = formData(e);
    setBusy(true);
    try {
      await api(
        invitation ? "auth/accept" : "auth/login",
        "POST",
        invitation
          ? { token: invitation, password: String(f.get("password") || "") }
          : {
              email: str(f, "email"),
              password: String(f.get("password") || ""),
            },
      );
      window.history.replaceState({}, "", "/");
      setInvitation("");
      await refresh();
    } catch (error) {
      setToast({ text: (error as Error).message, error: true });
    } finally {
      setBusy(false);
    }
  }
  const filtered =
    data?.offers.filter(
      (o) =>
        `${o.title} ${o.seller.name} ${o.platform_listing_id}`
          .toLowerCase()
          .includes(search.toLowerCase()) &&
        (!platform || o.platform === platform) &&
        (!category || o.category === category) &&
        (!status || o.status === status) &&
        (!groupFilter || o.group_ids.includes(groupFilter)) &&
        (!sellerFilter || o.seller_id === sellerFilter) &&
        (!couponFilter ||
          (couponFilter === "with" ? !!o.coupon_id : !o.coupon_id)) &&
        (!minimum || o.price_cents >= Number(minimum) * 100) &&
        (!maximum || o.price_cents <= Number(maximum) * 100) &&
        (!minScore || o.score.value >= Number(minScore)) &&
        (!after || o.checked_at >= utcDate(after)!),
    ) || [];
  if (loading)
    return (
      <main className="loading">
        <Radar className="spin" />
        <p>Preparando seu radar…</p>
      </main>
    );
  if (!data)
    return (
      <main className="auth-page">
        <div className="auth-intro">
          <Brand />
          <div>
            <span className="eyebrow">MENOS RUÍDO. MAIS BOAS ESCOLHAS.</span>
            <h1>
              O próximo achado
              <br />
              começa com você<span>.</span>
            </h1>
            <p>
              Seu espaço para organizar ofertas, entender cupons e recomendar
              com confiança.
            </p>
            <div className="auth-pills">
              <span>
                <ShieldCheck size={17} /> Acesso privado
              </span>
              <span>
                <Users size={17} /> Feito para sua equipe
              </span>
            </div>
          </div>
          <small>Radar de Ofertas IA · Curadoria com responsabilidade</small>
        </div>
        <section className="auth-form">
          <div className="auth-form-inner">
            <span className="brand-symbol">
              <Radar />
            </span>
            <h2>
              {invitation
                ? "Vamos fazer parte do radar?"
                : "Que bom ter você por aqui."}
            </h2>
            <p>
              {invitation
                ? "Você recebeu um convite. Crie sua senha pessoal para entrar."
                : "Entre para continuar sua curadoria de ofertas."}
            </p>
            <form onSubmit={submitLogin}>
              {!invitation && (
                <Field label="E-mail">
                  <input
                    name="email"
                    type="email"
                    autoComplete="username"
                    required
                    placeholder="voce@exemplo.com.br"
                  />
                </Field>
              )}
              <Field
                label={invitation ? "Crie sua senha" : "Senha"}
                hint={invitation ? "Use pelo menos 12 caracteres." : undefined}
              >
                <input
                  name="password"
                  type="password"
                  minLength={invitation ? 12 : 1}
                  maxLength={128}
                  autoComplete={
                    invitation ? "new-password" : "current-password"
                  }
                  required
                />
              </Field>
              <button className="button primary full" disabled={busy}>
                {busy
                  ? "Aguarde…"
                  : invitation
                    ? "Aceitar convite e entrar"
                    : "Entrar no radar"}
                <ArrowRight size={18} />
              </button>
            </form>
            <div className="notice">
              <LockKeyhole size={17} />
              <p>
                {invitation
                  ? "O convite é pessoal e expira em 48 horas."
                  : "Sem cadastro público. Peça um convite ao administrador. No primeiro acesso, crie o administrador seguindo o README (npm run owner)."}
              </p>
            </div>
          </div>
        </section>
        {toast && <Toast toast={toast} close={() => setToast(null)} />}
      </main>
    );
  const pending = data.offers.filter((o) => o.status === "draft").length;
  function navigate(key: Screen) {
    setScreen(key);
    setMobileNav(false);
  }
  function showDraft(draft: Draft) {
    setSelectedDraft(draft.id);
    setDraftText(draft.content);
    navigate("messages");
  }
  async function copyDraft(draft: Draft) {
    if (draftText !== draft.content) {
      setToast({ text: "Salve a edição antes de copiar.", error: true });
      return;
    }
    let copied = false;
    try {
      const latest = await api<State>("state");
      const current = latest.drafts.find((d) => d.id === draft.id);
      if (
        !current ||
        current.offer_version !== current.current_offer_version ||
        current.content !== draft.content
      ) {
        setData(latest);
        setToast({
          text: "A oferta ou a mensagem mudou. Atualize o rascunho antes de copiar.",
          error: true,
        });
        return;
      }
      await navigator.clipboard.writeText(draft.content);
      copied = true;
      await api(`drafts/${draft.id}/copy`, "POST", {});
      await refresh();
      setToast({
        text: "Mensagem copiada. Publique manualmente e depois registre a publicação.",
      });
    } catch {
      setToast({
        text: copied
          ? "Mensagem copiada, mas o registro da cópia falhou. Confira sua sessão. Nada foi marcado como publicado."
          : "Não foi possível copiar. Selecione o texto e copie manualmente. Nada foi marcado como publicado.",
        error: true,
      });
    }
  }
  const activeDraft = data.drafts.find((d) => d.id === selectedDraft);
  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileNav ? "open" : ""}`}>
        <Brand />
        <div className="workspace">
          <span className="workspace-avatar">R</span>
          <div>
            <strong>Meu espaço de curadoria</strong>
            <small>
              Equipe privada <span className="live-dot" />
            </small>
          </div>
        </div>
        <span className="nav-label">SEU RADAR</span>
        <nav aria-label="Menu principal">
          {navigation
            .filter(
              (n) =>
                (!n.permission || can(n.permission)) &&
                (n.key !== "admin" ||
                  data.user.role === "owner" ||
                  can("audit.view")),
            )
            .map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                onClick={() => navigate(key)}
                className={screen === key ? "active" : ""}
              >
                <Icon size={19} />
                <span>{label}</span>
                {key === "offers" && pending > 0 && (
                  <em aria-hidden="true">{pending}</em>
                )}
                {key === "integrations" && <span className="nav-dot" />}
              </button>
            ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="curation-tip">
            <span>
              <Sparkles size={17} /> Curadoria que faz a diferença
            </span>
            <p>Uma recomendação boa vale mais que dez ofertas duvidosas.</p>
          </div>
          <div className="profile">
            <span className="avatar">
              {data.user.name.slice(0, 2).toUpperCase()}
            </span>
            <div>
              <strong>{data.user.name}</strong>
              <small>
                {data.user.role === "owner"
                  ? "Administrador principal"
                  : "Operador"}
              </small>
            </div>
            <button
              aria-label="Sair"
              className="icon-button"
              onClick={() =>
                perform(
                  async () => {
                    await api("auth/logout", "POST", {});
                    setData(null);
                  },
                  "Você saiu.",
                  false,
                )
              }
            >
              <LogOut size={17} />
            </button>
          </div>
        </div>
      </aside>
      {mobileNav && (
        <button
          className="nav-overlay"
          aria-label="Fechar menu"
          onClick={() => setMobileNav(false)}
        />
      )}
      <div className="main-area">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="icon-button mobile-menu"
              aria-label="Abrir menu"
              onClick={() => setMobileNav(true)}
            >
              <Menu />
            </button>
            <span>Meu espaço</span>
            <ChevronRight size={14} />
            <strong>{navigation.find((n) => n.key === screen)?.label}</strong>
          </div>
          <div className="topbar-right">
            <span className="manual-pill">
              <span className="live-dot" /> Operação manual
            </span>
            <button
              className="icon-button"
              aria-label="Ver alertas"
              onClick={() => {
                navigate("overview");
                setToast({
                  text: data.alerts.length
                    ? data.alerts.map((a) => a.message).join(" ")
                    : "Nenhum alerta de divergência. Confira as ofertas pendentes no painel.",
                });
              }}
            >
              <Bell size={19} />
              {data.alerts.length > 0 && <i className="notification-dot" />}
            </button>
            <span className="avatar small">
              {data.user.name.slice(0, 2).toUpperCase()}
            </span>
          </div>
        </header>
        <main className="content">
          <div className="page-heading">
            <div>
              <div className="eyebrow">
                {screen === "overview"
                  ? "SEU CENTRO DE CURADORIA"
                  : "RADAR DE OFERTAS IA"}
              </div>
              <h1>
                {screen === "overview"
                  ? `Olá, ${data.user.name.split(" ")[0]} 👋`
                  : navigation.find((n) => n.key === screen)?.label}
              </h1>
              <p>{subtitles[screen]}</p>
            </div>
            {(screen === "overview" || screen === "offers") &&
              can("offers.manage") && (
                <button
                  className="button primary"
                  onClick={() => setModal({ type: "offer" })}
                >
                  <Plus size={18} /> Nova oferta
                </button>
              )}
            {screen === "coupons" && can("coupons.manage") && (
              <button
                className="button primary"
                onClick={() => setModal({ type: "coupon" })}
              >
                <Plus size={18} /> Cadastrar cupom
              </button>
            )}
            {screen === "sellers" && can("sellers.manage") && (
              <button
                className="button primary"
                onClick={() => setModal({ type: "seller" })}
              >
                <Plus size={18} /> Novo vendedor
              </button>
            )}
            {screen === "groups" && can("groups.manage") && (
              <button
                className="button primary"
                onClick={() => setModal({ type: "group" })}
              >
                <Plus size={18} /> Novo grupo
              </button>
            )}
          </div>
          <section
            className="dataset-switch"
            aria-label="Separar dados reais e exemplos"
          >
            <div>
              <strong>
                {data.dataset === "real"
                  ? "Ofertas reais"
                  : "Exemplos fictícios"}
              </strong>
              <small>
                {data.dataset === "real"
                  ? "Cadastros reais e dados recebidos de APIs. Exemplos ficam em outra visualização."
                  : "Área de demonstração. Buscas externas ficam disponíveis somente em Ofertas reais."}
              </small>
            </div>
            <div className="button-row">
              <button
                className={`button ${data.dataset === "real" ? "primary" : "secondary"}`}
                aria-pressed={data.dataset === "real"}
                onClick={() => {
                  currentDataset = "real";
                  setSelectedDraft("");
                  setHistory(null);
                  void refresh();
                }}
              >
                Ver ofertas reais
              </button>
              <button
                className={`button ${data.dataset === "demo" ? "primary" : "secondary"}`}
                aria-pressed={data.dataset === "demo"}
                onClick={() => {
                  currentDataset = "demo";
                  setSelectedDraft("");
                  setHistory(null);
                  void refresh();
                }}
              >
                Ver exemplos
              </button>
            </div>
          </section>
          {data.offers.some((o) => o.demo === 1) && (
            <div className="demo-banner">
              <Sparkles size={17} />
              <span>
                <strong>Exemplos carregados.</strong> Os registros com selo
                “Exemplo” são fictícios e servem apenas para testar o fluxo.
              </span>
            </div>
          )}
          {screen === "overview" && (
            <>
              <section className="welcome-banner">
                <div className="welcome-copy">
                  <span className="eyebrow light">
                    <span className="live-dot" /> VOCÊ NO CONTROLE
                  </span>
                  <h2>
                    Boas ofertas.
                    <br />
                    Recomendações melhores.
                  </h2>
                  <p>
                    Reúna seus achados, confira as condições
                    <br className="desktop-only" /> e transforme cada oferta em
                    uma boa conversa.
                  </p>
                  <button
                    className="button white"
                    onClick={() => navigate("offers")}
                  >
                    Explorar meu radar
                    <ArrowUpRight size={17} />
                  </button>
                </div>
                <div className="radar-illustration" aria-hidden="true">
                  <div />
                  <div />
                  <div />
                  <Radar size={130} strokeWidth={0.7} />
                  <span className="floating-card float-one">
                    <Ticket size={21} /> Cupons revisados
                    <CheckCircle2 size={16} />
                  </span>
                  <span className="floating-card float-two">
                    <ShieldCheck size={21} /> Sua curadoria, sua confiança
                  </span>
                  <span className="radar-point point-one" />
                  <span className="radar-point point-two" />
                </div>
              </section>
              <section className="stats-grid">
                <Stat
                  icon={Radar}
                  title="Ofertas no radar"
                  value={data.offers.length}
                  note="Cadastradas pela sua equipe"
                  tone="green"
                />
                <Stat
                  icon={Clock3}
                  title="Aguardando revisão"
                  value={pending}
                  note="Uma conferência faz a diferença"
                  tone="amber"
                />
                <Stat
                  icon={Ticket}
                  title="Cupons cadastrados"
                  value={data.coupons.length}
                  note="Verifique as regras antes de usar"
                  tone="purple"
                />
                <Stat
                  icon={Send}
                  title="Publicações registradas"
                  value={data.publications.length}
                  note="Declaradas manualmente"
                  tone="blue"
                />
              </section>
              <div className="section-title">
                <div>
                  <h2>
                    Oportunidades no radar <span>{data.offers.length}</span>
                  </h2>
                  <p>
                    Seus achados mais recentes, prontos para uma boa revisão.
                  </p>
                </div>
                <button
                  className="text-button"
                  onClick={() => navigate("offers")}
                >
                  Ver todas as ofertas <ArrowRight size={16} />
                </button>
              </div>
              {!data.offers.length ? (
                <div className="panel">
                  <Empty title="Seu radar está pronto para o primeiro achado">
                    Cadastre um vendedor e um grupo e adicione sua primeira
                    oferta. Se preferir conhecer o fluxo, carregue exemplos
                    claramente identificados.
                  </Empty>
                  <div className="empty-actions">
                    {can("sellers.manage") && (
                      <button
                        className="button secondary"
                        onClick={() => setModal({ type: "seller" })}
                      >
                        Cadastrar vendedor
                      </button>
                    )}
                    {data.user.role === "owner" && (
                      <button
                        className="button primary"
                        disabled={busy}
                        onClick={() =>
                          perform(async () => {
                            if (!data.datasets.demo_offers)
                              await api("demo", "POST", {});
                            currentDataset = "demo";
                          }, "Exemplos fictícios carregados.")
                        }
                      >
                        Experimentar com exemplos
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <div className="offer-grid">
                  {data.offers.slice(0, 3).map((o) => (
                    <OfferCard
                      key={o.id}
                      offer={o}
                      open={() => setModal({ type: "detail", value: o })}
                      generate={() => setModal({ type: "generate", value: o })}
                      canPrepare={can("posts.prepare")}
                    />
                  ))}
                </div>
              )}
              <div className="bottom-grid">
                <section className="panel">
                  <div className="panel-title">
                    <h3>
                      <Plug size={18} /> Suas fontes
                    </h3>
                    <Badge>Importação manual</Badge>
                  </div>
                  {data.integrations
                    .filter((i) => i.id !== "other")
                    .map((i) => (
                      <div className="source-row" key={i.id}>
                        <span className={`platform-icon ${i.id}`}>
                          {i.name.slice(0, 1)}
                        </span>
                        <div>
                          <strong>{i.name}</strong>
                          <small>
                            {i.id === "mercado_livre" && i.status === "active"
                              ? "Busca autorizada no último teste"
                              : i.credential_present
                                ? "Credencial guardada; confira a autorização em Integrações"
                                : "Sem conexão automática"}
                          </small>
                        </div>
                        <Badge tone="neutral">
                          {i.id === "mercado_livre" && i.status === "active"
                            ? "API"
                            : "Manual"}
                        </Badge>
                      </div>
                    ))}
                  <button
                    className="text-button"
                    onClick={() => navigate("integrations")}
                  >
                    Entender as integrações <ArrowRight size={15} />
                  </button>
                </section>
                <section className="panel next-steps">
                  <div className="panel-title">
                    <h3>
                      <CheckCircle2 size={18} /> Seu próximo passo
                    </h3>
                  </div>
                  {[
                    {
                      n: "01",
                      title: "Confira produto, preço e vendedor",
                      text: "Dados manuais precisam de uma conferência cuidadosa.",
                    },
                    {
                      n: "02",
                      title: "Revise as regras do cupom",
                      text: "Estimativa de desconto não é garantia de aplicação.",
                    },
                    {
                      n: "03",
                      title: "Prepare a mensagem e publique",
                      text: "Copie, compartilhe manualmente e registre no grupo.",
                    },
                  ].map((s) => (
                    <div className="step" key={s.n}>
                      <span>{s.n}</span>
                      <div>
                        <strong>{s.title}</strong>
                        <p>{s.text}</p>
                      </div>
                    </div>
                  ))}
                </section>
              </div>
              {data.alerts.map((a) => (
                <div className="notice warning" key={a.id}>
                  <AlertTriangle size={20} />
                  {a.message}
                </div>
              ))}
            </>
          )}
          {screen === "offers" && (
            <>
              {data.dataset === "real" && (
                <AutomaticRadar
                  owner={data.user.role === "owner"}
                  canRun={can("offers.manage")}
                  onSync={refresh}
                  configure={() => navigate("integrations")}
                />
              )}
              <section className="panel filter-panel">
                <div className="filter-main">
                  <label className="search-input">
                    <Search size={18} />
                    <input
                      aria-label="Buscar ofertas"
                      placeholder="Busque produto, vendedor ou ID…"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  </label>
                  <select
                    aria-label="Filtrar plataforma"
                    value={platform}
                    onChange={(e) => setPlatform(e.target.value)}
                  >
                    <option value="">Todas as plataformas</option>
                    {Object.entries(platforms).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                  <select
                    aria-label="Filtrar categoria"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                  >
                    <option value="">Todas as categorias</option>
                    {categories.map((c) => (
                      <option key={c} value={c}>
                        {categoryNames[c]}
                      </option>
                    ))}
                  </select>
                  <select
                    aria-label="Filtrar status"
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                  >
                    <option value="">Todos os status</option>
                    {["draft", "approved", "saved", "rejected"].map((s) => (
                      <option key={s} value={s}>
                        {statusNames[s]}
                      </option>
                    ))}
                  </select>
                  <button
                    className={`button secondary ${advanced ? "selected" : ""}`}
                    onClick={() => setAdvanced(!advanced)}
                  >
                    <SlidersHorizontal size={16} /> Filtros
                  </button>
                </div>
                {advanced && (
                  <div className="advanced-filters">
                    <Field label="Grupo">
                      <select
                        value={groupFilter}
                        onChange={(e) => setGroupFilter(e.target.value)}
                      >
                        <option value="">Todos</option>
                        {data.groups.map((g) => (
                          <option key={g.id} value={g.id}>
                            {g.name}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Vendedor">
                      <select
                        value={sellerFilter}
                        onChange={(e) => setSellerFilter(e.target.value)}
                      >
                        <option value="">Todos</option>
                        {data.sellers.map((g) => (
                          <option key={g.id} value={g.id}>
                            {g.name}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Cupom">
                      <select
                        value={couponFilter}
                        onChange={(e) => setCouponFilter(e.target.value)}
                      >
                        <option value="">Todos</option>
                        <option value="with">Com cupom</option>
                        <option value="without">Sem cupom</option>
                      </select>
                    </Field>
                    <Field label="Preço mínimo (R$)">
                      <input
                        type="number"
                        min="0"
                        value={minimum}
                        onChange={(e) => setMinimum(e.target.value)}
                      />
                    </Field>
                    <Field label="Preço máximo (R$)">
                      <input
                        type="number"
                        min="0"
                        value={maximum}
                        onChange={(e) => setMaximum(e.target.value)}
                      />
                    </Field>
                    <Field label="Score mínimo">
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={minScore}
                        onChange={(e) => setMinScore(e.target.value)}
                      />
                    </Field>
                    <Field label="Conferido após (Brasília)">
                      <input
                        type="datetime-local"
                        value={after}
                        onChange={(e) => setAfter(e.target.value)}
                      />
                    </Field>
                  </div>
                )}
              </section>
              <div className="results-bar">
                <span>
                  <strong>{filtered.length}</strong> ofertas encontradas
                </span>
                <div className="view-toggle">
                  <button
                    aria-label="Visualizar cartões"
                    aria-pressed={view === "cards"}
                    className={view === "cards" ? "active" : ""}
                    onClick={() => setView("cards")}
                  >
                    <LayoutGrid size={17} />
                  </button>
                  <button
                    aria-label="Visualizar tabela"
                    aria-pressed={view === "table"}
                    className={view === "table" ? "active" : ""}
                    onClick={() => setView("table")}
                  >
                    <List size={18} />
                  </button>
                </div>
              </div>
              {!filtered.length ? (
                <div className="panel">
                  <Empty title="Nenhuma oferta por aqui ainda">
                    Cadastre uma oferta manual ou ajuste os filtros.
                  </Empty>
                </div>
              ) : view === "cards" ? (
                <div className="offer-grid">
                  {filtered.map((o) => (
                    <OfferCard
                      key={o.id}
                      offer={o}
                      open={() => setModal({ type: "detail", value: o })}
                      generate={() => setModal({ type: "generate", value: o })}
                      canPrepare={can("posts.prepare")}
                    />
                  ))}
                </div>
              ) : (
                <div className="panel table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Produto / vendedor</th>
                        <th>Plataforma</th>
                        <th>Preço informado</th>
                        <th>Score</th>
                        <th>Status</th>
                        <th>Detalhes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((o) => (
                        <tr key={o.id}>
                          <td>
                            <strong>{o.title}</strong>
                            {o.demo === 1 && (
                              <Badge tone="amber">Exemplo</Badge>
                            )}
                            <small>{o.seller.name}</small>
                          </td>
                          <td>{platforms[o.platform]}</td>
                          <td>{money(o.price_cents)}</td>
                          <td>{o.score.value}/100</td>
                          <td>{statusNames[o.status]}</td>
                          <td>
                            <button
                              className="text-button"
                              onClick={() =>
                                setModal({ type: "detail", value: o })
                              }
                            >
                              Revisar <ArrowUpRight size={15} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
          {screen === "coupons" && (
            <>
              <div className="panel coupon-import">
                <div className="import-icon">
                  <Ticket size={25} />
                </div>
                <div>
                  <h2>Da mensagem para a sua central.</h2>
                  <p>
                    Cole um texto com um ou vários cupons. O parser separa os
                    códigos; você revisa e confirma cada registro.
                  </p>
                  <textarea
                    aria-label="Texto para importar cupons"
                    value={importText}
                    onChange={(e) => setImportText(e.target.value)}
                    rows={5}
                    placeholder={
                      "Cupom CASA30: 30% de desconto, limitado a R$ 60, mínimo R$ 100\nCupom PET10: 10% de desconto…"
                    }
                  />
                  <div className="form-footer">
                    <small>
                      Texto apenas nesta fase. OCR de prints e IA externa ainda
                      não implementados.
                    </small>
                    <button
                      className="button primary"
                      disabled={!importText.trim() || busy}
                      onClick={() =>
                        perform(
                          async () => {
                            const result = await api<{
                              candidates: CouponCandidate[];
                            }>("coupons/parse", "POST", { text: importText });
                            setCandidates(result.candidates);
                          },
                          "Texto analisado. Revise os candidatos antes de salvar.",
                          false,
                        )
                      }
                    >
                      <FileText size={17} /> Analisar texto
                    </button>
                  </div>
                </div>
              </div>
              {candidates.length > 0 && (
                <section className="panel">
                  <div className="panel-title">
                    <h3>{candidates.length} cupons para revisar</h3>
                    <Badge tone="amber">Ainda não salvos</Badge>
                  </div>
                  {candidates.map((c, i) => (
                    <div className="candidate-row" key={`${c.code}-${i}`}>
                      <Ticket size={19} />
                      <div>
                        <strong>{c.code}</strong>
                        <small>
                          {c.value
                            ? c.type === "percent"
                              ? `${c.value}% de desconto identificado`
                              : `${money(c.value)} identificado`
                            : "Valor não identificado: preencha na revisão"}
                        </small>
                      </div>
                      <button
                        className="button secondary"
                        onClick={() =>
                          setModal({ type: "coupon", candidate: c })
                        }
                      >
                        Revisar e cadastrar <ArrowRight size={15} />
                      </button>
                    </div>
                  ))}
                </section>
              )}
              <div className="section-title">
                <div>
                  <h2>Seus cupons</h2>
                  <p>
                    Validade e condições sempre à vista. Horários de Brasília.
                  </p>
                </div>
                <Badge>{data.coupons.length} cadastrados</Badge>
              </div>
              <div className="coupon-grid">
                {data.coupons.map((c) => (
                  <article className="panel coupon-card" key={c.id}>
                    <div className="panel-title">
                      <span className="coupon-code">
                        <Ticket size={19} />
                        {c.code}
                      </span>
                      <Badge
                        tone={couponState(c) === "verified" ? "green" : "amber"}
                      >
                        {statusNames[couponState(c)] || couponState(c)}
                      </Badge>
                    </div>
                    {c.demo === 1 && (
                      <Badge tone="amber">Exemplo fictício</Badge>
                    )}
                    <p className="small-note">
                      Fonte: {c.source}
                      <br />
                      Última evidência manual:{" "}
                      {c.last_verification_at
                        ? dateTime(c.last_verification_at)
                        : "Nenhuma; aplicação não verificada"}
                    </p>
                    <h3>
                      {c.type === "percent" ? `${c.value}%` : money(c.value)} de
                      desconto
                    </h3>
                    <p>
                      {platforms[c.platform]} ·{" "}
                      {c.categories.length
                        ? c.categories.map((x) => categoryNames[x]).join(", ")
                        : "Categoria não restringida / a revisar"}
                    </p>
                    <dl className="compact-dl">
                      <div>
                        <dt>Teto</dt>
                        <dd>
                          {c.cap_cents === null
                            ? "Não informado"
                            : money(c.cap_cents)}
                        </dd>
                      </div>
                      <div>
                        <dt>Compra mínima</dt>
                        <dd>{money(c.minimum_cents)}</dd>
                      </div>
                      <div>
                        <dt>Início</dt>
                        <dd>
                          {c.starts_at ? dateTime(c.starts_at) : "Desconhecido"}
                        </dd>
                      </div>
                      <div>
                        <dt>Fim</dt>
                        <dd>
                          {c.ends_at ? dateTime(c.ends_at) : "Desconhecido"}
                        </dd>
                      </div>
                    </dl>
                    <p className="muted">
                      {c.rules_reviewed
                        ? "Regras revisadas por operador"
                        : "Revisão de regras pendente"}{" "}
                      · {c.unknown_conditions.length} condições desconhecidas
                    </p>
                    <div className="button-row">
                      <button
                        className="button secondary"
                        onClick={() => setModal({ type: "coupon", value: c })}
                      >
                        Editar regras
                      </button>
                      <button
                        className="text-button"
                        onClick={() => setModal({ type: "verify", value: c })}
                      >
                        Registrar evidência
                      </button>
                    </div>
                  </article>
                ))}
              </div>
              {!data.coupons.length && (
                <div className="panel">
                  <Empty
                    icon={Ticket}
                    title="Cupons organizados, sem adivinhação"
                  >
                    Importe uma mensagem ou cadastre um código manualmente.
                  </Empty>
                </div>
              )}
            </>
          )}
          {screen === "sellers" && (
            <>
              <div className="notice">
                <ShieldCheck size={20} />
                <p>
                  Vendedores independentes também podem ser recomendados.
                  Reputação e loja oficial não garantem originalidade: registre
                  evidências e revise os casos sensíveis.
                </p>
              </div>
              <div className="entity-grid">
                {data.sellers.map((s) => (
                  <article className="panel entity-card" key={s.id}>
                    <div className="entity-header">
                      <span className="entity-icon">
                        <Store size={24} />
                      </span>
                      <Badge
                        tone={
                          s.trust_status === "blocked"
                            ? "red"
                            : s.trust_status === "trusted"
                              ? "green"
                              : "amber"
                        }
                      >
                        {s.trust_status === "blocked"
                          ? "Bloqueado"
                          : s.trust_status === "trusted"
                            ? "Confiável (manual)"
                            : "Em revisão"}
                      </Badge>
                    </div>
                    <h3>{s.name}</h3>
                    {s.demo === 1 && <Badge tone="amber">Exemplo</Badge>}
                    <p>
                      {platforms[s.platform]} · ID: {s.platform_seller_id}
                    </p>
                    <p>
                      Reputação informada:{" "}
                      {
                        {
                          unknown: "desconhecida",
                          good: "boa",
                          excellent: "excelente",
                          poor: "ruim",
                        }[s.reputation]
                      }
                    </p>
                    <p>
                      {s.official
                        ? "Loja oficial informada"
                        : "Vendedor independente / não informado"}
                    </p>
                    <p className="small-note">
                      {s.authenticity === "unknown"
                        ? "Autenticidade não verificada"
                        : "Evidência de autenticidade cadastrada; revise a fonte"}
                    </p>
                    <SellerApiEvidence seller={s} />
                    <button
                      className="button secondary"
                      onClick={() => setModal({ type: "seller", value: s })}
                    >
                      Revisar vendedor
                    </button>
                  </article>
                ))}
              </div>
              {!data.sellers.length && (
                <div className="panel">
                  <Empty icon={Store} title="Quem está por trás da oferta?">
                    Cadastre o nome e o ID exatos do vendedor antes de
                    recomendar.
                  </Empty>
                </div>
              )}
            </>
          )}
          {screen === "groups" && (
            <>
              <div className="entity-grid">
                {data.groups.map((g) => (
                  <article className="panel entity-card" key={g.id}>
                    <div className="entity-header">
                      <span className="entity-icon">
                        <Users size={24} />
                      </span>
                      <Badge tone={g.active ? "green" : "neutral"}>
                        {g.active ? "Ativo no cadastro" : "Inativo"}
                      </Badge>
                    </div>
                    <h3>{g.name}</h3>
                    {g.demo === 1 && <Badge tone="amber">Exemplo</Badge>}
                    <p>
                      {categoryNames[g.category]} ·{" "}
                      {g.channel === "whatsapp" ? "WhatsApp" : "Telegram"}
                    </p>
                    <p>{g.description || "Sem descrição"}</p>
                    <p>
                      {
                        data.publications.filter((p) => p.group_id === g.id)
                          .length
                      }{" "}
                      publicações declaradas
                    </p>
                    <small className="muted">
                      Destino cadastrado. Sem conexão ou envio automático.
                    </small>
                    <button
                      className="button secondary"
                      onClick={() => setModal({ type: "group", value: g })}
                    >
                      Editar grupo
                    </button>
                  </article>
                ))}
              </div>
              {!data.groups.length && (
                <div className="panel">
                  <Empty icon={Users} title="Uma curadoria para cada público">
                    Cadastre seus grupos e canais. A publicação será manual.
                  </Empty>
                </div>
              )}
            </>
          )}
          {screen === "messages" && (
            <>
              <div className="notice">
                <MessageSquare size={20} />
                <p>
                  Revise o texto, salve e copie. Compartilhe no grupo por conta
                  própria. Só depois registre a publicação — copiar nunca
                  significa enviar.
                </p>
              </div>
              <div className="messages-layout">
                <section className="panel drafts-list">
                  <h3>Seus rascunhos</h3>
                  {data.drafts.map((d) => (
                    <button
                      className={`draft-item ${selectedDraft === d.id ? "active" : ""}`}
                      onClick={() => showDraft(d)}
                      key={d.id}
                    >
                      <MessageSquare size={18} />
                      <div>
                        <strong>{d.offer_title}</strong>
                        <small>
                          {d.group_name} · {dateTime(d.updated_at)}
                        </small>
                      </div>
                      <ChevronRight size={16} />
                    </button>
                  ))}
                  {!data.drafts.length && (
                    <p className="muted">
                      Abra uma oferta e escolha “Gerar mensagem”.
                    </p>
                  )}
                </section>
                <section className="panel message-editor">
                  {activeDraft ? (
                    <>
                      <div className="panel-title">
                        <h3>Edite do seu jeito</h3>
                        {activeDraft.demo === 1 && (
                          <Badge tone="amber">Exemplo</Badge>
                        )}
                      </div>
                      <p>{activeDraft.group_name}</p>
                      <textarea
                        aria-label="Editar mensagem"
                        value={draftText}
                        onChange={(e) => setDraftText(e.target.value)}
                        rows={17}
                      />
                      <small className="muted">
                        Não acrescente estoque, prazo, reputação ou economia sem
                        evidências.
                      </small>
                      <div className="button-row">
                        <button
                          className="button secondary"
                          disabled={busy}
                          onClick={() =>
                            perform(
                              () =>
                                api(`drafts/${activeDraft.id}`, "PATCH", {
                                  content: draftText,
                                }),
                              "Mensagem salva.",
                              false,
                            )
                          }
                        >
                          Salvar edição
                        </button>
                        <button
                          className="button primary"
                          disabled={busy}
                          onClick={() => copyDraft(activeDraft)}
                        >
                          <Copy size={16} /> Copiar mensagem
                        </button>
                        {can("posts.publish") && (
                          <button
                            className="button secondary"
                            disabled={busy || draftText !== activeDraft.content}
                            onClick={() => {
                              const repeated = data.publications.some(
                                (p) =>
                                  p.offer_id === activeDraft.offer_id &&
                                  p.group_id === activeDraft.group_id,
                              );
                              if (
                                window.confirm(
                                  repeated
                                    ? "Esta oferta já foi publicada neste grupo. Você publicou novamente e quer registrar a republicação?"
                                    : "Você já publicou esta mensagem manualmente no grupo? Este botão registra sua declaração e não envia nada.",
                                )
                              )
                                perform(
                                  () =>
                                    api("publications", "POST", {
                                      draft_id: activeDraft.id,
                                      confirm: true,
                                      allow_repeat: repeated,
                                    }),
                                  "Publicação manual registrada.",
                                  false,
                                );
                            }}
                          >
                            <Check size={16} /> Registrar publicação manual
                          </button>
                        )}
                      </div>
                    </>
                  ) : (
                    <Empty
                      icon={MessageSquare}
                      title="Uma boa conversa começa aqui"
                    >
                      Selecione um rascunho ou gere uma mensagem a partir de uma
                      oferta.
                    </Empty>
                  )}
                </section>
              </div>
              <section className="panel">
                <div className="panel-title">
                  <h3>Histórico de publicações declaradas</h3>
                  <Badge>Manual</Badge>
                </div>
                {data.publications.map((p) => (
                  <div className="publication-row" key={p.id}>
                    <CheckCircle2 size={20} />
                    <div>
                      <strong>{p.group_name}</strong>
                      <small>
                        {dateTime(p.declared_at)} · {p.operator_name}
                      </small>
                      <details>
                        <summary>Ver texto registrado</summary>
                        <pre>{p.content}</pre>
                      </details>
                    </div>
                  </div>
                ))}
                {!data.publications.length && (
                  <p className="muted">
                    Nenhuma publicação registrada. Copiar uma mensagem não
                    altera este histórico.
                  </p>
                )}
              </section>
            </>
          )}
          {screen === "history" && (
            <>
              <section className="panel">
                <Field label="Escolha a oferta">
                  <select
                    value={historyOffer}
                    onChange={async (e) => {
                      const key = e.target.value;
                      setHistoryOffer(key);
                      setHistory(null);
                      if (key)
                        try {
                          setHistory(await api(`history/${key}`));
                        } catch (error) {
                          setToast({
                            text: (error as Error).message,
                            error: true,
                          });
                        }
                    }}
                  >
                    <option value="">Selecione um produto / vendedor</option>
                    {data.offers.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.title} · {o.seller.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <p className="muted">
                  Cada observação pertence ao produto, à variação e ao vendedor
                  informados. Preços registrados manualmente.
                </p>
              </section>
              {history && (
                <>
                  <div className="entity-grid">
                    {history.summary.map((s) => (
                      <section className="panel" key={s.days}>
                        <h3>Últimos {s.days} dias</h3>
                        <p>{s.count} observações</p>
                        {s.sufficient ? (
                          <dl className="compact-dl">
                            <div>
                              <dt>Menor preço observado</dt>
                              <dd>{money(s.minimum!)}</dd>
                            </div>
                            <div>
                              <dt>Média</dt>
                              <dd>{money(s.mean!)}</dd>
                            </div>
                            <div>
                              <dt>Mediana</dt>
                              <dd>{money(s.median!)}</dd>
                            </div>
                          </dl>
                        ) : (
                          <div className="notice warning">
                            Amostra insuficiente. Exigimos 10 observações em
                            pelo menos 7 dias distintos. Sem selo de mínima
                            histórica.
                          </div>
                        )}
                      </section>
                    ))}
                  </div>
                  <div className="panel table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Conferência (Brasília)</th>
                          <th>Preço do anúncio</th>
                          <th>Fonte</th>
                          <th>Confiança</th>
                        </tr>
                      </thead>
                      <tbody>
                        {history.observations.map((o, i) => (
                          <tr key={i}>
                            <td>{dateTime(o.observed_at)}</td>
                            <td>{money(o.price_cents)}</td>
                            <td>{o.source}</td>
                            <td>
                              {o.confidence === "manual"
                                ? "Informado manualmente"
                                : o.confidence}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
              {!history && (
                <div className="panel">
                  <Empty
                    icon={ChartNoAxesCombined}
                    title="Histórico construído com evidências"
                  >
                    Selecione uma oferta. Ainda não há provedor externo de
                    preços conectado.
                  </Empty>
                </div>
              )}
            </>
          )}
          {screen === "integrations" && (
            <>
              {data.dataset === "real" ? (
                <AutomaticRadar
                  owner={data.user.role === "owner"}
                  canRun={can("offers.manage")}
                  onSync={refresh}
                  configuration
                />
              ) : (
                <div className="notice warning">
                  Mude para Ofertas reais para configurar a conexão com a API.
                </div>
              )}
              <div className="notice warning">
                <Plug size={20} />
                <p>
                  O Mercado Livre depende de autorização testada. Amazon e
                  Shopee ainda não têm conectores. Links de afiliados são
                  colados manualmente; a validação de URL não confirma comissão,
                  rastreamento ou vendedor. Acesso e regras de cada programa
                  precisam ser confirmados antes da ativação.
                </p>
              </div>
              <div className="entity-grid">
                {data.integrations
                  .filter((i) => i.id !== "mercado_livre")
                  .map((i) => (
                    <article className="panel entity-card" key={i.id}>
                      <div className="entity-header">
                        <span className={`platform-icon large ${i.id}`}>
                          {i.name.slice(0, 1)}
                        </span>
                        <Badge>
                          {i.status === "configured"
                            ? "Configurado; não validado"
                            : "Não configurado"}
                        </Badge>
                      </div>
                      <h3>{i.name}</h3>
                      <p>
                        Disponível: cadastro manual de dados e link de afiliado.
                      </p>
                      <p>
                        Busca automática, sincronização e geração de links: não
                        implementadas.
                      </p>
                      <small className="muted">
                        Última sincronização:{" "}
                        {i.last_sync_at ? dateTime(i.last_sync_at) : "Nunca"}
                        <br />
                        Limite: {i.rate_limit}
                      </small>
                      {i.credential_present === 1 && (
                        <div className="notice">
                          <LockKeyhole size={17} /> Credencial cifrada no
                          servidor. Não enviada à interface.
                        </div>
                      )}
                      {data.user.role === "owner" && (
                        <button
                          className="button secondary"
                          onClick={() =>
                            setModal({ type: "credential", value: i })
                          }
                        >
                          <LockKeyhole size={15} />
                          {i.credential_present
                            ? "Substituir credencial"
                            : "Guardar credencial (opcional)"}
                        </button>
                      )}
                    </article>
                  ))}
              </div>
              <section className="panel">
                <h3>O que vem depois?</h3>
                <p>
                  Fase 2: conectores autorizados, verificações e OCR. Fase 3:
                  ranking por público, notificações e Telegram, mediante
                  viabilidade e autorização. Sem automação não oficial de
                  WhatsApp.
                </p>
              </section>
            </>
          )}
          {screen === "admin" && (
            <>
              {data.user.role === "owner" && (
                <>
                  <section className="panel">
                    <div className="panel-title">
                      <div>
                        <h3>Sua equipe</h3>
                        <p>
                          Contas individuais, acesso por convite e permissões no
                          servidor.
                        </p>
                      </div>
                      <button
                        className="button primary"
                        onClick={() => {
                          setInviteUrl("");
                          setModal({ type: "invite" });
                        }}
                      >
                        <Plus size={17} /> Convidar sócio
                      </button>
                    </div>
                    {data.users.map((u) => (
                      <div className="member-row" key={u.id}>
                        <span className="avatar">
                          {u.name.slice(0, 2).toUpperCase()}
                        </span>
                        <div>
                          <strong>{u.name}</strong>
                          <small>{u.email}</small>
                        </div>
                        <Badge tone={u.active ? "green" : "neutral"}>
                          {u.role === "owner"
                            ? "Administrador principal"
                            : u.active
                              ? "Operador"
                              : "Desativado"}
                        </Badge>
                        {u.role !== "owner" && (
                          <button
                            className="text-button"
                            onClick={() =>
                              setModal({ type: "member", value: u })
                            }
                          >
                            Permissões
                          </button>
                        )}
                        <button
                          className="text-button"
                          onClick={() =>
                            setModal({ type: "password", value: u })
                          }
                        >
                          Alterar senha
                        </button>
                      </div>
                    ))}
                  </section>
                  <section className="panel">
                    <h3>Convites</h3>
                    {data.invitations.map((i) => (
                      <div className="source-row" key={i.id}>
                        <Users size={19} />
                        <div>
                          <strong>{i.name}</strong>
                          <small>
                            {i.email} · Expira {dateTime(i.expires_at)}
                          </small>
                        </div>
                        <Badge>
                          {i.used_at
                            ? "Encerrado"
                            : Date.parse(i.expires_at) <
                                Date.parse(data.server_time)
                              ? "Expirado"
                              : "Pendente"}
                        </Badge>
                      </div>
                    ))}
                    {!data.invitations.length && (
                      <p className="muted">
                        Convide seus dois sócios. O link será exibido uma única
                        vez e deve ser enviado por um canal privado.
                      </p>
                    )}
                  </section>
                  <div className="bottom-grid">
                    <section className="panel">
                      <h3>Custos e dados</h3>
                      <p>
                        Esta versão não chama APIs pagas. O funcionamento local
                        não exige serviços externos. Hospedagem e domínio podem
                        ter custos próprios.
                      </p>
                      <button
                        className="button secondary"
                        onClick={() => {
                          const payload = {
                            exported_at: new Date().toISOString(),
                            offers: data.offers,
                            coupons: data.coupons,
                            sellers: data.sellers,
                            groups: data.groups,
                            drafts: data.drafts,
                            publications: data.publications,
                          };
                          const url = URL.createObjectURL(
                            new Blob([JSON.stringify(payload, null, 2)], {
                              type: "application/json",
                            }),
                          );
                          const a = document.createElement("a");
                          a.href = url;
                          a.download = "radar-exportacao.json";
                          a.click();
                          URL.revokeObjectURL(url);
                        }}
                      >
                        <Download size={16} /> Exportar dados de trabalho
                      </button>
                      <small className="muted">
                        Não inclui credenciais, senhas nem backup completo do
                        banco. Siga o README para backup restaurável.
                      </small>
                    </section>
                    <section className="panel">
                      <h3>Conheça o fluxo</h3>
                      <p>
                        Carregue registros fictícios, rotulados como exemplos,
                        para testar sem credenciais comerciais.
                      </p>
                      <button
                        className="button secondary"
                        disabled={busy || data.datasets.demo_offers > 0}
                        onClick={() =>
                          perform(async () => {
                            if (!data.datasets.demo_offers)
                              await api("demo", "POST", {});
                            currentDataset = "demo";
                          }, "Exemplos carregados.")
                        }
                      >
                        Carregar exemplos identificados
                      </button>
                    </section>
                  </div>
                </>
              )}
              {can("audit.view") && (
                <section className="panel">
                  <div className="panel-title">
                    <h3>Auditoria</h3>
                    <Badge>Últimas 200 ações</Badge>
                  </div>
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Data (Brasília)</th>
                          <th>Pessoa</th>
                          <th>Ação</th>
                          <th>Registro</th>
                          <th>Detalhes</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.audit.map((a) => (
                          <tr key={a.id}>
                            <td>{dateTime(a.created_at)}</td>
                            <td>{a.user_name}</td>
                            <td>{auditLabel(a.action)}</td>
                            <td>{a.entity_type}</td>
                            <td>
                              <details>
                                <summary>Ver detalhes</summary>
                                <pre>{a.details}</pre>
                              </details>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}
            </>
          )}
          <footer className="page-footer">
            <span>
              <Radar size={14} /> Radar de Ofertas IA
            </span>
            <span>
              Curadoria humana. Tecnologia a favor.
              <span className="footer-dot">·</span> Horário de Brasília
            </span>
          </footer>
        </main>
      </div>
      {modal && (
        <ModalShell
          title={modalTitle(modal)}
          close={() => setModal(null)}
          feedback={toast?.error ? toast.text : undefined}
        >
          <ModalContents
            modal={modal}
            data={data}
            busy={busy}
            can={can}
            inviteUrl={inviteUrl}
            setModal={setModal}
            perform={perform}
            onInvite={setInviteUrl}
            onDraft={showDraft}
            onCandidateSaved={(code) =>
              setCandidates((previous) =>
                previous.filter((c) => c.code !== code),
              )
            }
          />
        </ModalShell>
      )}
      {toast && (!modal || !toast.error) && (
        <Toast toast={toast} close={() => setToast(null)} />
      )}
    </div>
  );
}

function Brand() {
  return (
    <div className="brand">
      <span className="brand-symbol">
        <Radar size={27} />
      </span>
      <div>
        radar
        <span>
          de ofertas <b>IA</b>
        </span>
      </div>
    </div>
  );
}
function Toast({
  toast,
  close,
}: {
  toast: { text: string; error?: boolean };
  close: () => void;
}) {
  return (
    <div
      className={`toast ${toast.error ? "error" : ""}`}
      role={toast.error ? "alert" : "status"}
    >
      {toast.error ? <AlertTriangle size={20} /> : <CheckCircle2 size={20} />}
      <span>{toast.text}</span>
      <button className="icon-button" onClick={close} aria-label="Fechar aviso">
        <X size={16} />
      </button>
    </div>
  );
}
function Stat({
  icon: Icon,
  title,
  value,
  note,
  tone,
}: {
  icon: typeof Radar;
  title: string;
  value: number;
  note: string;
  tone: string;
}) {
  return (
    <article className="stat panel">
      <div>
        <span>{title}</span>
        <strong>{value.toString().padStart(2, "0")}</strong>
        <small>{note}</small>
      </div>
      <span className={`stat-icon ${tone}`}>
        <Icon size={21} />
      </span>
    </article>
  );
}
function OfferCard({
  offer: o,
  open,
  generate,
  canPrepare,
}: {
  offer: Offer;
  open: () => void;
  generate: () => void;
  canPrepare: boolean;
}) {
  return (
    <article className="offer-card">
      <div className="offer-image">
        <ProductArt offer={o} />
        <div className="image-labels">
          <Badge>{platforms[o.platform]}</Badge>
          {o.demo === 1 && <Badge tone="amber">Exemplo</Badge>}
        </div>
        <div className="image-bottom">
          <Badge tone={o.status === "approved" ? "green" : "neutral"}>
            <span className="status-dot" />
            {statusNames[o.status]}
          </Badge>
        </div>
      </div>
      <div className="offer-body">
        <div className="category-row">
          <span>{categoryNames[o.category]}</span>
          <span
            className="score-mini"
            title="Score de curadoria baseado nas informações disponíveis; não comprova autenticidade"
          >
            <Sparkles size={13} />
            {o.score.value}
            <small>/100</small>
          </span>
        </div>
        <button className="offer-title" onClick={open}>
          {o.title}
        </button>
        <div className="seller-line">
          <Store size={13} />
          {o.seller.name}
        </div>
        {o.reference_cents && o.reference_source ? (
          <div className="reference-price">
            Referência {o.confidence === "api" ? "da plataforma" : "manual"}{" "}
            <s>{money(o.reference_cents)}</s>
          </div>
        ) : (
          <div className="reference-price">Referência não informada</div>
        )}
        <div className="price-row">
          <strong>{money(o.calculation.final_cents ?? o.price_cents)}</strong>
          <span>
            {o.coupon && o.calculation.state === "eligible"
              ? "estimativa com cupom"
              : "preço informado"}
          </span>
        </div>
        {o.coupon ? (
          <div
            className={`coupon-strip ${o.calculation.state !== "eligible" ? "uncertain" : ""}`}
          >
            <Ticket size={15} />
            <strong>{o.coupon.code}</strong>
            <span>
              {o.calculation.state === "eligible"
                ? "Regras revisadas"
                : "Revisar elegibilidade"}
            </span>
          </div>
        ) : (
          <div className="no-coupon">
            Sem cupom vinculado · frete a conferir
          </div>
        )}
        {o.opportunity?.below_percent != null ? (
          <p className="small-note">
            {o.opportunity.below_percent}% abaixo da mediana observada ·{" "}
            {o.opportunity.count} observações em 30 dias. Não representa todo o
            mercado.
          </p>
        ) : (
          <p className="muted">
            Histórico próprio: {o.opportunity?.count ?? 0} observações
            anteriores; sem comprovação de preço habitual.
          </p>
        )}
        <div className="card-check">
          <Clock3 size={12} />
          {o.confidence === "api"
            ? "Consulta à API"
            : "Conferência manual"}: {dateTime(o.checked_at)}
        </div>
        <div className="card-actions">
          <button className="button secondary" onClick={open}>
            Revisar oferta
          </button>
          {canPrepare && (
            <button
              className="button primary"
              onClick={generate}
              aria-label={`Gerar mensagem: ${o.title}`}
            >
              <MessageSquare size={15} />
              <span>Mensagem</span>
            </button>
          )}
        </div>
      </div>
    </article>
  );
}
function modalTitle(modal: Modal) {
  return {
    offer:
      modal.type === "offer" && modal.value
        ? "Editar oferta"
        : "Nova oferta manual",
    seller: "Cadastro de vendedor",
    group: "Cadastro de grupo",
    coupon: "Revisar cupom e condições",
    detail: "Revisão da oferta",
    generate: "Preparar mensagem",
    check: "Conferência manual",
    invite: "Convidar para a equipe",
    member: "Permissões do operador",
    credential: "Guardar credencial com segurança",
    verify: "Registrar evidência de cupom",
    password: "Alterar senha",
  }[modal.type];
}
function auditLabel(action: string) {
  return (
    (
      {
        created: "Cadastro",
        updated: "Edição",
        login: "Entrada",
        invited: "Convite criado",
        invitation_accepted: "Convite aceito",
        approved: "Aprovação",
        rejected: "Rejeição",
        saved: "Oferta salva",
        draft: "Retorno à revisão",
        manual_check: "Conferência manual",
        prepared: "Mensagem preparada",
        edited: "Mensagem editada",
        copy_declared: "Cópia registrada",
        manual_publication_declared: "Publicação manual declarada",
        verification_declared: "Evidência de cupom",
        permissions_updated: "Permissões alteradas",
        password_reset: "Senha alterada",
        credential_stored: "Credencial guardada",
        demo_loaded: "Exemplos carregados",
      } as Record<string, string>
    )[action] || action
  );
}

type ModalProps = {
  modal: Modal;
  data: State;
  busy: boolean;
  can: (p: Permission) => boolean;
  inviteUrl: string;
  setModal: (m: Modal | null) => void;
  perform: (
    action: () => Promise<unknown>,
    message: string,
    close?: boolean,
  ) => Promise<boolean>;
  onInvite: (url: string) => void;
  onDraft: (d: Draft) => void;
  onCandidateSaved: (code: string) => void;
};
function ModalContents({
  modal,
  data,
  busy,
  can,
  inviteUrl,
  setModal,
  perform,
  onInvite,
  onDraft,
  onCandidateSaved,
}: ModalProps) {
  const saveButton = (text = "Salvar cadastro") => (
    <div className="form-footer">
      <small>Alterações ficam registradas na auditoria.</small>
      <button className="button primary" disabled={busy}>
        {busy ? "Salvando…" : text}
        <Check size={16} />
      </button>
    </div>
  );
  if (modal.type === "seller") {
    const s = modal.value;
    return (
      <form
        onSubmit={(e) => {
          const f = formData(e);
          perform(
            () =>
              api(`sellers${s ? `/${s.id}` : ""}`, s ? "PATCH" : "POST", {
                platform: s?.platform || str(f, "platform"),
                platform_seller_id:
                  s?.platform_seller_id || str(f, "platform_seller_id"),
                name: str(f, "name"),
                reputation: str(f, "reputation"),
                official: f.has("official"),
                authenticity: str(f, "authenticity"),
                trust_status: str(f, "trust_status"),
                evidence: str(f, "evidence"),
              }),
            "Vendedor salvo. Ofertas relacionadas voltam para revisão quando há alterações.",
          );
        }}
      >
        <div className="form-grid">
          <Field label="Nome exato do vendedor">
            <input
              name="name"
              required
              maxLength={200}
              defaultValue={s?.name}
            />
          </Field>
          <Field label="Plataforma">
            <select
              name="platform"
              defaultValue={s?.platform || "mercado_livre"}
              disabled={!!s}
            >
              {Object.entries(platforms).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
          <Field
            label="ID do vendedor na plataforma"
            hint="Copie o identificador real. Para outro ID, cadastre outro vendedor."
          >
            <input
              name="platform_seller_id"
              required
              maxLength={100}
              defaultValue={s?.platform_seller_id}
              readOnly={!!s}
            />
          </Field>
          <Field label="Reputação informada">
            <select name="reputation" defaultValue={s?.reputation || "unknown"}>
              <option value="unknown">Desconhecida</option>
              <option value="good">Boa</option>
              <option value="excellent">Excelente</option>
              <option value="poor">Ruim / risco elevado</option>
            </select>
          </Field>
          <Field label="Classificação manual">
            <select
              name="trust_status"
              defaultValue={s?.trust_status || "review"}
            >
              <option value="review">Em revisão</option>
              <option value="trusted">Confiável segundo evidências</option>
              <option value="blocked">Bloqueado (exige justificativa)</option>
            </select>
          </Field>
          <Field label="Autenticidade">
            <select
              name="authenticity"
              defaultValue={s?.authenticity || "unknown"}
            >
              <option value="unknown">Não verificada</option>
              <option value="evidence">Evidência cadastrada</option>
            </select>
          </Field>
        </div>
        <label className="check-field">
          <input
            name="official"
            type="checkbox"
            defaultChecked={!!s?.official}
          />{" "}
          Loja oficial segundo informação conferida manualmente
        </label>
        <Field
          label="Evidências e justificativa"
          hint="Descreva a fonte e a data. Não acuse falsificação sem fundamento."
        >
          <textarea
            name="evidence"
            rows={4}
            maxLength={4000}
            defaultValue={s?.evidence}
          />
        </Field>
        {saveButton()}
      </form>
    );
  }
  if (modal.type === "group") {
    const g = modal.value;
    return (
      <form
        onSubmit={(e) => {
          const f = formData(e);
          perform(
            () =>
              api(`groups${g ? `/${g.id}` : ""}`, g ? "PATCH" : "POST", {
                name: str(f, "name"),
                channel: str(f, "channel"),
                category: str(f, "category"),
                description: str(f, "description"),
                audience: str(f, "audience"),
                active: f.has("active"),
              }),
            "Grupo salvo. O cadastro não estabelece conexão com o canal.",
          );
        }}
      >
        <div className="form-grid">
          <Field label="Nome do grupo">
            <input
              name="name"
              required
              maxLength={100}
              defaultValue={g?.name}
            />
          </Field>
          <Field label="Canal">
            <select name="channel" defaultValue={g?.channel || "whatsapp"}>
              <option value="whatsapp">WhatsApp · publicação manual</option>
              <option value="telegram">Telegram · publicação manual</option>
            </select>
          </Field>
          <Field label="Nicho">
            <CategorySelect value={g?.category} />
          </Field>
          <Field label="Público">
            <input name="audience" maxLength={500} defaultValue={g?.audience} />
          </Field>
        </div>
        <Field label="Descrição">
          <textarea
            name="description"
            maxLength={1000}
            defaultValue={g?.description}
          />
        </Field>
        <label className="check-field">
          <input
            name="active"
            type="checkbox"
            defaultChecked={g ? !!g.active : true}
          />{" "}
          Grupo ativo para a curadoria
        </label>
        {saveButton()}
      </form>
    );
  }
  if (modal.type === "coupon") {
    const c = modal.value,
      p = modal.candidate;
    return (
      <form
        onSubmit={(e) => {
          const f = formData(e),
            type = str(f, "type");
          perform(async () => {
            await api(`coupons${c ? `/${c.id}` : ""}`, c ? "PATCH" : "POST", {
              code: str(f, "code"),
              platform: str(f, "platform"),
              type,
              value:
                type === "percent"
                  ? Number(str(f, "value"))
                  : cents(f, "value"),
              cap_cents: nullableCents(f, "cap_cents"),
              minimum_cents: cents(f, "minimum_cents"),
              starts_at: utcDate(str(f, "starts_at")),
              ends_at: utcDate(str(f, "ends_at")),
              status: str(f, "status"),
              rules_reviewed: f.has("rules_reviewed"),
              source: str(f, "source"),
              original_text: str(f, "original_text"),
              categories: f.getAll("categories"),
              seller_ids: array(f, "seller_ids"),
              excluded_seller_ids: array(f, "excluded_seller_ids"),
              official_only: f.has("official_only"),
              payment: str(f, "payment"),
              audience: str(f, "audience"),
              unknown_conditions: str(f, "unknown_conditions")
                .split("\n")
                .map((s) => s.trim())
                .filter(Boolean),
            });
            if (p) onCandidateSaved(p.code);
          }, "Cupom salvo após revisão humana. Isso não confirma aplicação no checkout.");
        }}
      >
        <div className="notice warning">
          <Ticket size={18} />
          <p>
            Confira cada condição no texto original. Campos sem informação não
            devem ser inventados. As datas abaixo usam o horário de Brasília.
          </p>
        </div>
        <div className="form-grid">
          <Field label="Código">
            <input
              name="code"
              required
              maxLength={32}
              defaultValue={c?.code || p?.code}
            />
          </Field>
          <Field label="Plataforma">
            <PlatformSelect value={c?.platform} />
          </Field>
          <Field label="Tipo de desconto">
            <select name="type" defaultValue={c?.type || p?.type || "percent"}>
              <option value="percent">Percentual (%)</option>
              <option value="fixed">Valor fixo (R$)</option>
            </select>
          </Field>
          <Field label="Valor (% ou R$, conforme o tipo)">
            <input
              name="value"
              type="number"
              required
              min="0.01"
              step="0.01"
              defaultValue={
                c
                  ? c.type === "percent"
                    ? c.value
                    : c.value / 100
                  : p
                    ? p.type === "percent"
                      ? p.value
                      : p.value / 100
                    : ""
              }
            />
          </Field>
          <Field
            label="Teto do desconto (R$)"
            hint="Em branco = não informado / sem teto conhecido."
          >
            <input
              name="cap_cents"
              type="number"
              min="0"
              step="0.01"
              defaultValue={
                (c?.cap_cents ?? p?.cap_cents) != null
                  ? (c?.cap_cents ?? p?.cap_cents)! / 100
                  : ""
              }
            />
          </Field>
          <Field label="Compra mínima (R$)">
            <input
              name="minimum_cents"
              type="number"
              required
              min="0"
              step="0.01"
              defaultValue={(c?.minimum_cents ?? p?.minimum_cents ?? 0) / 100}
            />
          </Field>
          <Field label="Início (Brasília)">
            <input
              name="starts_at"
              type="datetime-local"
              defaultValue={localDate(c?.starts_at)}
            />
          </Field>
          <Field label="Fim (Brasília)">
            <input
              name="ends_at"
              type="datetime-local"
              defaultValue={localDate(c?.ends_at)}
            />
          </Field>
          <Field label="Status informado">
            <select
              name="status"
              defaultValue={
                c?.status === "verified"
                  ? "apparently_active"
                  : c?.status || "unknown"
              }
            >
              {[
                "unknown",
                "announced",
                "apparently_active",
                "expired",
                "exhausted",
                "invalid",
              ].map((s) => (
                <option key={s} value={s}>
                  {statusNames[s]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Fonte da informação">
            <input
              name="source"
              required
              maxLength={1000}
              defaultValue={c?.source}
              placeholder="Canal, documento ou URL consultada"
            />
          </Field>
        </div>
        <fieldset>
          <legend>Categorias elegíveis</legend>
          <p className="muted">
            Nenhuma seleção significa sem restrição de categoria conhecida.
            Confirme na fonte.
          </p>
          <div className="check-grid">
            {categories
              .filter((x) => x !== "geral")
              .map((x) => (
                <label className="check-field" key={x}>
                  <input
                    name="categories"
                    type="checkbox"
                    value={x}
                    defaultChecked={c?.categories.includes(x)}
                  />
                  {categoryNames[x]}
                </label>
              ))}
          </div>
        </fieldset>
        <div className="form-grid">
          <Field
            label="IDs de vendedores elegíveis"
            hint="Separados por vírgulas. Em branco: sem lista conhecida."
          >
            <input name="seller_ids" defaultValue={c?.seller_ids.join(", ")} />
          </Field>
          <Field label="IDs de vendedores excluídos">
            <input
              name="excluded_seller_ids"
              defaultValue={c?.excluded_seller_ids.join(", ")}
            />
          </Field>
          <Field
            label="Restrição de pagamento"
            hint="Se houver restrição, o cálculo aguardará confirmação específica da compra."
          >
            <input name="payment" maxLength={200} defaultValue={c?.payment} />
          </Field>
          <Field label="Público / elegibilidade especial">
            <input name="audience" maxLength={500} defaultValue={c?.audience} />
          </Field>
        </div>
        <label className="check-field">
          <input
            type="checkbox"
            name="official_only"
            defaultChecked={!!c?.official_only}
          />{" "}
          Exclusivo de lojas oficiais
        </label>
        <Field label="Texto original">
          <textarea
            name="original_text"
            rows={4}
            maxLength={20000}
            defaultValue={c?.original_text || p?.original_text}
          />
        </Field>
        <Field
          label="Condições desconhecidas (uma por linha)"
          hint="Remova uma pendência somente depois de esclarecê-la. Pendências impedem o cálculo de elegibilidade."
        >
          <textarea
            name="unknown_conditions"
            rows={3}
            defaultValue={(
              c?.unknown_conditions ||
              p?.unknown_conditions || [
                "Validade e restrições precisam de revisão.",
              ]
            ).join("\n")}
          />
        </Field>
        <label className="check-field important">
          <input
            type="checkbox"
            name="rules_reviewed"
            defaultChecked={!!c?.rules_reviewed}
          />{" "}
          Revisei manualmente as regras, as categorias e os vendedores. Não
          estou declarando aplicação confirmada.
        </label>
        {saveButton("Confirmar e salvar cupom")}
      </form>
    );
  }
  if (modal.type === "offer") {
    const o = modal.value;
    return (
      <form
        onSubmit={(e) => {
          const f = formData(e);
          perform(
            () =>
              api(`offers${o ? `/${o.id}` : ""}`, o ? "PATCH" : "POST", {
                title: str(f, "title"),
                category: str(f, "category"),
                variation: str(f, "variation"),
                platform: str(f, "platform"),
                platform_listing_id: str(f, "platform_listing_id"),
                seller_id: str(f, "seller_id"),
                url: str(f, "url"),
                image_url: str(f, "image_url"),
                price_cents: cents(f, "price_cents"),
                reference_cents: nullableCents(f, "reference_cents"),
                reference_source: str(f, "reference_source"),
                shipping_cents: nullableCents(f, "shipping_cents"),
                coupon_id: str(f, "coupon_id") || null,
                group_ids: f.getAll("group_ids"),
                affiliate_url: str(f, "affiliate_url"),
              }),
            "Oferta salva em revisão. Preço e links registrados como informações manuais.",
          );
        }}
      >
        <div className="notice">
          <CircleHelp size={18} />
          <p>
            Cadastre somente dados que você conferiu. Links não são consultados
            automaticamente. Se necessário, cadastre antes o vendedor e o grupo.
          </p>
        </div>
        <Field label="Nome do produto">
          <input
            name="title"
            required
            maxLength={300}
            defaultValue={o?.title}
          />
        </Field>
        <div className="form-grid">
          <Field label="Plataforma">
            <PlatformSelect value={o?.platform} />
          </Field>
          <Field label="ID do anúncio / produto na plataforma">
            <input
              name="platform_listing_id"
              required
              maxLength={100}
              defaultValue={o?.platform_listing_id}
            />
          </Field>
          <Field label="Categoria">
            <CategorySelect value={o?.category} />
          </Field>
          <Field label="Variação (cor, tamanho, capacidade…)">
            <input
              name="variation"
              maxLength={200}
              defaultValue={o?.variation}
            />
          </Field>
          <Field label="Vendedor recomendado">
            <select name="seller_id" required defaultValue={o?.seller_id || ""}>
              <option value="" disabled>
                Selecione o vendedor
              </option>
              {data.sellers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} · {platforms[s.platform]} · {s.platform_seller_id}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Cupom opcional">
            <select name="coupon_id" defaultValue={o?.coupon_id || ""}>
              <option value="">Sem cupom</option>
              {data.coupons.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.code} · {platforms[c.platform]}
                  {c.demo ? " (exemplo)" : ""}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Preço conferido agora (R$)">
            <input
              name="price_cents"
              type="number"
              required
              min="0.01"
              step="0.01"
              defaultValue={o ? o.price_cents / 100 : ""}
            />
          </Field>
          <Field
            label="Frete conhecido (R$)"
            hint="Em branco = desconhecido; não incluído na estimativa."
          >
            <input
              name="shipping_cents"
              type="number"
              min="0"
              step="0.01"
              defaultValue={
                o?.shipping_cents != null ? o.shipping_cents / 100 : ""
              }
            />
          </Field>
          <Field
            label="Preço de referência (R$)"
            hint="Opcional. Não invente um preço anterior."
          >
            <input
              name="reference_cents"
              type="number"
              min="0"
              step="0.01"
              defaultValue={o?.reference_cents ? o.reference_cents / 100 : ""}
            />
          </Field>
          <Field label="Origem do preço de referência">
            <input
              name="reference_source"
              maxLength={1000}
              defaultValue={o?.reference_source || ""}
              placeholder="Ex.: anúncio consultado em determinada data"
            />
          </Field>
        </div>
        <Field label="URL original do produto (HTTPS)">
          <input
            type="url"
            name="url"
            required
            maxLength={2048}
            defaultValue={o?.url}
          />
        </Field>
        <Field
          label="Link de afiliado criado manualmente (opcional)"
          hint="Colado por você pelo fluxo autorizado da plataforma. Sem garantia de rastreamento ou comissão."
        >
          <input
            type="url"
            name="affiliate_url"
            maxLength={2048}
            defaultValue={o?.affiliate_url || ""}
          />
        </Field>
        <Field
          label="URL HTTPS da foto (opcional)"
          hint="Use uma imagem que tenha autorização para exibir. Sem foto, mostramos uma ilustração identificada."
        >
          <input
            type="url"
            name="image_url"
            maxLength={2048}
            defaultValue={o?.image_url || ""}
          />
        </Field>
        <fieldset>
          <legend>Grupos de destino</legend>
          {data.groups
            .filter((g) => g.active)
            .map((g) => (
              <label className="check-field" key={g.id}>
                <input
                  name="group_ids"
                  type="checkbox"
                  value={g.id}
                  defaultChecked={o?.group_ids.includes(g.id)}
                />
                {g.name}
              </label>
            ))}
          {!data.groups.length && (
            <p className="muted">
              Cadastre um grupo para preparar mensagens depois.
            </p>
          )}
        </fieldset>
        {saveButton("Salvar oferta em revisão")}
      </form>
    );
  }
  if (modal.type === "detail") {
    const o = data.offers.find((x) => x.id === modal.value.id) || modal.value;
    return (
      <div className="offer-detail">
        <div className="button-row">
          <Badge tone={o.status === "approved" ? "green" : "amber"}>
            {statusNames[o.status]}
          </Badge>
          {o.demo === 1 && <Badge tone="amber">Exemplo fictício</Badge>}
          <Badge>
            Score {o.score.value}/100 · confiança {o.score.confidence}
          </Badge>
        </div>
        <h3>{o.title}</h3>
        <p>
          {platforms[o.platform]} · {categoryNames[o.category]} ·{" "}
          {o.variation || "Variação não informada"}
        </p>
        <dl className="compact-dl">
          <div>
            <dt>Vendedor</dt>
            <dd>
              {o.seller.name} · ID {o.seller.platform_seller_id}
            </dd>
          </div>
          <div>
            <dt>Preço informado</dt>
            <dd>{money(o.price_cents)}</dd>
          </div>
          <div>
            <dt>
              {o.confidence === "api"
                ? "Consulta à API oficial"
                : "Conferência manual"}
            </dt>
            <dd>{dateTime(o.checked_at)} · Brasília</dd>
          </div>
          <div>
            <dt>Frete conhecido</dt>
            <dd>
              {o.shipping_cents === null
                ? "Não informado"
                : money(o.shipping_cents)}
            </dd>
          </div>
          <div>
            <dt>Preço com cupom</dt>
            <dd>
              {o.coupon && o.calculation.final_cents !== null
                ? `${money(o.calculation.final_cents)} (estimativa, não confirmada)`
                : "Sem estimativa aplicável"}
            </dd>
          </div>
        </dl>
        <div className="notice warning">
          <AlertTriangle size={20} />
          <div>
            {o.calculation.reasons.map((r) => (
              <p key={r}>{r}</p>
            ))}
            {o.score.warnings.map((w) => (
              <p key={w}>{w}</p>
            ))}
          </div>
        </div>
        {data.alerts
          .filter((a) => a.message.includes(o.seller.platform_seller_id))
          .map((a) => (
            <div className="notice warning" key={a.id}>
              {a.message}
            </div>
          ))}
        <SellerApiEvidence seller={o.seller} />
        {o.api_metadata && (
          <div className="notice">
            <div>
              <strong>Dados da última consulta à API</strong>
              <p>
                Estoque informado: {o.stock_quantity ?? "não disponibilizado"} ·
                confirme no checkout. Vendas informadas do anúncio:{" "}
                {String(
                  readApiFacts(o.api_metadata).sold_quantity ??
                    "não disponibilizadas",
                )}
                .
              </p>
              <p>
                Categoria da plataforma:{" "}
                {String(
                  readApiFacts(o.api_metadata).category_id ??
                    "não disponibilizada",
                )}
                . A classificação interna e a compatibilidade com cupons exigem
                revisão. A API não comprova originalidade.
              </p>
            </div>
          </div>
        )}
        <h4>Como o score foi calculado</h4>
        {o.score.factors.map((f) => (
          <div className="score-factor" key={f.label}>
            <span>{f.label}</span>
            <meter min={0} max={f.maximum} value={f.points} />
            <strong>
              {f.points}/{f.maximum}
            </strong>
          </div>
        ))}
        <p className="muted">
          Score de curadoria baseado nas informações disponíveis. Não prevê
          vendas e não garante segurança, autenticidade ou preço.
        </p>
        <div className="link-row">
          <a href={o.url} target="_blank" rel="noopener noreferrer">
            Abrir anúncio <ArrowUpRight size={15} />
          </a>
          {o.affiliate_url && (
            <a href={o.affiliate_url} target="_blank" rel="noopener noreferrer">
              Link informado como afiliado (não verificado){" "}
              <ArrowUpRight size={15} />
            </a>
          )}
        </div>
        <p className="small-note">
          Links informados em {dateTime(o.affiliate_checked_at || o.checked_at)}{" "}
          · validação sintática; destino e comissão não confirmados.
        </p>
        <div className="button-row">
          {can("offers.manage") && (
            <>
              <button
                className="button secondary"
                onClick={() => setModal({ type: "offer", value: o })}
              >
                Editar oferta
              </button>
              <button
                className="button secondary"
                onClick={() => setModal({ type: "check", value: o })}
              >
                <RefreshCw size={15} /> Conferir manualmente
              </button>
            </>
          )}
          {can("posts.prepare") && (
            <button
              className="button primary"
              onClick={() => setModal({ type: "generate", value: o })}
            >
              Gerar mensagem
            </button>
          )}
        </div>
        {can("offers.approve") && (
          <form
            onSubmit={(e) => {
              const f = formData(e);
              const target = (e.nativeEvent as SubmitEvent)
                .submitter as HTMLButtonElement;
              perform(
                () =>
                  api(`offers/${o.id}/status`, "POST", {
                    status: target.value,
                    reason: str(f, "reason"),
                  }),
                "Revisão registrada.",
                false,
              );
            }}
          >
            <Field
              label="Justificativa da revisão"
              hint="Obrigatória para aprovar categoria sensível sem evidência de autenticidade. Não representa garantia de originalidade."
            >
              <textarea name="reason" maxLength={2000} rows={3} />
            </Field>
            <div className="button-row">
              <button
                name="status"
                value="approved"
                className="button primary"
                disabled={busy || o.score.blocked}
              >
                <Check size={16} /> Aprovar
              </button>
              <button
                name="status"
                value="rejected"
                className="button danger"
                disabled={busy}
              >
                Rejeitar
              </button>
              <button
                name="status"
                value="draft"
                className="button secondary"
                disabled={busy}
              >
                Voltar à revisão
              </button>
              <button
                name="status"
                value="saved"
                className="button secondary"
                disabled={busy}
              >
                Salvar para depois
              </button>
            </div>
          </form>
        )}
      </div>
    );
  }
  if (modal.type === "check")
    return (
      <form
        onSubmit={(e) => {
          const f = formData(e);
          perform(async () => {
            const result = await api<{ mismatch: boolean; message: string }>(
              `offers/${modal.value.id}/check`,
              "POST",
              {
                observed_seller_id: str(f, "observed_seller_id"),
                price_cents: cents(f, "price_cents"),
                evidence: str(f, "evidence"),
              },
            );
            if (result.mismatch) throw new Error(result.message);
          }, "Conferência manual registrada. A oferta voltou para revisão.");
        }}
      >
        <p>
          Abra o anúncio e confira você mesmo. Nenhum preço será buscado
          automaticamente.
        </p>
        <a href={modal.value.url} target="_blank" rel="noopener noreferrer">
          Abrir anúncio <ArrowUpRight size={15} />
        </a>
        <Field
          label="ID do vendedor que aparece agora"
          hint={`Esperado: ${modal.value.seller.platform_seller_id}`}
        >
          <input name="observed_seller_id" required />
        </Field>
        <Field label="Preço do anúncio agora (R$)">
          <input
            name="price_cents"
            type="number"
            step="0.01"
            min="0.01"
            required
          />
        </Field>
        <Field label="Fonte / observação da conferência">
          <input name="evidence" required minLength={5} maxLength={2000} />
        </Field>
        {saveButton("Registrar conferência")}
      </form>
    );
  if (modal.type === "generate")
    return (
      <form
        onSubmit={(e) => {
          const f = formData(e);
          perform(async () => {
            const created = await api<{ id: string }>("drafts", "POST", {
              offer_id: modal.value.id,
              group_id: str(f, "group_id"),
              style: str(f, "style"),
            });
            const fresh = await api<State>("state");
            onDraft(fresh.drafts.find((d) => d.id === created.id)!);
          }, "Rascunho criado. Revise o texto antes de copiar.");
        }}
      >
        <p>
          O gerador usa um modelo determinístico com os dados cadastrados. Não
          usa IA externa nem inventa informações.
        </p>
        <Field label="Grupo de destino">
          <select name="group_id" required defaultValue="">
            <option value="" disabled>
              Escolha um grupo vinculado
            </option>
            {data.groups
              .filter((g) => g.active && modal.value.group_ids.includes(g.id))
              .map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
          </select>
        </Field>
        {!modal.value.group_ids.length && (
          <div className="notice warning">
            Edite a oferta e vincule pelo menos um grupo primeiro.
          </div>
        )}
        <Field label="Tom da mensagem">
          <select name="style">
            <option value="informativo">Informativo</option>
            <option value="empolgado">Empolgado, sem exageros</option>
            <option value="comercial">Comercial</option>
          </select>
        </Field>
        {saveButton("Gerar rascunho")}
      </form>
    );
  if (modal.type === "invite")
    return inviteUrl ? (
      <div>
        <div className="notice">
          <ShieldCheck size={20} />
          <p>
            Convite criado. Expira em 48 horas e só pode ser utilizado uma vez.
            O aplicativo não envia e-mails.
          </p>
        </div>
        <Field
          label="Link privado de convite"
          hint="Copie e envie pessoalmente ao sócio. Este link só aparece agora."
        >
          <input
            readOnly
            value={inviteUrl}
            onFocus={(e) => e.target.select()}
          />
        </Field>
        <button className="button primary" onClick={() => setModal(null)}>
          Concluir
        </button>
      </div>
    ) : (
      <form
        onSubmit={(e) => {
          const f = formData(e);
          perform(
            async () => {
              const result = await api<{ url: string }>(
                "users/invite",
                "POST",
                { name: str(f, "name"), email: str(f, "email") },
              );
              onInvite(result.url);
            },
            "Convite criado. Envie o link por um canal privado.",
            false,
          );
        }}
      >
        <Field label="Nome do sócio">
          <input name="name" required minLength={2} maxLength={100} />
        </Field>
        <Field label="E-mail pessoal">
          <input name="email" type="email" required />
        </Field>
        <div className="notice">
          A nova conta será de operador. Somente o administrador gerencia
          credenciais e configurações financeiras.
        </div>
        {saveButton("Criar convite")}
      </form>
    );
  if (modal.type === "member")
    return (
      <form
        onSubmit={(e) => {
          const f = formData(e);
          perform(
            () =>
              api(`users/${modal.value.id}/permissions`, "PATCH", {
                active: f.has("active"),
                permissions: commonPermissions.map((p) => ({
                  permission: p,
                  allowed: f.getAll("permissions").includes(p),
                })),
              }),
            "Permissões atualizadas. As sessões anteriores do operador foram encerradas.",
          );
        }}
      >
        <h3>{modal.value.name}</h3>
        <label className="check-field important">
          <input
            name="active"
            type="checkbox"
            defaultChecked={!!modal.value.active}
          />{" "}
          Conta ativa
        </label>
        <fieldset>
          <legend>Permissões</legend>
          {commonPermissions.map((p) => (
            <label className="check-field" key={p}>
              <input
                name="permissions"
                type="checkbox"
                value={p}
                defaultChecked={modal.value.permissions.includes(p)}
              />
              {permissionLabels[p]}
            </label>
          ))}
        </fieldset>
        <p className="muted">
          Credenciais, usuários e configurações financeiras permanecem
          exclusivos do administrador principal.
        </p>
        {saveButton("Salvar permissões")}
      </form>
    );
  if (modal.type === "credential")
    return (
      <form
        onSubmit={(e) => {
          const f = formData(e);
          perform(
            () =>
              api(`integrations/${modal.value.id}`, "PATCH", {
                credential: str(f, "credential"),
              }),
            "Credencial cifrada e guardada. A integração continua sem conexão automática.",
          );
        }}
      >
        <div className="notice warning">
          <LockKeyhole size={20} />
          <p>
            Opcional. Nenhum conector usa esta credencial nesta fase. O servidor
            precisa ter INTEGRATION_ENCRYPTION_KEY configurada. Nunca
            compartilhe segredos no chat.
          </p>
        </div>
        <Field
          label={`Credencial de ${modal.value.name}`}
          hint="Será cifrada com AES-256-GCM e não poderá ser visualizada pela interface."
        >
          <input
            name="credential"
            type="password"
            autoComplete="off"
            maxLength={10000}
            required
          />
        </Field>
        {saveButton("Cifrar e guardar")}
      </form>
    );
  if (modal.type === "verify")
    return (
      <form
        onSubmit={(e) => {
          const f = formData(e);
          perform(
            () =>
              api(`coupons/${modal.value.id}/verify`, "POST", {
                evidence: str(f, "evidence"),
              }),
            "Evidência humana registrada. O preço continua sendo estimativa para outras compras.",
          );
        }}
      >
        <p>
          Registre o que você verificou, quando e em qual compra. Receber um
          código em uma mensagem não é verificação.
        </p>
        <Field
          label="Evidência de aplicação"
          hint="Ex.: checkout consultado, produto, vendedor, horário e condições observadas. Não inclua dados pessoais ou de pagamento."
        >
          <textarea
            name="evidence"
            rows={5}
            required
            minLength={20}
            maxLength={4000}
          />
        </Field>
        {saveButton("Registrar evidência manual")}
      </form>
    );
  if (modal.type === "password")
    return (
      <form
        onSubmit={(e) => {
          const f = formData(e);
          perform(
            () =>
              api(`users/${modal.value.id}/password`, "POST", {
                password: String(f.get("password") || ""),
                current_password: String(f.get("current_password") || ""),
              }),
            "Senha alterada. As sessões da conta foram encerradas.",
          );
        }}
      >
        <p>
          Alterar a senha de {modal.value.name}. Todas as sessões dessa conta
          serão encerradas. Se alterar a própria senha, entre novamente.
        </p>
        <Field label="Sua senha atual de administrador">
          <input
            name="current_password"
            type="password"
            autoComplete="current-password"
            required
            maxLength={128}
          />
        </Field>
        <Field label="Nova senha da conta">
          <input
            name="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={12}
            maxLength={128}
          />
        </Field>
        {saveButton("Alterar senha")}
      </form>
    );
  return null;
}

function readApiFacts(raw: string | null | undefined): Record<string, unknown> {
  try {
    const data = JSON.parse(raw || "{}");
    return data && typeof data === "object" && !Array.isArray(data) ? data : {};
  } catch {
    return {};
  }
}
function SellerApiEvidence({ seller }: { seller: Seller }) {
  if (!seller.api_metrics) return null;
  const data = readApiFacts(seller.api_metrics);
  const transactions =
    data.transactions && typeof data.transactions === "object"
      ? (data.transactions as Record<string, unknown>)
      : {};
  return (
    <details className="seller-api-evidence">
      <summary>Dados do vendedor recebidos da API</summary>
      <p>
        Consulta:{" "}
        {seller.api_checked_at
          ? dateTime(seller.api_checked_at)
          : "Data não disponível"}
        . Nível informado: {String(data.level_id ?? "não disponibilizado")}.
        Classificação:{" "}
        {String(data.power_seller_status ?? "não disponibilizada")}.
      </p>
      <p>
        Transações totais informadas:{" "}
        {String(transactions.total ?? "não disponibilizadas")}. Não é o volume
        de vendas deste produto. A reputação não garante autenticidade e não
        altera suas listas manuais de confiança.
      </p>
    </details>
  );
}
