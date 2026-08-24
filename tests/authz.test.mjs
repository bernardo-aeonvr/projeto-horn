/**
 * Testes de autorização e isolamento entre lojas.
 *
 * Cobre o modelo de acesso da spec (seção 4): o admin enxerga tudo, a loja
 * enxerga somente a própria carteira comercial e é somente leitura, e o
 * anônimo não enxerga nada.
 *
 * Cada caso fala direto com PostgREST/Storage usando o JWT de uma sessão real
 * — nenhuma chamada passa pela interface, porque esconder o botão não é
 * autorização. A service role nunca aparece aqui: ela ignora RLS e provaria
 * exatamente nada.
 *
 * Uso:
 *   npm run test:authz:setup
 *   npm run test:authz
 *   npm run test:authz:teardown
 */
import {
  signIn, rest, rpc, storage, signedUrl,
  expect, section, readAllowed, writeAllowed, brief, summary,
} from "./lib/client.mjs";
import { loadManifest } from "./fixtures.mjs";
import { PUBLISHABLE_KEY, SUPABASE_URL, require_ } from "./lib/env.mjs";

require_("NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");

const F = loadManifest();

const A = await signIn(F.userA);      // usuário da Loja A   (carteira do Admin 1)
const B = await signIn(F.userB);      // usuário da Loja B   (carteira do Admin 1)
const C = await signIn(F.userC);      // usuário da Loja C   (carteira do Admin 2)
const ADM = await signIn(F.admin);    // administrador HORN
const ADM2 = await signIn(F.admin2);  // segundo administrador, carteira própria
const ANON = null;                    // sem sessão

// ---------------------------------------------------------------------------
section("Oportunidades — leitura");
// ---------------------------------------------------------------------------
expect("opp", "Admin lê oportunidade da Loja A", "allow",
  readAllowed(await rest(ADM, "GET", `opportunities?id=eq.${F.oppA}&select=*`)));
expect("opp", "Admin lê oportunidade da Loja B", "allow",
  readAllowed(await rest(ADM, "GET", `opportunities?id=eq.${F.oppB}&select=*`)));
expect("opp", "Loja A lê a própria oportunidade", "allow",
  readAllowed(await rest(A, "GET", `opportunities?id=eq.${F.oppA}&select=*`)));
{
  const r = await rest(A, "GET", `opportunities?id=eq.${F.oppB}&select=*`);
  expect("opp", "Loja A lê oportunidade da Loja B pelo id (IDOR)", "deny", readAllowed(r), brief(r));
}
{
  const r = await rest(A, "GET", `opportunities?store_id=eq.${F.storeB}&select=*`);
  expect("opp", "Loja A filtra por store_id da Loja B", "deny", readAllowed(r), brief(r));
}
{
  const r = await rest(B, "GET", `opportunities?id=eq.${F.oppA}&select=*`);
  expect("opp", "Loja B lê oportunidade da Loja A", "deny", readAllowed(r), brief(r));
}
{
  const r = await rest(A, "GET", "opportunities?select=id,store_id,final_closed_value,commission_value");
  const foreign = Array.isArray(r.body) ? r.body.filter((o) => o.store_id !== F.storeA) : [];
  expect("opp", "Loja A varre a tabela inteira de oportunidades", "deny", foreign.length > 0,
    `${Array.isArray(r.body) ? r.body.length : 0} linhas, ${foreign.length} de outra loja`);
}
{
  const r = await rest(ANON, "GET", "opportunities?select=*");
  expect("opp", "Anônimo lê oportunidades", "deny", readAllowed(r), brief(r));
}

