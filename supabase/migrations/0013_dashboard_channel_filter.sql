-- ============================================================================
-- HORN — Filtro de canal no dashboard
--
-- O dashboard passa a aceitar um terceiro recorte, ao lado de período e loja:
-- o CANAL do contato (WhatsApp, ligação, Instagram, e-mail, outro). Nulo
-- significa "todos" e reproduz exatamente o comportamento anterior.
--
-- O QUE O CANAL PODE FILTRAR, E O QUE NÃO PODE
--
-- Canal é atributo de CONTATO. Ele só faz sentido onde o número nasce de
-- contato, e não tem significado nenhum onde o número nasce de projeto,
-- proposta, valor fechado ou cadastro. Por isso o predicado entra em uma CTE
-- por função, sempre a que lê `public.contacts`, e em nenhuma outra:
--
--   get_admin_dashboard_metrics      -> só a CTE `reach`
--   get_admin_contacted_professionals-> só a CTE `scoped`
--   get_admin_activity_timeseries    -> só a CTE `contacted`
--   get_admin_store_results          -> só a CTE `reach` (coluna Alcançados)
--   get_store_dashboard_metrics      -> só a CTE `reach`
--   get_store_contacted_professionals-> só a CTE `scoped`
--   get_store_reach_breakdown        -> só a CTE `reached`
--
-- No gráfico de evolução isso é visível a olho nu: a série de profissionais
-- contatados responde ao canal; as de projetos recebidos e negócios fechados
-- ficam iguais, porque saem de `opportunities`.
--
-- Funções DELIBERADAMENTE fora desta lista, por não lerem contato nenhum:
-- get_admin_portfolio_totals, get_admin_professionals_by_segment,
-- get_admin_professionals_by_region (carteira cadastrada, não alcance) e a
-- varredura de `opportunities` que alimenta os cards de status e o Top 5.
--
-- POR QUE DROP E NÃO SÓ REPLACE
--
-- `create or replace` com um parâmetro a mais cria uma SOBRECARGA, não uma
-- substituição: ficariam duas versões de cada função e o PostgREST não saberia
-- qual chamar. Cada bloco abaixo derruba a assinatura antiga e recria a nova,
-- na mesma transação. Os corpos são os que já estavam no banco — extraídos com
-- `pg_get_functiondef` e alterados só na assinatura e na CTE de contatos.
--
-- ORDEM: aplicado depois de 0012.
-- ============================================================================

begin;

drop function if exists public.get_admin_dashboard_metrics(timestamptz, timestamptz, uuid);

