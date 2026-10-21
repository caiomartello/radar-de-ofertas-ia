import { loadEnvConfig } from "@next/env";
import { db } from "../src/lib/db";
loadEnvConfig(process.cwd());
db();
console.log("Banco preparado. Migrations aplicadas.");
