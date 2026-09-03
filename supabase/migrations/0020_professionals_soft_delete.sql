-- ============================================================================
-- HORN — Exclusão de profissional sem perder o histórico
--
-- Excluir um profissional passa a funcionar SEMPRE, inclusive quando ele já
-- tem contatos ou projetos. O que muda é o que acontece por baixo.
--
-- POR QUE NÃO DÁ PARA SIMPLESMENTE APAGAR
--
-- `contacts` e `opportunities` referenciam `professionals` com ON DELETE
-- RESTRICT, e essa proteção está certa: um contato guarda o alcance de uma
-- loja num dia específico, e um projeto guarda a comissão que a HORN ganhou.
-- Apagar a pessoa levaria os dois junto — o histórico comercial inteiro dela.
-- Afrouxar a FK para CASCADE resolveria a exclusão destruindo exatamente o que
-- o sistema existe para guardar.
--
-- A SAÍDA: `deleted_at`
--
-- Quem tem histórico ganha uma data de exclusão em vez de sumir da tabela. A
-- linha continua lá, então todo contato e todo projeto continuam resolvendo
-- nome, empresa e segmento como antes — mas ela deixa de existir para o
-- sistema operacional: não aparece na listagem, na busca, nos filtros, nos
-- contadores nem em nenhum seletor que crie vínculo novo.
--
-- Quem NÃO tem histórico continua sendo apagado de verdade. A aplicação tenta
-- o DELETE primeiro e cai para o `deleted_at` quando o banco recusa (23503).
-- Quem decide é a própria FK: não existe uma segunda contagem de dependências
-- na aplicação para discordar dela ou ficar desatualizada.
--
-- ISTO NÃO É Ativo/Inativo DE VOLTA
--
-- Não há estado intermediário, não há tela de excluídos, não há restaurar e
-- não há filtro. Um profissional está na carteira ou não está. `deleted_at` é
-- mecânica interna para o histórico sobreviver, e nunca aparece na interface.
--
-- `is_active` CONTINUA MORTA
--
-- A 0019 tirou a coluna de circulação e normalizou todo mundo para `true`. Ela
-- NÃO volta a significar nada aqui: as três funções que ainda a usavam como
-- recorte passam a ler `deleted_at`, e depois desta migration nenhum filtro do
-- sistema depende dela.
--
-- ORDEM: aplicado depois de 0019.
-- ============================================================================

begin;

-- --------------------------------------------------------------------------
-- 1. A COLUNA
-- --------------------------------------------------------------------------
-- Nula é o estado normal, e é o que faz a mudança ser retrocompatível: os 175
-- profissionais que já existem continuam nulos e seguem visíveis, sem nenhuma
-- linha precisar ser tocada.

alter table public.professionals
  add column if not exists deleted_at timestamptz;

comment on column public.professionals.deleted_at is
'Momento em que o profissional foi excluído, ou NULL para quem está na carteira. Só é preenchida quando o registro não pode ser apagado de verdade por ter contato ou projeto — a linha fica para o histórico continuar resolvendo nome e empresa. Não é status: não existe Ativo/Inativo, tela de excluídos nem restauração.';

/*
  Índice parcial, e não um índice sobre a coluna.

  Toda consulta operacional pergunta a mesma coisa — "os da carteira deste
  dono" —, e é isso que o índice cobre. Indexar `deleted_at` inteira serviria
  para achar os excluídos, que é justamente a pergunta que o sistema não faz.
*/
create index if not exists professionals_owner_live_idx
  on public.professionals(owner_id)
  where deleted_at is null;

-- --------------------------------------------------------------------------
-- 2. OS CONTADORES DA CARTEIRA
-- --------------------------------------------------------------------------
-- As três funções abaixo descrevem o cadastro de hoje, e eram as últimas a
-- usar `is_active` como recorte. Passam a ler `deleted_at`: um profissional
-- excluído sai dos totais e dos gráficos no mesmo instante.
--
-- As funções de PERÍODO não entram aqui, de propósito. "Profissionais
-- contatados" e o ranking descrevem o que aconteceu, não quem está na
-- carteira: quem foi contatado em agosto continua tendo sido contatado em
-- agosto depois de ser excluído, e sumir de lá reescreveria o passado.