// ---------------------------------------------------------------------------
section("Oportunidades — escrita (a loja é somente leitura)");
// ---------------------------------------------------------------------------
const repr = { Prefer: "return=representation" };
{
  const r = await rest(A, "PATCH", `opportunities?id=eq.${F.oppA}`, { title: "ALTERADO" }, repr);
  expect("opp-w", "Loja A edita a PRÓPRIA oportunidade", "deny", writeAllowed(r), brief(r));
}
{
  const r = await rest(A, "PATCH", `opportunities?id=eq.${F.oppB}`, { title: "ALTERADO" }, repr);
  expect("opp-w", "Loja A edita oportunidade da Loja B", "deny", writeAllowed(r), brief(r));
}
{
  const r = await rest(A, "POST", "opportunities",
    { professional_id: F.professional, store_id: F.storeA, title: "SEC_TEST criada por loja" }, repr);
  expect("opp-w", "Loja A cria oportunidade para si", "deny", writeAllowed(r), brief(r));
}
{
  const r = await rest(A, "POST", "opportunities",
    { professional_id: F.professional, store_id: F.storeB, title: "SEC_TEST criada p/ B" }, repr);
  expect("opp-w", "Loja A cria oportunidade para a Loja B", "deny", writeAllowed(r), brief(r));
}
{
  const r = await rest(A, "DELETE", `opportunities?id=eq.${F.oppA}`, undefined, repr);
  expect("opp-w", "Loja A exclui a própria oportunidade", "deny", writeAllowed(r), brief(r));
}
{
  const r = await rest(A, "DELETE", `opportunities?id=eq.${F.oppB}`, undefined, repr);
  expect("opp-w", "Loja A exclui oportunidade da Loja B", "deny", writeAllowed(r), brief(r));
}
{
  const r = await rest(A, "PATCH", `opportunities?id=eq.${F.oppA}`, { store_id: F.storeB }, repr);
  expect("opp-w", "Loja A transfere a própria oportunidade para outra loja", "deny", writeAllowed(r), brief(r));
}

// ---------------------------------------------------------------------------
section("Profissionais — a carteira e a PII pertencem à HORN");
// ---------------------------------------------------------------------------
{
  const r = await rest(A, "GET", "professionals?select=*");
  expect("prof", "Loja A lê a tabela professionals", "deny", readAllowed(r), brief(r));
}
{
  const r = await rest(A, "GET",
    `professionals?id=eq.${F.professional}&select=name,phone,email,instagram,address,notes`);
  expect("prof", "Loja A lê a PII do profissional do próprio projeto", "deny", readAllowed(r), brief(r));
}
{
  const r = await rest(A, "GET", "professional_regions?select=*");
  expect("prof", "Loja A lê professional_regions", "deny", readAllowed(r), brief(r));
}
{
  const r = await rest(A, "PATCH", `professionals?id=eq.${F.professional}`, { name: "ALTERADO" }, repr);
  expect("prof", "Loja A edita profissional", "deny", writeAllowed(r), brief(r));
}
{
  const r = await rpc(A, "save_professional", { p_name: "X", p_segment_id: null });
  expect("prof", "Loja A chama a RPC save_professional", "deny", r.status < 300, brief(r));
}
expect("prof", "Admin lê professionals", "allow",
  readAllowed(await rest(ADM, "GET", "professionals?select=id,name,phone&limit=5")));

// ---------------------------------------------------------------------------
section("Contatos — histórico interno da HORN");
// ---------------------------------------------------------------------------
{
  const r = await rest(A, "GET", "contacts?select=*");
  expect("contact", "Loja A lê a tabela contacts", "deny", readAllowed(r), brief(r));
}
{
  const r = await rest(A, "GET", `contacts?id=eq.${F.contact}&select=notes`);
  expect("contact", "Loja A lê as observações de um contato", "deny", readAllowed(r), brief(r));
}
{
  const r = await rpc(A, "register_contact", {
    p_professional_id: F.professional, p_channel: "whatsapp", p_store_ids: [F.storeA],
  });
  expect("contact", "Loja A chama a RPC register_contact", "deny", r.status < 300, brief(r));
}
expect("contact", "Admin lê contacts", "allow",
  readAllowed(await rest(ADM, "GET", "contacts?select=id,notes&limit=5")));

// ---------------------------------------------------------------------------
section("contact_stores — uma loja não descobre as outras marcas do contato");
// ---------------------------------------------------------------------------
// O contato do fixture apresentou Loja A E Loja B. A Loja A não pode, por
// caminho nenhum, descobrir que a Loja B estava no mesmo contato (spec 4.2).
{
  const r = await rest(A, "GET", "contact_stores?select=*");
  expect("cstores", "Loja A lista contact_stores inteira", "deny", readAllowed(r), brief(r));
}
{
  const r = await rest(A, "GET", `contact_stores?contact_id=eq.${F.contact}&select=contact_id,store_id`);
  expect("cstores", "Loja A enumera as lojas do contato compartilhado", "deny", readAllowed(r), brief(r));
}
{
  const r = await rest(A, "GET", `contact_stores?store_id=eq.${F.storeA}&select=*`);
  expect("cstores", "Loja A lê os próprios vínculos contato x loja", "deny", readAllowed(r), brief(r));
}
{
  const r = await rest(A, "GET", "stores?select=id,name");
  const foreign = Array.isArray(r.body) ? r.body.filter((s) => s.id !== F.storeA) : [];
  expect("cstores", "Loja A enxerga outras lojas na tabela stores", "deny", foreign.length > 0,
    `${Array.isArray(r.body) ? r.body.length : 0} loja(s) visível(is)`);
}
{
  const r = await rpc(A, "get_store_contact_reach", {});
  const rows = Array.isArray(r.body) ? r.body : [];
  expect("cstores", "get_store_contact_reach devolve vínculo contato x loja", "deny",
    rows.some((x) => "store_id" in x || "store_name" in x));
  const text = JSON.stringify(rows);
  expect("cstores", "get_store_contact_reach devolve PII do profissional", "deny",
    text.includes("11999990000") || text.includes("Rua Secreta") ||
    text.includes("sec-test-prof@example.com") || text.includes("OBSERVACAO INTERNA"));
}

