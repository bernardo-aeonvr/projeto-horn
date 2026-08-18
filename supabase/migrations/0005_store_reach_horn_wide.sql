-- ============================================================================
-- HORN — Alcance mostrado à loja passa a ser o total da HORN
--
-- DECISÃO DE NEGÓCIO (17/08/2026), diverge da spec 15.2:
--   A spec dizia "profissionais contatados no período NOS QUAIS A LOJA FOI
--   APRESENTADA". A regra passa a ser: toda loja enxerga o alcance completo do
--   trabalho da HORN no período, mesmo nos contatos em que ela não foi marcada.
--   Motivo: demonstrar à marca representada o tamanho real do esforço da HORN,
--   sem depender de quem foi selecionado no momento do registro do contato.
--
-- O QUE **NÃO** MUDA — continua estritamente por loja:
--   projetos recebidos, propostas recebidas/enviadas, fechamentos, perdas,
--   valor proposto, valor fechado e comissão. Esses são dados comerciais da
--   loja e a spec 15.4 continua valendo integralmente para eles.
--
-- O QUE CONTINUA INVISÍVEL PARA A LOJA:
--   quais outras lojas foram apresentadas em cada contato (spec 15.4). As
--   funções abaixo devolvem profissional, segmento, região e data — nunca a
--   relação contato × loja.
--
-- A porta de entrada continua sendo o perfil: quem não é loja ativa não recebe
-- nada. Sem esse portão, um usuário sem loja passaria a ver o alcance global.
-- ============================================================================

begin;

-- --------------------------------------------------------------------------
-- 1. KPIs DA LOJA — alcance global, comercial por loja
-- --------------------------------------------------------------------------

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
    -- Alcance = todo o trabalho da HORN no período, sem recorte por loja.
    -- O cross join com current_store é o portão de autorização: sem loja ativa
    -- a CTE não produz linha nenhuma e os KPIs saem zerados.
    select
      count(distinct c.professional_id)::bigint as professionals_contacted,
      count(distinct c.id)::bigint as contact_events
    from current_store cs0
    cross join public.contacts c
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

comment on function public.get_store_dashboard_metrics(timestamptz, timestamptz) is
'KPIs da loja no período. Alcance (profissionais contatados / eventos de contato) é o total da HORN; projetos, propostas, valores e comissão são exclusivos da loja.';

-- --------------------------------------------------------------------------
-- 2. LISTA DE PROFISSIONAIS ALCANÇADOS — todos os contatos do período
-- --------------------------------------------------------------------------
-- Assinatura preservada. Continua sem devolver qualquer vínculo contato × loja
-- e sem telefone, e-mail, Instagram, endereço ou observações (spec 15.3).

create or replace function public.get_store_contact_reach(
  p_from timestamptz default null,
  p_to timestamptz default null
)
returns table (
  contact_id uuid,
  professional_id uuid,
  professional_name text,
  segment_name text,
  regions text[],
  contacted_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    c.id as contact_id,
    p.id as professional_id,
    p.name as professional_name,
    s.name as segment_name,
    coalesce(
      array_agg(distinct r.name order by r.name)
        filter (where r.name is not null),
      array[]::text[]
    ) as regions,
    c.contacted_at
  from public.user_profiles up
  cross join public.contacts c
  join public.professionals p
    on p.id = c.professional_id
  join public.segments s
    on s.id = p.segment_id
  left join public.professional_regions pr
    on pr.professional_id = p.id
  left join public.regions r
    on r.id = pr.region_id
  where up.id = (select auth.uid())
    and up.role = 'store'::public.app_role
    and up.is_active = true
    and (p_from is null or c.contacted_at >= p_from)
    and (p_to is null or c.contacted_at < p_to)
  group by c.id, p.id, p.name, s.name, c.contacted_at
  order by c.contacted_at desc;
$$;

comment on function public.get_store_contact_reach(timestamptz, timestamptz) is
'Profissionais contatados pela HORN no período, na visão da loja. Não revela quais lojas foram apresentadas em cada contato.';

-- --------------------------------------------------------------------------
-- 3. DISTRIBUIÇÃO POR SEGMENTO E REGIÃO — visão da loja
-- --------------------------------------------------------------------------
-- Função nova, em vez de alterar get_store_reach_breakdown: aquela recebe
-- p_store_id e continua servindo ao admin com a atribuição real por loja.
-- Esta não recebe loja alguma — deriva tudo da sessão.

create or replace function public.get_horn_reach_breakdown(
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
begin
  if not exists (
    select 1
    from public.user_profiles up
    where up.id = (select auth.uid())
      and up.is_active = true
      and up.role in ('store'::public.app_role, 'admin'::public.app_role)
  ) then
    raise exception 'Not authorized';
  end if;

  return query
  with reached as (
    select distinct c.professional_id
    from public.contacts c
    where (p_from is null or c.contacted_at >= p_from)
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

revoke all on function public.get_horn_reach_breakdown(timestamptz, timestamptz) from public;
revoke all on function public.get_horn_reach_breakdown(timestamptz, timestamptz) from anon;
grant execute on function public.get_horn_reach_breakdown(timestamptz, timestamptz) to authenticated;

comment on function public.get_horn_reach_breakdown(timestamptz, timestamptz) is
'Distribuição por segmento e região de todos os profissionais contatados pela HORN no período. Usada no Dashboard da Loja.';

commit;
