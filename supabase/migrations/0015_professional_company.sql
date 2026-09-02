-- ============================================================================
-- HORN — Empresa do profissional
--
-- Uma coluna em `public.professionals` e um parâmetro a mais em
-- `save_professional`. É a migration inteira.
--
-- POR QUE NÃO EXISTE TABELA DE EMPRESA
--
-- Um profissional pode pertencer a um escritório, estúdio ou construtora, e
-- duas pessoas podem pertencer ao mesmo. Isso não faz da empresa uma entidade:
-- ela não tem contato, não tem projeto, não tem proposta e não entra em
-- métrica nenhuma. O que existe hoje é a informação "onde esta pessoa
-- trabalha" — um atributo do profissional, como cidade ou segmento.
--
-- Modelar `empresas` com chave estrangeira criaria cadastro, tela, dono e
-- deduplicação para guardar um texto, e transformaria a carteira em hierarquia
-- (empresa → profissionais) que nenhuma consulta do sistema pede. A relação
-- entre dois profissionais da mesma empresa é o texto igual, e por ora basta.
--
-- POR QUE NULA, E SEM CHECK
--
-- A carteira é de arquitetos, designers e engenheiros, boa parte autônoma:
-- "sem empresa" é situação normal, não cadastro incompleto. Todos os ~435
-- profissionais que já existem continuam com a coluna nula, e nenhum deles
-- precisa ser tocado.
--
-- Sem constraint de propósito: a aplicação já normaliza string vazia para NULL
-- (`emptyToNull`), e um CHECK aqui só criaria um jeito novo de a gravação
-- falhar, para um campo cujo conteúdo é texto livre.
--
-- POR QUE DROP E NÃO SÓ REPLACE
--
-- Mesmo motivo da 0013: `create or replace` com um parâmetro a mais cria uma
-- SOBRECARGA, não uma substituição. Ficariam duas versões de save_professional
-- e o PostgREST não saberia qual chamar. O bloco abaixo derruba a assinatura
-- antiga e recria a nova na mesma transação — o corpo é o da 0001, alterado só
-- na assinatura e nas duas listas de colunas.
--
-- POR QUE O PARÂMETRO NOVO VAI NO FIM
--
-- A função continua sendo chamada por nome pelo PostgREST, então a posição não
-- muda nada para a aplicação; no fim, o diff contra a 0001 fica mínimo e a
-- ordem dos parâmetros antigos permanece a mesma para quem for comparar.
--
-- `save_professional` grava a linha inteira, não um patch: omitir p_company num
-- update apaga a empresa, exatamente como já acontece com e-mail, telefone e
-- qualquer outro campo opcional. O formulário sempre envia os dois estados.
--
-- ORDEM: aplicado depois de 0014.
-- ============================================================================

begin;

-- --------------------------------------------------------------------------
-- 1. A COLUNA
-- --------------------------------------------------------------------------

alter table public.professionals
  add column if not exists company text;

comment on column public.professionals.company is
'Escritório, estúdio ou empresa a que o profissional pertence, ou NULL. Texto livre e opcional: não há entidade de empresa, e autônomo é situação normal.';

-- --------------------------------------------------------------------------
-- 2. A FUNÇÃO
-- --------------------------------------------------------------------------

drop function if exists public.save_professional(
  text, uuid, uuid[], uuid, text, text, text, text, text, text, text,
  smallint, smallint, text, boolean
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
  p_company text default null
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
      name, segment_id, company, email, instagram, phone, address, postal_code,
      city, state, birthday_day, birthday_month, notes, is_active
    ) values (
      p_name, p_segment_id, p_company, p_email, p_instagram, p_phone, p_address,
      p_postal_code, p_city, p_state, p_birthday_day, p_birthday_month,
      p_notes, p_is_active
    )
    returning id into v_id;
  else
    update public.professionals set
      name = p_name,
      segment_id = p_segment_id,
      company = p_company,
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

  return v_id;
end;
$$;

-- A função nova nasce sem os privilégios da antiga: `drop` leva os grants
-- junto. Estes três comandos repõem o que a 0001 e a 0008 tinham deixado.
revoke all on function public.save_professional(
  text, uuid, uuid[], uuid, text, text, text, text, text, text, text,
  smallint, smallint, text, boolean, text
) from public;

revoke all on function public.save_professional(
  text, uuid, uuid[], uuid, text, text, text, text, text, text, text,
  smallint, smallint, text, boolean, text
) from anon;

grant execute on function public.save_professional(
  text, uuid, uuid[], uuid, text, text, text, text, text, text, text,
  smallint, smallint, text, boolean, text
) to authenticated;

comment on function public.save_professional is
'Grava profissional e sincroniza professional_regions numa única transação. p_id nulo cria, preenchido atualiza.';

commit;
