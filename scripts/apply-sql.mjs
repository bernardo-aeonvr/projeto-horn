/**
 * Aplica arquivos SQL no banco do projeto Supabase via Management API.
 *
 * Existe porque a chave do .env.local é a publishable: ela serve para o
 * PostgREST ler tabelas e chamar funções, mas não executa DDL. Criar função,
 * índice ou tabela exige credencial administrativa.
 *
 * Precisa de um personal access token (https://supabase.com/dashboard/account/tokens)
 * em SUPABASE_ACCESS_TOKEN — no .env.local ou no ambiente, igual ao
 * scripts/setup-auth-config.mjs. O token é usado só aqui; a aplicação nunca o
 * lê. Revogue depois do setup.
 *
 * Uso, a partir da raiz do projeto:
 *   node scripts/apply-sql.mjs supabase/migrations/0002_dashboard_metrics.sql
 *   node scripts/apply-sql.mjs --apply supabase/migrations/0002_dashboard_metrics.sql
 *
 * Sem --apply o script só mostra o que executaria.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");

function readEnvFile() {
  try {
    return Object.fromEntries(
      readFileSync(path.join(ROOT, ".env.local"), "utf8")
        .split(/\r?\n/)
        .filter((line) => line.trim() && !line.trim().startsWith("#"))
        .filter((line) => line.includes("="))
        .map((line) => {
          const index = line.indexOf("=");
          return [line.slice(0, index).trim(), line.slice(index + 1).trim()];
        }),
    );
  } catch {
    return {};
  }
}

const env = { ...readEnvFile(), ...process.env };

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const files = args.filter((arg) => !arg.startsWith("--"));

if (files.length === 0) {
  console.error("Informe ao menos um arquivo .sql.");
  process.exit(1);
}

if (!env.SUPABASE_ACCESS_TOKEN) {
  console.error(
    "SUPABASE_ACCESS_TOKEN não encontrado.\n" +
      "Gere um token em https://supabase.com/dashboard/account/tokens e adicione\n" +
      "ao .env.local como SUPABASE_ACCESS_TOKEN=sbp_...\n" +
      "A chave publishable do .env.local não serve: ela não executa DDL.",
  );
  process.exit(1);
}

if (!env.NEXT_PUBLIC_SUPABASE_URL) {
  console.error("NEXT_PUBLIC_SUPABASE_URL não encontrado no .env.local.");
  process.exit(1);
}

const ref = new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0];
const endpoint = `https://api.supabase.com/v1/projects/${ref}/database/query`;

async function run(file) {
  const absolute = path.resolve(ROOT, file);
  const query = readFileSync(absolute, "utf8");
  const lines = query.split(/\r?\n/).length;

  if (!apply) {
    console.log(`[simulação] ${file} — ${lines} linhas, ${query.length} bytes`);
    return true;
  }

  process.stdout.write(`${file} ... `);

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      // O token nunca é impresso, nem em erro.
      Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query }),
  });

  const text = await response.text();

  if (!response.ok) {
    console.log("FALHOU");
    console.error(`  HTTP ${response.status}: ${text.slice(0, 600)}`);
    return false;
  }

  console.log("ok");

  // A Management API devolve o resultado da última instrução, quando houver.
  // Útil para rodar conferências, então o corte é generoso.
  const trimmed = text.trim();
  if (trimmed && trimmed !== "[]" && trimmed !== "null") {
    console.log(`  ${trimmed.length > 20000 ? `${trimmed.slice(0, 20000)}…` : trimmed}`);
  }

  return true;
}

console.log(`Projeto: ${ref}${apply ? "" : "  (simulação — use --apply para executar)"}\n`);

for (const file of files) {
  const ok = await run(file);
  // Os arquivos são aplicados em ordem e um depende do outro; parar no
  // primeiro erro evita deixar o banco pela metade.
  if (!ok) process.exit(1);
}

console.log(`\n${apply ? "Concluído." : "Nada foi executado."}`);
