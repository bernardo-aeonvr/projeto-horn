/**
 * Clientes HTTP dos testes de autorização.
 *
 * REGRA CENTRAL: os testes de autorização falam com o Supabase usando a
 * publishable key mais o JWT de uma sessão real, exatamente como o navegador
 * do usuário faria. A credencial privilegiada aparece apenas em fixtures.mjs,
 * para preparar dados — nunca para provar que uma policy funciona, porque a
 * service role ignora RLS.
 */
import { SUPABASE_URL, PUBLISHABLE_KEY, env } from "./env.mjs";

/** Faz login e devolve o access token (JWT) do usuário. */
export async function signIn({ email, password }) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: PUBLISHABLE_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const body = await res.json();
  if (!body.access_token) {
    throw new Error(`Login falhou para ${email}: ${body.error_description ?? body.msg ?? res.status}`);
  }
  return body.access_token;
}

function headers(token, extra = {}) {
  return {
    apikey: PUBLISHABLE_KEY,
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    "Content-Type": "application/json",
    ...extra,
  };
}

/** Chamada crua ao PostgREST. `token` nulo = usuário anônimo. */
export async function rest(token, method, path, body, extraHeaders) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: headers(token, extraHeaders),
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await res.text();
  let parsed;
  try { parsed = text ? JSON.parse(text) : null; } catch { parsed = text; }
  return { status: res.status, body: parsed };
}

export function rpc(token, fn, args = {}) {
  return rest(token, "POST", `rpc/${fn}`, args);
}

/** Chamada crua à API de Storage. */
export async function storage(token, method, path, { headers: h, body } = {}) {
  const res = await fetch(`${SUPABASE_URL}/storage/v1/${path}`, {
    method,
    headers: { apikey: PUBLISHABLE_KEY, ...(token ? { Authorization: `Bearer ${token}` } : {}), ...h },
    ...(body ? { body } : {}),
  });
  const text = await res.text();
  let parsed;
  try { parsed = text ? JSON.parse(text) : null; } catch { parsed = text; }
  return { status: res.status, body: parsed, raw: text };
}

export function signedUrl(token, path, expiresIn = 300) {
  return storage(token, "POST", `object/sign/proposal-pdfs/${path}`, {
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ expiresIn }),
  });
}

/** SQL administrativo via Management API. Só para fixtures. */
export async function adminSql(query) {
  const res = await fetch(
    `https://api.supabase.com/v1/projects/${new URL(SUPABASE_URL).hostname.split(".")[0]}/database/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query }),
    },
  );
  const text = await res.text();
  if (!res.ok) throw new Error(`SQL falhou (${res.status}): ${text.slice(0, 500)}`);
  try { return JSON.parse(text); } catch { return text; }
}

// --------------------------------------------------------------------------
// mini test runner — sem dependências
// --------------------------------------------------------------------------

const results = [];
let passed = 0;
let failed = 0;

/**
 * Registra um caso.
 * @param expectation "allow" quando o acesso DEVE funcionar, "deny" quando NÃO deve.
 * @param actualAllowed o que de fato aconteceu.
 */
export function expect(group, name, expectation, actualAllowed, detail = "") {
  const ok = expectation === "allow" ? actualAllowed : !actualAllowed;
  if (ok) passed++;
  else failed++;
  results.push({ group, name, expectation, actualAllowed, ok, detail });
  const got = actualAllowed ? "allow" : "deny";
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name} — esperado ${expectation}, obtido ${got}${detail ? ` (${detail})` : ""}`);
  return ok;
}

export function section(title) {
  console.log(`\n== ${title} ==`);
}

/** Leitura permitida = veio pelo menos uma linha. */
export const readAllowed = (r) =>
  r.status >= 200 && r.status < 300 && Array.isArray(r.body) && r.body.length > 0;

/** Escrita permitida = aceita e afetou alguma linha. */
export const writeAllowed = (r) => {
  if (r.status < 200 || r.status >= 300) return false;
  if (Array.isArray(r.body)) return r.body.length > 0;
  return true;
};

export const brief = (r) => {
  const m = r.body?.message ?? r.body?.error ?? r.body?.msg;
  return `${r.status}${m ? ` ${String(m).slice(0, 80)}` : ""}`;
};

export function summary() {
  console.log(`\n${"=".repeat(70)}`);
  console.log(`RESULTADO: ${passed} PASS / ${failed} FAIL  (total ${passed + failed})`);
  console.log("=".repeat(70));
  if (failed > 0) {
    console.log("\nFALHAS:");
    for (const r of results.filter((x) => !x.ok)) {
      console.log(`  x [${r.group}] ${r.name} — esperado ${r.expectation}, obtido ${r.actualAllowed ? "allow" : "deny"}${r.detail ? ` (${r.detail})` : ""}`);
    }
  }
  return failed;
}
