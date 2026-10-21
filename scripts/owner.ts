import { loadEnvConfig } from "@next/env";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { hashPassword } from "../src/lib/auth";
import { id, one, run, transaction } from "../src/lib/db";
import { z } from "zod";

loadEnvConfig(process.cwd());

async function main() {
  if (one("SELECT id FROM users WHERE role=?", "owner"))
    throw new Error(
      "O administrador principal já existe. Use a tela Administração.",
    );
  if (!stdin.isTTY)
    throw new Error(
      "Execute em um terminal interativo. Senhas não são aceitas como argumentos.",
    );
  const rl = createInterface({ input: stdin, output: stdout });
  const name = z
    .string()
    .trim()
    .min(2)
    .max(100)
    .parse(await rl.question("Seu nome: "));
  const email = z
    .email()
    .parse((await rl.question("Seu e-mail: ")).trim().toLowerCase());
  rl.close();
  async function secret(prompt: string) {
    stdout.write(prompt);
    stdin.setRawMode(true);
    stdin.resume();
    return await new Promise<string>((resolve, reject) => {
      let value = "";
      const listener = (chunk: Buffer) => {
        for (const char of chunk.toString()) {
          if (char === "\u0003") {
            cleanup();
            reject(new Error("Cancelado."));
            return;
          }
          if (char === "\r" || char === "\n") {
            cleanup();
            resolve(value);
            return;
          }
          if (char === "\u007f" || char === "\b") value = value.slice(0, -1);
          else if (char >= " ") value += char;
        }
      };
      function cleanup() {
        stdin.off("data", listener);
        stdin.setRawMode(false);
        stdin.pause();
        stdout.write("\n");
      }
      stdin.on("data", listener);
    });
  }
  const password = await secret(
    "Crie uma senha (mínimo de 12 caracteres; não será exibida): ",
  );
  const confirm = await secret("Repita a senha: ");
  if (password !== confirm) throw new Error("As senhas são diferentes.");
  transaction(() =>
    run(
      "INSERT INTO users (id,name,email,password_hash,role) VALUES (?,?,?,?,?)",
      id(),
      name,
      email,
      hashPassword(password),
      "owner",
    ),
  );
  console.log(
    "Administrador criado. Entre no aplicativo e convide seus sócios em Administração.",
  );
}
main().catch((error) => {
  console.error(
    error instanceof Error
      ? error.message
      : "Não foi possível criar o administrador.",
  );
  process.exitCode = 1;
});