// ---------------------------------------------------------------------------
section("RPCs — adulteração de argumentos");
// ---------------------------------------------------------------------------
{
  const r = await rpc(A, "get_store_reach_breakdown", { p_store_id: F.storeB });
  expect("rpc", "Loja A pede o breakdown da Loja B por parâmetro", "deny",
    r.status < 300 && Array.isArray(r.body) && r.body.length > 0, brief(r));
}
expect("rpc", "Loja A pede o breakdown da própria loja", "allow",
  (await rpc(A, "get_store_reach_breakdown", { p_store_id: F.storeA })).status < 300);

for (const [fn, args] of [
  ["get_admin_dashboard_metrics", { p_store_id: null }],
  ["get_admin_store_results", {}],
  ["get_admin_portfolio_totals", {}],
  ["get_admin_professionals_by_segment", {}],
  ["get_admin_professionals_by_region", {}],
  ["get_admin_activity_timeseries", { p_from: null, p_to: null, p_bucket: "day", p_store_id: null }],
]) {
  const r = await rpc(A, fn, args);
  expect("rpc", `Loja A chama ${fn} (só admin)`, "deny", r.status < 300, brief(r));
}
{
  const r = await rpc(A, "get_store_access_summary", {});
  expect("rpc", "Loja A chama get_store_access_summary (e-mails de login)", "deny",
    r.status < 300 && Array.isArray(r.body) && r.body.length > 0, brief(r));
}
{
  const r = await rpc(A, "get_store_opportunities_page", { p_limit: 500 });
  const rows = Array.isArray(r.body) ? r.body : [];
  expect("rpc", "get_store_opportunities_page devolve linha de outra loja", "deny",
    rows.some((o) => o.store_id !== F.storeA), `${rows.length} linha(s)`);
  expect("rpc", "get_store_opportunities_page devolve as notas internas", "deny",
    JSON.stringify(rows).toLowerCase().includes("nota interna"));
}
{
  const r = await rpc(A, "get_store_dashboard_metrics", {});
  const row = Array.isArray(r.body) ? r.body[0] : null;
  // A comissão da Loja A é 10% de 10.000 = 1.000. A da Loja B seria 4.000.
  expect("rpc", "métricas da Loja A somam a comissão da Loja B", "deny",
    Number(row?.total_commission_value ?? 0) >= 4000,
    `comissão vista por A = ${row?.total_commission_value}`);
}
for (const fn of ["get_store_opportunities_page", "get_store_contact_reach", "get_store_dashboard_metrics"]) {
  const r = await rpc(ANON, fn, {});
  expect("rpc", `Anônimo chama ${fn}`, "deny",
    r.status < 300 && Array.isArray(r.body) && r.body.length > 0, brief(r));
}

