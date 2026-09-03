/**
 * Testes de domínio — a lógica pura que decide o que vai para o banco.
 *
 * Complementa `authz.test.mjs`: lá o assunto é permissão, e cada caso fala com
 * o PostgREST; aqui o assunto é TRANSFORMAÇÃO, e nada sai do processo. São as
 * funções que convertem o formulário em payload e o registro gravado em tela —
 * exatamente onde um erro passa por build, typecheck e lint sem levantar a mão.
 *
 * Não roda contra o banco, não precisa de sessão e não precisa de .env: pode
 * rodar a qualquer momento, inclusive em CI.
 *
 * As funções são importadas dos módulos REAIS de src/. O Node 22 remove os
 * tipos do TypeScript sozinho; os imports com alias `@/` na cadeia são todos
 * `import type`, que somem junto com os tipos — por isso não é preciso
 * resolver alias nenhum aqui.
 *
 * Uso:
 *   npm run test:domain
 */
import { parseStoreForm } from "../src/lib/stores/validation.ts";
import {
  normalizeResponsibles,
  storeResponsibles,
} from "../src/lib/stores/format.ts";
import { parseProfessionalForm } from "../src/lib/professionals/validation.ts";
import {
  DEFAULT_JOB_ROLES,
  mergeOptionNames,
  optionKey,
} from "../src/lib/professionals/format.ts";
import { parsePage } from "../src/lib/professionals/types.ts";
import { contactCompany } from "../src/lib/contacts/types.ts";

// ---------------------------------------------------------------------------
// Harness mínimo, no mesmo formato de saída do authz.test.mjs
// ---------------------------------------------------------------------------
let passed = 0;
let failed = 0;
const failures = [];

function section(title) {
  console.log(`\n== ${title} ==`);
}

