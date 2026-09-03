-- ============================================================================
-- HORN — Fim do status do profissional, "Cliente Final" e Empresa no contato
--
-- Três assuntos que chegaram juntos e se tocam num ponto só: quem é o
-- profissional. Nenhum deles cria entidade nova.
--
-- 1. ATIVO/INATIVO SAI DO PRODUTO
--
-- A regra passa a ser a mais simples possível: se o profissional está
-- cadastrado, ele existe; se não deve mais existir, é excluído. Não há
-- arquivamento, não há soft-delete, não há terceiro estado.
--
-- A COLUNA `is_active` CONTINUA NA TABELA, de propósito. Ela aparece em
-- índice, em política de RLS e em meia dúzia de funções de dashboard escritas
-- desde a 0002; derrubá-la agora seria reescrever tudo isso por um campo que
-- só precisa parar de significar algo. O que esta migration faz é tirá-la de
-- circulação:
--
--   * `save_professional` perde `p_is_active` — a aplicação não manda mais
--     status nenhum, e editar um profissional não pode mais mudar esse campo;
--   * os 6 registros que estavam inativos passam a ativos, para que os
--     contadores do dashboard (que somam `where p.is_active`) voltem a
--     descrever a carteira inteira sem que nenhuma RPC precise ser tocada.
--
-- Depois disto, `is_active` é constante `true` para todo profissional novo
-- (default da coluna) e para todos os que já existem. Quem lê essa coluna
-- continua funcionando; ela apenas não separa mais nada.
--
-- 2. "CLIENTE FINAL" É UM SEGMENTO
--
-- Uma linha no catálogo `public.segments`, no mesmo formato dos outros cinco.
-- Não é cargo, não é campo novo, não é exceção em lugar nenhum do código: o
-- formulário e o filtro leem a tabela.
--
-- 3. A EMPRESA DO CONTATO É UM SNAPSHOT
--
-- A listagem de Contatos passa a mostrar a empresa do profissional. Ela podia
-- ser lida por join a cada exibição, mas isso reescreveria o passado: quando
-- Larissa trocasse da Ziggy para o Studio Norte, o contato de agosto passaria
-- a dizer Studio Norte, e o histórico comercial mentiria.
--
-- Então `contacts.company_name` guarda a empresa do momento do registro. Quem
-- preenche é um TRIGGER, não a aplicação: assim o snapshot vale para a RPC
-- `register_contact`, para o update do PostgREST e para qualquer chamada
-- direta à API — não existe caminho que grave contato sem ele.
--
-- Trocar o profissional de um contato retira o snapshot antigo e tira outro do
-- profissional novo: o contato passou a ser de outra pessoa, e o contexto que
-- vale é o dela. Mudar só a data ou o canal não mexe em nada.
--
-- CONTATOS ANTIGOS FICAM COM NULL, e é o certo: ninguém sabe qual era a
-- empresa deles em 2026. A aplicação cai para `professional.company` nesses
-- casos — o mesmo que mostraria hoje —, e o snapshot passa a existir dos
-- registros novos em diante.
--
-- ORDEM: aplicado depois de 0018.
-- ============================================================================

begin;

-- --------------------------------------------------------------------------
-- 1. SEGMENTO "CLIENTE FINAL"
-- --------------------------------------------------------------------------
-- `sort_order` 60 põe a opção depois de Corretor, no fim da lista: é o
-- segmento menos frequente da carteira, e os cinco antigos não mudam de lugar.
-- O `on conflict` repete o do schema.sql — reaplicar é inofensivo.

insert into public.segments (slug, name, sort_order)
values ('cliente-final', 'Cliente Final', 60)
on conflict (slug) do update
set name = excluded.name,
    sort_order = excluded.sort_order,
    is_active = true;

-- --------------------------------------------------------------------------
-- 2. STATUS FORA DE CIRCULAÇÃO
-- --------------------------------------------------------------------------
-- Não é exclusão de dado: nenhum profissional some, nenhuma coluna cai. O
-- campo deixa de dividir a carteira em dois grupos, que é o que o produto
-- deixou de fazer.

update public.professionals
   set is_active = true
 where not is_active;

