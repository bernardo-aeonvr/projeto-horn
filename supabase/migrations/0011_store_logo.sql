-- ============================================================================
-- HORN — Logotipo da loja
--
-- Uma coluna, um bucket e quatro policies. A loja passa a poder ter uma marca
-- própria no dashboard dela; quem envia, troca e remove continua sendo só o
-- admin dono daquela loja.
--
-- POR QUE UM BUCKET NOVO, E PÚBLICO
--
-- `proposal-pdfs` é privado por necessidade: uma proposta é documento
-- comercial de uma loja e não pode ser lida por ninguém mais. Um logotipo é o
-- oposto — existe para ser exibido, é a mesma imagem que a loja estampa na
-- fachada. Guardá-lo no bucket privado obrigaria a assinar uma URL a cada
-- renderização do dashboard, com validade e ida ao servidor, para proteger um
-- arquivo que não é segredo.
--
-- Sendo público, a URL é estável e o navegador cacheia. O nome do arquivo
-- carrega um sufixo único a cada envio, então trocar o logotipo muda a URL e a
-- imagem nova aparece sem truque de invalidação de cache.
--
-- O QUE O BUCKET RECUSA SOZINHO
--
-- `allowed_mime_types` e `file_size_limit` são conferidos pelo Storage, não
-- pelo navegador: um upload fora do tipo ou acima de 1 MB é recusado mesmo que
-- alguém chame a API direto, sem passar pela tela. A validação do formulário
-- existe para avisar antes, não para autorizar.
--
-- ORDEM: aplicado depois de 0010.
-- ============================================================================

begin;

-- --------------------------------------------------------------------------
-- 1. A COLUNA
-- --------------------------------------------------------------------------
-- Guarda o CAMINHO dentro do bucket, não a URL: o domínio do projeto Supabase
-- não fica gravado em cada linha, e montar a URL pública é uma operação de
-- string na aplicação. Mesmo critério de `proposal_attachments.storage_path`.
--
-- Nula por padrão, e continua nula em toda loja que já existe: logotipo é
-- opcional, e nenhuma loja precisa de um para funcionar.

alter table public.stores
  add column if not exists logo_path text;

comment on column public.stores.logo_path is
'Caminho do logotipo no bucket store-logos, ou NULL. Opcional: a loja funciona sem ele.';

-- --------------------------------------------------------------------------
-- 2. O BUCKET
-- --------------------------------------------------------------------------
-- 1 MB é de sobra para uma marca em PNG ou WebP e uma ordem de grandeza abaixo
-- do limite dos PDFs de proposta (10 MB), que é outro tipo de arquivo e outro
-- uso. SVG fica de fora de propósito: é XML, aceita script embutido, e um
-- bucket público serviria esse arquivo direto ao navegador.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'store-logos',
  'store-logos',
  true,
  1048576,
  array['image/png', 'image/jpeg', 'image/webp']::text[]
)
on conflict (id) do update
set public = true,
    file_size_limit = 1048576,
    allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp']::text[];

-- --------------------------------------------------------------------------
-- 3. DE QUEM É A PASTA
-- --------------------------------------------------------------------------
-- Mesma solução de `owns_proposal_object`, e pelo mesmo motivo documentado na
-- migration 0009: consultar `public.stores` dentro da policy de storage não
-- resolve a favor de quem chama, e o EXISTS cai para falso sem erro nenhum.
-- SECURITY DEFINER responde "esta pasta é minha?" igual em qualquer contexto.
--
-- A convenção de caminho é `{store_uuid}/{arquivo}`.

create or replace function public.owns_store_logo_object(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.stores s
    where s.id::text = (storage.foldername(p_name))[1]
      and s.owner_id = (select public.current_owner_id())
  );
$$;

revoke all on function public.owns_store_logo_object(text) from public;
revoke all on function public.owns_store_logo_object(text) from anon;
grant execute on function public.owns_store_logo_object(text) to authenticated;

comment on function public.owns_store_logo_object(text) is
'Diz se o objeto do bucket store-logos está na pasta de uma loja do dono da sessão. Usada pelas policies de storage.objects.';

-- --------------------------------------------------------------------------
-- 4. POLICIES
-- --------------------------------------------------------------------------
-- Escrita: admin, e só na pasta de uma loja dele. O usuário de loja não
-- aparece em nenhuma das três — ele não edita a própria loja em lugar nenhum
-- do sistema, e o logotipo não abre exceção.
--
-- Leitura: o bucket é público, então o endpoint /object/public/ serve a imagem
-- sem consultar RLS. A policy de select existe para o SDK autenticado
-- (listar, baixar pelo caminho) continuar funcionando na tela do admin.

drop policy if exists "store_logos_read" on storage.objects;
drop policy if exists "store_logos_admin_insert" on storage.objects;
drop policy if exists "store_logos_admin_update" on storage.objects;
drop policy if exists "store_logos_admin_delete" on storage.objects;

create policy "store_logos_read"
on storage.objects for select
to authenticated
using (bucket_id = 'store-logos');

create policy "store_logos_admin_insert"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'store-logos'
  and (select public.is_admin())
  and (select public.owns_store_logo_object(name))
);

create policy "store_logos_admin_update"
on storage.objects for update
to authenticated
using (
  bucket_id = 'store-logos'
  and (select public.is_admin())
  and (select public.owns_store_logo_object(name))
)
with check (
  bucket_id = 'store-logos'
  and (select public.is_admin())
  and (select public.owns_store_logo_object(name))
);

create policy "store_logos_admin_delete"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'store-logos'
  and (select public.is_admin())
  and (select public.owns_store_logo_object(name))
);

commit;