// ---------------------------------------------------------------------------
section("Escalação de privilégio");
// ---------------------------------------------------------------------------
{
  const r = await rest(A, "PATCH", `user_profiles?id=eq.${F.userA.id}`, { role: "admin" }, repr);
  expect("escal", "Loja A muda a própria role para admin", "deny", writeAllowed(r), brief(r));
}
{
  const r = await rest(A, "PATCH", `user_profiles?id=eq.${F.userA.id}`, { store_id: F.storeB }, repr);
  expect("escal", "Loja A muda o próprio store_id para a Loja B", "deny", writeAllowed(r), brief(r));
}
{
  const r = await rest(A, "POST", "user_profiles", { id: F.userA.id, role: "admin", is_active: true },
    { Prefer: "resolution=merge-duplicates,return=representation" });
  expect("escal", "Loja A faz upsert do próprio perfil como admin", "deny", writeAllowed(r), brief(r));
}
{
  const r = await rest(A, "GET", "user_profiles?select=id,role,store_id");
  const others = Array.isArray(r.body) ? r.body.filter((p) => p.id !== F.userA.id) : [];
  expect("escal", "Loja A enumera perfis de outros usuários", "deny", others.length > 0,
    `${Array.isArray(r.body) ? r.body.length : 0} perfil(is) visível(is)`);
}
{
  // A role precisa vir do banco. Metadata do Auth é editável pelo próprio usuário.
  await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    method: "PUT",
    headers: { apikey: PUBLISHABLE_KEY, Authorization: `Bearer ${A}`, "Content-Type": "application/json" },
    body: JSON.stringify({ data: { role: "admin", store_id: F.storeB } }),
  });
  const check = await rest(A, "GET", `opportunities?id=eq.${F.oppB}&select=id`);
  expect("escal", "Loja A grava role=admin no user_metadata e ganha acesso", "deny",
    readAllowed(check), `leitura da Loja B: ${check.status}`);
}
{
  const r = await rest(A, "PATCH", `stores?id=eq.${F.storeA}`, { default_commission_percent: 99 }, repr);
  expect("escal", "Loja A edita o cadastro da própria loja", "deny", writeAllowed(r), brief(r));
}

// ---------------------------------------------------------------------------
section("Histórico de status e metadados de anexo");
// ---------------------------------------------------------------------------
expect("hist", "Loja A lê o histórico da própria oportunidade", "allow",
  readAllowed(await rest(A, "GET", `opportunity_status_history?opportunity_id=eq.${F.oppA}&select=*`)));
{
  const r = await rest(A, "GET", `opportunity_status_history?opportunity_id=eq.${F.oppB}&select=*`);
  expect("hist", "Loja A lê o histórico da oportunidade da Loja B", "deny", readAllowed(r), brief(r));
}
{
  const r = await rest(A, "POST", "opportunity_status_history",
    { opportunity_id: F.oppA, to_status: "closed" }, repr);
  expect("hist", "Loja A insere no histórico", "deny", writeAllowed(r), brief(r));
}
{
  const r = await rest(A, "DELETE", `opportunity_status_history?opportunity_id=eq.${F.oppA}`, undefined, repr);
  expect("hist", "Loja A apaga o histórico", "deny", writeAllowed(r), brief(r));
}
expect("att", "Loja A lê o metadado do próprio anexo", "allow",
  readAllowed(await rest(A, "GET", `proposal_attachments?opportunity_id=eq.${F.oppA}&select=*`)));
{
  const r = await rest(A, "GET", `proposal_attachments?opportunity_id=eq.${F.oppB}&select=*`);
  expect("att", "Loja A lê o metadado do anexo da Loja B", "deny", readAllowed(r), brief(r));
}
{
  const r = await rest(A, "DELETE", `proposal_attachments?id=eq.${F.attachmentA}`, undefined, repr);
  expect("att", "Loja A remove o próprio anexo", "deny", writeAllowed(r), brief(r));
}
{
  const r = await rest(A, "POST", "proposal_attachments",
    { opportunity_id: F.oppA, storage_path: `${F.storeA}/${F.oppA}/x.pdf`, file_name: "x.pdf" }, repr);
  expect("att", "Loja A registra um anexo novo", "deny", writeAllowed(r), brief(r));
}

