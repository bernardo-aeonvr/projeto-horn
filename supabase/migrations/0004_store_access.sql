-- ============================================================================
-- HORN — Acesso por perfil: leitura da loja e provisionamento de acessos
--
-- Nada aqui afrouxa RLS. São apenas funções SECURITY DEFINER novas, cada uma
-- travada no perfil de quem chama:
--
--   1. get_store_opportunities_page — a listagem de Projetos & Propostas da
--      própria loja. Existe porque `professionals` é admin-only por RLS e a
--      listagem do admin embute `professionals!inner`: para um usuário de loja
--      o join interno derruba todas as linhas, e a tela ficaria vazia. A função
--      devolve só os campos aprovados para a loja (spec, seção 4.2) — sem
--      telefone, e-mail, Instagram, endereço ou observações internas.
--
--   2. get_store_opportunity_professional_ids — apoio à busca por nome dentro
--      da própria carteira, sem abrir a tabela de profissionais.
--
--   3. get_store_access_summary — quais lojas têm acesso provisionado. O e-mail
--      mora em auth.users, fora do alcance do PostgREST, então precisa de uma
--      função. Só responde para admin.
--
-- A loja NUNCA é recebida por parâmetro: sempre sai de
-- user_profiles.store_id do usuário autenticado.
-- ============================================================================

begin;

-- --------------------------------------------------------------------------
-- 1. LISTAGEM DE PROJETOS & PROPOSTAS DA PRÓPRIA LOJA
-- --------------------------------------------------------------------------
-- p_from é inclusivo; p_to é exclusivo, igual às demais funções do projeto.
-- `filtered_count` e `total_count` viajam repetidos em cada linha para que a
-- paginação caiba em uma única ida ao banco.

