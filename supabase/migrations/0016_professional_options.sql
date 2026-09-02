-- ============================================================================
-- HORN — Empresa e cargo como listas reutilizáveis
--
-- Duas coisas: a coluna `job_role` em professionals (irmã de `company`, criada
-- na 0015) e um catálogo de valores reutilizáveis para os dois campos.
--
-- POR QUE UM CATÁLOGO, E NÃO UMA ENTIDADE
--
-- Continua não existindo empresa como entidade — nada de endereço, contato,
-- projeto ou lista de funcionários. O que existe é o mesmo texto sendo digitado
-- de novo a cada profissional, com risco de "Aliás Arquitetura", "alias
-- arquitetura" e "Aliás Arquitetura " virarem três empresas diferentes. O
-- catálogo existe para a pessoa ESCOLHER em vez de digitar; o valor escolhido
-- continua gravado como texto em `professionals`, exatamente como na 0015.
--
-- É por isso que renomear uma opção não está nesta migration (nem no escopo
-- desta etapa): enquanto o profissional guarda o texto, renomear a opção não
-- mudaria os profissionais já gravados. Trocar isso por chave estrangeira é
-- decisão de outra etapa, e está anotada no relatório.
--
-- POR QUE UMA TABELA SÓ, COM `kind`
--
-- Empresa e cargo têm o mesmo comportamento: um nome, do dono, único sem olhar
-- caixa nem espaço. Duas tabelas seriam duas RLS, dois conjuntos de grants e
-- dois índices para a mesma regra. O discriminador `kind` deixa uma regra só —
-- e um `kind` novo no futuro não pede tabela nova.
--
-- POR QUE POR DONO, E NÃO GLOBAL
--
-- `segments` e `regions` são catálogos compartilhados: fazem parte da
-- especificação da HORN e ninguém os cria pela tela. Empresa e cargo são o
-- contrário — nascem do que cada admin digita. A migration 0009 separou os dois
-- admins justamente para que o dado de um não apareça para o outro, e a carteira
-- de clientes de um escritório é exatamente o tipo de coisa que não pode vazar.
-- Por isso `owner_id`, com a mesma RLS de `professionals`.
--
-- POR QUE SÓ SELECT E INSERT
--
-- Esta etapa tem escolher e criar. Não tem apagar nem renomear — e a pergunta
-- "o que acontece com os profissionais que apontam para a opção apagada?" fica
-- para quando existir resposta. Sem `update` e sem `delete` no grant, a resposta
-- por ora é: não acontece, porque a API não deixa.
--
-- ORDEM: aplicado depois de 0015.
-- ============================================================================

begin;

-- --------------------------------------------------------------------------
-- 1. O TIPO
-- --------------------------------------------------------------------------
-- Mesmo idioma do schema base: valor interno em inglês, rótulo em português na
-- aplicação. 'job_role' e não 'role' porque `user_profiles.role` já existe e é
-- outra coisa — admin ou loja, o papel de quem entra no sistema.

do $$
begin
  if not exists (
    select 1 from pg_type where typname = 'professional_option_kind'
  ) then
    create type public.professional_option_kind as enum ('company', 'job_role');
  end if;
end $$;

comment on type public.professional_option_kind is
'Qual lista a opção alimenta: empresa ou cargo do profissional.';

-- --------------------------------------------------------------------------
-- 2. A TABELA
-- --------------------------------------------------------------------------

create table if not exists public.professional_options (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete restrict,
  kind public.professional_option_kind not null,
  name text not null,
  created_at timestamptz not null default now(),
  constraint professional_options_name_not_blank check (btrim(name) <> '')
);

comment on table public.professional_options is
'Valores reutilizáveis de empresa e cargo, por admin. Catálogo de digitação: o profissional guarda o texto, não uma referência.';

