-- ============================================================================
-- SEED DE DESENVOLVIMENTO — atividade comercial para os dashboards
--
-- Complementa supabase/seed/dev_seed.sql (lojas e profissionais) gerando o que
-- os dashboards consolidam: contatos, lojas apresentadas, oportunidades e
-- histórico de status espalhados pelos últimos meses.
--
-- NÃO representa clientes ou negócios reais da HORN.
-- Remover antes de entrar em operação:
--
--   delete from public.opportunities where notes = 'seed-dashboard';
--   delete from public.contacts where notes = 'seed-dashboard';
--
-- (contact_stores, proposal_attachments e opportunity_status_history saem
--  junto por ON DELETE CASCADE)
--
-- O arquivo é idempotente: reaplicar não duplica, porque cada bloco verifica
-- antes se o seed já existe.
--
-- Pré-requisito: dev_seed.sql já aplicado (precisa de lojas e profissionais).
--
-- POR QUE O HISTÓRICO É ESCRITO À MÃO AQUI:
-- em produção quem escreve opportunity_status_history é o trigger
-- opportunities_record_status_history, sempre com now(). Para exercitar a
-- regra temporal dos KPIs (projeto em um mês, proposta em outro, fechamento
-- em outro) o seed apaga os eventos que o trigger gerou e insere a trilha
-- retroativa equivalente. Isso vale para dados fictícios de desenvolvimento;
-- a aplicação continua nunca escrevendo nessa tabela.
-- ============================================================================

begin;

-- --------------------------------------------------------------------------
-- 1. CONTATOS
-- --------------------------------------------------------------------------
-- Distribuição pensada para separar visualmente os dois KPIs de contato:
-- parte dos profissionais não recebe contato nenhum, e boa parte recebe mais
-- de um. Assim "Profissionais contatados" e "Contatos realizados" nunca são
-- o mesmo número.

insert into public.contacts (professional_id, contacted_at, channel, notes)
select
  b.professional_id,
  -- Espalha pelos últimos ~5 meses, sempre em horário comercial local.
  (
    date_trunc('day', now() at time zone 'America/Sao_Paulo')
    - (((b.n * 11 + g.i * 29) % 150)) * interval '1 day'
    + (9 + ((b.n + g.i) % 9)) * interval '1 hour'
  ) at time zone 'America/Sao_Paulo',
  (array['whatsapp','phone','instagram','email','other'])[1 + ((b.n + g.i) % 5)]::public.contact_channel,
  'seed-dashboard'
from (
  select p.id as professional_id, row_number() over (order by p.name) as n
  from public.professionals p
  where p.is_active
) b
cross join generate_series(1, 3) g(i)
-- n % 4 define quantos contatos o profissional recebe: 0, 1, 2 ou 3.
where g.i <= (b.n % 4)
  and not exists (
    select 1 from public.contacts c where c.notes = 'seed-dashboard'
  );

-- --------------------------------------------------------------------------
-- 2. LOJAS APRESENTADAS EM CADA CONTATO
-- --------------------------------------------------------------------------
-- Snapshot histórico: é isto que decide o alcance de cada loja. Um contato
-- expõe de 2 a 5 lojas ativas, escolhidas de forma determinística.

insert into public.contact_stores (contact_id, store_id)
select c.contact_id, s.store_id
from (
  select c.id as contact_id, row_number() over (order by c.contacted_at, c.id) as n
  from public.contacts c
  where c.notes = 'seed-dashboard'
) c
join (
  select s.id as store_id, row_number() over (order by s.name) as sn,
         count(*) over () as total
  from public.stores s
  where s.is_active
) s
  on ((s.sn + c.n * 7) % s.total) < (2 + (c.n % 4))
on conflict (contact_id, store_id) do nothing;

-- --------------------------------------------------------------------------
-- 3. OPORTUNIDADES
-- --------------------------------------------------------------------------
-- Nascem a partir de profissionais que realmente foram contatados — igual ao
-- fluxo real, onde o projeto vem depois de uma conversa. A loja escolhida é
-- uma das que foram apresentadas àquele profissional.
--
-- O percentual de comissão é gravado explicitamente com o padrão da loja
-- naquele momento, e não recalculado depois: é o percentual histórico.

insert into public.opportunities (
  professional_id, store_id, title, notes, status,
  proposal_initial_value, final_closed_value, commission_percent, created_at
)
select
  d.professional_id,
  d.store_id,
  d.titulo,
  'seed-dashboard',
  d.status,
  d.valor_inicial,
  d.valor_final,
  d.percentual,
  d.criado_em