create or replace function public.get_store_opportunities_page(
  p_q text default null,
  -- '' / null = todos os status; 'abertas' = ainda em andamento;
  -- qualquer outro valor é tratado como um opportunity_status específico.
  p_status text default null,
  p_professional_id uuid default null,
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_limit integer default 20,
  p_offset integer default 0
)
returns table (
  id uuid,
  professional_id uuid,
  professional_name text,
  segment_name text,
  store_id uuid,
  store_name text,
  store_is_active boolean,
  title text,
  status public.opportunity_status,
  proposal_initial_value numeric,
  final_closed_value numeric,
  commission_percent numeric,
  commission_value numeric,
  loss_reason text,
  created_at timestamptz,
  updated_at timestamptz,
  filtered_count bigint,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_store_id uuid;
  v_term text;
  v_pattern text;
  v_status public.opportunity_status;
  v_open boolean := false;
begin
  -- A loja vem do perfil, nunca da chamada.
  select up.store_id
    into v_store_id
  from public.user_profiles up
  where up.id = (select auth.uid())
    and up.role = 'store'::public.app_role
    and up.is_active = true
  limit 1;

  -- Sem loja associada não existe recorte seguro: devolve vazio.
  if v_store_id is null then
    return;
  end if;

  v_term := nullif(btrim(coalesce(p_q, '')), '');
  if v_term is not null then
    -- Os curingas do LIKE viram texto literal.
    v_pattern := '%' ||
      replace(replace(replace(v_term, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  end if;

  if coalesce(p_status, '') = 'abertas' then
    v_open := true;
  elsif coalesce(p_status, '') <> '' then
    v_status := p_status::public.opportunity_status;
  end if;

  return query
  with scoped as (
    select
      o.id,
      o.professional_id,
      p.name as professional_name,
      sg.name as segment_name,
      o.store_id,
      st.name as store_name,
      st.is_active as store_is_active,
      o.title,
      o.status,
      o.proposal_initial_value,
      o.final_closed_value,
      o.commission_percent,
      o.commission_value,
      o.loss_reason,
      o.created_at,
      o.updated_at
    from public.opportunities o
    join public.professionals p on p.id = o.professional_id
    join public.segments sg on sg.id = p.segment_id
    join public.stores st on st.id = o.store_id
    where o.store_id = v_store_id
  ),
  filtered as (
    select *
    from scoped s
    where (v_pattern is null
           or s.professional_name ilike v_pattern
           or coalesce(s.title, '') ilike v_pattern)
      and (p_professional_id is null or s.professional_id = p_professional_id)
      and (not v_open or s.status in (
            'project_received'::public.opportunity_status,
            'waiting_store_proposal'::public.opportunity_status,
            'proposal_received'::public.opportunity_status,
            'proposal_sent_to_professional'::public.opportunity_status,
            'negotiating'::public.opportunity_status
          ))
      and (v_status is null or s.status = v_status)
      and (p_from is null or s.created_at >= p_from)
      and (p_to is null or s.created_at < p_to)
  ),
  totals as (
    select
      (select count(*) from filtered) as filtered_count,
      (select count(*) from scoped) as total_count
  )
  select
    f.id,
    f.professional_id,
    f.professional_name,
    f.segment_name,
    f.store_id,
    f.store_name,
    f.store_is_active,
    f.title,
    f.status,
    f.proposal_initial_value,
    f.final_closed_value,
    f.commission_percent,
    f.commission_value,
    f.loss_reason,
    f.created_at,
    f.updated_at,
    t.filtered_count,
    t.total_count
  from filtered f
  cross join totals t
  -- Mesma ordenação da listagem do admin: o que andou por último vem primeiro.
  order by f.updated_at desc
  limit greatest(coalesce(p_limit, 20), 1)
  offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

revoke all on function public.get_store_opportunities_page(text, text, uuid, timestamptz, timestamptz, integer, integer) from public;
grant execute on function public.get_store_opportunities_page(text, text, uuid, timestamptz, timestamptz, integer, integer) to authenticated;

comment on function public.get_store_opportunities_page(text, text, uuid, timestamptz, timestamptz, integer, integer) is
'Listagem paginada de Projetos & Propostas da loja do usuário autenticado. Não expõe observações internas nem dados de contato do profissional.';

-- --------------------------------------------------------------------------
-- 2. PROFISSIONAIS VISÍVEIS À LOJA (apoio à busca)
-- --------------------------------------------------------------------------
-- Devolve apenas profissionais que já geraram projeto para a própria loja.
-- Serve para resolver o chip de filtro por profissional sem liberar a carteira.

create or replace function public.get_store_opportunity_professionals()
returns table (
  professional_id uuid,
  professional_name text,
  segment_name text
)
language sql
stable
security definer
set search_path = ''
as $$
  select distinct
    p.id,
    p.name,
    sg.name
  from public.user_profiles up
  join public.opportunities o on o.store_id = up.store_id
  join public.professionals p on p.id = o.professional_id
  join public.segments sg on sg.id = p.segment_id
  where up.id = (select auth.uid())
    and up.role = 'store'::public.app_role
    and up.is_active = true
  order by p.name;
$$;

revoke all on function public.get_store_opportunity_professionals() from public;
grant execute on function public.get_store_opportunity_professionals() to authenticated;

-- --------------------------------------------------------------------------
-- 3. SITUAÇÃO DO ACESSO DE CADA LOJA (admin)
-- --------------------------------------------------------------------------
-- O e-mail de login vive em auth.users, que o PostgREST não alcança. Esta
-- função é o único caminho de leitura, e responde exclusivamente para admin.

create or replace function public.get_store_access_summary()
returns table (
  store_id uuid,
  user_id uuid,
  email text,
  full_name text,
  is_active boolean,
  last_sign_in_at timestamptz,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    up.store_id,
    up.id,
    u.email::text,
    up.full_name,
    up.is_active,
    u.last_sign_in_at,
    up.created_at
  from public.user_profiles up
  join auth.users u on u.id = up.id
  where (select public.is_admin())
    and up.role = 'store'::public.app_role
    and up.store_id is not null
  order by up.created_at;
$$;

revoke all on function public.get_store_access_summary() from public;
grant execute on function public.get_store_access_summary() to authenticated;

comment on function public.get_store_access_summary() is
'Acessos de loja provisionados, com o e-mail vindo de auth.users. Responde apenas para admin.';

commit;