function eq(name, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  const ok = a === e;
  if (ok) passed++;
  else {
    failed++;
    failures.push(`${name}\n      obtido:   ${a}\n      esperado: ${e}`);
  }
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}`);
  return ok;
}

function ok(name, condition, detail = "") {
  return eq(detail ? `${name} (${detail})` : name, Boolean(condition), true);
}

/** FormData de loja com os campos obrigatórios já preenchidos. */
function storeForm(responsibles, extra = {}) {
  const fd = new FormData();
  fd.set("name", extra.name ?? "Marmoraria XYZ");
  fd.set("is_active", "true");
  for (const [key, value] of Object.entries(extra.fields ?? {})) {
    fd.set(key, value);
  }
  for (const item of responsibles) {
    fd.append("responsible_names", item.name);
    fd.append("responsible_phones", item.phone);
  }
  return fd;
}

const SEGMENT = "11111111-1111-4111-8111-111111111111";

/** FormData de profissional com nome e segmento válidos. */
function professionalForm(fields = {}) {
  const fd = new FormData();
  fd.set("name", "Alice Campos");
  fd.set("segment_id", SEGMENT);
  for (const [key, value] of Object.entries(fields)) fd.set(key, value);
  return fd;
}

// ---------------------------------------------------------------------------
section("Lojas — responsáveis vindos do formulário");
// ---------------------------------------------------------------------------
{
  const r = parseStoreForm(
    storeForm([
      { name: "Leandro Pereira", phone: "(41) 99999-1111" },
      { name: "Carol Pereira", phone: "(41) 99999-2222" },
    ]),
  );
  ok("formulário válido é aceito", r.ok);
  eq("cada telefone com o seu dono", r.payload.responsibles, [
    { name: "Leandro Pereira", phone: "(41) 99999-1111" },
    { name: "Carol Pereira", phone: "(41) 99999-2222" },
  ]);
  eq("contact_name espelha o primeiro nome", r.payload.contact_name, "Leandro Pereira");
}

{
  // O caso que o componente evita e o servidor precisa aguentar: telefone
  // sobrando na lista paralela não pode ser adotado por outra pessoa.
  const fd = new FormData();
  fd.set("name", "Marmoraria XYZ");
  fd.append("responsible_names", "Leandro Pereira");
  fd.append("responsible_phones", "(41) 99999-1111");
  fd.append("responsible_phones", "(41) 99999-2222");
  const r = parseStoreForm(fd);
  eq("telefone órfão não gruda em ninguém", r.payload.responsibles, [
    { name: "Leandro Pereira", phone: "(41) 99999-1111" },
  ]);
}

{
  const fd = new FormData();
  fd.set("name", "Marmoraria XYZ");
  fd.append("responsible_names", "Leandro Pereira");
  fd.append("responsible_names", "Carol Pereira");
  fd.append("responsible_phones", "(41) 99999-1111");
  const r = parseStoreForm(fd);
  eq("nome sem telefone correspondente fica sem telefone", r.payload.responsibles, [
    { name: "Leandro Pereira", phone: "(41) 99999-1111" },
    { name: "Carol Pereira", phone: null },
  ]);
}

{
  const r = parseStoreForm(
    storeForm([
      { name: "Leandro Pereira", phone: "(41) 99999-1111" },
      { name: "  ", phone: "  " },
      { name: "", phone: "(41) 90000-0000" },
    ]),
  );
  eq("linha em branco não é gravada", r.payload.responsibles, [
    { name: "Leandro Pereira", phone: "(41) 99999-1111" },
  ]);
}

{
  const r = parseStoreForm(
    storeForm([
      { name: "Leandro Pereira", phone: "(41) 99999-1111" },
      { name: " leandro pereira ", phone: "(41) 90000-0000" },
    ]),
  );
  eq("duplicata: vence o primeiro registro inteiro", r.payload.responsibles, [
    { name: "Leandro Pereira", phone: "(41) 99999-1111" },
  ]);
}

{
  const r = parseStoreForm(
    storeForm([
      { name: "Leandro Pereira", phone: "(41) 3333-0000" },
      { name: "Carol Pereira", phone: "(41) 3333-0000" },
    ]),
  );
  eq("telefone igual NÃO funde pessoas diferentes", r.payload.responsibles.length, 2);
}

{
  const r = parseStoreForm(storeForm([{ name: "Maria Silva", phone: "" }]));
  eq("telefone é opcional", r.payload.responsibles, [
    { name: "Maria Silva", phone: null },
  ]);
}

{
  const r = parseStoreForm(storeForm([]));
  eq("loja sem responsável nenhum é válida", r.payload.responsibles, []);
  eq("contact_name vira nulo quando não há ninguém", r.payload.contact_name, null);
}

{
  const r = parseStoreForm(storeForm([{ name: "x".repeat(121), phone: "" }]));
  ok("nome acima do limite é recusado", !r.ok);
  ok("erro aponta o campo de responsáveis", Boolean(r.fieldErrors?.responsibles));
}

// ---------------------------------------------------------------------------
section("Lojas — leitura, incluindo o formato antigo");
// ---------------------------------------------------------------------------
eq(
  "loja anterior à feature: só contact_name",
  storeResponsibles({ contact_name: "Leandro Pereira" }),
  [{ name: "Leandro Pereira", phone: null }],
);
eq(
  "lista vazia cai no legado",
  storeResponsibles({ responsibles: [], contact_name: "Leandro Pereira" }),
  [{ name: "Leandro Pereira", phone: null }],
);
eq(
  "lista preenchida manda no legado",
  storeResponsibles({
    responsibles: [{ name: "Carol Pereira", phone: "2222" }],
    contact_name: "Leandro Pereira",
  }),
  [{ name: "Carol Pereira", phone: "2222" }],
);
eq("loja sem responsável", storeResponsibles({ responsibles: [], contact_name: null }), []);
eq("registro sem nada não quebra", storeResponsibles({}), []);
eq(
  "jsonb com string solta ainda é lido",
  storeResponsibles({ responsibles: ["Leandro Pereira"] }),
  [{ name: "Leandro Pereira", phone: null }],
);
eq(
  "item sem name é descartado",
  storeResponsibles({ responsibles: [{ phone: "1111" }, { name: "Carol", phone: null }] }),
  [{ name: "Carol", phone: null }],
);
eq(
  "jsonb que não é array não derruba a listagem",
  storeResponsibles({ responsibles: { name: "x" }, contact_name: "Leandro" }),
  [{ name: "Leandro", phone: null }],
);
eq(
  "normalize aceita phone ausente",
  normalizeResponsibles([{ name: "  Maria Silva  " }]),
  [{ name: "Maria Silva", phone: null }],
);

// ---------------------------------------------------------------------------
section("Profissionais — empresa e cargo no formulário");
// ---------------------------------------------------------------------------
{
  const r = parseProfessionalForm(
    professionalForm({ company: "  Aliás Arquitetura  ", job_role: "  Sócio  " }),
  );
  ok("formulário válido é aceito", r.ok);
  eq("empresa é gravada sem espaço nas pontas", r.payload.company, "Aliás Arquitetura");
  eq("cargo é gravado sem espaço nas pontas", r.payload.job_role, "Sócio");
}
{
  const r = parseProfessionalForm(professionalForm());
  eq("sem empresa vira null", r.payload.company, null);
  eq("sem cargo vira null", r.payload.job_role, null);
}
{
  const r = parseProfessionalForm(professionalForm({ company: "   ", job_role: "   " }));
  eq("só espaços viram null (limpar o campo)", [r.payload.company, r.payload.job_role], [null, null]);
}
{
  const r = parseProfessionalForm(professionalForm({ company: "x".repeat(161) }));
  ok("empresa acima do limite é recusada", !r.ok);
  ok("erro aponta o campo empresa", Boolean(r.fieldErrors?.company));
}
{
  const r = parseProfessionalForm(professionalForm({ job_role: "x".repeat(161) }));
  ok("cargo acima do limite é recusado", !r.ok);
  ok("erro aponta o campo cargo", Boolean(r.fieldErrors?.job_role));
}
{
  const r = parseProfessionalForm(professionalForm({ name: "   " }));
  ok("nome continua obrigatório", !r.ok && Boolean(r.fieldErrors?.name));
}

// ---------------------------------------------------------------------------
section("Profissionais — listas de empresa e cargo");
// ---------------------------------------------------------------------------
eq("chave de comparação ignora caixa e espaços", optionKey("  Aliás Arquitetura "), "aliás arquitetura");
eq(
  "merge não repete e ordena",
  mergeOptionNames(["Studio Forma", "Aliás Arquitetura"], [" aliás arquitetura "]),
  ["Aliás Arquitetura", "Studio Forma"],
);
eq("merge preserva a primeira grafia", mergeOptionNames(["studio forma"], ["Studio Forma"]), ["studio forma"]);
eq("merge descarta vazios", mergeOptionNames(["", "   ", "Equipe"]), ["Equipe"]);
eq("cargos padrão continuam os dois", [...DEFAULT_JOB_ROLES], ["Sócio", "Equipe"]);
eq(
  "cargo padrão não duplica com o catálogo",
  mergeOptionNames(["Sócio"], [...DEFAULT_JOB_ROLES]),
  ["Equipe", "Sócio"],
);

// ---------------------------------------------------------------------------
section("Profissionais — filtros vindos da URL");
// ---------------------------------------------------------------------------
eq("página inválida cai em 1", parsePage("abc"), 1);
eq("página zero cai em 1", parsePage("0"), 1);
eq("página válida é mantida", parsePage("3"), 3);

// ---------------------------------------------------------------------------
section("Contatos — a empresa que a listagem mostra");
// ---------------------------------------------------------------------------
/** Contato mínimo, com o snapshot e a empresa atual que o caso pede. */
function contact(companyName, currentCompany) {
  return {
    company_name: companyName,
    professional:
      currentCompany === undefined
        ? null
        : {
            id: "p1",
            name: "Larissa",
            segment_name: "Arquiteto",
            company: currentCompany,
          },
  };
}

eq(
  "o snapshot vence a empresa atual (histórico preservado)",
  contactCompany(contact("Ziggy", "Studio Norte")),
  "Ziggy",
);
eq(
  "sem snapshot, cai para a empresa atual do profissional",
  contactCompany(contact(null, "Studio Norte")),
  "Studio Norte",
);
eq(
  "snapshot só com espaços não conta como snapshot",
  contactCompany(contact("   ", "Studio Norte")),
  "Studio Norte",
);
eq("profissional sem empresa vira null", contactCompany(contact(null, null)), null);
eq("contato sem profissional vira null", contactCompany(contact(null)), null);

// ---------------------------------------------------------------------------
console.log(`\n${"=".repeat(70)}`);
console.log(`RESULTADO: ${passed} PASS / ${failed} FAIL  (total ${passed + failed})`);
console.log("=".repeat(70));
if (failed > 0) {
  console.log("\nFALHAS:");
  for (const f of failures) console.log(`  x ${f}`);
}
process.exit(failed > 0 ? 1 : 0);