create or replace function public.get_admin_portfolio_totals()
returns table(
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
stable security definer
set search_path = ''
as $function$
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
  select
    (select count(*) from public.professionals p
      where p.owner_id = v_owner and p.deleted_at is null)::bigint,
    /*
      `professionals_active` e `professionals_inactive` sobrevivem apenas na
      assinatura: mudar as colunas de retorno obrigaria a derrubar e recriar a
      função, e o dashboard já lê o total. A primeira repete o total (não há
      mais recorte); a segunda é zero e permanece zero.
    */
    (select count(*) from public.professionals p
      where p.owner_id = v_owner and p.deleted_at is null)::bigint,
    0::bigint,
    (
      select count(*)
      from public.professionals p
      where p.owner_id = v_owner
        and p.deleted_at is null
        and not exists (
          select 1
          from public.professional_regions pr
          where pr.professional_id = p.id
        )
    )::bigint,
    (
      select count(*)
      from public.professionals p
      where p.owner_id = v_owner
        and p.deleted_at is null
        and not exists (
          select 1
          from public.contacts c
          where c.professional_id = p.id
        )
    )::bigint,
    (select count(*) from public.stores s
      where s.owner_id = v_owner)::bigint,
    (select count(*) from public.stores s
      where s.owner_id = v_owner and s.is_active)::bigint,
    (
      select count(*)
      from public.stores s
      where s.owner_id = v_owner
        and s.is_active
        and not exists (
          select 1
          from public.opportunities o
          where o.store_id = s.id
        )
    )::bigint;
end;
$function$;

comment on function public.get_admin_portfolio_totals is
'Estado atual da carteira do admin da sessão. Ignora profissionais excluídos (deleted_at). Lojas continuam com Ativa/Inativa, que é conceito delas.';

create or replace function public.get_admin_professionals_by_segment()
returns table(
  segment_id uuid,
  segment_name text,
  sort_order integer,
  active_count bigint,
  total_count bigint
)
language plpgsql
stable security definer
set search_path = ''
as $function$
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
  select
    s.id,
    s.name,
    s.sort_order,
    count(p.id)::bigint,
    count(p.id)::bigint
  from public.segments s
  -- O recorte vai no ON, não no WHERE: no WHERE ele desfaria o LEFT JOIN e o
  -- segmento sem ninguém sumiria do gráfico em vez de aparecer zerado.
  left join public.professionals p
    on p.segment_id = s.id
   and p.owner_id = v_owner
   and p.deleted_at is null
  group by s.id, s.name, s.sort_order
  order by s.sort_order, s.name;
end;
$function$;

create or replace function public.get_admin_professionals_by_region()
returns table(
  region_id uuid,
  region_name text,
  sort_order integer,
  active_count bigint,
  total_count bigint
)
language plpgsql
stable security definer
set search_path = ''
as $function$
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
  select
    r.id,
    r.name,
    r.sort_order,
    count(p.id)::bigint,
    count(p.id)::bigint
  from public.regions r
  left join public.professional_regions pr on pr.region_id = r.id
  left join public.professionals p
    on p.id = pr.professional_id
   and p.owner_id = v_owner
   and p.deleted_at is null
  group by r.id, r.name, r.sort_order
  order by r.sort_order, r.name;
end;
$function$;

-- --------------------------------------------------------------------------
-- 3. is_active
-- --------------------------------------------------------------------------

comment on column public.professionals.is_active is
'MORTA desde a 0019, e sem nenhum leitor desde a 0020. Não voltou a significar nada: o produto não tem Ativo/Inativo, e quem sai da carteira sai por deleted_at. Vale sempre true; mantida só por causa de índices antigos.';

commit;
