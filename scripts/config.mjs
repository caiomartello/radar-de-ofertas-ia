import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
const path = ".env.local";
if (!existsSync(path)) {
  writeFileSync(
    path,
    `DATABASE_PATH=./data/radar.sqlite\nAPP_URL=http://localhost:3000\nINTEGRATION_ENCRYPTION_KEY=${randomBytes(32).toString("hex")}\n`,
    { mode: 0o600, flag: "wx" },
  );
  console.log(
    "Configuração local criada em .env.local. A chave é privada e não foi exibida.",
  );
} else {
  const contents = readFileSync(path, "utf8");
  if (/^INTEGRATION_ENCRYPTION_KEY=\s*$/m.test(contents)) {
    writeFileSync(
      path,
      contents.replace(
        /^INTEGRATION_ENCRYPTION_KEY=\s*$/m,
        `INTEGRATION_ENCRYPTION_KEY=${randomBytes(32).toString("hex")}`,
      ),
      { mode: 0o600 },
    );
    console.log(
      "Chave de criptografia gerada no campo vazio. Demais configurações preservadas.",
    );
  } else if (!/^INTEGRATION_ENCRYPTION_KEY=.+/m.test(contents)) {
    writeFileSync(
      path,
      contents +
        `\nINTEGRATION_ENCRYPTION_KEY=${randomBytes(32).toString("hex")}\n`,
      { mode: 0o600 },
    );
    console.log(
      "Chave de criptografia adicionada. Demais configurações preservadas.",
    );
  } else console.log("Configuração existente preservada.");
}