// ---------------------------------------------------------------------------
section("Storage — PDFs das propostas");
// ---------------------------------------------------------------------------
expect("storage", "Admin assina o PDF da Loja A", "allow", (await signedUrl(ADM, F.pdfA)).status < 300);
expect("storage", "Admin assina o PDF da Loja B", "allow", (await signedUrl(ADM, F.pdfB)).status < 300);
expect("storage", "Loja A assina o PRÓPRIO PDF", "allow", (await signedUrl(A, F.pdfA)).status < 300);
{
  const r = await signedUrl(A, F.pdfB);
  expect("storage", "Loja A assina o PDF da Loja B", "deny", r.status < 300, brief(r));
}
{
  const r = await signedUrl(B, F.pdfA);
  expect("storage", "Loja B assina o PDF da Loja A", "deny", r.status < 300, brief(r));
}
{
  const r = await signedUrl(ANON, F.pdfA);
  expect("storage", "Anônimo assina um PDF", "deny", r.status < 300, brief(r));
}
{
  // Path forjado: prefixo da própria loja + oportunidade da outra.
  const r = await signedUrl(A, `${F.storeA}/${F.oppB}/sec-test-loja-b.pdf`);
  expect("storage", "Loja A forja o path (próprio store_id + oportunidade de B)", "deny", r.status < 300, brief(r));
}
{
  const r = await storage(A, "GET", `object/proposal-pdfs/${F.pdfB}`);
  expect("storage", "Loja A baixa o objeto da Loja B direto", "deny",
    r.status < 300 && r.raw?.includes("%PDF"), brief(r));
}
expect("storage", "Loja A baixa o próprio objeto", "allow",
  (await storage(A, "GET", `object/proposal-pdfs/${F.pdfA}`)).raw?.includes("%PDF"));
{
  const r = await storage(ANON, "GET", `object/public/proposal-pdfs/${F.pdfA}`);
  expect("storage", "Anônimo baixa pela rota /public (bucket é privado)", "deny",
    r.status < 300 && r.raw?.includes("%PDF"), brief(r));
}
{
  const r = await storage(A, "POST", "object/list/proposal-pdfs", {
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prefix: "", limit: 100 }),
  });
  const rows = Array.isArray(r.body) ? r.body : [];
  expect("storage", "Loja A enxerga a pasta de outra loja ao listar o bucket", "deny",
    rows.some((x) => x.name !== F.storeA), `pastas: ${rows.map((x) => x.name).join(",") || "-"}`);
}
{
  const r = await storage(A, "POST", "object/list/proposal-pdfs", {
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prefix: `${F.storeB}/`, limit: 100 }),
  });
  expect("storage", "Loja A lista a pasta da Loja B", "deny",
    Array.isArray(r.body) && r.body.length > 0, `${(r.body ?? []).length} entrada(s)`);
}
{
  const r = await storage(A, "POST", `object/proposal-pdfs/${F.storeA}/${F.oppA}/upload-loja.pdf`, {
    headers: { "Content-Type": "application/pdf" },
    body: Buffer.from("%PDF-1.4 upload\n%%EOF\n"),
  });
  expect("storage", "Loja A faz upload na PRÓPRIA pasta", "deny", r.status < 300, brief(r));
}
{
  const r = await storage(A, "POST", `object/proposal-pdfs/${F.storeB}/${F.oppB}/upload-loja.pdf`, {
    headers: { "Content-Type": "application/pdf" },
    body: Buffer.from("%PDF-1.4 upload\n%%EOF\n"),
  });
  expect("storage", "Loja A faz upload na pasta da Loja B", "deny", r.status < 300, brief(r));
}
for (const [label, p] of [["o próprio PDF", F.pdfA], ["o PDF da Loja B", F.pdfB]]) {
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/proposal-pdfs/${p}`, {
    method: "DELETE",
    headers: { apikey: PUBLISHABLE_KEY, Authorization: `Bearer ${A}` },
  });
  expect("storage", `Loja A apaga ${label}`, "deny", res.status < 300, `HTTP ${res.status}`);
}
{
  const r = await storage(A, "DELETE", "object/proposal-pdfs", {
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prefixes: [F.pdfA, F.pdfB] }),
  });
  expect("storage", "Loja A apaga PDFs em lote", "deny",
    Array.isArray(r.body) && r.body.length > 0, `${(r.body ?? []).length} objeto(s) apagado(s)`);
}
{
  const r = await storage(A, "POST", "object/move", {
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ bucketId: "proposal-pdfs", sourceKey: F.pdfB,
                           destinationKey: `${F.storeA}/${F.oppA}/movido.pdf` }),
  });
  expect("storage", "Loja A move o PDF da Loja B para a própria pasta", "deny", r.status < 300, brief(r));
}
{
  const r = await storage(A, "POST", "object/copy", {
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ bucketId: "proposal-pdfs", sourceKey: F.pdfB,
                           destinationKey: `${F.storeA}/${F.oppA}/copia.pdf` }),
  });
  expect("storage", "Loja A copia o PDF da Loja B", "deny", r.status < 300, brief(r));
}

// ---------------------------------------------------------------------------
section("Isolamento entre administradores (migration 0009)");
// ---------------------------------------------------------------------------
/*
  Até a 0009, `is_admin()` era a autorização inteira: qualquer admin via a
  operação toda. Agora cada linha tem dono, e "é admin" só vale para o que é
  dele.

  ADM é dono da Loja A, da Loja B e do profissional; ADM2 é dono da Loja C e do
  segundo profissional. Nenhum dos dois pode alcançar nada do outro — nem lendo,
  nem escrevendo, nem por RPC, nem pelo Storage, nem pela porta da loja.
*/
for (const [label, path] of [
  ["a loja", `stores?id=eq.${F.storeC}&select=*`],
  ["o profissional", `professionals?id=eq.${F.professional2}&select=*`],
  ["o contato", `contacts?id=eq.${F.contact2}&select=*`],
  ["a oportunidade", `opportunities?id=eq.${F.oppC}&select=*`],
  ["o anexo", `proposal_attachments?opportunity_id=eq.${F.oppC}&select=*`],
]) {
  const r = await rest(ADM, "GET", path);
  expect("admins", `Admin 1 lê ${label} do Admin 2 pelo id (IDOR)`, "deny", readAllowed(r), brief(r));
}
for (const [label, path] of [
  ["a loja", `stores?id=eq.${F.storeA}&select=*`],
  ["o profissional", `professionals?id=eq.${F.professional}&select=*`],
  ["a oportunidade", `opportunities?id=eq.${F.oppA}&select=*`],
]) {
  const r = await rest(ADM2, "GET", path);
  expect("admins", `Admin 2 lê ${label} do Admin 1 pelo id (IDOR)`, "deny", readAllowed(r), brief(r));
}
{
  const r = await rest(ADM, "GET", "stores?select=id&limit=1000");
  const rows = Array.isArray(r.body) ? r.body : [];
  expect("admins", "Admin 1 varre stores e alcança a loja do Admin 2", "deny",
    rows.some((s) => s.id === F.storeC), `${rows.length} loja(s)`);
}
{
  const r = await rest(ADM2, "GET", "professionals?select=id,name,notes&limit=1000");
  const rows = Array.isArray(r.body) ? r.body : [];
  expect("admins", "Admin 2 varre a carteira e alcança o profissional do Admin 1", "deny",
    rows.some((p) => p.id === F.professional), `${rows.length} profissional(is)`);
  expect("admins", "Admin 2 enxerga as observações internas do Admin 1", "deny",
    JSON.stringify(rows).includes("OBSERVACAO INTERNA SIGILOSA"));
}

// Escrita: ler é metade do problema; escrever no dado do outro é a outra.
{
  const r = await rest(ADM, "PATCH", `stores?id=eq.${F.storeC}`, { name: "INVADIDA" }, repr);
  expect("admins", "Admin 1 edita a loja do Admin 2", "deny", writeAllowed(r), brief(r));
}
{
  const r = await rest(ADM, "PATCH", `professionals?id=eq.${F.professional2}`, { name: "INVADIDO" }, repr);
  expect("admins", "Admin 1 edita o profissional do Admin 2", "deny", writeAllowed(r), brief(r));
}
{
  const r = await rest(ADM, "DELETE", `opportunities?id=eq.${F.oppC}`, undefined, repr);
  expect("admins", "Admin 1 exclui a oportunidade do Admin 2", "deny", writeAllowed(r), brief(r));
}
{
  // A FK aceitaria: os dois ids existem. Quem barra é o trigger de coerência.
  const r = await rest(ADM, "POST", "opportunities",
    { professional_id: F.professional, store_id: F.storeC, title: "SEC_TEST cruzada" }, repr);
  expect("admins", "Admin 1 cria oportunidade na loja do Admin 2", "deny", writeAllowed(r), brief(r));
}
{
  const r = await rest(ADM, "POST", "opportunities",
    { professional_id: F.professional2, store_id: F.storeA, title: "SEC_TEST cruzada 2" }, repr);
  expect("admins", "Admin 1 cria oportunidade com o profissional do Admin 2", "deny",
    writeAllowed(r), brief(r));
}
{
  const r = await rest(ADM, "POST", "contact_stores",
    { contact_id: F.contact, store_id: F.storeC }, repr);
  expect("admins", "Admin 1 apresenta a loja do Admin 2 no próprio contato", "deny",
    writeAllowed(r), brief(r));
}
{
  const r = await rest(ADM, "POST", "stores",
    { name: "SEC_TEST Loja plantada", owner_id: F.admin2.id, is_active: true }, repr);
  expect("admins", "Admin 1 cria loja já no nome do Admin 2", "deny", writeAllowed(r), brief(r));
}
{
  const r = await rest(ADM, "PATCH", `stores?id=eq.${F.storeA}`, { owner_id: F.admin2.id }, repr);
  expect("admins", "Admin 1 transfere a própria loja para o Admin 2", "deny", writeAllowed(r), brief(r));
}
{
  const r = await rest(ADM2, "PATCH", `user_profiles?id=eq.${F.userA.id}`,
    { store_id: F.storeC }, repr);
  expect("admins", "Admin 2 sequestra o acesso de loja do Admin 1", "deny", writeAllowed(r), brief(r));
}

// RPCs: são SECURITY DEFINER e ignoram RLS por dentro — o recorte por dono
// precisa estar no corpo de cada uma. É aqui que um esquecimento apareceria.
{
  const r = await rpc(ADM, "get_store_reach_breakdown", { p_store_id: F.storeC });
  expect("admins", "Admin 1 pede o breakdown da loja do Admin 2", "deny",
    r.status < 300 && Array.isArray(r.body) && r.body.length > 0, brief(r));
}
{
  const r = await rpc(ADM, "get_admin_dashboard_metrics", {});
  const row = Array.isArray(r.body) ? r.body[0] : null;
  // A + B = 1.000 + 4.000 = 5.000. A comissão da Loja C (9.000) não pode entrar.
  expect("admins", "KPIs do Admin 1 somam a comissão do Admin 2", "deny",
    Number(row?.total_commission_value ?? 0) >= 9000,
    `comissão vista pelo Admin 1 = ${row?.total_commission_value}`);
}
{
  const r = await rpc(ADM2, "get_admin_dashboard_metrics", {});
  const row = Array.isArray(r.body) ? r.body[0] : null;
  expect("admins", "KPIs do Admin 2 trazem só a comissão dele (9.000)", "allow",
    Number(row?.total_commission_value ?? 0) === 9000,
    `comissão vista pelo Admin 2 = ${row?.total_commission_value}`);
}
{
  const r = await rpc(ADM2, "get_admin_store_results", {});
  const rows = Array.isArray(r.body) ? r.body : [];
  expect("admins", "Resultados por loja do Admin 2 listam lojas do Admin 1", "deny",
    rows.some((s) => s.store_id === F.storeA || s.store_id === F.storeB),
    `${rows.length} loja(s)`);
}
{
  const r = await rpc(ADM2, "get_admin_portfolio_totals", {});
  const row = Array.isArray(r.body) ? r.body[0] : null;
  expect("admins", "Carteira do Admin 2 conta profissional do Admin 1", "deny",
    Number(row?.professionals_total ?? 0) > 1,
    `${row?.professionals_total} profissional(is), ${row?.stores_total} loja(s)`);
}
{
  const r = await rpc(ADM, "get_store_access_summary", {});
  const rows = Array.isArray(r.body) ? r.body : [];
  expect("admins", "Painel de acessos do Admin 1 mostra o acesso do Admin 2", "deny",
    rows.some((a) => a.store_id === F.storeC || a.user_id === F.userC.id),
    `${rows.length} acesso(s)`);
}
{
  const r = await rpc(ADM, "get_horn_reach_breakdown", {});
  expect("admins", "get_horn_reach_breakdown responde para o Admin 1", "allow", r.status < 300, brief(r));
}

/*
  O caso mais fácil de deixar passar. A decisão de 17/08 (migration 0005) manda
  mostrar à loja o alcance completo do trabalho da HORN, e não só os contatos em
  que ela foi marcada. Sem recorte por dono, essa mesma regra entregaria à loja
  de um admin o trabalho do outro — pela porta da loja, sem ninguém ser admin.
*/
{
  const r = await rpc(C, "get_store_contact_reach", {});
  const rows = Array.isArray(r.body) ? r.body : [];
  expect("admins", "Loja C vê no alcance o profissional do Admin 1", "deny",
    rows.some((x) => x.professional_id === F.professional),
    `${rows.length} contato(s) no alcance`);
}
{
  const r = await rpc(A, "get_store_contact_reach", {});
  const rows = Array.isArray(r.body) ? r.body : [];
  expect("admins", "Loja A vê no alcance o profissional do Admin 2", "deny",
    rows.some((x) => x.professional_id === F.professional2),
    `${rows.length} contato(s) no alcance`);
}
{
  const r = await rpc(C, "get_store_dashboard_metrics", {});
  const row = Array.isArray(r.body) ? r.body[0] : null;
  expect("admins", "Alcance da Loja C conta os contatos do Admin 1", "deny",
    Number(row?.professionals_contacted ?? 0) > 1,
    `${row?.professionals_contacted} profissional(is) contatado(s)`);
}

// Storage: o PDF é o dado mais sensível, e a policy dele lê a loja da pasta.
{
  const r = await storage(ADM, "GET", `object/proposal-pdfs/${F.pdfC}`);
  expect("admins", "Admin 1 baixa o PDF do Admin 2", "deny", r.status < 300, brief(r));
}
{
  const r = await storage(ADM2, "GET", `object/proposal-pdfs/${F.pdfA}`);
  expect("admins", "Admin 2 baixa o PDF do Admin 1", "deny", r.status < 300, brief(r));
}
{
  const r = await storage(ADM2, "GET", `object/proposal-pdfs/${F.pdfC}`);
  expect("admins", "Admin 2 baixa o próprio PDF", "allow", r.status < 300, brief(r));
}
{
  const r = await storage(ADM, "POST", `object/proposal-pdfs/${F.storeC}/${F.oppC}/plantado.pdf`, {
    headers: { "Content-Type": "application/pdf", "x-upsert": "true" },
    body: Buffer.from("%PDF-1.4 plantado\n%%EOF\n"),
  });
  expect("admins", "Admin 1 sobe PDF na pasta da loja do Admin 2", "deny", r.status < 300, brief(r));
}

// ---------------------------------------------------------------------------
section("Regressão do Admin — a segurança não pode quebrar o uso legítimo");
// ---------------------------------------------------------------------------
for (const [label, path] of [
  ["stores", "stores?select=id&limit=3"],
  ["professionals", "professionals?select=id&limit=3"],
  ["contacts", "contacts?select=id&limit=3"],
  ["contact_stores", "contact_stores?select=contact_id&limit=3"],
  ["opportunities", "opportunities?select=id&limit=3"],
  ["proposal_attachments", "proposal_attachments?select=id&limit=3"],
  ["opportunity_status_history", "opportunity_status_history?select=id&limit=3"],
  ["user_profiles", "user_profiles?select=id&limit=3"],
]) {
  expect("admin", `Admin lê ${label}`, "allow", readAllowed(await rest(ADM, "GET", path)));
}
for (const [fn, args] of [
  ["get_admin_portfolio_totals", {}],
  ["get_admin_dashboard_metrics", {}],
  ["get_admin_store_results", {}],
  ["get_admin_professionals_by_segment", {}],
  ["get_admin_professionals_by_region", {}],
  ["get_admin_activity_timeseries", { p_from: null, p_to: null, p_bucket: "day", p_store_id: null }],
  ["get_store_access_summary", {}],
  ["get_horn_reach_breakdown", {}],
]) {
  expect("admin", `Admin chama ${fn}`, "allow", (await rpc(ADM, fn, args)).status < 300);
}
expect("admin", "Admin consulta o breakdown da Loja A", "allow",
  (await rpc(ADM, "get_store_reach_breakdown", { p_store_id: F.storeA })).status < 300);
expect("admin", "Admin consulta o breakdown da Loja B", "allow",
  (await rpc(ADM, "get_store_reach_breakdown", { p_store_id: F.storeB })).status < 300);
{
  const r = await rest(ADM, "PATCH", `opportunities?id=eq.${F.oppA}`,
    { title: "SEC_TEST Projeto da Loja A" }, repr);
  expect("admin", "Admin edita uma oportunidade", "allow", writeAllowed(r), brief(r));
}
{
  const r = await storage(ADM, "POST", `object/proposal-pdfs/${F.storeA}/${F.oppA}/admin-upload.pdf`, {
    headers: { "Content-Type": "application/pdf", "x-upsert": "true" },
    body: Buffer.from("%PDF-1.4 admin\n%%EOF\n"),
  });
  expect("admin", "Admin faz upload de PDF", "allow", r.status < 300, brief(r));
  await fetch(`${SUPABASE_URL}/storage/v1/object/proposal-pdfs/${F.storeA}/${F.oppA}/admin-upload.pdf`,
    { method: "DELETE", headers: { apikey: PUBLISHABLE_KEY, Authorization: `Bearer ${ADM}` } });
}

// ---------------------------------------------------------------------------
section("Anônimo não alcança nada");
// ---------------------------------------------------------------------------
for (const t of ["stores", "professionals", "contacts", "contact_stores", "opportunities",
                 "user_profiles", "proposal_attachments", "opportunity_status_history",
                 "segments", "regions"]) {
  const r = await rest(ANON, "GET", `${t}?select=*`);
  expect("anon", `Anônimo lê ${t}`, "deny", readAllowed(r), brief(r));
}

process.exit(summary() > 0 ? 1 : 0);
