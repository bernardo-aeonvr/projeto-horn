/**
 * Aplica as configurações de Auth do projeto Supabase via Management API.
 *
 * Equivale a mexer em Authentication → URL Configuration e Sign In / Providers
 * no dashboard, mas deixa o estado desejado registrado no repositório.
 *
 * Precisa de um personal access token (https://supabase.com/dashboard/account/tokens)
 * em SUPABASE_ACCESS_TOKEN — no .env.local ou no ambiente. O token é usado só
 * aqui; a aplicação nunca o lê. Revogue depois do setup.
 *
 * Uso, a partir da raiz do projeto:
 *   node scripts/setup-auth-config.mjs           # mostra o que mudaria
 *   node scripts/setup-auth-config.mjs --apply   # aplica
 */
import { readFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");

/** Domínio de produção na Vercel. Trocar aqui ao migrar para domínio próprio. */
const PRODUCTION_URL = "https://plataforma-horn.vercel.app";

/**
 * Estado desejado da configuração de Auth.
 *
 * Este objeto é a fonte de verdade: o script sobrescreve o que estiver
 * diferente no projeto. Ao acrescentar um ambiente, acrescente aqui também,
 * senão a próxima execução remove o que foi adicionado só pelo dashboard.
 */
const DESIRED = {
  // Destino padrão quando não vem um redirectTo explícito, e valor de
  // {{ .SiteURL }} nos templates de e-mail. Precisa ser produção.
  // Não atrapalha o desenvolvimento: a aplicação sempre manda um redirectTo,
  // e o localhost está liberado na allow list abaixo.
  site_url: PRODUCTION_URL,

  // Para onde o Supabase aceita redirecionar depois do link de recuperação.
  // O curinga dos previews é restrito a este projeto de propósito:
  // 'https://*.vercel.app/**' liberaria qualquer aplicação hospedada lá a
  // receber um token de recuperação válido.
  uri_allow_list: [
    `${PRODUCTION_URL}/**`,
    "https://plataforma-horn-*.vercel.app/**",
    "http://localhost:3000/**",
  ].join(","),

  // Os acessos da HORN são criados internamente pela administração.
  disable_signup: true,

  // Mesmo mínimo exigido por MIN_PASSWORD_LENGTH em src/lib/auth/form-state.ts.
  password_min_length: 8,
};

function loadEnv() {
  const fromProcess = { ...process.env };

  try {
    const file = readFileSync(path.join(ROOT, ".env.local"), "utf8");
    for (const line of file.split(/\r?\n/)) {
      if (!line || line.trimStart().startsWith("#")) continue;
      const i = line.indexOf("=");
      if (i === -1) continue;
      const key = line.slice(0, i).trim();
      if (!fromProcess[key]) fromProcess[key] = line.slice(i + 1).trim();
    }
  } catch {
    // .env.local é opcional se as variáveis já estiverem no ambiente.
  }

  return fromProcess;
}

const env = loadEnv();

if (!env.SUPABASE_ACCESS_TOKEN) {
  console.error(
    "SUPABASE_ACCESS_TOKEN não encontrado.\n" +
      "Gere um token em https://supabase.com/dashboard/account/tokens e adicione\n" +
      "ao .env.local como SUPABASE_ACCESS_TOKEN=sbp_...",
  );
  process.exit(1);
}

if (!env.NEXT_PUBLIC_SUPABASE_URL) {
  console.error("NEXT_PUBLIC_SUPABASE_URL não encontrado no .env.local.");
  process.exit(1);
}

const ref = new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0];
const endpoint = `https://api.supabase.com/v1/projects/${ref}/config/auth`;
const authHeader = { Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}` };
const apply = process.argv.includes("--apply");

const currentRes = await fetch(endpoint, { headers: authHeader });

if (!currentRes.ok) {
  console.error(`Falha ao ler a configuração (HTTP ${currentRes.status}).`);
  console.error((await currentRes.text()).slice(0, 500));
  process.exit(1);
}

const current = await currentRes.json();
const changes = Object.entries(DESIRED).filter(
  ([key, value]) => JSON.stringify(current[key]) !== JSON.stringify(value),
);

console.log(`Projeto: ${ref}\n`);

for (const [key, value] of Object.entries(DESIRED)) {
  const now = JSON.stringify(current[key]);
  const next = JSON.stringify(value);
  console.log(
    now === next
      ? `  ok       ${key} = ${next}`
      : `  alterar  ${key}: ${now} -> ${next}`,
  );
}

if (changes.length === 0) {
  console.log("\nNada a fazer, a configuração já está como esperado.");
  process.exit(0);
}

if (!apply) {
  console.log("\nRode de novo com --apply para gravar essas alterações.");
  process.exit(0);
}

const patchRes = await fetch(endpoint, {
  method: "PATCH",
  headers: { ...authHeader, "Content-Type": "application/json" },
  body: JSON.stringify(Object.fromEntries(changes)),
});

if (!patchRes.ok) {
  console.error(`\nFalha ao gravar (HTTP ${patchRes.status}).`);
  console.error((await patchRes.text()).slice(0, 500));
  process.exit(1);
}

const updated = await patchRes.json();
console.log("\nAplicado. Estado atual:");
for (const key of Object.keys(DESIRED)) {
  console.log(`  ${key} = ${JSON.stringify(updated[key])}`);
}
