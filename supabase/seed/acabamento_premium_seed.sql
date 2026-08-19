-- ============================================================================
-- SEED DE DESENVOLVIMENTO — atividade da loja "Acabamento Premium"
--
-- Existe para exercitar o Dashboard da Loja com números diferentes de zero:
-- o dev_seed espalha a atividade por dezenas de lojas e sobra pouco (ou nada)
-- para uma loja específica. Aqui a atividade é concentrada em uma só.
--
-- NÃO representa clientes ou negócios reais da HORN.
-- Remover a qualquer momento:
--
--   delete from public.opportunities where notes = 'seed-acabamento';
--   delete from public.contacts where notes = 'seed-acabamento';
--
-- (contact_stores e opportunity_status_history saem junto por ON DELETE CASCADE)
--
-- Idempotente: reaplicar não duplica, porque cada bloco verifica antes se o
-- seed já existe.
--
-- Pré-requisito: supabase/seed/dev_seed.sql aplicado (precisa da loja
-- "Acabamento Premium" e dos profissionais).
--
-- AS DATAS SÃO RELATIVAS AO MÊS CORRENTE, não fixas: o dashboard abre em
-- "Este mês", e um seed com datas absolutas ficaria invisível no mês seguinte.
-- Cada evento é limitado a `now()` — um evento no futuro não entraria em
-- nenhum KPI — e cada etapa recua uma hora a menos que a anterior, para a
-- ordem do funil se manter mesmo quando o seed roda no começo do mês.
--
-- O histórico é escrito à mão pelo mesmo motivo do dashboard_seed.sql: em
-- produção quem escreve opportunity_status_history é o trigger, sempre com
-- now(). Para o funil ocupar várias datas, o seed apaga o evento do trigger e
-- insere a trilha retroativa equivalente.
-- ============================================================================

begin;

-- --------------------------------------------------------------------------
-- 0. PLANO
-- --------------------------------------------------------------------------
-- Uma linha por oportunidade, com o dia (contado do início do mês) de cada
-- transição. Coluna nula = etapa que aquela oportunidade não alcançou.
--
-- `n` é a posição do profissional na lista de ativos ordenada por nome: cada
-- oportunidade sai de um profissional diferente.

create temporary table plano_acabamento (
  n int,
  titulo text,
  dia_projeto int,
  dia_espera int,
  dia_proposta int,
  dia_envio int,
  dia_negociacao int,
  dia_final int,
  status_final public.opportunity_status,
  valor_inicial numeric(14,2),
  valor_final numeric(14,2)
) on commit drop;

insert into plano_acabamento values
  (2,  'Revestimento sala e cozinha',   2,  4,  6,  7,  10,  13,  'closed',                        42000.00, 38500.00),
  (9,  'Porcelanato área gourmet',      4,  5,  7,  9,  11,  16,  'closed',                        27500.00, 25000.00),
  (15, 'Revestimento fachada sobrado',  6,  8, 10, 12, null, null, 'proposal_sent_to_professional', 33800.00, null),
  (22, 'Piso laminado suítes',          9, 10, 12, 13,   17, null, 'negotiating',                   18900.00, null),
  (30, 'Revestimento banheiros',       11, 12, 15, null, null, null, 'proposal_received',           12400.00, null),
  (38, 'Deck área externa',            13, 14, null, null, null, null, 'waiting_store_proposal',    null,     null),
  (45, 'Revestimento externo edícula',  5,  6,  8,  9,   12,   14,  'lost',                         21000.00, null);

-- --------------------------------------------------------------------------
-- 1. CONTATOS
-- --------------------------------------------------------------------------
-- O projeto nasce de uma conversa: cada oportunidade recebe um contato dois
-- dias antes, com a loja apresentada nele (bloco 2). É o que faz a coluna
-- "Alcançados" desta loja sair de zero no Dashboard Admin.

insert into public.contacts (professional_id, contacted_at, channel, notes)
select
  pr.id,
  least(
    (
      date_trunc('month', now() at time zone 'America/Sao_Paulo')
      + greatest(pl.dia_projeto - 2, 0) * interval '1 day'
      + interval '10 hour'
    ) at time zone 'America/Sao_Paulo',
    now() - interval '7 hour'
  ),
  (array['whatsapp','phone','email','instagram'])[1 + (pl.n % 4)]::public.contact_channel,
  'seed-acabamento'
from plano_acabamento pl
join (
  select p.id, row_number() over (order by p.name) as n
  from public.professionals p
  where p.is_active
) pr on pr.n = pl.n
where not exists (
  select 1 from public.contacts c where c.notes = 'seed-acabamento'
);

