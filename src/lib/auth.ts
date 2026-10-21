import {
  randomBytes,
  scryptSync,
  timingSafeEqual,
  createHash,
  createCipheriv,
  createDecipheriv,
} from "node:crypto";
import { all, one, run, now, permissions, type Permission } from "./db";

export class AppError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export type User = {
  id: string;
  name: string;
  email: string;
  role: "owner" | "operator";
  active: number;
  permissions: Permission[];
};
export const hashToken = (token: string) =>
  createHash("sha256").update(token).digest("hex");
export const newToken = () => randomBytes(32).toString("hex");
export function hashPassword(password: string) {
  if (password.length < 12 || password.length > 128)
    throw new AppError("Use uma senha entre 12 e 128 caracteres.");
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
}
export function verifyPassword(password: string, saved: string) {
  const [salt, digest] = saved.split(":");
  if (!salt || !digest || password.length > 128) return false;
  const calculated = scryptSync(password, salt, 64);
  const original = Buffer.from(digest, "hex");
  return (
    original.length === calculated.length &&
    timingSafeEqual(calculated, original)
  );
}
export function publicUser(userId: string): User | undefined {
  const user = one<Omit<User, "permissions">>(
    "SELECT id,name,email,role,active FROM users WHERE id=?",
    userId,
  );
  if (!user || !user.active) return;
  const defaults = new Set<Permission>(
    user.role === "owner"
      ? permissions
      : permissions.filter(
          (p) =>
            ![
              "users.manage",
              "integrations.manage",
              "settings.manage",
              "audit.view",
            ].includes(p),
        ),
  );
  if (user.role !== "owner")
    for (const override of all<{ permission: Permission; allowed: number }>(
      "SELECT permission,allowed FROM user_permissions WHERE user_id=?",
      userId,
    )) {
      if (override.allowed) defaults.add(override.permission);
      else defaults.delete(override.permission);
    }
  return { ...user, permissions: [...defaults] };
}
export function requirePermission(user: User, permission: Permission) {
  const ownerOnly = ["users.manage", "integrations.manage", "settings.manage"];
  if (
    (ownerOnly.includes(permission) && user.role !== "owner") ||
    !user.permissions.includes(permission)
  )
    throw new AppError("Você não tem permissão para esta ação.", 403);
}
export function authenticate(token: string | undefined) {
  if (!token) throw new AppError("Entre na sua conta para continuar.", 401);
  const session = one<{ user_id: string }>(
    "SELECT user_id FROM sessions WHERE token_hash=? AND expires_at>?",
    hashToken(token),
    now(),
  );
  const user = session && publicUser(session.user_id);
  if (!user) throw new AppError("Sua sessão terminou. Entre novamente.", 401);
  return user;
}
export function createSession(userId: string) {
  const token = newToken();
  run("DELETE FROM sessions WHERE expires_at<?", now());
  run(
    "INSERT INTO sessions VALUES (?,?,?)",
    hashToken(token),
    userId,
    new Date(Date.now() + 7 * 86400000).toISOString(),
  );
  return token;
}
export function limit(key: string, max: number, windowMs = 900000) {
  const timestamp = Date.now();
  run(
    "INSERT INTO rate_limits VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN resets_at<=? THEN 1 ELSE count+1 END,resets_at=CASE WHEN resets_at<=? THEN excluded.resets_at ELSE resets_at END",
    key,
    timestamp + windowMs,
    timestamp,
    timestamp,
  );
  const item = one<{ count: number }>(
    "SELECT count FROM rate_limits WHERE key=?",
    key,
  )!;
  if (item.count > max)
    throw new AppError(
      "Muitas tentativas. Aguarde alguns minutos e tente novamente.",
      429,
    );
}
function encryptionKey() {
  const key = process.env.INTEGRATION_ENCRYPTION_KEY || "";
  if (!/^[a-f\d]{64}$/i.test(key))
    throw new AppError(
      "O administrador precisa configurar a chave de criptografia no servidor antes de salvar credenciais.",
      503,
    );
  return Buffer.from(key, "hex");
}
export function encryptCredential(value: string) {
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(value, "utf8"),
    cipher.final(),
  ]);
  return [iv, cipher.getAuthTag(), encrypted]
    .map((b) => b.toString("base64"))
    .join(".");
}
// Exclusivo para futuros conectores no servidor; nunca retornar à interface.
export function decryptCredential(value: string) {
  const [iv, tag, content] = value
    .split(".")
    .map((b) => Buffer.from(b, "base64"));
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(content), decipher.final()]).toString(
    "utf8",
  );
}
