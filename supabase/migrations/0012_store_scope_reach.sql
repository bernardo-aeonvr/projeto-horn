-- ============================================================================
-- HORN — O dashboard da loja passa a ser só da loja
--
-- O QUE MUDA, E POR QUÊ
--
-- A migration 0005 decidiu, em 17/08, que a loja veria o ALCANCE da HORN
-- inteira: "profissionais contatados" contava todo mundo que o admin procurou
-- no período, tivesse aquela marca sido apresentada ou não. A intenção era
-- mostrar à loja o tamanho do trabalho por trás da representação.
--
-- O cliente reverteu essa decisão. A regra agora é uma só: o que a loja vê no
-- painel dela é sobre ela. Um número que conta conversas onde a marca nem foi
-- citada não descreve a loja — e, com mais de uma loja no ar, o mesmo valor
-- aparecia idêntico em painéis diferentes, o que é pior do que não ter o dado.
--
-- O RECORTE, DAQUI EM DIANTE
--
-- Contato pertence à loja quando a loja foi apresentada nele: existe linha em
-- `contact_stores` ligando os dois. É a mesma relação que o admin usa quando
-- filtra o dashboard por loja — a diferença é só de onde vem a loja: lá do
-- filtro da tela, aqui do perfil autenticado, sem parâmetro para trocar.
--
-- Projetos, propostas, valores e comissão JÁ eram da loja e não mudam nada.
--
-- O QUE ESTE ARQUIVO FAZ
--
--   1. get_store_dashboard_metrics — o alcance passa por `contact_stores`;
--   2. get_store_contacted_professionals (nova) — a lista por trás do KPI,
--      um profissional por linha, só com os contatos desta loja;
--   3. get_horn_reach_breakdown deixa de ter chamador. Fica no banco, sem uso:
--      quem desenha os gráficos de segmento e região da loja passa a ser
--      get_store_reach_breakdown, que já existe e já aceita o usuário de loja
--      pedindo a própria loja.
--
-- ORDEM: aplicado depois de 0011.
-- ============================================================================

begin;

-- --------------------------------------------------------------------------
-- 1. KPIs DA LOJA — o alcance agora é o desta loja
-- --------------------------------------------------------------------------
-- Só a CTE `reach` muda. O resto da função continua palavra por palavra o que
-- era: o mesmo `current_store` como portão de autorização, os mesmos recortes
-- de projeto, proposta, fechamento e perda.

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
'KPIs do dashboard da loja autenticada. Tudo recortado nela: alcance pelos contatos em que a loja foi apresentada (contact_stores), comercial pelos projetos da loja.';

-- --------------------------------------------------------------------------
-- 2. QUEM SÃO OS CONTATADOS DESTA LOJA
-- --------------------------------------------------------------------------
-- A mesma abertura que o admin tem desde a 0010, agora para a loja: um
-- profissional por linha, com a contagem, a data e o canal DO ÚLTIMO contato
-- em que esta loja foi apresentada. A contagem de linhas é, por construção, o
-- KPI "Profissionais contatados" da função acima — as duas leem `contacts`
-- pelo mesmo caminho.
--
-- DUAS COISAS QUE ELA NÃO DEVOLVE, DE PROPÓSITO
--
--   - quantas lojas foram apresentadas no contato. A versão do admin tem essa
--     coluna; aqui ela vazaria para uma marca quantas concorrentes estavam na
--     mesma conversa, que é justamente o que as policies de `contact_stores`
--     protegem desde a 0004;
--   - qualquer dado de contato do profissional (telefone, e-mail, Instagram,
--     endereço) e as observações internas da HORN. Nome e segmento bastam para
--     a loja saber a quem sua marca foi apresentada.

create or replace function public.get_store_contacted_professionals(
  p_from timestamptz default null,
  p_to timestamptz default null
)
returns table (
  professional_id uuid,
  professional_name text,
  segment_name text,
  is_active boolean,
  last_contact_at timestamptz,
  last_channel public.contact_channel,
  contacts bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
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
$$;

revoke all on function
  public.get_store_contacted_professionals(timestamptz, timestamptz) from public;
revoke all on function
  public.get_store_contacted_professionals(timestamptz, timestamptz) from anon;
grant execute on function
  public.get_store_contacted_professionals(timestamptz, timestamptz) to authenticated;

comment on function public.get_store_contacted_professionals(timestamptz, timestamptz) is
'Profissionais a quem a loja autenticada foi apresentada no período, um por linha. Não revela as outras lojas do mesmo contato nem dados pessoais do profissional.';

-- --------------------------------------------------------------------------
-- 3. A FUNÇÃO QUE PERDE O CHAMADOR
-- --------------------------------------------------------------------------
-- `get_horn_reach_breakdown` desenhava os gráficos de segmento e região da
-- loja com o alcance do admin inteiro. Com a nova regra ela não tem mais uso:
-- a tela passa a chamar `get_store_reach_breakdown`, que recebe a loja e já
-- recusa qualquer loja que não seja a de quem chama.
--
-- Ela NÃO é removida aqui. Derrubar função em produção é irreversível dentro
-- da mesma migration, e nada quebra por ela existir sem chamador. A remoção
-- fica registrada como dívida, para uma limpeza deliberada.

comment on function public.get_horn_reach_breakdown(timestamptz, timestamptz) is
'OBSOLETA desde a migration 0012: devolvia o alcance do admin inteiro para a loja. Sem chamador na aplicação — o dashboard da loja usa get_store_reach_breakdown.';

commit;