from (
  select
    x.professional_id,
    x.store_id,
    (array[
      'Marcenaria apartamento','Mármore bancada cozinha','Iluminação sala de estar',
      'Revestimento área gourmet','Automação residencial','Esquadrias fachada',
      'Piso de madeira suítes','Projeto de paisagismo','Climatização integrada',
      'Marcenaria home office'
    ])[1 + (x.n % 10)] || ' ' || (100 + x.n)::text as titulo,
    -- Distribuição de status parecida com um funil real: mais coisa no meio,
    -- alguns fechamentos e algumas perdas.
    (array[
      'project_received','waiting_store_proposal','proposal_received',
      'proposal_sent_to_professional','negotiating','closed','closed','lost'
    ])[1 + (x.n % 8)]::public.opportunity_status as status,
    -- Valor inicial só existe a partir de "proposta recebida".
    case when (x.n % 8) >= 2
      then (8000 + ((x.n * 2137) % 90) * 500)::numeric(14,2)
      else null end as valor_inicial,
    -- Valor final só nos fechados, sempre um pouco abaixo do inicial:
    -- é o desconto da negociação.
    case when (x.n % 8) in (5, 6)
      then ((8000 + ((x.n * 2137) % 90) * 500) * 0.92)::numeric(14,2)
      else null end as valor_final,
    coalesce(x.default_commission_percent, 3.00) as percentual,
    x.criado_em
  from (
    select distinct on (c.professional_id, cs.store_id)
      c.professional_id,
      cs.store_id,
      s.default_commission_percent,
      -- O projeto nasce alguns dias depois do contato que o originou.
      c.contacted_at + ((3 + (row_number() over ()) % 21)) * interval '1 day' as criado_em,
      row_number() over () as n
    from public.contacts c
    join public.contact_stores cs on cs.contact_id = c.id
    join public.stores s on s.id = cs.store_id
    where c.notes = 'seed-dashboard'
      and (c.contacted_at + interval '3 day') < now()
    order by c.professional_id, cs.store_id, c.contacted_at
  ) x
  -- Só uma fatia dos pares profissional x loja vira projeto: contato não
  -- gera oportunidade automaticamente.
  where (x.n % 9) = 0
) d
where not exists (
  select 1 from public.opportunities o where o.notes = 'seed-dashboard'
);

-- --------------------------------------------------------------------------
-- 4. HISTÓRICO DE STATUS RETROATIVO
-- --------------------------------------------------------------------------
-- Substitui o evento único que o trigger gravou com now() por uma trilha
-- coerente, com cada transição em sua própria data. Sem isso todos os KPIs
-- cairiam no mês em que o seed foi aplicado.

delete from public.opportunity_status_history h
using public.opportunities o
where h.opportunity_id = o.id
  and o.notes = 'seed-dashboard';

-- A ordem oficial do funil, usada para saber por quais etapas cada
-- oportunidade passou até o status atual.
with fluxo(status, passo) as (
  values
    ('project_received', 1),
    ('waiting_store_proposal', 2),
    ('proposal_received', 3),
    ('proposal_sent_to_professional', 4),
    ('negotiating', 5)
),
alvo as (
  select
    o.id,
    o.status,
    o.created_at,
    case o.status
      when 'project_received' then 1
      when 'waiting_store_proposal' then 2
      when 'proposal_received' then 3
      when 'proposal_sent_to_professional' then 4
      when 'negotiating' then 5
      -- Fechada e perdida percorrem o funil até "em negociação" e então
      -- recebem o evento final.
      else 5
    end as passo_final,
    row_number() over (order by o.created_at, o.id) as n
  from public.opportunities o
  where o.notes = 'seed-dashboard'
),
etapas as (
  select
    a.id as opportunity_id,
    f.status::public.opportunity_status as to_status,
    f.passo,
    -- Cada etapa avança alguns dias: o funil leva semanas, não segundos.
    a.created_at + ((f.passo - 1) * (4 + (a.n % 9))) * interval '1 day' as changed_at
  from alvo a
  join fluxo f on f.passo <= a.passo_final

  union all

  -- Evento terminal, quando houver.
  select
    a.id,
    a.status,
    6,
    a.created_at + (5 * (4 + (a.n % 9)) + (3 + a.n % 12)) * interval '1 day'
  from alvo a
  where a.status in ('closed', 'lost')
)
insert into public.opportunity_status_history (opportunity_id, from_status, to_status, changed_at)
select
  e.opportunity_id,
  lag(e.to_status) over (partition by e.opportunity_id order by e.passo),
  e.to_status,
  e.changed_at
from etapas e
-- Um evento no futuro deixaria o KPI do mês atual errado.
where e.changed_at <= now();

-- Realinha o status atual da oportunidade com o último evento que sobrou,
-- para lista e dashboard contarem a mesma história.
update public.opportunities o
set status = u.to_status,
    updated_at = u.changed_at,
    -- Valores só fazem sentido a partir da etapa em que aparecem.
    final_closed_value = case when u.to_status = 'closed' then o.final_closed_value else null end,
    loss_reason = case when u.to_status = 'lost' then 'Cliente optou por outro fornecedor.' else null end
from (
  select distinct on (h.opportunity_id)
    h.opportunity_id, h.to_status, h.changed_at
  from public.opportunity_status_history h
  join public.opportunities o2 on o2.id = h.opportunity_id
  where o2.notes = 'seed-dashboard'
  order by h.opportunity_id, h.changed_at desc, h.id
) u
where u.opportunity_id = o.id
  and o.notes = 'seed-dashboard';

-- Um fechamento sem valor final quebraria o CHECK do trigger na próxima
-- atualização; garante o par valor/percentual em todo negócio fechado.
update public.opportunities o
set final_closed_value = coalesce(o.final_closed_value, round(coalesce(o.proposal_initial_value, 15000) * 0.92, 2)),
    commission_percent = coalesce(o.commission_percent, 3.00)
where o.notes = 'seed-dashboard'
  and o.status = 'closed';

commit;

-- ============================================================================
-- CONFERÊNCIA RÁPIDA (opcional)
-- ============================================================================
-- select count(*) as contatos from public.contacts where notes = 'seed-dashboard';
-- select count(*) as vinculos from public.contact_stores cs
--   join public.contacts c on c.id = cs.contact_id where c.notes = 'seed-dashboard';
-- select status, count(*) from public.opportunities
--   where notes = 'seed-dashboard' group by status order by 1;
-- select to_status, date_trunc('month', changed_at) as mes, count(*)
--   from public.opportunity_status_history h
--   join public.opportunities o on o.id = h.opportunity_id
--   where o.notes = 'seed-dashboard' group by 1,2 order by 2,1;
-- ============================================================================