-- --------------------------------------------------------------------------
-- 2. LOJA APRESENTADA NO CONTATO
-- --------------------------------------------------------------------------

insert into public.contact_stores (contact_id, store_id)
select c.id, s.id
from public.contacts c
cross join public.stores s
where c.notes = 'seed-acabamento'
  and s.name = 'Acabamento Premium'
on conflict (contact_id, store_id) do nothing;

-- --------------------------------------------------------------------------
-- 3. OPORTUNIDADES
-- --------------------------------------------------------------------------
-- commission_percent fica nulo de propósito: o trigger `opportunities_prepare`
-- grava o padrão da loja no momento da criação, que é o comportamento real.

insert into public.opportunities (
  professional_id, store_id, title, notes, status,
  proposal_initial_value, final_closed_value, loss_reason, created_at
)
select
  pr.id,
  s.id,
  pl.titulo,
  'seed-acabamento',
  pl.status_final,
  pl.valor_inicial,
  pl.valor_final,
  case
    when pl.status_final = 'lost'::public.opportunity_status
    then 'Cliente optou por outro fornecedor.'
  end,
  least(
    (
      date_trunc('month', now() at time zone 'America/Sao_Paulo')
      + pl.dia_projeto * interval '1 day'
      + interval '10 hour'
    ) at time zone 'America/Sao_Paulo',
    now() - interval '5 hour'
  )
from plano_acabamento pl
join (
  select p.id, row_number() over (order by p.name) as n
  from public.professionals p
  where p.is_active
) pr on pr.n = pl.n
cross join (
  select id from public.stores where name = 'Acabamento Premium'
) s
where not exists (
  select 1 from public.opportunities o where o.notes = 'seed-acabamento'
);

-- --------------------------------------------------------------------------
-- 4. HISTÓRICO DE STATUS RETROATIVO
-- --------------------------------------------------------------------------

delete from public.opportunity_status_history h
using public.opportunities o
where h.opportunity_id = o.id
  and o.notes = 'seed-acabamento';

insert into public.opportunity_status_history (
  opportunity_id, from_status, to_status, changed_at
)
select
  e.opportunity_id,
  lag(e.to_status) over (partition by e.opportunity_id order by e.passo),
  e.to_status,
  e.changed_at
from (
  select
    o.id as opportunity_id,
    x.status as to_status,
    x.passo,
    least(
      (
        date_trunc('month', now() at time zone 'America/Sao_Paulo')
        + x.dia * interval '1 day'
        + interval '10 hour'
      ) at time zone 'America/Sao_Paulo',
      now() - (6 - x.passo) * interval '1 hour'
    ) as changed_at
  from public.opportunities o
  join plano_acabamento pl on pl.titulo = o.title
  cross join lateral (
    values
      ('project_received'::public.opportunity_status, pl.dia_projeto, 1),
      ('waiting_store_proposal',                      pl.dia_espera, 2),
      ('proposal_received',                           pl.dia_proposta, 3),
      ('proposal_sent_to_professional',               pl.dia_envio, 4),
      ('negotiating',                                 pl.dia_negociacao, 5),
      -- Evento terminal: só existe quando a oportunidade fechou ou foi perdida.
      (pl.status_final,                               pl.dia_final, 6)
  ) as x(status, dia, passo)
  where o.notes = 'seed-acabamento'
    and x.dia is not null
) e;

-- Deixa a oportunidade e sua trilha contando a mesma história.
update public.opportunities o
set updated_at = u.changed_at
from (
  select h.opportunity_id, max(h.changed_at) as changed_at
  from public.opportunity_status_history h
  join public.opportunities o2 on o2.id = h.opportunity_id
  where o2.notes = 'seed-acabamento'
  group by h.opportunity_id
) u
where u.opportunity_id = o.id
  and o.notes = 'seed-acabamento';

commit;

-- ============================================================================
-- CONFERÊNCIA RÁPIDA (opcional)
-- ============================================================================
-- select o.title, o.status, o.proposal_initial_value, o.final_closed_value,
--        o.commission_percent, o.commission_value, o.created_at
--   from public.opportunities o
--   where o.notes = 'seed-acabamento' order by o.created_at;
--
-- select h.to_status, h.changed_at
--   from public.opportunity_status_history h
--   join public.opportunities o on o.id = h.opportunity_id
--   where o.notes = 'seed-acabamento' order by o.created_at, h.changed_at;
-- ============================================================================
