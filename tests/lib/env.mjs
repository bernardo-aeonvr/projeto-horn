/**
 * Leitura das variáveis usadas pelos testes.
 *
 * Os testes rodam fora do Next, então precisam ler o .env.local por conta
 * própria. Nenhum valor é impresso — só os nomes, quando algo falta.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..", "..");

function readEnvFile() {
  try {
    return Object.fromEntries(
      readFileSync(path.join(ROOT, ".env.local"), "utf8")
        .split(/\r?\n/)
        .filter((line) => line.trim() && !line.trim().startsWith("#"))
        .filter((line) => line.includes("="))
        .map((line) => {
          const i = line.indexOf("=");
          return [line.slice(0, i).trim(), line.slice(i + 1).trim()];
        }),
    );
  } catch {
    return {};
  }
}

export const env = { ...readEnvFile(), ...process.env };

export function require_(...names) {
  const missing = names.filter((n) => !env[n]?.trim());
  if (missing.length > 0) {
    console.error(
      `Faltam variáveis no .env.local ou no ambiente: ${missing.join(", ")}.\n` +
        "Veja .env.example. Nenhum valor é impresso por estes testes.",
    );
    process.exit(1);
  }
}

export const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
export const PUBLISHABLE_KEY = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
export const PROJECT_REF = SUPABASE_URL
  ? new URL(SUPABASE_URL).hostname.split(".")[0]
  : null;