-- A unicidade é a proteção contra duplicata, e ela mora aqui e não na
-- aplicação: `lower(btrim(name))` faz "Aliás Arquitetura", "aliás arquitetura"
-- e "Aliás Arquitetura " colidirem no banco, mesmo em duas abas ao mesmo tempo.
-- O `name` gravado continua sendo o que a pessoa escreveu — a normalização é do
-- índice, não do dado.
create unique index if not exists professional_options_unique_idx
  on public.professional_options (owner_id, kind, lower(btrim(name)));

-- --------------------------------------------------------------------------
-- 3. DONO AUTOMÁTICO, DONO CONGELADO
-- --------------------------------------------------------------------------
-- As mesmas funções da 0009. A aplicação nunca envia `owner_id`.

create or replace trigger a_professional_options_set_owner
before insert on public.professional_options
for each row execute function public.set_owner_id_from_session();

create or replace trigger professional_options_freeze_owner
before update on public.professional_options
for each row execute function public.freeze_owner_id();

-- --------------------------------------------------------------------------
-- 4. RLS
-- --------------------------------------------------------------------------
-- Idêntica à de `professionals`: admin, e só o próprio dono. Sem policy de
-- update e de delete porque nenhuma das duas operações existe nesta etapa.

alter table public.professional_options enable row level security;

drop policy if exists "professional_options_admin_read" on public.professional_options;
drop policy if exists "professional_options_admin_insert" on public.professional_options;

create policy "professional_options_admin_read"
on public.professional_options for select
to authenticated
using (
  (select public.is_admin())
  and owner_id = (select public.current_owner_id())
);

create policy "professional_options_admin_insert"
on public.professional_options for insert
to authenticated
with check (
  (select public.is_admin())
  and owner_id = (select public.current_owner_id())
);

-- --------------------------------------------------------------------------
-- 5. PRIVILÉGIOS
-- --------------------------------------------------------------------------
-- O revoke vem antes do grant de propósito: o Supabase concede privilégios
-- padrão em tabelas novas do schema public, e o que não é revogado fica.

revoke all on table public.professional_options from anon;
revoke all on table public.professional_options from authenticated;
grant select, insert on table public.professional_options to authenticated;

-- --------------------------------------------------------------------------
-- 6. A COLUNA DE CARGO
-- --------------------------------------------------------------------------
-- Mesma forma da `company`: texto livre, nula, sem CHECK. "Sem cargo" é
-- situação normal, e nenhum dos profissionais que já existem é tocado.

alter table public.professionals
  add column if not exists job_role text;

comment on column public.professionals.job_role is
'Cargo do profissional dentro da empresa (Sócio, Equipe, Diretor...), ou NULL. Texto livre e opcional, escolhido em professional_options.';

-- --------------------------------------------------------------------------
-- 7. A FUNÇÃO
-- --------------------------------------------------------------------------
-- Mesmo motivo da 0013 e da 0015: um parâmetro a mais é sobrecarga, não
-- substituição. Derruba a assinatura da 0015 e recria com `p_job_role` no fim.

drop function if exists public.save_professional(
  text, uuid, uuid[], uuid, text, text, text, text, text, text, text,
  smallint, smallint, text, boolean, text
);

