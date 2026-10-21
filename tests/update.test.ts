import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
const require = createRequire(import.meta.url);
const { update, verifyPath } = require("../atualizar-radar.cjs") as {
  update: (
    target: string,
    source: string,
    install: boolean,
  ) => Promise<{ backup: string }>;
  verifyPath: (path: string) => string;
};
test("atualização mantém banco antigo, conta, senha, permissões, configuração e arquivos pessoais", async () => {
  const root = resolve("."),
    target = mkdtempSync(join(tmpdir(), "radar-old-install-"));
  try {
    mkdirSync(join(target, "data"), { recursive: true });
    const config =
      "DATABASE_PATH=./data/privado.sqlite\nAPP_URL=http://localhost:3199\nINTEGRATION_ENCRYPTION_KEY=" +
      "3".repeat(64) +
      "\n";
    writeFileSync(join(target, ".env.local"), config, { mode: 0o600 });
    writeFileSync(
      join(target, "package.json"),
      JSON.stringify({ name: "radar-de-ofertas-ia", version: "0.1.0" }),
    );
    writeFileSync(join(target, "README.md"), "Código anterior preservado");
    writeFileSync(
      join(target, "NOTAS_PESSOAIS.txt"),
      "Não sobrescrever este arquivo.",
    );
    const old = new DatabaseSync(join(target, "data", "privado.sqlite"));
    old.exec(
      "PRAGMA foreign_keys=ON;CREATE TABLE migrations(name TEXT PRIMARY KEY,applied_at TEXT NOT NULL)",
    );
    for (const name of ["001_initial.sql", "002_offer_versions.sql"]) {
      old.exec(readFileSync(join(root, "migrations", name), "utf8"));
      old
        .prepare("INSERT INTO migrations VALUES (?,?)")
        .run(name, "2026-10-20T00:00:00Z");
    }
    old
      .prepare(
        "INSERT INTO users(id,name,email,password_hash,role) VALUES (?,?,?,?,?)",
      )
      .run(
        "owner-fixture",
        "Nome preservado",
        "old@example.test",
        "hash-fixture-preservado",
        "owner",
      );
    old.exec(
      "INSERT INTO permissions VALUES ('offers.view');INSERT INTO user_permissions VALUES ('owner-fixture','offers.view',1);INSERT INTO sessions VALUES ('hash-sessao-fixture','owner-fixture','2099-01-01T00:00:00Z');UPDATE integrations SET credential_ciphertext='ciphertext-fixture-preservado',status='configured' WHERE id='mercado_livre';",
    );
    old.close();
    const result = await update(target, root, false);
    assert.equal(readFileSync(join(target, ".env.local"), "utf8"), config);
    assert.equal(
      readFileSync(join(target, "NOTAS_PESSOAIS.txt"), "utf8"),
      "Não sobrescrever este arquivo.",
    );
    assert.equal(
      readFileSync(join(result.backup, "codigo", "README.md"), "utf8"),
      "Código anterior preservado",
    );
    assert.equal(
      readFileSync(join(result.backup, ".env.local"), "utf8"),
      config,
    );
    const backup = new DatabaseSync(join(result.backup, "radar.sqlite"), {
      readOnly: true,
    });
    assert.equal(
      (
        backup.prepare("SELECT COUNT(*) count FROM users").get() as {
          count: number;
        }
      ).count,
      1,
    );
    backup.close();
    const migrated = spawnSync(
      process.execPath,
      [
        join(root, "node_modules", "tsx", "dist", "cli.mjs"),
        join(root, "scripts", "migrate.ts"),
      ],
      {
        cwd: target,
        env: {
          ...process.env,
          DATABASE_PATH: join(target, "data", "privado.sqlite"),
        },
        encoding: "utf8",
      },
    );
    assert.equal(migrated.status, 0, migrated.stderr);
    const current = new DatabaseSync(join(target, "data", "privado.sqlite"), {
      readOnly: true,
    });
    const owner = current.prepare("SELECT * FROM users").get()!;
    assert.equal(owner.email, "old@example.test");
    assert.equal(owner.password_hash, "hash-fixture-preservado");
    assert.equal(owner.active, 1);
    assert.equal(
      (
        current.prepare("SELECT COUNT(*) count FROM users").get() as {
          count: number;
        }
      ).count,
      1,
    );
    assert.equal(
      current.prepare("SELECT allowed FROM user_permissions").get()!.allowed,
      1,
    );
    assert.equal(
      current.prepare("SELECT token_hash FROM sessions").get()!.token_hash,
      "hash-sessao-fixture",
    );
    assert.equal(
      current
        .prepare(
          "SELECT credential_ciphertext FROM integrations WHERE id='mercado_livre'",
        )
        .get()!.credential_ciphertext,
      "ciphertext-fixture-preservado",
    );
    assert.ok(
      current
        .prepare("SELECT name FROM migrations WHERE name='003_radar.sql'")
        .get(),
    );
    assert.equal(
      current.prepare("PRAGMA integrity_check").get()!.integrity_check,
      "ok",
    );
    current.close();
  } finally {
    rmSync(target, { recursive: true, force: true });
  }
});
test("manifesto da atualização não permite apagar ou substituir dados privados", () => {
  for (const value of [
    "../fora",
    "data/radar.sqlite",
    ".env.local",
    "node_modules/pacote",
    "/tmp/fora",
  ])
    assert.throws(() => verifyPath(value));
  assert.equal(verifyPath("src/lib/radar.ts"), "src/lib/radar.ts");
  assert.equal(verifyPath(".env.example"), ".env.example");
});
