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
import {
  professionalColumns,
  professionalRow,
} from "../src/lib/professionals/export.ts";
import { contactColumns, contactRow } from "../src/lib/contacts/export.ts";

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
section("Profissionais — a linha que vai para o Excel");
// ---------------------------------------------------------------------------
/*
  O bug que originou esta bateria: a planilha saía sem Empresa e sem Cargo, dois
  campos que a tela mostra desde a migration 0015. O teste é do MAPEAMENTO —
  quem escreve o arquivo é o ExcelJS, e não era ele que estava errado.
*/

/** Profissional mínimo, com os campos que o caso em teste precisa. */
function professional(fields = {}) {
  return {
    id: "p1",
    name: "Alexandre Duarte Motta",
    segment_id: "s1",
    company: null,
    job_role: null,
    email: null,
    instagram: null,
    phone: null,
    address: null,
    postal_code: null,
    city: null,
    state: null,
    birthday_day: null,
    birthday_month: null,
    notes: null,
    created_at: "2026-08-13T14:00:00Z",
    updated_at: "2026-08-13T14:00:00Z",
    segment: { id: "s1", slug: "arquiteto", name: "Arquiteto" },
    regions: [],
    ...fields,
  };
}

/** Valor de uma coluna pelo rótulo do cabeçalho — o teste não conta posições. */
function cellByHeader(columns, cells, header) {
  const index = columns.findIndex((column) => column.header === header);
  if (index === -1) return `SEM A COLUNA "${header}"`;
  return cells[index]?.text;
}

const PROFESSIONAL_HEADERS = professionalColumns.map((column) => column.header);

eq(
  "cabeçalho traz Empresa e Cargo logo depois do nome",
  PROFESSIONAL_HEADERS.slice(0, 4),
  ["Nome", "Empresa", "Cargo", "Segmento"],
);
eq(
  "uma célula por coluna",
  professionalRow(professional()).length,
  professionalColumns.length,
);
ok(
  "nenhuma coluna de status voltou",
  !PROFESSIONAL_HEADERS.some((header) => /ativ|inativ|status/i.test(header)),
  PROFESSIONAL_HEADERS.join(", "),
);

{
  const cells = professionalRow(
    professional({ company: "Jubileu Arquitetos", job_role: "Dono" }),
  );
  eq("empresa vai como está na tela", cellByHeader(professionalColumns, cells, "Empresa"), "Jubileu Arquitetos");
  eq("cargo vai como está na tela", cellByHeader(professionalColumns, cells, "Cargo"), "Dono");
}
{
  // Cargo é texto livre: nada de "Sócio"/"Equipe" fixos no código da planilha.
  const cells = professionalRow(professional({ job_role: "Diretor Comercial" }));
  eq("cargo fora dos padrões sai inteiro", cellByHeader(professionalColumns, cells, "Cargo"), "Diretor Comercial");
}
{
  const cells = professionalRow(professional());
  eq("sem empresa vira célula vazia", cellByHeader(professionalColumns, cells, "Empresa"), "");
  eq("sem cargo vira célula vazia", cellByHeader(professionalColumns, cells, "Cargo"), "");
}
{
  const cells = professionalRow(
    professional({ segment: { id: "s2", slug: "cliente-final", name: "Cliente Final" } }),
  );
  eq("Cliente Final é um segmento como outro", cellByHeader(professionalColumns, cells, "Segmento"), "Cliente Final");
}
{
  const cells = professionalRow(professional({ segment: null }));
  eq("profissional sem segmento não quebra a linha", cellByHeader(professionalColumns, cells, "Segmento"), "");
}
{
  const cells = professionalRow(
    professional({
      company: "Aliás Arquitetura",
      job_role: "Sócio",
      phone: "(41) 3456-7890",
      postal_code: "01310-000",
      instagram: "instagram.com/alias",
      city: "São Bernardo do Campo",
      regions: [
        { id: "r1", slug: "curitiba", name: "Curitiba", sort_order: 1 },
        { id: "r2", slug: "litoral", name: "Litoral", sort_order: 2 },
      ],
    }),
  );
  eq("telefone continua texto (o Excel não o transforma em número)", cellByHeader(professionalColumns, cells, "Telefone"), "(41) 3456-7890");
  eq("CEP mantém o zero à esquerda", cellByHeader(professionalColumns, cells, "CEP"), "01310-000");
  eq("instagram vira @handle", cellByHeader(professionalColumns, cells, "Instagram"), "@alias");
  eq("regiões em uma célula só", cellByHeader(professionalColumns, cells, "Regiões"), "Curitiba; Litoral");
  eq("acento chega intacto", cellByHeader(professionalColumns, cells, "Cidade"), "São Bernardo do Campo");
}
{
  const cells = professionalRow(
    professional({ company: "Jubileu Arquitetos", job_role: "Dono", notes: "ok" }),
  );
  const sujo = cells.filter((cell) => /undefined|\[object Object\]|^null$/.test(cell.text));
  eq("nenhuma célula com undefined, null ou [object Object]", sujo, []);
}

