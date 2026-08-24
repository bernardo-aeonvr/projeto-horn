/**
 * Fixtures dos testes de autorização — criação e remoção.
 *
 * Tudo que este arquivo cria leva o prefixo SEC_TEST e é removido por
 * `npm run test:authz:teardown`. Nenhum dado real é tocado.
 *
 * A credencial privilegiada é usada SOMENTE aqui, para preparar dados. Os
 * testes de autorização usam sessões reais de usuário: a service role ignora
 * RLS e não serviria para provar que uma policy está correta.
 *
 * Uso:
 *   node tests/fixtures.mjs setup
 *   node tests/fixtures.mjs teardown
 */
import { writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import path from "node:path";

import { env, require_, SUPABASE_URL } from "./lib/env.mjs";
import { adminSql } from "./lib/client.mjs";

require_("NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SECRET_KEY", "SUPABASE_ACCESS_TOKEN");

const SECRET = env.SUPABASE_SECRET_KEY;
const MANIFEST = path.join(import.meta.dirname, "fixtures.json");

export const USERS = {
  storeA: { email: "sec-test-loja-a@example.com", password: "SecTestA!2026#horn" },
  storeB: { email: "sec-test-loja-b@example.com", password: "SecTestB!2026#horn" },
  admin: { email: "sec-test-admin@example.com", password: "SecTestAdmin!2026#horn" },
  // Segundo administrador, com carteira própria. Existe para provar o
  // isolamento da migration 0009: nada do admin acima pode alcançá-lo, e
  // vice-versa.
  admin2: { email: "sec-test-admin-2@example.com", password: "SecTestAdmin2!2026#horn" },
  storeC: { email: "sec-test-loja-c@example.com", password: "SecTestC!2026#horn" },
};

const q = (s) => `'${String(s).replace(/'/g, "''")}'`;

async function authAdmin(pathname, options = {}) {
  const res = await fetch(`${SUPABASE_URL}${pathname}`, {
    ...options,
    headers: {
      apikey: SECRET,
      Authorization: `Bearer ${SECRET}`,
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
  });
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = text; }
  return { status: res.status, body };
}

async function ensureUser({ email, password }) {
  const created = await authAdmin("/auth/v1/admin/users", {
    method: "POST",
    body: JSON.stringify({ email, password, email_confirm: true }),
  });
  if (created.status === 200 || created.status === 201) return created.body.id;

  const list = await authAdmin("/auth/v1/admin/users?per_page=200");
  const found = (list.body.users ?? []).find((u) => u.email === email);
  if (!found) throw new Error(`Não foi possível criar nem localizar ${email}`);
  await authAdmin(`/auth/v1/admin/users/${found.id}`, {
    method: "PUT",
    body: JSON.stringify({ password, email_confirm: true }),
  });
  return found.id;
}

const tinyPdf = (label) =>
  Buffer.from(
    `%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n` +
      `2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n` +
      `3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 50]>>endobj\n` +
      `trailer<</Root 1 0 R>>\n%% ${label}\n%%EOF\n`,
  );

export function loadManifest() {
  if (!existsSync(MANIFEST)) {
    console.error("Fixtures ausentes. Rode primeiro: npm run test:authz:setup");
    process.exit(1);
  }
  return JSON.parse(readFileSync(MANIFEST, "utf8"));
}

async function setup() {
  console.log("Criando fixtures SEC_TEST…");

  const userA = await ensureUser(USERS.storeA);
  const userB = await ensureUser(USERS.storeB);
  const admin = await ensureUser(USERS.admin);
  const admin2 = await ensureUser(USERS.admin2);
  const userC = await ensureUser(USERS.storeC);

  await teardownData(); // idempotente: limpa restos de uma execução anterior

  /*
    `owner_id` vai explícito em cada insert.

    Não é redundância: o trigger `a_*_set_owner` deriva o dono de
    `current_owner_id()`, e aqui não existe sessão — quem escreve é a service
    role, para quem `auth.uid()` é nulo. Sem a coluna preenchida à mão, o
    trigger levanta "Sem perfil ativo para determinar o dono do registro" e as
    fixtures nem chegam a ser criadas.

    Loja A, Loja B e o profissional pertencem ao primeiro admin. Loja C e o
    segundo profissional pertencem ao segundo — é esse par que os testes de
    isolamento entre admins exercitam.
  */
  const [f] = await adminSql(`
    with loja_a as (
      insert into public.stores (owner_id, name, category, is_active, default_commission_percent, notes)
      values (${q(admin)}, 'SEC_TEST Loja A', 'SEC_TEST', true, 10.00, 'Fixture de teste de autorizacao')
      returning id
    ),
    loja_b as (
      insert into public.stores (owner_id, name, category, is_active, default_commission_percent, notes)
      values (${q(admin)}, 'SEC_TEST Loja B', 'SEC_TEST', true, 20.00, 'Fixture de teste de autorizacao')
      returning id
    ),
    loja_c as (
      insert into public.stores (owner_id, name, category, is_active, default_commission_percent, notes)
      values (${q(admin2)}, 'SEC_TEST Loja C', 'SEC_TEST', true, 30.00, 'Fixture do segundo admin')
      returning id
    ),
    seg as (select id from public.segments order by sort_order limit 1),
    reg as (select id from public.regions order by sort_order limit 1),
    prof as (
      insert into public.professionals (owner_id, name, segment_id, email, phone, instagram, address, notes, is_active)
      values (${q(admin)}, 'SEC_TEST Profissional', (select id from seg),
              'sec-test-prof@example.com', '11999990000', '@sectestprof',
              'Rua Secreta 123 - SEC_TEST', 'OBSERVACAO INTERNA SIGILOSA SEC_TEST', true)
      returning id
    ),
    prof2 as (
      insert into public.professionals (owner_id, name, segment_id, email, phone, instagram, address, notes, is_active)
      values (${q(admin2)}, 'SEC_TEST Profissional Admin 2', (select id from seg),
              'sec-test-prof2@example.com', '11988880000', '@sectestprof2',
              'Rua Reservada 456 - SEC_TEST', 'CARTEIRA DO SEGUNDO ADMIN SEC_TEST', true)
      returning id
    ),
    profreg as (
      insert into public.professional_regions (professional_id, region_id)
      select (select id from prof), (select id from reg) returning professional_id
    ),
    -- Contato que apresentou AS DUAS lojas: base do teste de contact_stores.
    ct as (
      insert into public.contacts (owner_id, professional_id, contacted_at, channel, notes)
      values (${q(admin)}, (select id from prof), now() - interval '2 days', 'whatsapp',
              'SEC_TEST contato interno da HORN')
      returning id
    ),
    ct2 as (
      insert into public.contacts (owner_id, professional_id, contacted_at, channel, notes)
      values (${q(admin2)}, (select id from prof2), now() - interval '1 day', 'phone',
              'SEC_TEST contato do segundo admin')
      returning id
    ),
    cs as (
      insert into public.contact_stores (contact_id, store_id)
      select (select id from ct), x from (
        select (select id from loja_a) as x union all select (select id from loja_b)
      ) t returning contact_id
    ),
    cs2 as (
      insert into public.contact_stores (contact_id, store_id)
      select (select id from ct2), (select id from loja_c) returning contact_id
    ),
    opp_a as (
      insert into public.opportunities (owner_id, professional_id, store_id, title, notes, status,
                                        proposal_initial_value, final_closed_value, commission_percent)
      values (${q(admin)}, (select id from prof), (select id from loja_a),
              'SEC_TEST Projeto da Loja A', 'NOTA INTERNA A', 'closed', 11111.11, 10000.00, 10.00)
      returning id
    ),
    opp_b as (
      insert into public.opportunities (owner_id, professional_id, store_id, title, notes, status,
                                        proposal_initial_value, final_closed_value, commission_percent)
      values (${q(admin)}, (select id from prof), (select id from loja_b),
              'SEC_TEST Projeto da Loja B', 'NOTA INTERNA B', 'closed', 22222.22, 20000.00, 20.00)
      returning id
    ),
    opp_c as (
      insert into public.opportunities (owner_id, professional_id, store_id, title, notes, status,
                                        proposal_initial_value, final_closed_value, commission_percent)
      values (${q(admin2)}, (select id from prof2), (select id from loja_c),
              'SEC_TEST Projeto da Loja C', 'NOTA INTERNA C', 'closed', 33333.33, 30000.00, 30.00)
      returning id
    )
    select (select id from loja_a) as store_a, (select id from loja_b) as store_b,
           (select id from loja_c) as store_c,
           (select id from prof) as professional, (select id from prof2) as professional2,
           (select id from ct) as contact, (select id from ct2) as contact2,
           (select id from opp_a) as opp_a, (select id from opp_b) as opp_b,
           (select id from opp_c) as opp_c;
  `);

  // `owner_id` também vai à mão nos perfis: o trigger `user_profiles_guard_owner`
  // exige que um admin seja dono de si mesmo e que um acesso de loja pertença ao
  // dono da loja.
  await adminSql(`
    update public.user_profiles set role='store', store_id=${q(f.store_a)}, is_active=true,
      owner_id=${q(admin)}, full_name='SEC_TEST Usuario Loja A',
      must_change_password=false where id=${q(userA)};
    update public.user_profiles set role='store', store_id=${q(f.store_b)}, is_active=true,
      owner_id=${q(admin)}, full_name='SEC_TEST Usuario Loja B',
      must_change_password=false where id=${q(userB)};
    update public.user_profiles set role='store', store_id=${q(f.store_c)}, is_active=true,
      owner_id=${q(admin2)}, full_name='SEC_TEST Usuario Loja C',
      must_change_password=false where id=${q(userC)};
    update public.user_profiles set role='admin', store_id=null, is_active=true,
      owner_id=${q(admin)}, full_name='SEC_TEST Usuario Admin',
      must_change_password=false where id=${q(admin)};
    update public.user_profiles set role='admin', store_id=null, is_active=true,
      owner_id=${q(admin2)}, full_name='SEC_TEST Usuario Admin 2',
      must_change_password=false where id=${q(admin2)};
  `);

  const pdfA = `${f.store_a}/${f.opp_a}/sec-test-loja-a.pdf`;
  const pdfB = `${f.store_b}/${f.opp_b}/sec-test-loja-b.pdf`;
  const pdfC = `${f.store_c}/${f.opp_c}/sec-test-loja-c.pdf`;

  for (const [label, p] of [["A", pdfA], ["B", pdfB], ["C", pdfC]]) {
    await fetch(`${SUPABASE_URL}/storage/v1/object/proposal-pdfs/${p}`, {
      method: "POST",
      headers: {
        apikey: SECRET, Authorization: `Bearer ${SECRET}`,
        "Content-Type": "application/pdf", "x-upsert": "true",
      },
      body: tinyPdf(`SEC_TEST loja ${label}`),
    });
  }

  await adminSql(`
    insert into public.proposal_attachments (opportunity_id, storage_path, file_name, mime_type, size_bytes)
    values (${q(f.opp_a)}, ${q(pdfA)}, 'sec-test-loja-a.pdf', 'application/pdf', 200),
           (${q(f.opp_b)}, ${q(pdfB)}, 'sec-test-loja-b.pdf', 'application/pdf', 200),
           (${q(f.opp_c)}, ${q(pdfC)}, 'sec-test-loja-c.pdf', 'application/pdf', 200);
  `);

  const att = await adminSql(`
    select id, opportunity_id from public.proposal_attachments
    where storage_path in (${q(pdfA)}, ${q(pdfB)}, ${q(pdfC)});
  `);

  const manifest = {
    userA: { id: userA, ...USERS.storeA },
    userB: { id: userB, ...USERS.storeB },
    userC: { id: userC, ...USERS.storeC },
    admin: { id: admin, ...USERS.admin },
    admin2: { id: admin2, ...USERS.admin2 },
    storeA: f.store_a, storeB: f.store_b, storeC: f.store_c,
    professional: f.professional, professional2: f.professional2,
    contact: f.contact, contact2: f.contact2,
    oppA: f.opp_a, oppB: f.opp_b, oppC: f.opp_c,
    pdfA, pdfB, pdfC,
    attachmentA: att.find((a) => a.opportunity_id === f.opp_a)?.id,
    attachmentB: att.find((a) => a.opportunity_id === f.opp_b)?.id,
    attachmentC: att.find((a) => a.opportunity_id === f.opp_c)?.id,
  };

  writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2));
  console.log(`Fixtures prontos. Manifesto em tests/fixtures.json`);
  console.log("  Admin 1: Loja A / Loja B, 1 profissional, 1 contato com as duas lojas,");
  console.log("  1 oportunidade e 1 PDF por loja.");
  console.log("  Admin 2: Loja C, 1 profissional, 1 contato, 1 oportunidade, 1 PDF.");
  console.log("  5 usuários SEC_TEST (3 lojas, 2 admins).");
}

