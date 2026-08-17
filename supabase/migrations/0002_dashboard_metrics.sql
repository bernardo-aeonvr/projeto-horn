-- ============================================================================
-- 0002 — funções de leitura do Dashboard HORN (admin)
--
-- Motivo: o PostgREST não faz COUNT(DISTINCT), GROUP BY nem série temporal.
-- Sem estas funções, o dashboard precisaria baixar todos os contatos e todas
-- as transições de status do período para agregar no JavaScript — exatamente
-- o que a especificação pede para evitar (seção de performance).
--
-- ESTE ARQUIVO É PURAMENTE ADITIVO.
-- Não cria, altera ou remove tabela, coluna, enum, índice, policy ou RLS.
-- Só adiciona funções SOMENTE LEITURA.
--
-- Semântica: espelha public.get_store_dashboard_metrics, que já existe no
-- schema. Mesmas regras, mesmas datas, mesma contagem por oportunidade
-- distinta. A visão do admin é a mesma conta da visão da loja, sem o
-- travamento em current_store_id() e com filtro opcional por loja.
--
-- REGRA TEMPORAL (spec, seção 14.5) — a data de cada indicador:
--   profissionais contatados / contatos  -> contacts.contacted_at
--   projetos recebidos                   -> opportunities.created_at
--   propostas recebidas                  -> history.changed_at (proposal_received)
--   propostas enviadas                   -> history.changed_at (proposal_sent_to_professional)
--   fechados / valor fechado / comissão  -> history.changed_at (closed)
--   perdidos                             -> history.changed_at (lost)
--
-- p_from é inclusivo; p_to é exclusivo. Iguais aos parâmetros das funções de
-- loja já existentes.
--
-- SEGURANÇA: todas são SECURITY DEFINER e começam checando public.is_admin().
-- Sem essa checagem um usuário de loja chamaria a função e enxergaria a
-- operação inteira, furando a RLS.
--
-- Dois cuidados que não são óbvios e já morderam aqui:
--
-- 1. `revoke ... from public` NÃO tira o execute de `anon`. O Supabase define
--    default privileges concedendo EXECUTE em funções novas do schema public
--    para anon, authenticated e service_role. Por isso cada função abaixo tem
--    um `revoke ... from anon` explícito, além da checagem interna.
--
-- 2. Comparação com NULL não barra ninguém. `p_store_id = current_store_id()`
--    devolve NULL quando o chamador não tem loja, e `if not (false or NULL)`
--    não entra no ramo — a exceção nunca era levantada. As guardas abaixo
--    resolvem o NULL explicitamente antes de comparar.
-- ============================================================================

begin;

-- --------------------------------------------------------------------------
-- 1. ATIVIDADE COMERCIAL DO PERÍODO
-- --------------------------------------------------------------------------
-- p_store_id nulo = consolidado de todas as lojas.
-- Com uma loja informada, o recorte é o mesmo que a loja veria de si mesma:
--   - alcance vem do snapshot em contact_stores, nunca das lojas ativas hoje;
--   - projetos, propostas e valores vêm das oportunidades daquela loja.

