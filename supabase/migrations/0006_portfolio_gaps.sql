-- ============================================================================
-- HORN — Carteira: troca dois números derivados por duas lacunas acionáveis
--
-- O bloco "Carteira" mostrava "profissionais inativos" e "sem região definida".
-- Os dois repetiam informação que já estava na tela:
--
--   profissionais inativos    = total - ativos, e o card de ativos já diz
--                               "65 cadastrados no total"
--   sem região definida       = já aparece como nota do gráfico de regiões
--
-- Entram no lugar duas contagens que ninguém consegue derivar do resto e que
-- apontam trabalho a fazer:
--
--   professionals_never_contacted  profissionais ativos que nunca receberam
--                                  contato. É a regra central do produto em
--                                  forma de número: cadastrar um profissional
--                                  não significa que ele foi contatado.
--   stores_without_projects        lojas ativas que nunca receberam projeto.
--                                  A marca está sendo apresentada mas não está
--                                  recebendo demanda.
--
-- Ambas descrevem o estado de hoje, não o período — é o que a seção promete, e
-- por isso não recebem recorte de data.
--
-- A função precisa de DROP: o Postgres não troca os parâmetros de saída com
-- CREATE OR REPLACE. `professionals_inactive` continua no retorno, mesmo fora
-- da tela, porque é um fato legítimo da carteira e custa um count().
-- ============================================================================

begin;

drop function if exists public.get_admin_portfolio_totals();

create function public.get_admin_portfolio_totals()
returns table (
  professionals_total bigint,
  professionals_active bigint,
  professionals_inactive bigint,
  professionals_without_region bigint,
  professionals_never_contacted bigint,
  stores_total bigint,
  stores_active bigint,
  stores_without_projects bigint
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
    (
      -- Sem contato NENHUM na história, não "sem contato no período": a
      -- seção descreve o cadastro de hoje.
      select count(*)
      from public.professionals p
      where p.is_active
        and not exists (
          select 1
          from public.contacts c
          where c.professional_id = p.id
        )
    )::bigint,
    (select count(*) from public.stores)::bigint,
    (select count(*) from public.stores s where s.is_active)::bigint,
    (
      select count(*)
      from public.stores s
      where s.is_active
        and not exists (
          select 1
          from public.opportunities o
          where o.store_id = s.id
        )
    )::bigint;
end;
$$;

revoke all on function public.get_admin_portfolio_totals() from public;
revoke all on function public.get_admin_portfolio_totals() from anon;
grant execute on function public.get_admin_portfolio_totals() to authenticated;

comment on function public.get_admin_portfolio_totals() is
'Estado atual da carteira: tamanho da base, lacunas de região, profissionais nunca contatados e lojas sem projeto. Sem recorte de período. Só responde para admin.';

commit;