// ---------------------------------------------------------------------------
section("Contatos — a linha que vai para o Excel");
// ---------------------------------------------------------------------------

/** Contato mínimo, no formato que a listagem entrega à exportação. */
function exportContact(fields = {}) {
  return {
    id: "c1",
    professional_id: "p1",
    contacted_at: "2026-08-13T18:42:00Z",
    channel: "whatsapp",
    notes: null,
    company_name: null,
    created_at: "2026-08-13T18:42:00Z",
    professional: {
      id: "p1",
      name: "Larissa",
      segment_name: "Arquiteto",
      company: null,
    },
    stores: [],
    ...fields,
  };
}

ok(
  "a planilha de contatos tem a coluna Empresa",
  contactColumns.some((column) => column.header === "Empresa"),
  contactColumns.map((column) => column.header).join(", "),
);
eq(
  "uma célula por coluna",
  contactRow(exportContact()).length,
  contactColumns.length,
);
eq(
  "Empresa e Lojas apresentadas são colunas diferentes",
  contactColumns.filter((column) => /Empresa|Lojas apresentadas/.test(column.header)).length,
  2,
);
{
  const cells = contactRow(
    exportContact({
      company_name: "Ziggy",
      professional: { id: "p1", name: "Larissa", segment_name: "Arquiteto", company: "Studio Norte" },
    }),
  );
  eq("o snapshot histórico vence a empresa atual", cellByHeader(contactColumns, cells, "Empresa"), "Ziggy");
}
{
  const cells = contactRow(
    exportContact({
      professional: { id: "p1", name: "Larissa", segment_name: "Arquiteto", company: "Studio Norte" },
    }),
  );
  eq("sem snapshot, a empresa atual do profissional", cellByHeader(contactColumns, cells, "Empresa"), "Studio Norte");
}
{
  const cells = contactRow(exportContact());
  eq("sem empresa nenhuma, célula vazia", cellByHeader(contactColumns, cells, "Empresa"), "");
}
{
  // Profissional excluído: o embed pode não resolver, e o histórico continua.
  const cells = contactRow(
    exportContact({ company_name: "Empresa do dia do contato", professional: null }),
  );
  eq("profissional excluído não apaga a empresa histórica", cellByHeader(contactColumns, cells, "Empresa"), "Empresa do dia do contato");
  eq("nome ausente vira célula vazia, não undefined", cellByHeader(contactColumns, cells, "Profissional"), "");
}
{
  const cells = contactRow(
    exportContact({
      channel: "event",
      stores: [
        { id: "s1", name: "Loja A", is_active: true },
        { id: "s2", name: "Marmoraria Açaí", is_active: false },
      ],
    }),
  );
  eq("Evento é um canal como outro", cellByHeader(contactColumns, cells, "Canal"), "Evento");
  eq("todas as lojas apresentadas em uma célula", cellByHeader(contactColumns, cells, "Lojas apresentadas"), "Loja A; Marmoraria Açaí");
}
{
  const cells = contactRow(exportContact({ notes: "Observação histórica." }));
  eq("a observação histórica continua sendo exportada", cellByHeader(contactColumns, cells, "Observação"), "Observação histórica.");
}

// ---------------------------------------------------------------------------
console.log(`\n${"=".repeat(70)}`);
console.log(`RESULTADO: ${passed} PASS / ${failed} FAIL  (total ${passed + failed})`);
console.log("=".repeat(70));
if (failed > 0) {
  console.log("\nFALHAS:");
  for (const f of failures) console.log(`  x ${f}`);
}
process.exit(failed > 0 ? 1 : 0);