create or replace function public.save_professional(
  p_name text,
  p_segment_id uuid,
  p_region_ids uuid[] default '{}',
  p_id uuid default null,
  p_email text default null,
  p_instagram text default null,
  p_phone text default null,
  p_address text default null,
  p_postal_code text default null,
  p_city text default null,
  p_state text default null,
  p_birthday_day smallint default null,
  p_birthday_month smallint default null,
  p_notes text default null,
  p_is_active boolean default true,
  p_company text default null,
  p_job_role text default null
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_id uuid;
  v_regions uuid[] := coalesce(p_region_ids, '{}'::uuid[]);
begin
  if not (select public.is_admin()) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  if p_id is null then
    insert into public.professionals (
      name, segment_id, company, job_role, email, instagram, phone, address,
      postal_code, city, state, birthday_day, birthday_month, notes, is_active
    ) values (
      p_name, p_segment_id, p_company, p_job_role, p_email, p_instagram,
      p_phone, p_address, p_postal_code, p_city, p_state, p_birthday_day,
      p_birthday_month, p_notes, p_is_active
    )
    returning id into v_id;
  else
    update public.professionals set
      name = p_name,
      segment_id = p_segment_id,
      company = p_company,
      job_role = p_job_role,
      email = p_email,
      instagram = p_instagram,
      phone = p_phone,
      address = p_address,
      postal_code = p_postal_code,
      city = p_city,
      state = p_state,
      birthday_day = p_birthday_day,
      birthday_month = p_birthday_month,
      notes = p_notes,
      is_active = p_is_active
    where id = p_id
    returning id into v_id;

    -- A RLS devolve zero linhas em vez de erro quando o update não é permitido.
    if v_id is null then
      raise exception 'Professional not found or not permitted'
        using errcode = 'P0002';
    end if;
  end if;

  -- Sincroniza as regiões tocando apenas o diff: os vínculos mantidos
  -- preservam o created_at original.
  delete from public.professional_regions pr
   where pr.professional_id = v_id
     and not (pr.region_id = any(v_regions));

  insert into public.professional_regions (professional_id, region_id)
  select v_id, x.region_id
    from (select distinct unnest(v_regions) as region_id) x
  on conflict (professional_id, region_id) do nothing;

  /*
    O valor gravado nunca fica fora da lista.

    A tela só oferece opções do catálogo, então na prática estas duas linhas
    não fazem nada. Elas existem para o resto: o que foi digitado antes desta
    migration, o que entrar por chamada direta da API, e o dia em que alguém
    restaurar um backup antigo. Sem isso, um profissional poderia carregar uma
    empresa que o seletor não oferece a mais ninguém.

    `owner_id` vem do trigger, como em qualquer insert da aplicação, e a RLS
    confere de novo — o catálogo cresce só dentro do dono da sessão.
  */
  insert into public.professional_options (kind, name)
  select 'company'::public.professional_option_kind, btrim(p_company)
   where btrim(coalesce(p_company, '')) <> ''
  on conflict do nothing;

  insert into public.professional_options (kind, name)
  select 'job_role'::public.professional_option_kind, btrim(p_job_role)
   where btrim(coalesce(p_job_role, '')) <> ''
  on conflict do nothing;

  return v_id;
end;
$$;

-- A função nova nasce sem os privilégios da antiga: `drop` leva os grants
-- junto. Repõe o que a 0001 e a 0008 tinham deixado.
revoke all on function public.save_professional(
  text, uuid, uuid[], uuid, text, text, text, text, text, text, text,
  smallint, smallint, text, boolean, text, text
) from public;

revoke all on function public.save_professional(
  text, uuid, uuid[], uuid, text, text, text, text, text, text, text,
  smallint, smallint, text, boolean, text, text
) from anon;

grant execute on function public.save_professional(
  text, uuid, uuid[], uuid, text, text, text, text, text, text, text,
  smallint, smallint, text, boolean, text, text
) to authenticated;

comment on function public.save_professional is
'Grava profissional e sincroniza professional_regions numa única transação. p_id nulo cria, preenchido atualiza.';

-- --------------------------------------------------------------------------
-- 8. AS EMPRESAS QUE JÁ EXISTEM
-- --------------------------------------------------------------------------
-- Toda empresa já digitada vira opção do dono dela, sem ninguém precisar
-- recadastrar nada. `distinct on` com a mesma normalização do índice: se a
-- mesma empresa já foi escrita de duas formas, a mais antiga é a que vira
-- opção, e a outra continua gravada como está no profissional dela — esta
-- migration não reescreve profissional nenhum.
--
-- Daqui para a frente quem mantém a lista completa é a própria
-- `save_professional`, na seção 7: esta cópia é só o ponto de partida.

insert into public.professional_options (owner_id, kind, name)
select distinct on (p.owner_id, lower(btrim(p.company)))
       p.owner_id,
       'company'::public.professional_option_kind,
       btrim(p.company)
  from public.professionals p
 where p.company is not null
   and btrim(p.company) <> ''
 order by p.owner_id, lower(btrim(p.company)), p.created_at
on conflict do nothing;

commit;