/** Remove só os dados SEC_TEST. Nunca toca em registro real. */
async function teardownData() {
  const objs = await adminSql(`
    select name from storage.objects
    where bucket_id='proposal-pdfs' and name like '%sec-test-%';
  `);
  for (const o of objs) {
    await fetch(`${SUPABASE_URL}/storage/v1/object/proposal-pdfs/${o.name}`, {
      method: "DELETE",
      headers: { apikey: SECRET, Authorization: `Bearer ${SECRET}` },
    });
  }

  await adminSql(`
    delete from public.proposal_attachments
     where storage_path like '%sec-test-%'
        or opportunity_id in (select id from public.opportunities where title like 'SEC\\_TEST%');

    delete from public.opportunity_status_history
     where opportunity_id in (select id from public.opportunities where title like 'SEC\\_TEST%');

    delete from public.opportunities where title like 'SEC\\_TEST%';

    delete from public.contact_stores
     where store_id in (select id from public.stores where name like 'SEC\\_TEST%')
        or contact_id in (
          select c.id from public.contacts c
          join public.professionals p on p.id = c.professional_id
          where p.name like 'SEC\\_TEST%');

    delete from public.contacts
     where professional_id in (select id from public.professionals where name like 'SEC\\_TEST%');

    delete from public.professional_regions
     where professional_id in (select id from public.professionals where name like 'SEC\\_TEST%');

    delete from public.professionals where name like 'SEC\\_TEST%';

    -- Desvincula os perfis antes de apagar as lojas (FK on delete restrict).
    update public.user_profiles set is_active=false, store_id=null
     where store_id in (select id from public.stores where name like 'SEC\\_TEST%');

    delete from public.stores where name like 'SEC\\_TEST%';
  `);
}