comment on column public.professionals.is_active is
'OBSOLETA desde a 0019. O produto não tem mais Ativo/Inativo: profissional cadastrado existe, e quem não deve existir é excluído. Mantida por compatibilidade com índices, políticas e funções de dashboard anteriores; vale sempre true.';

-- --------------------------------------------------------------------------
-- 3. save_professional SEM p_is_active
-- --------------------------------------------------------------------------
-- Mesmo motivo da 0013, 0015 e 0016: mudar a lista de parâmetros cria
-- SOBRECARGA, não substituição, e o PostgREST não saberia qual chamar. Derruba
-- a assinatura da 0016 e recria sem o parâmetro.
--
-- O corpo é o da 0016 com duas diferenças: `is_active` sai do insert (fica o
-- default `true` da coluna) e sai do update (editar um profissional não toca
-- mais nesse campo).

drop function if exists public.save_professional(
  text, uuid, uuid[], uuid, text, text, text, text, text, text, text,
  smallint, smallint, text, boolean, text, text
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
      postal_code, city, state, birthday_day, birthday_month, notes
    ) values (
      p_name, p_segment_id, p_company, p_job_role, p_email, p_instagram,
      p_phone, p_address, p_postal_code, p_city, p_state, p_birthday_day,
      p_birthday_month, p_notes
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
      notes = p_notes
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

  -- O valor gravado nunca fica fora da lista. Ver a nota longa na 0016.
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
-- junto.
revoke all on function public.save_professional(
  text, uuid, uuid[], uuid, text, text, text, text, text, text, text,
  smallint, smallint, text, text, text
) from public;

revoke all on function public.save_professional(
  text, uuid, uuid[], uuid, text, text, text, text, text, text, text,
  smallint, smallint, text, text, text
) from anon;

grant execute on function public.save_professional(
  text, uuid, uuid[], uuid, text, text, text, text, text, text, text,
  smallint, smallint, text, text, text
) to authenticated;

comment on function public.save_professional is
'Grava profissional e sincroniza professional_regions numa única transação. p_id nulo cria, preenchido atualiza. Não toca em is_active: o produto não tem mais status de profissional (0019).';

-- --------------------------------------------------------------------------
-- 4. A EMPRESA GRAVADA NO CONTATO
-- --------------------------------------------------------------------------

alter table public.contacts
  add column if not exists company_name text;

comment on column public.contacts.company_name is
'Empresa do profissional NO MOMENTO do contato. Snapshot histórico preenchido pelo trigger contacts_snapshot_company, como contact_stores é para as lojas. NULL nos contatos anteriores à 0019: nesses, a aplicação cai para professionals.company.';

/*
  SECURITY DEFINER, ao contrário do resto.

  O trigger precisa ler `professionals` para saber a empresa, e a RLS de
  `professionals` é do dono. Como INVOKER isso funcionaria hoje — quem registra
  contato é o admin dono do profissional, e `register_contact` já conferiu isso
  — mas falharia em silêncio no dia em que outra sessão gravasse contato por
  outro caminho: o select voltaria vazio e o snapshot nasceria nulo, sem erro
  nenhum para avisar.

  Ler o nome de uma empresa por id de profissional não vaza nada que quem
  registrou o contato já não tenha escolhido na tela, e a permissão de gravar
  contato continua sendo decidida pela RLS de `contacts` e por
  `register_contact` — este trigger não concede acesso a lugar nenhum.
*/
create or replace function public.contacts_snapshot_company()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Insert: sempre. Update: só quando o contato muda de dono — corrigir data,
  -- canal ou observação não pode reescrever o contexto histórico.
  if tg_op = 'INSERT'
     or new.professional_id is distinct from old.professional_id then
    select p.company
      into new.company_name
      from public.professionals p
     where p.id = new.professional_id;
  end if;

  return new;
end;
$$;

comment on function public.contacts_snapshot_company is
'Preenche contacts.company_name com a empresa do profissional no momento do registro. Também na troca de profissional; nunca ao editar data, canal ou observação.';

drop trigger if exists contacts_snapshot_company on public.contacts;

create trigger contacts_snapshot_company
before insert or update of professional_id on public.contacts
for each row
execute function public.contacts_snapshot_company();

commit;