CREATE OR REPLACE FUNCTION public.get_admin_dashboard_metrics(p_from timestamp with time zone DEFAULT NULL::timestamp with time zone, p_to timestamp with time zone DEFAULT NULL::timestamp with time zone, p_store_id uuid DEFAULT NULL::uuid, p_channel public.contact_channel DEFAULT NULL::public.contact_channel)
 RETURNS TABLE(professionals_contacted bigint, contact_events bigint, projects_received bigint, proposals_received bigint, proposals_sent bigint, proposals_closed bigint, proposals_lost bigint, total_proposed_value numeric, total_closed_value numeric, total_commission_value numeric, professionals_with_projects bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_owner uuid;
begin
  if not coalesce((select public.is_admin()), false) then
    raise exception 'Not authorized';
  end if;

  v_owner := (select public.current_owner_id());
  if v_owner is null then
    raise exception 'Not authorized';
  end if;

  -- Filtrar por uma loja alheia devolveria zero de qualquer forma, mas um erro
  -- explícito impede que o filtro vire um oráculo de "esta loja existe".
  if p_store_id is not null and not exists (
    select 1 from public.stores s
    where s.id = p_store_id and s.owner_id = v_owner
  ) then
    raise exception 'Not authorized';
  end if;

  return query
  with reach as (
    select
      count(distinct c.professional_id)::bigint as professionals_contacted,
      count(distinct c.id)::bigint as contact_events
    from public.contacts c
    where c.owner_id = v_owner
      and (p_channel is null or c.channel = p_channel)
      and (p_from is null or c.contacted_at >= p_from)
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
    where o.owner_id = v_owner
      and (p_from is null or o.created_at >= p_from)
      and (p_to is null or o.created_at < p_to)
      and (p_store_id is null or o.store_id = p_store_id)
  ),
  received_ids as (
    select distinct h.opportunity_id
    from public.opportunity_status_history h
    join public.opportunities o on o.id = h.opportunity_id
    where o.owner_id = v_owner
      and h.to_status = 'proposal_received'::public.opportunity_status
      and (p_from is null or h.changed_at >= p_from)
      and (p_to is null or h.changed_at < p_to)
      and (p_store_id is null or o.store_id = p_store_id)
  ),
  sent_ids as (
    select distinct h.opportunity_id
    from public.opportunity_status_history h
    join public.opportunities o on o.id = h.opportunity_id
    where o.owner_id = v_owner
      and h.to_status = 'proposal_sent_to_professional'::public.opportunity_status
      and (p_from is null or h.changed_at >= p_from)
      and (p_to is null or h.changed_at < p_to)
      and (p_store_id is null or o.store_id = p_store_id)
  ),
  -- Fechou no período E CONTINUA fechado: contagem, valor e comissão saem do
  -- mesmo conjunto (a regra que a 0002 documenta).
  closed_ids as (
    select distinct h.opportunity_id
    from public.opportunity_status_history h
    join public.opportunities o on o.id = h.opportunity_id
    where o.owner_id = v_owner
      and h.to_status = 'closed'::public.opportunity_status
      and o.status = 'closed'::public.opportunity_status
      and (p_from is null or h.changed_at >= p_from)
      and (p_to is null or h.changed_at < p_to)
      and (p_store_id is null or o.store_id = p_store_id)
  ),
  lost_ids as (
    select distinct h.opportunity_id
    from public.opportunity_status_history h
    join public.opportunities o on o.id = h.opportunity_id
    where o.owner_id = v_owner
      and h.to_status = 'lost'::public.opportunity_status
      and o.status = 'lost'::public.opportunity_status
      and (p_from is null or h.changed_at >= p_from)
      and (p_to is null or h.changed_at < p_to)
      and (p_store_id is null or o.store_id = p_store_id)
  ),
  received_stats as (
    select count(*)::bigint as proposals_received from received_ids
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
$function$;

revoke all on function public.get_admin_dashboard_metrics(timestamptz, timestamptz, uuid, public.contact_channel) from public;
revoke all on function public.get_admin_dashboard_metrics(timestamptz, timestamptz, uuid, public.contact_channel) from anon;
grant execute on function public.get_admin_dashboard_metrics(timestamptz, timestamptz, uuid, public.contact_channel) to authenticated;

-- ------------------------------------------------------------------

drop function if exists public.get_admin_contacted_professionals(timestamptz, timestamptz, uuid);

CREATE OR REPLACE FUNCTION public.get_admin_contacted_professionals(p_from timestamp with time zone DEFAULT NULL::timestamp with time zone, p_to timestamp with time zone DEFAULT NULL::timestamp with time zone, p_store_id uuid DEFAULT NULL::uuid, p_channel public.contact_channel DEFAULT NULL::public.contact_channel)
 RETURNS TABLE(professional_id uuid, professional_name text, segment_name text, is_active boolean, last_contact_at timestamp with time zone, last_channel contact_channel, contacts bigint, stores_presented bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_owner uuid;
begin
  if not coalesce((select public.is_admin()), false) then
    raise exception 'Not authorized';
  end if;

  v_owner := (select public.current_owner_id());
  if v_owner is null then
    raise exception 'Not authorized';
  end if;

  -- Igual às demais: filtrar por loja alheia é erro explícito, não lista
  -- vazia, para o parâmetro não virar um oráculo de "esta loja existe".
  if p_store_id is not null and not exists (
    select 1 from public.stores s
    where s.id = p_store_id and s.owner_id = v_owner
  ) then
    raise exception 'Not authorized';
  end if;

  return query
  with scoped as (
    -- O MESMO recorte da CTE `reach` de get_admin_dashboard_metrics.
    select c.id, c.professional_id, c.contacted_at, c.channel
    from public.contacts c
    where c.owner_id = v_owner
      and (p_channel is null or c.channel = p_channel)
      and (p_from is null or c.contacted_at >= p_from)
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
  grouped as (
    select
      s.professional_id,
      count(*)::bigint as contacts,
      max(s.contacted_at) as last_contact_at
    from scoped s
    group by s.professional_id
  ),
  latest as (
    select distinct on (s.professional_id)
      s.professional_id,
      s.channel
    from scoped s
    order by s.professional_id, s.contacted_at desc, s.id desc
  ),
  presented as (
    -- Quantas marcas distintas este profissional viu no período. Só o número:
    -- a coluna existe para dimensionar o esforço, não para listar lojas.
    select
      s.professional_id,
      count(distinct cs.store_id)::bigint as stores_presented
    from scoped s
    join public.contact_stores cs on cs.contact_id = s.id
    group by s.professional_id
  )
  select
    p.id,
    p.name,
    sg.name,
    p.is_active,
    g.last_contact_at,
    l.channel,
    g.contacts,
    coalesce(pr.stores_presented, 0)
  from grouped g
  join public.professionals p
    on p.id = g.professional_id
    -- Redundante com o dono do contato (os triggers de coerência impedem que
    -- difiram), e mantido assim mesmo: dentro de SECURITY DEFINER a RLS de
    -- `professionals` não roda, então o recorte por dono é escrito aqui.
   and p.owner_id = v_owner
  join public.segments sg on sg.id = p.segment_id
  join latest l on l.professional_id = g.professional_id
  left join presented pr on pr.professional_id = g.professional_id
  -- Operacional: quem foi contatado por último aparece primeiro. O nome
  -- desempata para a ordem não variar entre duas execuções iguais.
  order by g.last_contact_at desc, p.name;
end;
$function$;

revoke all on function public.get_admin_contacted_professionals(timestamptz, timestamptz, uuid, public.contact_channel) from public;
revoke all on function public.get_admin_contacted_professionals(timestamptz, timestamptz, uuid, public.contact_channel) from anon;
grant execute on function public.get_admin_contacted_professionals(timestamptz, timestamptz, uuid, public.contact_channel) to authenticated;

-- ------------------------------------------------------------------

drop function if exists public.get_admin_activity_timeseries(timestamptz, timestamptz, text, uuid);

CREATE OR REPLACE FUNCTION public.get_admin_activity_timeseries(p_from timestamp with time zone, p_to timestamp with time zone, p_bucket text DEFAULT 'day'::text, p_store_id uuid DEFAULT NULL::uuid, p_channel public.contact_channel DEFAULT NULL::public.contact_channel)
 RETURNS TABLE(bucket_start timestamp with time zone, professionals_contacted bigint, projects_received bigint, deals_closed bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_unit text;
  v_owner uuid;
  v_zone constant text := 'America/Sao_Paulo';
begin
  if not coalesce((select public.is_admin()), false) then
    raise exception 'Not authorized';
  end if;

  v_owner := (select public.current_owner_id());
  if v_owner is null then
    raise exception 'Not authorized';
  end if;

  if p_store_id is not null and not exists (
    select 1 from public.stores s
    where s.id = p_store_id and s.owner_id = v_owner
  ) then
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
    where c.owner_id = v_owner
      and (p_channel is null or c.channel = p_channel)
      and c.contacted_at >= p_from
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
    where o.owner_id = v_owner
      and o.created_at >= p_from
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
    where o.owner_id = v_owner
      and h.to_status = 'closed'::public.opportunity_status
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
$function$;

revoke all on function public.get_admin_activity_timeseries(timestamptz, timestamptz, text, uuid, public.contact_channel) from public;
revoke all on function public.get_admin_activity_timeseries(timestamptz, timestamptz, text, uuid, public.contact_channel) from anon;
grant execute on function public.get_admin_activity_timeseries(timestamptz, timestamptz, text, uuid, public.contact_channel) to authenticated;

-- ------------------------------------------------------------------

drop function if exists public.get_admin_store_results(timestamptz, timestamptz);

CREATE OR REPLACE FUNCTION public.get_admin_store_results(p_from timestamp with time zone DEFAULT NULL::timestamp with time zone, p_to timestamp with time zone DEFAULT NULL::timestamp with time zone, p_channel public.contact_channel DEFAULT NULL::public.contact_channel)
 RETURNS TABLE(store_id uuid, store_name text, is_active boolean, professionals_reached bigint, projects_received bigint, proposals_sent bigint, deals_closed bigint, total_closed_value numeric, total_commission_value numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_owner uuid;
begin
  if not coalesce((select public.is_admin()), false) then
    raise exception 'Not authorized';
  end if;

  v_owner := (select public.current_owner_id());
  if v_owner is null then
    raise exception 'Not authorized';
  end if;

  return query
  with reach as (
    select
      cs.store_id,
      count(distinct c.professional_id)::bigint as professionals_reached
    from public.contact_stores cs
    join public.contacts c on c.id = cs.contact_id
    where c.owner_id = v_owner
      and (p_channel is null or c.channel = p_channel)
      and (p_from is null or c.contacted_at >= p_from)
      and (p_to is null or c.contacted_at < p_to)
    group by cs.store_id
  ),
  projects as (
    select
      o.store_id,
      count(*)::bigint as projects_received
    from public.opportunities o
    where o.owner_id = v_owner
      and (p_from is null or o.created_at >= p_from)
      and (p_to is null or o.created_at < p_to)
    group by o.store_id
  ),
  sent as (
    select
      o.store_id,
      count(distinct o.id)::bigint as proposals_sent
    from public.opportunity_status_history h
    join public.opportunities o on o.id = h.opportunity_id
    where o.owner_id = v_owner
      and h.to_status = 'proposal_sent_to_professional'::public.opportunity_status
      and (p_from is null or h.changed_at >= p_from)
      and (p_to is null or h.changed_at < p_to)
    group by o.store_id
  ),
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
    where o.owner_id = v_owner
      and o.status = 'closed'::public.opportunity_status
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
  where s.owner_id = v_owner
  order by
    coalesce(closed.total_commission_value, 0::numeric) desc,
    coalesce(closed.total_closed_value, 0::numeric) desc,
    s.name;
end;
$function$;

revoke all on function public.get_admin_store_results(timestamptz, timestamptz, public.contact_channel) from public;
revoke all on function public.get_admin_store_results(timestamptz, timestamptz, public.contact_channel) from anon;
grant execute on function public.get_admin_store_results(timestamptz, timestamptz, public.contact_channel) to authenticated;

-- ------------------------------------------------------------------

drop function if exists public.get_store_dashboard_metrics(timestamptz, timestamptz);

CREATE OR REPLACE FUNCTION public.get_store_dashboard_metrics(p_from timestamp with time zone DEFAULT NULL::timestamp with time zone, p_to timestamp with time zone DEFAULT NULL::timestamp with time zone, p_channel public.contact_channel DEFAULT NULL::public.contact_channel)
 RETURNS TABLE(professionals_contacted bigint, contact_events bigint, projects_received bigint, proposals_received bigint, proposals_sent bigint, proposals_closed bigint, proposals_lost bigint, total_proposed_value numeric, total_closed_value numeric, total_commission_value numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with current_store as (
    select up.store_id, s.owner_id
    from public.user_profiles up
    join public.stores s on s.id = up.store_id
    where up.id = (select auth.uid())
      and up.role = 'store'::public.app_role
      and up.is_active = true
    limit 1
  ),
  reach as (
    -- Alcance DESTA loja: contatos em que ela foi apresentada. Sem loja ativa
    -- a CTE não produz linha e os KPIs saem zerados, como antes.
    select
      count(distinct c.professional_id)::bigint as professionals_contacted,
      count(distinct c.id)::bigint as contact_events
    from current_store cs0
    join public.contact_stores cst on cst.store_id = cs0.store_id
    join public.contacts c
      on c.id = cst.contact_id
     and c.owner_id = cs0.owner_id
    where (p_from is null or c.contacted_at >= p_from)
      and (p_to is null or c.contacted_at < p_to)
      and (p_channel is null or c.channel = p_channel)
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
$function$;

revoke all on function public.get_store_dashboard_metrics(timestamptz, timestamptz, public.contact_channel) from public;
revoke all on function public.get_store_dashboard_metrics(timestamptz, timestamptz, public.contact_channel) from anon;
grant execute on function public.get_store_dashboard_metrics(timestamptz, timestamptz, public.contact_channel) to authenticated;

-- ------------------------------------------------------------------

drop function if exists public.get_store_contacted_professionals(timestamptz, timestamptz);

CREATE OR REPLACE FUNCTION public.get_store_contacted_professionals(p_from timestamp with time zone DEFAULT NULL::timestamp with time zone, p_to timestamp with time zone DEFAULT NULL::timestamp with time zone, p_channel public.contact_channel DEFAULT NULL::public.contact_channel)
 RETURNS TABLE(professional_id uuid, professional_name text, segment_name text, is_active boolean, last_contact_at timestamp with time zone, last_channel contact_channel, contacts bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_store uuid;
begin
  -- A loja vem do perfil, nunca da chamada. Sem loja ativa, devolve vazio.
  select up.store_id
    into v_store
  from public.user_profiles up
  where up.id = (select auth.uid())
    and up.role = 'store'::public.app_role
    and up.is_active = true
  limit 1;

  if v_store is null then
    return;
  end if;

  return query
  with scoped as (
    select c.id, c.professional_id, c.contacted_at, c.channel
    from public.contact_stores cst
    join public.contacts c on c.id = cst.contact_id
    where cst.store_id = v_store
      and (p_channel is null or c.channel = p_channel)
      and (p_from is null or c.contacted_at >= p_from)
      and (p_to is null or c.contacted_at < p_to)
  ),
  grouped as (
    select
      s.professional_id,
      count(*)::bigint as contacts,
      max(s.contacted_at) as last_contact_at
    from scoped s
    group by s.professional_id
  ),
  latest as (
    -- Canal do contato mais recente; empate no mesmo instante decidido pelo
    -- id, para dois contatos simultâneos não alternarem entre execuções.
    select distinct on (s.professional_id)
      s.professional_id,
      s.channel
    from scoped s
    order by s.professional_id, s.contacted_at desc, s.id desc
  )
  select
    p.id,
    p.name,
    sg.name,
    p.is_active,
    g.last_contact_at,
    l.channel,
    g.contacts
  from grouped g
  join public.professionals p on p.id = g.professional_id
  join public.segments sg on sg.id = p.segment_id
  join latest l on l.professional_id = g.professional_id
  -- Mesma ordem da versão do admin: o último contato primeiro, nome desempata.
  order by g.last_contact_at desc, p.name;
end;
$function$;

revoke all on function public.get_store_contacted_professionals(timestamptz, timestamptz, public.contact_channel) from public;
revoke all on function public.get_store_contacted_professionals(timestamptz, timestamptz, public.contact_channel) from anon;
grant execute on function public.get_store_contacted_professionals(timestamptz, timestamptz, public.contact_channel) to authenticated;

-- ------------------------------------------------------------------

drop function if exists public.get_store_reach_breakdown(uuid, timestamptz, timestamptz);

CREATE OR REPLACE FUNCTION public.get_store_reach_breakdown(p_store_id uuid, p_from timestamp with time zone DEFAULT NULL::timestamp with time zone, p_to timestamp with time zone DEFAULT NULL::timestamp with time zone, p_channel public.contact_channel DEFAULT NULL::public.contact_channel)
 RETURNS TABLE(kind text, label text, sort_order integer, professionals bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_store uuid;
  v_owner uuid;
begin
  v_store := (select public.current_store_id());
  v_owner := (select public.current_owner_id());

  if v_owner is null then
    raise exception 'Not authorized';
  end if;

  -- Admin consulta qualquer loja SUA; usuário de loja, só a própria.
  if not (
    (
      coalesce((select public.is_admin()), false)
      and exists (
        select 1 from public.stores s
        where s.id = p_store_id and s.owner_id = v_owner
      )
    )
    or (v_store is not null and p_store_id = v_store)
  ) then
    raise exception 'Not authorized';
  end if;

  return query
  with reached as (
    select distinct c.professional_id
    from public.contact_stores cs
    join public.contacts c on c.id = cs.contact_id
    where cs.store_id = p_store_id
      and c.owner_id = v_owner
      and (p_channel is null or c.channel = p_channel)
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
$function$;

revoke all on function public.get_store_reach_breakdown(uuid, timestamptz, timestamptz, public.contact_channel) from public;
revoke all on function public.get_store_reach_breakdown(uuid, timestamptz, timestamptz, public.contact_channel) from anon;
grant execute on function public.get_store_reach_breakdown(uuid, timestamptz, timestamptz, public.contact_channel) to authenticated;

commit;