async function teardown() {
  console.log("Removendo fixtures SEC_TEST…");
  await teardownData();

  const list = await authAdmin("/auth/v1/admin/users?per_page=200");
  const emails = new Set(Object.values(USERS).map((u) => u.email));
  for (const u of list.body.users ?? []) {
    if (!emails.has(u.email)) continue;

    // O status é conferido: uma exclusão recusada por chave estrangeira deixa a
    // conta e o perfil para trás, e anunciar "removido" sem olhar a resposta
    // esconderia justamente o resto que o próximo setup vai tropeçar.
    const r = await authAdmin(`/auth/v1/admin/users/${u.id}`, { method: "DELETE" });
    if (r.status >= 300) {
      console.error(`  FALHA ao remover ${u.email}: ${r.status} ${JSON.stringify(r.body)}`);
    } else {
      console.log(`  usuário removido: ${u.email}`);
    }
  }

  if (existsSync(MANIFEST)) rmSync(MANIFEST);
  console.log("Fixtures removidos. Nenhum dado real foi tocado.");
}

const command = process.argv[2];
if (command === "setup") await setup();
else if (command === "teardown") await teardown();
else if (command) {
  console.error(`Comando desconhecido: ${command}. Use "setup" ou "teardown".`);
  process.exit(1);
}
