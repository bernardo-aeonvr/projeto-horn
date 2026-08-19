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

  await teardownData(); // idempotente: limpa restos de uma execução anterior

  const [f] = await adminSql(`
    with loja_a as (
      insert into public.stores (name, category, is_active, default_commission_percent, notes)
      values ('SEC_TEST Loja A', 'SEC_TEST', true, 10.00, 'Fixture de teste de autorizacao')
      returning id
    ),
    loja_b as (
      insert into public.stores (name, category, is_active, default_commission_percent, notes)
      values ('SEC_TEST Loja B', 'SEC_TEST', true, 20.00, 'Fixture de teste de autorizacao')
      returning id
    ),
    seg as (select id from public.segments order by sort_order limit 1),
    reg as (select id from public.regions order by sort_order limit 1),
    prof as (
      insert into public.professionals (name, segment_id, email, phone, instagram, address, notes, is_active)
      values ('SEC_TEST Profissional', (select id from seg),
              'sec-test-prof@example.com', '11999990000', '@sectestprof',
              'Rua Secreta 123 - SEC_TEST', 'OBSERVACAO INTERNA SIGILOSA SEC_TEST', true)
      returning id
    ),
    profreg as (
      insert into public.professional_regions (professional_id, region_id)
      select (select id from prof), (select id from reg) returning professional_id
    ),
    -- Contato que apresentou AS DUAS lojas: base do teste de contact_stores.
    ct as (
      insert into public.contacts (professional_id, contacted_at, channel, notes)
      values ((select id from prof), now() - interval '2 days', 'whatsapp',
              'SEC_TEST contato interno da HORN')
      returning id
    ),
    cs as (
      insert into public.contact_stores (contact_id, store_id)
      select (select id from ct), x from (
        select (select id from loja_a) as x union all select (select id from loja_b)
      ) t returning contact_id
    ),
    opp_a as (
      insert into public.opportunities (professional_id, store_id, title, notes, status,
                                        proposal_initial_value, final_closed_value, commission_percent)
      values ((select id from prof), (select id from loja_a),
              'SEC_TEST Projeto da Loja A', 'NOTA INTERNA A', 'closed', 11111.11, 10000.00, 10.00)
      returning id
    ),
    opp_b as (
      insert into public.opportunities (professional_id, store_id, title, notes, status,
                                        proposal_initial_value, final_closed_value, commission_percent)
      values ((select id from prof), (select id from loja_b),
              'SEC_TEST Projeto da Loja B', 'NOTA INTERNA B', 'closed', 22222.22, 20000.00, 20.00)
      returning id
    )
    select (select id from loja_a) as store_a, (select id from loja_b) as store_b,
           (select id from prof) as professional, (select id from ct) as contact,
           (select id from opp_a) as opp_a, (select id from opp_b) as opp_b;
  `);

  await adminSql(`
    update public.user_profiles set role='store', store_id=${q(f.store_a)}, is_active=true,
      full_name='SEC_TEST Usuario Loja A', must_change_password=false where id=${q(userA)};
    update public.user_profiles set role='store', store_id=${q(f.store_b)}, is_active=true,
      full_name='SEC_TEST Usuario Loja B', must_change_password=false where id=${q(userB)};
    update public.user_profiles set role='admin', store_id=null, is_active=true,
      full_name='SEC_TEST Usuario Admin', must_change_password=false where id=${q(admin)};
  `);

  const pdfA = `${f.store_a}/${f.opp_a}/sec-test-loja-a.pdf`;
  const pdfB = `${f.store_b}/${f.opp_b}/sec-test-loja-b.pdf`;

  for (const [label, p] of [["A", pdfA], ["B", pdfB]]) {
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
           (${q(f.opp_b)}, ${q(pdfB)}, 'sec-test-loja-b.pdf', 'application/pdf', 200);
  `);

  const att = await adminSql(`
    select id, opportunity_id from public.proposal_attachments
    where storage_path in (${q(pdfA)}, ${q(pdfB)});
  `);

  const manifest = {
    userA: { id: userA, ...USERS.storeA },
    userB: { id: userB, ...USERS.storeB },
    admin: { id: admin, ...USERS.admin },
    storeA: f.store_a, storeB: f.store_b,
    professional: f.professional, contact: f.contact,
    oppA: f.opp_a, oppB: f.opp_b,
    pdfA, pdfB,
    attachmentA: att.find((a) => a.opportunity_id === f.opp_a)?.id,
    attachmentB: att.find((a) => a.opportunity_id === f.opp_b)?.id,
  };

  writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2));
  console.log(`Fixtures prontos. Manifesto em tests/fixtures.json`);
  console.log("  SEC_TEST Loja A / Loja B, 1 profissional, 1 contato com as duas lojas,");
  console.log("  1 oportunidade por loja, 1 PDF por loja, 3 usuários SEC_TEST.");
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
    if (emails.has(u.email)) {
      await authAdmin(`/auth/v1/admin/users/${u.id}`, { method: "DELETE" });
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
