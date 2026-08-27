-- ============================================================================
-- HORN — Quem são os profissionais contatados no período
--
-- O dashboard já responde QUANTOS: o KPI "Profissionais contatados" conta
-- profissionais distintos com ao menos um contato no recorte. O que faltava
-- era abrir esse número — "o painel diz quatro; quais quatro?".
--
-- Esta função devolve exatamente aquele conjunto, uma linha por profissional:
-- o mesmo dono, o mesmo intervalo e o mesmo filtro de loja da CTE `reach` de
-- get_admin_dashboard_metrics. A contagem de linhas daqui é, por construção,
-- o valor do KPI — as duas leem `contacts` com o mesmo WHERE.
--
-- POR QUE NO BANCO
--
-- Pela mesma razão do resto do dashboard: PostgREST não faz GROUP BY nem
-- DISTINCT ON. Agregar no servidor significaria baixar todos os contatos do
-- período para montar meia dúzia de linhas — e contatos são a tabela que mais
-- cresce no produto (centenas de profissionais, vários contatos cada).
--
-- SÓ ADMIN
--
-- Não existe versão de loja. A loja vê alcance em agregado, nunca nome a nome
-- — regra decidida quando a lista de contatados saiu do dashboard dela. Este
-- arquivo não mexe em nada disso: nenhuma função de loja é alterada, e
-- get_store_contact_reach continua como está, sem chamador.
--
-- ORDEM: aplicado depois de 0009.
-- ============================================================================

begin;

-- --------------------------------------------------------------------------
-- A lista por trás do KPI
-- --------------------------------------------------------------------------
-- Devolve a lista inteira, sem paginação: a tela pagina em memória, igual a
-- "Resultados por loja", porque o payload já veio junto com o dashboard.
--
-- `last_channel` é o canal do contato MAIS RECENTE do período, não o do
-- primeiro — é o que a tabela promete ao lado da data. Vem de um DISTINCT ON
-- com desempate por id, para dois contatos no mesmo instante não alternarem
-- entre execuções.

create or replace function public.get_admin_contacted_professionals(
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_store_id uuid default null
)
returns table (
  professional_id uuid,
  professional_name text,
  segment_name text,
  is_active boolean,
  last_contact_at timestamptz,
  last_channel public.contact_channel,
  contacts bigint,
  stores_presented bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
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
$$;

revoke all on function
  public.get_admin_contacted_professionals(timestamptz, timestamptz, uuid) from public;
revoke all on function
  public.get_admin_contacted_professionals(timestamptz, timestamptz, uuid) from anon;
grant execute on function
  public.get_admin_contacted_professionals(timestamptz, timestamptz, uuid) to authenticated;

comment on function public.get_admin_contacted_professionals(timestamptz, timestamptz, uuid) is
'Profissionais contatados no período, um por linha, com último contato, canal desse contato e quantidade de contatos. Mesmo recorte do KPI "Profissionais contatados". Só admin, e só a própria carteira.';

commit;
