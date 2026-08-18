-- ============================================================================
-- HORN — Senha provisória com troca obrigatória no primeiro acesso
--
-- O acesso da loja passa a ser criado com uma senha aleatória, exibida UMA vez
-- ao administrador, que a entrega junto com o e-mail pelo canal que já usa com
-- a loja. É mais simples de explicar que um link, e não depende de e-mail.
--
-- O custo dessa simplicidade é que a senha fica parada no WhatsApp para sempre
-- e o lojista tende a nunca trocá-la — na prática o administrador passaria a
-- conhecer permanentemente a senha de outra pessoa. `must_change_password`
-- fecha isso: enquanto estiver marcada, o usuário entra e vai direto para a
-- troca, sem alcançar nenhuma tela do sistema. Depois de trocar, a senha que
-- circulou por fora não vale mais nada.
--
-- Continua sem senha em texto no banco: quem guarda o hash é o Supabase Auth.
-- Esta coluna é só um sinalizador.
-- ============================================================================

begin;

alter table public.user_profiles
  add column if not exists must_change_password boolean not null default false;

comment on column public.user_profiles.must_change_password is
'Marca uma senha provisória entregue pela administração. Enquanto true, o login leva direto à troca de senha. Nenhuma senha é armazenada aqui.';

-- --------------------------------------------------------------------------
-- O painel de acesso precisa mostrar quais senhas ainda são provisórias
-- --------------------------------------------------------------------------
-- A função é recriada com uma coluna a mais, então precisa de DROP: o Postgres
-- não troca parâmetros de saída com CREATE OR REPLACE.

drop function if exists public.get_store_access_summary();

create function public.get_store_access_summary()
returns table (
  store_id uuid,
  user_id uuid,
  email text,
  full_name text,
  is_active boolean,
  must_change_password boolean,
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
    up.must_change_password,
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
revoke all on function public.get_store_access_summary() from anon;
grant execute on function public.get_store_access_summary() to authenticated;

comment on function public.get_store_access_summary() is
'Acessos de loja provisionados, com o e-mail vindo de auth.users. Responde apenas para admin.';

-- --------------------------------------------------------------------------
-- Baixa da senha provisória
-- --------------------------------------------------------------------------
-- Chamada pelo próprio usuário logo após trocar a senha. Só mexe na própria
-- linha e só sabe desligar a marca — não existe caminho para ligá-la de volta
-- por aqui, nem para tocar em papel, loja ou status.
--
-- Existe porque a policy `user_profiles_admin_update` restringe UPDATE ao
-- admin: sem esta função, o lojista não conseguiria dar baixa na própria marca.

create or replace function public.clear_must_change_password()
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  update public.user_profiles
     set must_change_password = false
   where id = (select auth.uid())
     and must_change_password = true;
$$;

revoke all on function public.clear_must_change_password() from public;
revoke all on function public.clear_must_change_password() from anon;
grant execute on function public.clear_must_change_password() to authenticated;

comment on function public.clear_must_change_password() is
'Dá baixa na senha provisória do próprio usuário, após ele definir uma nova senha.';

commit;
