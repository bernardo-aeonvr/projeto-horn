-- ============================================================================
-- 0001 — save_professional
--
-- Grava um profissional e sincroniza suas regiões de atuação numa única
-- transação.
--
-- Motivo: o PostgREST não tem transação entre requisições, então salvar pelo
-- cliente exigia duas chamadas (professionals + professional_regions) com
-- compensação manual em caso de falha. Esta função elimina o estado
-- intermediário: ou tudo é gravado, ou nada é.
--
-- Segurança: SECURITY INVOKER (padrão), igual a public.register_contact. A
-- checagem explícita de is_admin() dá a mensagem de erro certa, e a RLS das
-- tabelas continua valendo como segunda camada.
-- ============================================================================

begin;

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
  p_is_active boolean default true
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
      name, segment_id, email, instagram, phone, address, postal_code,
      city, state, birthday_day, birthday_month, notes, is_active
    ) values (
      p_name, p_segment_id, p_email, p_instagram, p_phone, p_address,
      p_postal_code, p_city, p_state, p_birthday_day, p_birthday_month,
      p_notes, p_is_active
    )
    returning id into v_id;
  else
    update public.professionals set
      name = p_name,
      segment_id = p_segment_id,
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

revoke all on function public.save_professional(
  text, uuid, uuid[], uuid, text, text, text, text, text, text, text,
  smallint, smallint, text, boolean
) from public;

grant execute on function public.save_professional(
  text, uuid, uuid[], uuid, text, text, text, text, text, text, text,
  smallint, smallint, text, boolean
) to authenticated;

comment on function public.save_professional is
'Grava profissional e sincroniza professional_regions numa única transação. p_id nulo cria, preenchido atualiza.';

commit;
