import { rmSync } from "node:fs";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { db, id, run } from "../src/lib/db";
import { hashPassword } from "../src/lib/auth";
export const testPassword = "Fixture-e2e-somente-testes-123!";
export default function setup() {
  // Banco descartável separado do banco de trabalho. Sem conta padrão em produção.
  process.env.DATABASE_PATH = resolve("data/e2e.sqlite");
  for (const suffix of ["", "-wal", "-shm"])
    rmSync(process.env.DATABASE_PATH + suffix, { force: true });
  db();
  run(
    "INSERT INTO users (id,name,email,password_hash,role) VALUES (?,?,?,?,?)",
    id(),
    "Equipe de teste",
    "e2e@example.test",
    hashPassword(testPassword),
    "owner",
  );
  // Checkpoint deixa o arquivo pronto para o processo do Next.
  const connection = new DatabaseSync(process.env.DATABASE_PATH);
  connection.exec("PRAGMA wal_checkpoint(TRUNCATE)");
  connection.close();
}