create or replace function public.get_admin_dashboard_metrics(
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_store_id uuid default null
)
returns table (
  professionals_contacted bigint,
  contact_events bigint,
  projects_received bigint,
  proposals_received bigint,
  proposals_sent bigint,
  proposals_closed bigint,
  proposals_lost bigint,
  total_proposed_value numeric,
  total_closed_value numeric,
  total_commission_value numeric,
  professionals_with_projects bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not coalesce((select public.is_admin()), false) then
    raise exception 'Not authorized';
  end if;

  return query
  with reach as (
    -- Um contato conta para a loja apenas se ela estava no snapshot daquele
    -- contato. Sem loja no filtro, vale todo contato registrado.
    select
      count(distinct c.professional_id)::bigint as professionals_contacted,
      count(distinct c.id)::bigint as contact_events
    from public.contacts c
    where (p_from is null or c.contacted_at >= p_from)
      and (p_to is null or c.contacted_at < p_to)
      and (
        p_store_id is null
        or exists (
          select 1
          from public.contact_stores cs
          where cs.contact_id = c.id
            and cs.store_id = p_store_id
        )
      )
  ),
  projects as (
    select
      count(*)::bigint as projects_received,
      count(distinct o.professional_id)::bigint as professionals_with_projects
    from public.opportunities o
    where (p_from is null or o.created_at >= p_from)
      and (p_to is null or o.created_at < p_to)
      and (p_store_id is null or o.store_id = p_store_id)
  ),
  -- Uma oportunidade conta uma vez por período em cada transição, mesmo que
  -- uma correção administrativa a leve ao mesmo status duas vezes.
  received_ids as (
    select distinct h.opportunity_id
    from public.opportunity_status_history h
    join public.opportunities o on o.id = h.opportunity_id
    where h.to_status = 'proposal_received'::public.opportunity_status
      and (p_from is null or h.changed_at >= p_from)
      and (p_to is null or h.changed_at < p_to)
      and (p_store_id is null or o.store_id = p_store_id)
  ),
  sent_ids as (
    select distinct h.opportunity_id
    from public.opportunity_status_history h
    join public.opportunities o on o.id = h.opportunity_id
    where h.to_status = 'proposal_sent_to_professional'::public.opportunity_status
      and (p_from is null or h.changed_at >= p_from)
      and (p_to is null or h.changed_at < p_to)
      and (p_store_id is null or o.store_id = p_store_id)
  ),
  -- Fechou no período E CONTINUA fechado.
  --
  -- A segunda condição não é preciosismo: `commission_value` é coluna gerada e
  -- só existe enquanto o status é 'closed'. Sem ela, um negócio fechado por
  -- engano e depois corrigido entrava na contagem e na soma de valor, mas
  -- entrava com comissão nula — a tela mostrava "2 fechados, R$ 30.500" com a
  -- comissão de um só. Contagem, valor e comissão agora saem do mesmo conjunto.
  closed_ids as (
    select distinct h.opportunity_id
    from public.opportunity_status_history h
    join public.opportunities o on o.id = h.opportunity_id
    where h.to_status = 'closed'::public.opportunity_status
      and o.status = 'closed'::public.opportunity_status
      and (p_from is null or h.changed_at >= p_from)
      and (p_to is null or h.changed_at < p_to)
      and (p_store_id is null or o.store_id = p_store_id)
  ),
  -- Mesma regra: reaberto por correção deixa de contar como perdido.
  lost_ids as (
    select distinct h.opportunity_id
    from public.opportunity_status_history h
    join public.opportunities o on o.id = h.opportunity_id
    where h.to_status = 'lost'::public.opportunity_status
      and o.status = 'lost'::public.opportunity_status
      and (p_from is null or h.changed_at >= p_from)
      and (p_to is null or h.changed_at < p_to)
      and (p_store_id is null or o.store_id = p_store_id)
  ),
  received_stats as (
    select count(*)::bigint as proposals_received from received_ids
  ),
  -- Valor proposto = valor inicial das propostas ENVIADAS no período.
  -- Uma proposta de julho que segue negociando em agosto não entra de novo.
  sent_stats as (
    select
      count(*)::bigint as proposals_sent,
      coalesce(sum(o.proposal_initial_value), 0::numeric) as total_proposed_value
    from sent_ids x
    join public.opportunities o on o.id = x.opportunity_id
  ),
  -- Valor fechado e comissão vêm dos negócios FECHADOS no período.
  -- commission_value é a coluna gerada da oportunidade: já carrega o
  -- percentual preservado no negócio, então mudar o percentual da loja hoje
  -- não altera resultado antigo.
  closed_stats as (
    select
      count(*)::bigint as proposals_closed,
      coalesce(sum(o.final_closed_value), 0::numeric) as total_closed_value,
      coalesce(sum(o.commission_value), 0::numeric) as total_commission_value
    from closed_ids x
    join public.opportunities o on o.id = x.opportunity_id
  ),
  lost_stats as (
    select count(*)::bigint as proposals_lost from lost_ids
  )
  select
    coalesce(reach.professionals_contacted, 0),
    coalesce(reach.contact_events, 0),
    coalesce(projects.projects_received, 0),
    coalesce(received_stats.proposals_received, 0),
    coalesce(sent_stats.proposals_sent, 0),
    coalesce(closed_stats.proposals_closed, 0),
    coalesce(lost_stats.proposals_lost, 0),
    coalesce(sent_stats.total_proposed_value, 0::numeric),
    coalesce(closed_stats.total_closed_value, 0::numeric),
    coalesce(closed_stats.total_commission_value, 0::numeric),
    coalesce(projects.professionals_with_projects, 0)
  from reach
  cross join projects
  cross join received_stats
  cross join sent_stats
  cross join closed_stats
  cross join lost_stats;
end;
$$;

revoke all on function public.get_admin_dashboard_metrics(timestamptz, timestamptz, uuid) from public;
revoke all on function public.get_admin_dashboard_metrics(timestamptz, timestamptz, uuid) from anon;
grant execute on function public.get_admin_dashboard_metrics(timestamptz, timestamptz, uuid) to authenticated;

-- --------------------------------------------------------------------------
-- 2. CARTEIRA (ESTADO ATUAL, INDEPENDENTE DE PERÍODO)
-- --------------------------------------------------------------------------
-- Estes números descrevem a base hoje. Não são eventos e por isso NÃO devem
-- reagir ao filtro de período (spec, seção 14.2 — "Carteira").

create or replace function public.get_admin_portfolio_totals()
returns table (
  professionals_total bigint,
  professionals_active bigint,
  professionals_inactive bigint,
  professionals_without_region bigint,
  stores_total bigint,
  stores_active bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not coalesce((select public.is_admin()), false) then
    raise exception 'Not authorized';
  end if;

  return query
  select
    (select count(*) from public.professionals)::bigint,
    (select count(*) from public.professionals p where p.is_active)::bigint,
    (select count(*) from public.professionals p where not p.is_active)::bigint,
    (
      select count(*)
      from public.professionals p
      where p.is_active
        and not exists (
          select 1
          from public.professional_regions pr
          where pr.professional_id = p.id
        )
    )::bigint,
    (select count(*) from public.stores)::bigint,
    (select count(*) from public.stores s where s.is_active)::bigint;
end;
$$;

revoke all on function public.get_admin_portfolio_totals() from public;
revoke all on function public.get_admin_portfolio_totals() from anon;
grant execute on function public.get_admin_portfolio_totals() to authenticated;

-- --------------------------------------------------------------------------
-- 3. DISTRIBUIÇÃO DA CARTEIRA POR SEGMENTO
-- --------------------------------------------------------------------------
-- Todo segmento do catálogo é devolvido, inclusive com zero, para o gráfico
-- não mudar de forma conforme a base cresce.

create or replace function public.get_admin_professionals_by_segment()
returns table (
  segment_id uuid,
  segment_name text,
  sort_order integer,
  active_count bigint,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not coalesce((select public.is_admin()), false) then
    raise exception 'Not authorized';
  end if;

  return query
  select
    s.id,
    s.name,
    s.sort_order,
    count(p.id) filter (where p.is_active)::bigint,
    count(p.id)::bigint
  from public.segments s
  left join public.professionals p on p.segment_id = s.id
  group by s.id, s.name, s.sort_order
  order by s.sort_order, s.name;
end;
$$;

revoke all on function public.get_admin_professionals_by_segment() from public;
revoke all on function public.get_admin_professionals_by_segment() from anon;
grant execute on function public.get_admin_professionals_by_segment() to authenticated;

-- --------------------------------------------------------------------------
-- 4. DISTRIBUIÇÃO DA CARTEIRA POR REGIÃO
-- --------------------------------------------------------------------------
-- ATENÇÃO: um profissional pode atuar em várias regiões, então a soma das
-- linhas é MAIOR que o total de profissionais. Isso é esperado e a interface
-- não deve tentar fechar em 100% (spec, seção "Profissionais por região").

create or replace function public.get_admin_professionals_by_region()
returns table (
  region_id uuid,
  region_name text,
  sort_order integer,
  active_count bigint,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not coalesce((select public.is_admin()), false) then
    raise exception 'Not authorized';
  end if;

  return query
  select
    r.id,
    r.name,
    r.sort_order,
    count(p.id) filter (where p.is_active)::bigint,
    count(p.id)::bigint
  from public.regions r
  left join public.professional_regions pr on pr.region_id = r.id
  left join public.professionals p on p.id = pr.professional_id
  group by r.id, r.name, r.sort_order
  order by r.sort_order, r.name;
end;
$$;

revoke all on function public.get_admin_professionals_by_region() from public;
revoke all on function public.get_admin_professionals_by_region() from anon;
grant execute on function public.get_admin_professionals_by_region() to authenticated;

-- --------------------------------------------------------------------------
-- 5. RESULTADOS POR LOJA
-- --------------------------------------------------------------------------
-- Uma linha por loja, já agregada no banco — evita o N+1 de consultar cada
-- loja separadamente.
--
-- professionals_reached usa o snapshot histórico de contact_stores: a loja só
-- recebe o alcance dos contatos em que ela estava selecionada. Nunca se
-- pergunta "quais lojas estão ativas hoje" para recalcular contato antigo.

create or replace function public.get_admin_store_results(
  p_from timestamptz default null,
  p_to timestamptz default null
)
returns table (
  store_id uuid,
  store_name text,
  is_active boolean,
  professionals_reached bigint,
  projects_received bigint,
  proposals_sent bigint,
  deals_closed bigint,
  total_closed_value numeric,
  total_commission_value numeric
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not coalesce((select public.is_admin()), false) then
    raise exception 'Not authorized';
  end if;

  return query
  with reach as (
    select
      cs.store_id,
      count(distinct c.professional_id)::bigint as professionals_reached
    from public.contact_stores cs
    join public.contacts c on c.id = cs.contact_id
    where (p_from is null or c.contacted_at >= p_from)
      and (p_to is null or c.contacted_at < p_to)
    group by cs.store_id
  ),
  projects as (
    select
      o.store_id,
      count(*)::bigint as projects_received
    from public.opportunities o
    where (p_from is null or o.created_at >= p_from)
      and (p_to is null or o.created_at < p_to)
    group by o.store_id
  ),
  sent as (
    select
      o.store_id,
      count(distinct o.id)::bigint as proposals_sent
    from public.opportunity_status_history h
    join public.opportunities o on o.id = h.opportunity_id
    where h.to_status = 'proposal_sent_to_professional'::public.opportunity_status
      and (p_from is null or h.changed_at >= p_from)
      and (p_to is null or h.changed_at < p_to)
    group by o.store_id
  ),
  -- Mesma regra da função de métricas: fechou no período e continua fechado,
  -- para contagem, valor e comissão virem do mesmo conjunto.
  closed as (
    select
      o.store_id,
      count(distinct o.id)::bigint as deals_closed,
      coalesce(sum(o.final_closed_value), 0::numeric) as total_closed_value,
      coalesce(sum(o.commission_value), 0::numeric) as total_commission_value
    from (
      select distinct h.opportunity_id
      from public.opportunity_status_history h
      where h.to_status = 'closed'::public.opportunity_status
        and (p_from is null or h.changed_at >= p_from)
        and (p_to is null or h.changed_at < p_to)
    ) x
    join public.opportunities o on o.id = x.opportunity_id
    where o.status = 'closed'::public.opportunity_status
    group by o.store_id
  )
  select
    s.id,
    s.name,
    s.is_active,
    coalesce(reach.professionals_reached, 0),
    coalesce(projects.projects_received, 0),
    coalesce(sent.proposals_sent, 0),
    coalesce(closed.deals_closed, 0),
    coalesce(closed.total_closed_value, 0::numeric),
    coalesce(closed.total_commission_value, 0::numeric)
  from public.stores s
  left join reach on reach.store_id = s.id
  left join projects on projects.store_id = s.id
  left join sent on sent.store_id = s.id
  left join closed on closed.store_id = s.id
  order by
    coalesce(closed.total_commission_value, 0::numeric) desc,
    coalesce(closed.total_closed_value, 0::numeric) desc,
    s.name;
end;
$$;

revoke all on function public.get_admin_store_results(timestamptz, timestamptz) from public;
revoke all on function public.get_admin_store_results(timestamptz, timestamptz) from anon;
grant execute on function public.get_admin_store_results(timestamptz, timestamptz) to authenticated;

-- --------------------------------------------------------------------------
-- 6. EVOLUÇÃO NO TEMPO
-- --------------------------------------------------------------------------
-- p_bucket aceita 'day' ou 'month'. A aplicação escolhe conforme o tamanho do
-- período selecionado.
--
-- TIMEZONE: o corte é feito em America/Sao_Paulo. `changed_at at time zone
-- 'America/Sao_Paulo'` converte o instante para a hora local antes de truncar,
-- então um contato às 23:00 de 14/08 fica em 14/08 — e não escorrega para o
-- dia seguinte, que é o bug clássico de fazer o truncate em UTC. O bucket
-- volta a ser timestamptz no fim para a aplicação formatar.

create or replace function public.get_admin_activity_timeseries(
  p_from timestamptz,
  p_to timestamptz,
  p_bucket text default 'day',
  p_store_id uuid default null
)
returns table (
  bucket_start timestamptz,
  professionals_contacted bigint,
  projects_received bigint,
  deals_closed bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_unit text;
  v_zone constant text := 'America/Sao_Paulo';
begin
  if not coalesce((select public.is_admin()), false) then
    raise exception 'Not authorized';
  end if;

  -- Nunca interpolar o parâmetro direto no date_trunc.
  v_unit := case when p_bucket = 'month' then 'month' else 'day' end;

  return query
  with buckets as (
    select generate_series(
      date_trunc(v_unit, p_from at time zone v_zone),
      date_trunc(v_unit, (p_to - interval '1 microsecond') at time zone v_zone),
      case when v_unit = 'month' then interval '1 month' else interval '1 day' end
    ) as local_start
  ),
  contacted as (
    select
      date_trunc(v_unit, c.contacted_at at time zone v_zone) as local_start,
      count(distinct c.professional_id)::bigint as total
    from public.contacts c
    where c.contacted_at >= p_from
      and c.contacted_at < p_to
      and (
        p_store_id is null
        or exists (
          select 1
          from public.contact_stores cs
          where cs.contact_id = c.id
            and cs.store_id = p_store_id
        )
      )
    group by 1
  ),
  projects as (
    select
      date_trunc(v_unit, o.created_at at time zone v_zone) as local_start,
      count(*)::bigint as total
    from public.opportunities o
    where o.created_at >= p_from
      and o.created_at < p_to
      and (p_store_id is null or o.store_id = p_store_id)
    group by 1
  ),
  closed as (
    select
      date_trunc(v_unit, h.changed_at at time zone v_zone) as local_start,
      count(distinct h.opportunity_id)::bigint as total
    from public.opportunity_status_history h
    join public.opportunities o on o.id = h.opportunity_id
    where h.to_status = 'closed'::public.opportunity_status
      and o.status = 'closed'::public.opportunity_status
      and h.changed_at >= p_from
      and h.changed_at < p_to
      and (p_store_id is null or o.store_id = p_store_id)
    group by 1
  )
  select
    (b.local_start at time zone v_zone) as bucket_start,
    coalesce(contacted.total, 0),
    coalesce(projects.total, 0),
    coalesce(closed.total, 0)
  from buckets b
  left join contacted on contacted.local_start = b.local_start
  left join projects on projects.local_start = b.local_start
  left join closed on closed.local_start = b.local_start
  order by b.local_start;
end;
$$;

revoke all on function public.get_admin_activity_timeseries(timestamptz, timestamptz, text, uuid) from public;
revoke all on function public.get_admin_activity_timeseries(timestamptz, timestamptz, text, uuid) from anon;
grant execute on function public.get_admin_activity_timeseries(timestamptz, timestamptz, text, uuid) to authenticated;

-- --------------------------------------------------------------------------
-- 7. SEGMENTOS E REGIÕES ALCANÇADOS POR UMA LOJA
-- --------------------------------------------------------------------------
-- Usada pelo Dashboard da Loja e também pelo admin quando ele filtra por uma
-- loja específica.
--
-- Autorização: o admin pode consultar qualquer loja; o usuário de loja só
-- consegue a própria, porque p_store_id é comparado com current_store_id().
-- Um store user pedindo outra loja recebe exceção, não uma lista vazia.

create or replace function public.get_store_reach_breakdown(
  p_store_id uuid,
  p_from timestamptz default null,
  p_to timestamptz default null
)
returns table (
  kind text,
  label text,
  sort_order integer,
  professionals bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_store uuid;
begin
  -- Resolve a loja do chamador antes de comparar: uma comparação direta com
  -- current_store_id() devolveria NULL para quem não tem loja, e NULL não
  -- entra no `if not (...)` — o chamador passaria sem autorização.
  v_store := (select public.current_store_id());

  if not (
    coalesce((select public.is_admin()), false)
    or (v_store is not null and p_store_id = v_store)
  ) then
    raise exception 'Not authorized';
  end if;

  return query
  with reached as (
    -- Profissionais distintos alcançados pela loja no período, a partir do
    -- snapshot do contato.
    select distinct c.professional_id
    from public.contact_stores cs
    join public.contacts c on c.id = cs.contact_id
    where cs.store_id = p_store_id
      and (p_from is null or c.contacted_at >= p_from)
      and (p_to is null or c.contacted_at < p_to)
  )
  select
    'segment'::text,
    s.name,
    s.sort_order,
    count(distinct p.id)::bigint
  from public.segments s
  left join public.professionals p on p.segment_id = s.id
  left join reached x on x.professional_id = p.id
  where x.professional_id is not null
  group by s.name, s.sort_order

  union all

  select
    'region'::text,
    r.name,
    r.sort_order,
    count(distinct p.id)::bigint
  from public.regions r
  left join public.professional_regions pr on pr.region_id = r.id
  left join public.professionals p on p.id = pr.professional_id
  left join reached x on x.professional_id = p.id
  where x.professional_id is not null
  group by r.name, r.sort_order

  order by 1, 3, 2;
end;
$$;

revoke all on function public.get_store_reach_breakdown(uuid, timestamptz, timestamptz) from public;
revoke all on function public.get_store_reach_breakdown(uuid, timestamptz, timestamptz) from anon;
grant execute on function public.get_store_reach_breakdown(uuid, timestamptz, timestamptz) to authenticated;

-- --------------------------------------------------------------------------
-- 8. DOCUMENTAÇÃO
-- --------------------------------------------------------------------------

comment on function public.get_admin_dashboard_metrics(timestamptz, timestamptz, uuid) is
'KPIs de atividade comercial do período para o admin. Cada indicador usa a data do evento que representa: contato, criação da oportunidade ou transição de status. p_store_id opcional aplica o mesmo recorte que a loja veria de si mesma.';

comment on function public.get_admin_portfolio_totals() is
'Totais da carteira no estado atual. Não reagem ao filtro de período: descrevem a base hoje, não eventos.';

comment on function public.get_admin_professionals_by_region() is
'Distribuição por região. A soma das linhas é maior que o total de profissionais porque um profissional pode atuar em várias regiões.';

comment on function public.get_admin_store_results(timestamptz, timestamptz) is
'Comparativo entre lojas no período. O alcance vem do snapshot em contact_stores, não das lojas ativas hoje.';

comment on function public.get_store_reach_breakdown(uuid, timestamptz, timestamptz) is
'Segmentos e regiões dos profissionais alcançados por uma loja. Admin consulta qualquer loja; usuário de loja só a própria.';

commit;
