-- ============================================================================
-- 0003 — consistência entre fechados, valor fechado e comissão
--
-- Corrige public.get_store_dashboard_metrics, que veio no schema.sql base.
--
-- PROBLEMA: os KPIs de fechamento contavam toda oportunidade que teve uma
-- transição para 'closed' no período, sem olhar o status atual. Só que
-- opportunities.commission_value é COLUNA GERADA e só produz valor enquanto o
-- status é 'closed'. Um negócio fechado por engano e depois corrigido entrava
-- na contagem e na soma de final_closed_value, mas entrava com comissão nula.
--
-- Sintoma observado na base real: "2 fechados, R$ 30.500" com a comissão de um
-- negócio só. Contagem, valor e comissão precisam sair do mesmo conjunto.
--
-- CORREÇÃO: exigir que a oportunidade tenha fechado no período E continue
-- fechada. Mesma regra aplicada às perdas, e idêntica à que
-- 0002_dashboard_metrics.sql usa na visão do admin — as duas telas passam a
-- contar da mesma forma.
--
-- Só o corpo da função muda. Assinatura, retorno, grants e RLS ficam iguais.
-- ============================================================================

begin;

create or replace function public.get_store_dashboard_metrics(
  p_from timestamptz default null,
  p_to timestamptz default null
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
  total_commission_value numeric
)
language sql
stable
security definer
set search_path = ''
as $$
  with current_store as (
    select up.store_id
    from public.user_profiles up
    where up.id = (select auth.uid())
      and up.role = 'store'::public.app_role
      and up.is_active = true
    limit 1
  ),
  reach as (
    select
      count(distinct c.professional_id)::bigint as professionals_contacted,
      count(distinct c.id)::bigint as contact_events
    from current_store cs0
    join public.contact_stores cs on cs.store_id = cs0.store_id
    join public.contacts c on c.id = cs.contact_id
    where (p_from is null or c.contacted_at >= p_from)
      and (p_to is null or c.contacted_at < p_to)
  ),
  projects as (
    select count(*)::bigint as projects_received
    from current_store cs0
    join public.opportunities o on o.store_id = cs0.store_id
    where (p_from is null or o.created_at >= p_from)
      and (p_to is null or o.created_at < p_to)
  ),
  received_ids as (
    select distinct h.opportunity_id
    from current_store cs0
    join public.opportunities o on o.store_id = cs0.store_id
    join public.opportunity_status_history h on h.opportunity_id = o.id
    where h.to_status = 'proposal_received'::public.opportunity_status
      and (p_from is null or h.changed_at >= p_from)
      and (p_to is null or h.changed_at < p_to)
  ),
  sent_ids as (
    select distinct h.opportunity_id
    from current_store cs0
    join public.opportunities o on o.store_id = cs0.store_id
    join public.opportunity_status_history h on h.opportunity_id = o.id
    where h.to_status = 'proposal_sent_to_professional'::public.opportunity_status
      and (p_from is null or h.changed_at >= p_from)
      and (p_to is null or h.changed_at < p_to)
  ),
  closed_ids as (
    select distinct h.opportunity_id
    from current_store cs0
    join public.opportunities o on o.store_id = cs0.store_id
    join public.opportunity_status_history h on h.opportunity_id = o.id
    where h.to_status = 'closed'::public.opportunity_status
      and o.status = 'closed'::public.opportunity_status
      and (p_from is null or h.changed_at >= p_from)
      and (p_to is null or h.changed_at < p_to)
  ),
  lost_ids as (
    select distinct h.opportunity_id
    from current_store cs0
    join public.opportunities o on o.store_id = cs0.store_id
    join public.opportunity_status_history h on h.opportunity_id = o.id
    where h.to_status = 'lost'::public.opportunity_status
      and o.status = 'lost'::public.opportunity_status
      and (p_from is null or h.changed_at >= p_from)
      and (p_to is null or h.changed_at < p_to)
  ),
  received_stats as (
    select count(*)::bigint as proposals_received
    from received_ids
  ),
  sent_stats as (
    select
      count(*)::bigint as proposals_sent,
      coalesce(sum(o.proposal_initial_value), 0::numeric) as total_proposed_value
    from sent_ids x
    join public.opportunities o on o.id = x.opportunity_id
  ),
  closed_stats as (
    select
      count(*)::bigint as proposals_closed,
      coalesce(sum(o.final_closed_value), 0::numeric) as total_closed_value,
      coalesce(sum(o.commission_value), 0::numeric) as total_commission_value
    from closed_ids x
    join public.opportunities o on o.id = x.opportunity_id
  ),
  lost_stats as (
    select count(*)::bigint as proposals_lost
    from lost_ids
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
    coalesce(closed_stats.total_commission_value, 0::numeric)
  from reach
  cross join projects
  cross join received_stats
  cross join sent_stats
  cross join closed_stats
  cross join lost_stats;
$$;

-- Assinatura inalterada; os grants originais do schema continuam valendo.
comment on function public.get_store_dashboard_metrics(timestamptz, timestamptz) is
'KPIs da loja no período. Fechados/perdidos exigem que a oportunidade ainda esteja nesse status, para contagem, valor e comissão saírem do mesmo conjunto.';

commit;
