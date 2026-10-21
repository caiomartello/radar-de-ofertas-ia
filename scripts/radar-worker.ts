import { loadEnvConfig } from "@next/env";
import { workerTick } from "../src/lib/radar";
loadEnvConfig(process.cwd());
console.log(
  "Agendador do Radar iniciado. Somente buscas habilitadas com autorização testada serão executadas.",
);
async function tick() {
  try {
    await workerTick();
  } catch {
    console.error(
      "O agendador não conseguiu acessar o banco. Confira a configuração; não foi realizada uma consulta externa.",
    );
  }
}
void tick();
const timer = setInterval(() => void tick(), 60000);
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, () => {
    clearInterval(timer);
    process.exitCode = 0;
  });
