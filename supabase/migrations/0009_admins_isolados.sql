-- ============================================================================
-- HORN — Dois admins paralelos, sem enxergar os dados um do outro
--
-- O MVP nasceu com um admin só, e `is_admin()` bastava como autorização: quem
-- era admin via tudo. Com um segundo administrador operando em paralelo, "tudo"
-- deixa de ser uma resposta aceitável — cada um precisa da própria carteira,
-- das próprias lojas e dos próprios números, sem interseção.
--
-- COMO O ISOLAMENTO É FEITO
--
-- Cada linha das tabelas-raiz passa a ter um dono: `owner_id`, o UUID do admin
-- a que ela pertence. As tabelas de ligação (professional_regions,
-- contact_stores, opportunity_status_history, proposal_attachments) não ganham
-- coluna — herdam o dono pelo pai, e as policies delas passam por um EXISTS.
--
-- A partir daí, `is_admin()` deixa de ser autorização suficiente em qualquer
-- lugar. Toda policy e toda função SECURITY DEFINER passa a exigir também
-- `owner_id = current_owner_id()`. Onde antes se lia "é admin", agora se lê
-- "é admin E esta linha é sua".
--
-- `current_owner_id()` responde para os dois papéis:
--   admin  -> o próprio id;
--   loja   -> o dono da loja a que o usuário está vinculado.
-- Assim o usuário de loja continua vendo exatamente a própria loja, e o
-- "alcance HORN" que o dashboard da loja mostra (migration 0005) passa a ser o
-- alcance do admin que representa aquela loja — não a soma dos dois.
--
-- TRÊS BURACOS QUE ESTE ARQUIVO FECHA DE PROPÓSITO
--
-- 1. FK não respeita RLS. Nada impediria um admin de criar uma oportunidade
--    apontando para o profissional do outro: o id existe, a FK aceita, e a RLS
--    da tabela referenciada não é consultada num INSERT. Os triggers de
--    coerência (seção 5) recusam qualquer linha que cruze donos.
--
-- 2. Mover uma linha de dono. `owner_id` é congelado no UPDATE — depois de
--    criado, o dono não muda por caminho nenhum da aplicação. Sem isso, um
--    admin poderia empurrar dado para o outro (ou puxar o do outro para si).
--
-- 3. Sequestro do acesso recém-criado. O trigger `handle_new_auth_user` cria o
--    perfil antes de qualquer admin tocá-lo, e sem sessão — não há `auth.uid()`
--    para derivar dono. Esse perfil nasce órfão e, pela nova policy, invisível
--    para os dois admins. Quem o adota é `claim_store_user()`, que confere se a
--    loja é de quem chama e reivindica num UPDATE atômico: o segundo a tentar
--    recebe erro, não o acesso do outro.
--
-- O QUE CONTINUA COMPARTILHADO
--
-- `segments` e `regions`. São catálogos fixos, semeados por SQL, sem tela de
-- cadastro na aplicação — os dois admins classificam profissionais pela mesma
-- taxonomia. Nenhum dado de profissional, loja, contato ou proposta atravessa.
--
-- ORDEM: este arquivo é aplicado depois de 0008.
--
-- ESTA MIGRATION É ESPECÍFICA DESTE BANCO. As seções 0, 2 e 13 citam dois UUIDs
-- reais: o admin que construiu a base e o que está sendo criado. Em um projeto
-- Supabase novo ela aborta na seção 0, com a mensagem explicando o que falta —
-- de propósito, porque atribuir a carteira ao dono errado é pior do que não
-- aplicar. Para montar um ambiente do zero, troque os dois UUIDs pelos do
-- projeto novo. O resto do arquivo — colunas, triggers, policies e funções —
-- não depende de nenhum id.
--
-- Reaplicar o arquivo no mesmo banco é seguro: tudo é `if not exists`,
-- `create or replace` ou condicionado a `owner_id is null`.
-- ============================================================================

begin;

-- --------------------------------------------------------------------------
-- 0. QUEM É O NOVO ADMIN
-- --------------------------------------------------------------------------
-- O usuário de Auth já existe; aqui ele só é promovido. A conferência vem
-- antes de qualquer DDL para a migration abortar com uma mensagem clara, em
-- vez de estourar violação de chave estrangeira lá na frente.

do $$
declare
  v_new_admin constant uuid := 'ba0b21c1-fca4-4cf3-96cb-79b4cefd9146';
begin
  if not exists (select 1 from auth.users u where u.id = v_new_admin) then
    raise exception
      'O usuário % não existe em auth.users. Crie a conta contatos.horn@gmail.com em Authentication > Users antes de aplicar esta migration.',
      v_new_admin;
  end if;
end
$$;

-- --------------------------------------------------------------------------
-- 1. A COLUNA DE DONO
-- --------------------------------------------------------------------------
-- Entra nula para o backfill poder rodar; vira NOT NULL no fim da seção 2.
--
-- ON DELETE RESTRICT, e não CASCADE: apagar a conta de Auth de um admin não
-- pode levar junto a carteira inteira dele. Se um dia for preciso remover um
-- admin, os dados são transferidos ou apagados explicitamente antes.

alter table public.stores
  add column if not exists owner_id uuid references auth.users(id) on delete restrict;

alter table public.professionals
  add column if not exists owner_id uuid references auth.users(id) on delete restrict;

alter table public.contacts
  add column if not exists owner_id uuid references auth.users(id) on delete restrict;

alter table public.opportunities
  add column if not exists owner_id uuid references auth.users(id) on delete restrict;

-- Em user_profiles a coluna permanece NULLABLE, de propósito: é ela que
-- distingue um acesso já adotado por um admin de um perfil recém-criado pelo
-- trigger de Auth, que ainda não pertence a ninguém.
--
-- E aqui, diferente das quatro acima, a ação é CASCADE. O motivo é a linha do
-- próprio admin, que aponta para ele mesmo: com RESTRICT, apagar a conta de um
-- admin depende de o CASCADE da FK de `id` remover a linha antes de o RESTRICT
-- da FK de `owner_id` ser conferido — e essa ordem não é garantida. Na prática
-- a exclusão falhava e voltava a funcionar na segunda tentativa.
--
-- CASCADE aqui não afrouxa nada: apagar um admin que tem carteira continua
-- barrado pelo RESTRICT de stores, professionals, contacts e opportunities. E
-- como um acesso de loja só existe se houver loja, um admin que passa por esses
-- quatro RESTRICTs não tem nenhum perfil de loja para cascatear — sobra a
-- própria linha, que sairia de qualquer jeito.
alter table public.user_profiles
  add column if not exists owner_id uuid references auth.users(id) on delete cascade;

-- Reaplicação: a coluna pode já existir com a ação antiga.
do $$
declare
  v_constraint text;
begin
  select c.conname into v_constraint
  from pg_constraint c
  join pg_attribute a
    on a.attrelid = c.conrelid
   and a.attnum = any(c.conkey)
  where c.conrelid = 'public.user_profiles'::regclass
    and c.contype = 'f'
    and a.attname = 'owner_id'
    and c.confdeltype <> 'c';

  if v_constraint is not null then
    execute format(
      'alter table public.user_profiles drop constraint %I', v_constraint);
    alter table public.user_profiles
      add constraint user_profiles_owner_id_fkey
      foreign key (owner_id) references auth.users(id) on delete cascade;
  end if;
end
$$;

comment on column public.stores.owner_id is
'Admin dono desta loja. Base do isolamento entre os administradores: nenhuma policy aceita "é admin" sem também exigir que a linha seja dele.';

comment on column public.professionals.owner_id is
'Admin dono deste profissional. A carteira de um administrador é invisível para o outro.';

comment on column public.contacts.owner_id is
'Admin dono deste contato. Sempre igual ao dono do profissional contatado.';

comment on column public.opportunities.owner_id is
'Admin dono desta oportunidade. Sempre igual ao dono do profissional e ao da loja.';

comment on column public.user_profiles.owner_id is
'Admin a que este perfil pertence. Para o próprio admin, é o seu id. Para um usuário de loja, é o dono da loja. NULL = perfil criado pelo trigger de Auth e ainda não adotado por nenhum admin — invisível para todos até passar por claim_store_user().';

-- --------------------------------------------------------------------------
-- 2. BACKFILL — tudo que existe hoje é do admin de hoje
-- --------------------------------------------------------------------------
-- O dono dos dados existentes está escrito aqui, e não deduzido, porque a
-- dedução seria ambígua: no momento desta migration o banco tinha DOIS admins
-- ativos além do novo — bernardo@aeonvr.com.br, que construiu a base, e
-- admin@horn-teste.com.br, criado em 17/08 para testar o controle de acesso e
-- que nunca gravou contato, profissional, loja ou proposta.
--
-- Toda a base foi para o Bernardo. O admin de teste saiu daqui como um admin
-- isolado e vazio — que, aliás, era mais do que ele tinha antes: até então ele
-- enxergava a operação inteira, porque `is_admin()` não distinguia ninguém. A
-- conta foi excluída logo depois de aplicada esta migration, por não ter mais
-- uso; a explicação fica porque é ela que justifica o UUID escrito à mão.
--
-- A conferência antes do UPDATE existe para a migration não gravar a base no
-- nome de um UUID que não é mais admin, se este arquivo for reaproveitado.

do $$
declare
  v_owner constant uuid := '9c1d5a32-98e9-4927-9273-4b2ca9e597d1';  -- bernardo@aeonvr.com.br
begin
  if not exists (
    select 1
    from public.user_profiles up
    where up.id = v_owner
      and up.role = 'admin'::public.app_role
  ) then
    raise exception
      'O dono previsto para os dados existentes (%) não é admin em user_profiles. Confira o UUID antes de aplicar.',
      v_owner;
  end if;

  update public.stores        set owner_id = v_owner where owner_id is null;
  update public.professionals set owner_id = v_owner where owner_id is null;
  update public.contacts      set owner_id = v_owner where owner_id is null;
  update public.opportunities set owner_id = v_owner where owner_id is null;

  -- Todo admin é dono de si mesmo: é o que faz `current_owner_id()` responder
  -- o próprio id sem precisar de um caso especial.
  update public.user_profiles up
     set owner_id = up.id
   where up.role = 'admin'::public.app_role
     and up.owner_id is null;

  -- Acesso de loja herda o dono da loja.
  update public.user_profiles up
     set owner_id = s.owner_id
    from public.stores s
   where s.id = up.store_id
     and up.owner_id is null;
end
$$;

alter table public.stores        alter column owner_id set not null;
alter table public.professionals alter column owner_id set not null;
alter table public.contacts      alter column owner_id set not null;
alter table public.opportunities alter column owner_id set not null;

-- Toda listagem passa a filtrar por dono; sem estes índices o filtro vira
-- seq scan em cima de cada tela do sistema.
create index if not exists stores_owner_idx        on public.stores(owner_id);
create index if not exists professionals_owner_idx on public.professionals(owner_id, is_active);
create index if not exists contacts_owner_date_idx on public.contacts(owner_id, contacted_at desc);
create index if not exists opportunities_owner_idx on public.opportunities(owner_id, created_at desc);
create index if not exists user_profiles_owner_idx on public.user_profiles(owner_id) where owner_id is not null;

-- --------------------------------------------------------------------------
-- 3. O DONO DA SESSÃO
-- --------------------------------------------------------------------------
-- Uma função só, respondendo para os dois papéis, para que policy e função de
-- leitura nunca discordem sobre qual recorte é o do usuário.
--
-- SECURITY DEFINER pelo mesmo motivo de `is_admin()`: ela lê `user_profiles` e
-- `stores`, e essas duas tabelas têm policies que chamam esta função. Rodando
-- como dona das tabelas, a RLS não é reaplicada aqui dentro e a recursão não
-- acontece.
--
-- Perfil inativo devolve NULL, e NULL não é igual a nada — quem perde o acesso
-- para de enxergar linha alguma, em vez de cair no recorte de alguém.

create or replace function public.current_owner_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select case
           when up.role = 'admin'::public.app_role then up.id
           else (select s.owner_id from public.stores s where s.id = up.store_id)
         end
  from public.user_profiles up
  where up.id = (select auth.uid())
    and up.is_active = true
  limit 1;
$$;

revoke all on function public.current_owner_id() from public;
revoke all on function public.current_owner_id() from anon;
grant execute on function public.current_owner_id() to authenticated;

comment on function public.current_owner_id() is
'Recorte de dados do usuário autenticado: o próprio id quando admin, o dono da loja quando usuário de loja, NULL quando o perfil não está ativo.';

-- --------------------------------------------------------------------------
-- 4. DONO AUTOMÁTICO NO INSERT, DONO CONGELADO NO UPDATE
-- --------------------------------------------------------------------------
-- A aplicação nunca envia `owner_id`. Ele é preenchido aqui, a partir da
-- sessão, pelo mesmo motivo de `created_by`: um campo de dono que viaja no
-- corpo da requisição é um campo que o cliente pode mentir.

create or replace function public.set_owner_id_from_session()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.owner_id is null then
    new.owner_id := (select public.current_owner_id());
  end if;

  if new.owner_id is null then
    raise exception
      'Sem perfil ativo para determinar o dono do registro'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

-- Depois de criada, a linha não troca de dono. Este trigger é a diferença
-- entre "o outro admin não vê" e "o outro admin não vê e ninguém consegue
-- empurrar dado para lá": a policy barra escrever com dono alheio, este barra
-- reescrever o dono da linha que já é sua.
create or replace function public.freeze_owner_id()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.owner_id is distinct from old.owner_id then
    raise exception
      'O dono de um registro não pode ser alterado'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

create or replace trigger a_stores_set_owner
before insert on public.stores
for each row execute function public.set_owner_id_from_session();

create or replace trigger stores_freeze_owner
before update on public.stores
for each row execute function public.freeze_owner_id();

create or replace trigger a_professionals_set_owner
before insert on public.professionals
for each row execute function public.set_owner_id_from_session();

create or replace trigger professionals_freeze_owner
before update on public.professionals
for each row execute function public.freeze_owner_id();

create or replace trigger a_contacts_set_owner
before insert on public.contacts
for each row execute function public.set_owner_id_from_session();

create or replace trigger contacts_freeze_owner
before update on public.contacts
for each row execute function public.freeze_owner_id();

create or replace trigger a_opportunities_set_owner
before insert on public.opportunities
for each row execute function public.set_owner_id_from_session();

create or replace trigger opportunities_freeze_owner
before update on public.opportunities
for each row execute function public.freeze_owner_id();

-- `user_profiles` tem regra própria: o perfil nasce órfão (o trigger de Auth
-- roda sem sessão) e é adotado uma única vez por `claim_store_user()`. Só a
-- transição NULL -> dono é permitida; trocar de dono, nunca.
create or replace function public.guard_user_profile_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.owner_id is not null and new.owner_id is distinct from old.owner_id then
    raise exception
      'O dono de um perfil não pode ser alterado'
      using errcode = '42501';
  end if;

  -- Um acesso de loja pertence a quem é dono da loja. Sem esta amarra, um
  -- admin poderia vincular o próprio usuário à loja do outro e entrar pela
  -- porta da loja no dado alheio.
  if new.role = 'store'::public.app_role and new.store_id is not null then
    if new.owner_id is distinct from
       (select s.owner_id from public.stores s where s.id = new.store_id) then
      raise exception
        'O acesso precisa pertencer ao mesmo admin que é dono da loja'
        using errcode = '42501';
    end if;
  end if;

  if new.role = 'admin'::public.app_role and new.owner_id is distinct from new.id then
    raise exception
      'Um admin é sempre dono de si mesmo'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

create or replace trigger user_profiles_guard_owner
before update on public.user_profiles
for each row execute function public.guard_user_profile_owner();

-- --------------------------------------------------------------------------
-- 5. COERÊNCIA ENTRE TABELAS — a chave estrangeira não olha a RLS
-- --------------------------------------------------------------------------
-- Um INSERT em `opportunities` com o `professional_id` do outro admin passa
-- pela FK sem reclamar: o id existe, e o Postgres não aplica a policy da tabela
-- referenciada. A policy da própria `opportunities` também não pega — a linha
-- inserida tem o dono certo. Quem barra é isto.

create or replace function public.check_contact_owner_matches()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.owner_id is distinct from
     (select p.owner_id from public.professionals p where p.id = new.professional_id) then
    raise exception
      'O contato e o profissional precisam pertencer ao mesmo admin'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

create or replace trigger z_contacts_check_owner
before insert or update on public.contacts
for each row execute function public.check_contact_owner_matches();

create or replace function public.check_opportunity_owner_matches()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.owner_id is distinct from
     (select p.owner_id from public.professionals p where p.id = new.professional_id) then
    raise exception
      'A oportunidade e o profissional precisam pertencer ao mesmo admin'
      using errcode = '42501';
  end if;

  if new.owner_id is distinct from
     (select s.owner_id from public.stores s where s.id = new.store_id) then
    raise exception
      'A oportunidade e a loja precisam pertencer ao mesmo admin'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

-- Roda depois de `prepare_opportunity`, que é BEFORE INSERT OR UPDATE também:
-- triggers de mesmo tipo disparam em ordem alfabética, e "check_" vem antes de
-- "prepare_". O nome com prefixo z garante que a checagem veja o valor final.
create or replace trigger z_opportunities_check_owner
before insert or update on public.opportunities
for each row execute function public.check_opportunity_owner_matches();

create or replace function public.check_contact_store_owner_matches()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid;
begin
  select c.owner_id into v_owner
  from public.contacts c
  where c.id = new.contact_id;

  if v_owner is distinct from
     (select s.owner_id from public.stores s where s.id = new.store_id) then
    raise exception
      'A loja apresentada precisa pertencer ao mesmo admin que registrou o contato'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

create or replace trigger z_contact_stores_check_owner
before insert or update on public.contact_stores
for each row execute function public.check_contact_store_owner_matches();

commit;

begin;

-- --------------------------------------------------------------------------
-- 6. POLICIES — "é admin" deixa de ser resposta
-- --------------------------------------------------------------------------
-- Toda policy administrativa recebe a mesma segunda condição: a linha precisa
-- ser do dono da sessão. As de leitura da loja não mudam de forma — continuam
-- presas a `current_store_id()`, e uma loja pertence a um admin só.
--
-- Os catálogos `segments` e `regions` ficam como estão: leitura para todo
-- autenticado, escrita para admin. São a taxonomia compartilhada, não dado de
-- ninguém.

drop policy if exists "stores_read" on public.stores;
drop policy if exists "stores_admin_insert" on public.stores;
drop policy if exists "stores_admin_update" on public.stores;
drop policy if exists "stores_admin_delete" on public.stores;

create policy "stores_read"
on public.stores for select
to authenticated
using (
  (
    (select public.is_admin())
    and owner_id = (select public.current_owner_id())
  )
  or id = (select public.current_store_id())
);

create policy "stores_admin_insert"
on public.stores for insert
to authenticated
with check (
  (select public.is_admin())
  and owner_id = (select public.current_owner_id())
);

create policy "stores_admin_update"
on public.stores for update
to authenticated
using (
  (select public.is_admin())
  and owner_id = (select public.current_owner_id())
)
with check (
  (select public.is_admin())
  and owner_id = (select public.current_owner_id())
);

create policy "stores_admin_delete"
on public.stores for delete
to authenticated
using (
  (select public.is_admin())
  and owner_id = (select public.current_owner_id())
);

-- Perfis. Ler o próprio perfil continua liberado — é assim que a aplicação
-- descobre papel e loja de quem acabou de entrar. O que some é o "admin lê
-- todos": agora ele lê os seus.
--
-- Perfil órfão (owner_id nulo, recém-criado pelo trigger de Auth) não aparece
-- para admin nenhum. É o que impede um admin de adotar o acesso que o outro
-- acabou de provisionar. A adoção legítima passa por claim_store_user().

drop policy if exists "user_profiles_read" on public.user_profiles;
drop policy if exists "user_profiles_admin_insert" on public.user_profiles;
drop policy if exists "user_profiles_admin_update" on public.user_profiles;
drop policy if exists "user_profiles_admin_delete" on public.user_profiles;

create policy "user_profiles_read"
on public.user_profiles for select
to authenticated
using (
  id = (select auth.uid())
  or (
    (select public.is_admin())
    and owner_id = (select public.current_owner_id())
  )
);

create policy "user_profiles_admin_insert"
on public.user_profiles for insert
to authenticated
with check (
  (select public.is_admin())
  and owner_id = (select public.current_owner_id())
);

create policy "user_profiles_admin_update"
on public.user_profiles for update
to authenticated
using (
  (select public.is_admin())
  and owner_id = (select public.current_owner_id())
)
with check (
  (select public.is_admin())
  and owner_id = (select public.current_owner_id())
);

create policy "user_profiles_admin_delete"
on public.user_profiles for delete
to authenticated
using (
  (select public.is_admin())
  and owner_id = (select public.current_owner_id())
);

-- Profissionais: a carteira. Segue admin-only, agora também dono-only.

drop policy if exists "professionals_admin_read" on public.professionals;
drop policy if exists "professionals_admin_insert" on public.professionals;
drop policy if exists "professionals_admin_update" on public.professionals;
drop policy if exists "professionals_admin_delete" on public.professionals;

create policy "professionals_admin_read"
on public.professionals for select
to authenticated
using (
  (select public.is_admin())
  and owner_id = (select public.current_owner_id())
);

create policy "professionals_admin_insert"
on public.professionals for insert
to authenticated
with check (
  (select public.is_admin())
  and owner_id = (select public.current_owner_id())
);

create policy "professionals_admin_update"
on public.professionals for update
to authenticated
using (
  (select public.is_admin())
  and owner_id = (select public.current_owner_id())
)
with check (
  (select public.is_admin())
  and owner_id = (select public.current_owner_id())
);

create policy "professionals_admin_delete"
on public.professionals for delete
to authenticated
using (
  (select public.is_admin())
  and owner_id = (select public.current_owner_id())
);

-- Vínculo profissional x região: sem coluna própria, o dono vem do
-- profissional. A região em si é catálogo compartilhado.

drop policy if exists "professional_regions_admin_read" on public.professional_regions;
drop policy if exists "professional_regions_admin_insert" on public.professional_regions;
drop policy if exists "professional_regions_admin_update" on public.professional_regions;
drop policy if exists "professional_regions_admin_delete" on public.professional_regions;

create policy "professional_regions_admin_read"
on public.professional_regions for select
to authenticated
using (
  (select public.is_admin())
  and exists (
    select 1
    from public.professionals p
    where p.id = professional_regions.professional_id
      and p.owner_id = (select public.current_owner_id())
  )
);

create policy "professional_regions_admin_insert"
on public.professional_regions for insert
to authenticated
with check (
  (select public.is_admin())
  and exists (
    select 1
    from public.professionals p
    where p.id = professional_regions.professional_id
      and p.owner_id = (select public.current_owner_id())
  )
);

create policy "professional_regions_admin_update"
on public.professional_regions for update
to authenticated
using (
  (select public.is_admin())
  and exists (
    select 1
    from public.professionals p
    where p.id = professional_regions.professional_id
      and p.owner_id = (select public.current_owner_id())
  )
)
with check (
  (select public.is_admin())
  and exists (
    select 1
    from public.professionals p
    where p.id = professional_regions.professional_id
      and p.owner_id = (select public.current_owner_id())
  )
);

create policy "professional_regions_admin_delete"
on public.professional_regions for delete
to authenticated
using (
  (select public.is_admin())
  and exists (
    select 1
    from public.professionals p
    where p.id = professional_regions.professional_id
      and p.owner_id = (select public.current_owner_id())
  )
);

-- Contatos e o snapshot de lojas apresentadas.

drop policy if exists "contacts_admin_read" on public.contacts;
drop policy if exists "contacts_admin_insert" on public.contacts;
drop policy if exists "contacts_admin_update" on public.contacts;
drop policy if exists "contacts_admin_delete" on public.contacts;

create policy "contacts_admin_read"
on public.contacts for select
to authenticated
using (
  (select public.is_admin())
  and owner_id = (select public.current_owner_id())
);

create policy "contacts_admin_insert"
on public.contacts for insert
to authenticated
with check (
  (select public.is_admin())
  and owner_id = (select public.current_owner_id())
);

create policy "contacts_admin_update"
on public.contacts for update
to authenticated
using (
  (select public.is_admin())
  and owner_id = (select public.current_owner_id())
)
with check (
  (select public.is_admin())
  and owner_id = (select public.current_owner_id())
);

create policy "contacts_admin_delete"
on public.contacts for delete
to authenticated
using (
  (select public.is_admin())
  and owner_id = (select public.current_owner_id())
);

drop policy if exists "contact_stores_admin_read" on public.contact_stores;
drop policy if exists "contact_stores_admin_insert" on public.contact_stores;
drop policy if exists "contact_stores_admin_update" on public.contact_stores;
drop policy if exists "contact_stores_admin_delete" on public.contact_stores;

create policy "contact_stores_admin_read"
on public.contact_stores for select
to authenticated
using (
  (select public.is_admin())
  and exists (
    select 1
    from public.contacts c
    where c.id = contact_stores.contact_id
      and c.owner_id = (select public.current_owner_id())
  )
);

-- As duas pontas são conferidas na escrita: o contato precisa ser meu E a loja
-- apresentada também. Sem a segunda metade, um admin marcaria a loja do outro
-- no próprio contato, e ela apareceria no alcance de quem não devia.
create policy "contact_stores_admin_insert"
on public.contact_stores for insert
to authenticated
with check (
  (select public.is_admin())
  and exists (
    select 1
    from public.contacts c
    where c.id = contact_stores.contact_id
      and c.owner_id = (select public.current_owner_id())
  )
  and exists (
    select 1
    from public.stores s
    where s.id = contact_stores.store_id
      and s.owner_id = (select public.current_owner_id())
  )
);

create policy "contact_stores_admin_update"
on public.contact_stores for update
to authenticated
using (
  (select public.is_admin())
  and exists (
    select 1
    from public.contacts c
    where c.id = contact_stores.contact_id
      and c.owner_id = (select public.current_owner_id())
  )
)
with check (
  (select public.is_admin())
  and exists (
    select 1
    from public.contacts c
    where c.id = contact_stores.contact_id
      and c.owner_id = (select public.current_owner_id())
  )
  and exists (
    select 1
    from public.stores s
    where s.id = contact_stores.store_id
      and s.owner_id = (select public.current_owner_id())
  )
);

create policy "contact_stores_admin_delete"
on public.contact_stores for delete
to authenticated
using (
  (select public.is_admin())
  and exists (
    select 1
    from public.contacts c
    where c.id = contact_stores.contact_id
      and c.owner_id = (select public.current_owner_id())
  )
);

-- Oportunidades. A loja continua entrando pela própria porta: leitura do que é
-- dela, e nada de escrita.

drop policy if exists "opportunities_read" on public.opportunities;
drop policy if exists "opportunities_admin_insert" on public.opportunities;
drop policy if exists "opportunities_admin_update" on public.opportunities;
drop policy if exists "opportunities_admin_delete" on public.opportunities;

create policy "opportunities_read"
on public.opportunities for select
to authenticated
using (
  (
    (select public.is_admin())
    and owner_id = (select public.current_owner_id())
  )
  or store_id = (select public.current_store_id())
);

create policy "opportunities_admin_insert"
on public.opportunities for insert
to authenticated
with check (
  (select public.is_admin())
  and owner_id = (select public.current_owner_id())
);

create policy "opportunities_admin_update"
on public.opportunities for update
to authenticated
using (
  (select public.is_admin())
  and owner_id = (select public.current_owner_id())
)
with check (
  (select public.is_admin())
  and owner_id = (select public.current_owner_id())
);

create policy "opportunities_admin_delete"
on public.opportunities for delete
to authenticated
using (
  (select public.is_admin())
  and owner_id = (select public.current_owner_id())
);

drop policy if exists "opportunity_history_read" on public.opportunity_status_history;

create policy "opportunity_history_read"
on public.opportunity_status_history for select
to authenticated
using (
  exists (
    select 1
    from public.opportunities o
    where o.id = opportunity_status_history.opportunity_id
      and (
        (
          (select public.is_admin())
          and o.owner_id = (select public.current_owner_id())
        )
        or o.store_id = (select public.current_store_id())
      )
  )
);

drop policy if exists "proposal_attachments_read" on public.proposal_attachments;
drop policy if exists "proposal_attachments_admin_insert" on public.proposal_attachments;
drop policy if exists "proposal_attachments_admin_update" on public.proposal_attachments;
drop policy if exists "proposal_attachments_admin_delete" on public.proposal_attachments;

create policy "proposal_attachments_read"
on public.proposal_attachments for select
to authenticated
using (
  exists (
    select 1
    from public.opportunities o
    where o.id = proposal_attachments.opportunity_id
      and (
        (
          (select public.is_admin())
          and o.owner_id = (select public.current_owner_id())
        )
        or o.store_id = (select public.current_store_id())
      )
  )
);

create policy "proposal_attachments_admin_insert"
on public.proposal_attachments for insert
to authenticated
with check (
  (select public.is_admin())
  and exists (
    select 1
    from public.opportunities o
    where o.id = proposal_attachments.opportunity_id
      and o.owner_id = (select public.current_owner_id())
  )
);

create policy "proposal_attachments_admin_update"
on public.proposal_attachments for update
to authenticated
using (
  (select public.is_admin())
  and exists (
    select 1
    from public.opportunities o
    where o.id = proposal_attachments.opportunity_id
      and o.owner_id = (select public.current_owner_id())
  )
)
with check (
  (select public.is_admin())
  and exists (
    select 1
    from public.opportunities o
    where o.id = proposal_attachments.opportunity_id
      and o.owner_id = (select public.current_owner_id())
  )
);

create policy "proposal_attachments_admin_delete"
on public.proposal_attachments for delete
to authenticated
using (
  (select public.is_admin())
  and exists (
    select 1
    from public.opportunities o
    where o.id = proposal_attachments.opportunity_id
      and o.owner_id = (select public.current_owner_id())
  )
);

-- --------------------------------------------------------------------------
-- 7. STORAGE — o PDF da proposta
-- --------------------------------------------------------------------------
-- Caminho: {loja}/{oportunidade}/{arquivo}.pdf. A pasta raiz é a loja, então o
-- recorte do admin sai dela: ele só alcança objeto cuja loja é sua.
--
-- A leitura da loja não muda: pasta igual à própria loja e oportunidade que
-- lhe pertence.
--
-- POR QUE UMA FUNÇÃO, E NÃO UM EXISTS DIRETO NA POLICY
--
-- A primeira versão consultava `public.stores` dentro da própria policy. A
-- expressão está certa — rodando como `authenticated` no SQL Editor ela devolve
-- true — mas pela API de Storage o admin parava de enxergar os próprios PDFs:
-- select virava "Object not found" e upload virava violação de RLS. O Storage
-- avalia a policy em um contexto onde a RLS de `public.stores` não resolve a
-- favor de quem chama, e o EXISTS caía para falso sem erro nenhum.
--
-- `owns_proposal_object` tira `stores` do caminho da policy: sendo SECURITY
-- DEFINER, ela resolve a dona da pasta como dona da tabela e devolve um
-- booleano. A pergunta "esta pasta é minha?" passa a ter uma resposta só, do
-- mesmo jeito em qualquer contexto.

create or replace function public.owns_proposal_object(p_name text)
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

revoke all on function public.owns_proposal_object(text) from public;
revoke all on function public.owns_proposal_object(text) from anon;
grant execute on function public.owns_proposal_object(text) to authenticated;

comment on function public.owns_proposal_object(text) is
'Diz se o objeto do bucket proposal-pdfs está na pasta de uma loja do dono da sessão. Usada pelas policies de storage.objects.';

drop policy if exists "proposal_pdfs_admin_select" on storage.objects;
drop policy if exists "proposal_pdfs_admin_insert" on storage.objects;
drop policy if exists "proposal_pdfs_admin_update" on storage.objects;
drop policy if exists "proposal_pdfs_admin_delete" on storage.objects;

create policy "proposal_pdfs_admin_select"
on storage.objects for select
to authenticated
using (
  bucket_id = 'proposal-pdfs'
  and (select public.is_admin())
  and (select public.owns_proposal_object(name))
);

create policy "proposal_pdfs_admin_insert"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'proposal-pdfs'
  and (select public.is_admin())
  and (select public.owns_proposal_object(name))
);

create policy "proposal_pdfs_admin_update"
on storage.objects for update
to authenticated
using (
  bucket_id = 'proposal-pdfs'
  and (select public.is_admin())
  and (select public.owns_proposal_object(name))
)
with check (
  bucket_id = 'proposal-pdfs'
  and (select public.is_admin())
  and (select public.owns_proposal_object(name))
);

create policy "proposal_pdfs_admin_delete"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'proposal-pdfs'
  and (select public.is_admin())
  and (select public.owns_proposal_object(name))
);

commit;

begin;

-- --------------------------------------------------------------------------
-- 8. LEITURAS DO ADMIN — o recorte agora é o dono, não "a HORN inteira"
-- --------------------------------------------------------------------------
-- Estas funções são SECURITY DEFINER: rodam como donas das tabelas e a RLS não
-- se aplica dentro delas. Era assim que o dashboard conseguia agregar sem
-- baixar a base para o JavaScript — e é exatamente por isso que cada uma
-- precisa refazer o recorte à mão. Uma função esquecida aqui devolveria os
-- números do outro admin com toda a autorização em ordem.
--
-- O padrão é o mesmo em todas: resolver `v_owner` uma vez, abortar se for
-- nulo, e filtrar por ele toda tabela com dono. `is_admin()` continua na porta;
-- o que mudou é que ele deixou de ser suficiente.

create or replace function public.get_admin_dashboard_metrics(
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_store_id uuid default null
)
returns table (
  professionals_contacted bigint,
  contact_events bigint,
  projects_received bigint,
  proposals_received bigint,
  proposals_sent bigint,
  proposals_closed bigint,
  proposals_lost bigint,
  total_proposed_value numeric,
  total_closed_value numeric,
  total_commission_value numeric,
  professionals_with_projects bigint
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

  -- Filtrar por uma loja alheia devolveria zero de qualquer forma, mas um erro
  -- explícito impede que o filtro vire um oráculo de "esta loja existe".
  if p_store_id is not null and not exists (
    select 1 from public.stores s
    where s.id = p_store_id and s.owner_id = v_owner
  ) then
    raise exception 'Not authorized';
  end if;

  return query
  with reach as (
    select
      count(distinct c.professional_id)::bigint as professionals_contacted,
      count(distinct c.id)::bigint as contact_events
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
  projects as (
    select
      count(*)::bigint as projects_received,
      count(distinct o.professional_id)::bigint as professionals_with_projects
    from public.opportunities o
    where o.owner_id = v_owner
      and (p_from is null or o.created_at >= p_from)
      and (p_to is null or o.created_at < p_to)
      and (p_store_id is null or o.store_id = p_store_id)
  ),
  received_ids as (
    select distinct h.opportunity_id
    from public.opportunity_status_history h
    join public.opportunities o on o.id = h.opportunity_id
    where o.owner_id = v_owner
      and h.to_status = 'proposal_received'::public.opportunity_status
      and (p_from is null or h.changed_at >= p_from)
      and (p_to is null or h.changed_at < p_to)
      and (p_store_id is null or o.store_id = p_store_id)
  ),
  sent_ids as (
    select distinct h.opportunity_id
    from public.opportunity_status_history h
    join public.opportunities o on o.id = h.opportunity_id
    where o.owner_id = v_owner
      and h.to_status = 'proposal_sent_to_professional'::public.opportunity_status
      and (p_from is null or h.changed_at >= p_from)
      and (p_to is null or h.changed_at < p_to)
      and (p_store_id is null or o.store_id = p_store_id)
  ),
  -- Fechou no período E CONTINUA fechado: contagem, valor e comissão saem do
  -- mesmo conjunto (a regra que a 0002 documenta).
  closed_ids as (
    select distinct h.opportunity_id
    from public.opportunity_status_history h
    join public.opportunities o on o.id = h.opportunity_id
    where o.owner_id = v_owner
      and h.to_status = 'closed'::public.opportunity_status
      and o.status = 'closed'::public.opportunity_status
      and (p_from is null or h.changed_at >= p_from)
      and (p_to is null or h.changed_at < p_to)
      and (p_store_id is null or o.store_id = p_store_id)
  ),
  lost_ids as (
    select distinct h.opportunity_id
    from public.opportunity_status_history h
    join public.opportunities o on o.id = h.opportunity_id
    where o.owner_id = v_owner
      and h.to_status = 'lost'::public.opportunity_status
      and o.status = 'lost'::public.opportunity_status
      and (p_from is null or h.changed_at >= p_from)
      and (p_to is null or h.changed_at < p_to)
      and (p_store_id is null or o.store_id = p_store_id)
  ),
  received_stats as (
    select count(*)::bigint as proposals_received from received_ids
  ),
  sent_stats as (
    select
      count(*)::bigint as proposals_sent,
      coalesce(sum(o.proposal_initial_value), 0::numeric) as total_proposed_value
    from sent_ids x
    join public.opportunities o on o.id = x.opportunity_id
  ),
  closed_stats as (
    select
      count(*)::bigint as proposals_closed,
      coalesce(sum(o.final_closed_value), 0::numeric) as total_closed_value,
      coalesce(sum(o.commission_value), 0::numeric) as total_commission_value
    from closed_ids x
    join public.opportunities o on o.id = x.opportunity_id
  ),
  lost_stats as (
    select count(*)::bigint as proposals_lost from lost_ids
  )
  select
    coalesce(reach.professionals_contacted, 0),
    coalesce(reach.contact_events, 0),
    coalesce(projects.projects_received, 0),
    coalesce(received_stats.proposals_received, 0),
    coalesce(sent_stats.proposals_sent, 0),
    coalesce(closed_stats.proposals_closed, 0),
    coalesce(lost_stats.proposals_lost, 0),
    coalesce(sent_stats.total_proposed_value, 0::numeric),
    coalesce(closed_stats.total_closed_value, 0::numeric),
    coalesce(closed_stats.total_commission_value, 0::numeric),
    coalesce(projects.professionals_with_projects, 0)
  from reach
  cross join projects
  cross join received_stats
  cross join sent_stats
  cross join closed_stats
  cross join lost_stats;
end;
$$;

create or replace function public.get_admin_portfolio_totals()
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
      where p.owner_id = v_owner)::bigint,
    (select count(*) from public.professionals p
      where p.owner_id = v_owner and p.is_active)::bigint,
    (select count(*) from public.professionals p
      where p.owner_id = v_owner and not p.is_active)::bigint,
    (
      select count(*)
      from public.professionals p
      where p.owner_id = v_owner
        and p.is_active
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
        and p.is_active
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
$$;

-- Segmentos e regiões continuam sendo o catálogo inteiro — a linha com zero
-- existe para o gráfico não mudar de forma. O que passa a ser recortado é a
-- contagem: cada admin conta os profissionais dele.

create or replace function public.get_admin_professionals_by_segment()
returns table (
  segment_id uuid,
  segment_name text,
  sort_order integer,
  active_count bigint,
  total_count bigint
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

  return query
  select
    s.id,
    s.name,
    s.sort_order,
    count(p.id) filter (where p.is_active)::bigint,
    count(p.id)::bigint
  from public.segments s
  left join public.professionals p
    on p.segment_id = s.id
   and p.owner_id = v_owner
  group by s.id, s.name, s.sort_order
  order by s.sort_order, s.name;
end;
$$;

create or replace function public.get_admin_professionals_by_region()
returns table (
  region_id uuid,
  region_name text,
  sort_order integer,
  active_count bigint,
  total_count bigint
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

  return query
  select
    r.id,
    r.name,
    r.sort_order,
    count(p.id) filter (where p.is_active)::bigint,
    count(p.id)::bigint
  from public.regions r
  left join public.professional_regions pr on pr.region_id = r.id
  left join public.professionals p
    on p.id = pr.professional_id
   and p.owner_id = v_owner
  group by r.id, r.name, r.sort_order
  order by r.sort_order, r.name;
end;
$$;

create or replace function public.get_admin_store_results(
  p_from timestamptz default null,
  p_to timestamptz default null
)
returns table (
  store_id uuid,
  store_name text,
  is_active boolean,
  professionals_reached bigint,
  projects_received bigint,
  proposals_sent bigint,
  deals_closed bigint,
  total_closed_value numeric,
  total_commission_value numeric
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

  return query
  with reach as (
    select
      cs.store_id,
      count(distinct c.professional_id)::bigint as professionals_reached
    from public.contact_stores cs
    join public.contacts c on c.id = cs.contact_id
    where c.owner_id = v_owner
      and (p_from is null or c.contacted_at >= p_from)
      and (p_to is null or c.contacted_at < p_to)
    group by cs.store_id
  ),
  projects as (
    select
      o.store_id,
      count(*)::bigint as projects_received
    from public.opportunities o
    where o.owner_id = v_owner
      and (p_from is null or o.created_at >= p_from)
      and (p_to is null or o.created_at < p_to)
    group by o.store_id
  ),
  sent as (
    select
      o.store_id,
      count(distinct o.id)::bigint as proposals_sent
    from public.opportunity_status_history h
    join public.opportunities o on o.id = h.opportunity_id
    where o.owner_id = v_owner
      and h.to_status = 'proposal_sent_to_professional'::public.opportunity_status
      and (p_from is null or h.changed_at >= p_from)
      and (p_to is null or h.changed_at < p_to)
    group by o.store_id
  ),
  closed as (
    select
      o.store_id,
      count(distinct o.id)::bigint as deals_closed,
      coalesce(sum(o.final_closed_value), 0::numeric) as total_closed_value,
      coalesce(sum(o.commission_value), 0::numeric) as total_commission_value
    from (
      select distinct h.opportunity_id
      from public.opportunity_status_history h
      where h.to_status = 'closed'::public.opportunity_status
        and (p_from is null or h.changed_at >= p_from)
        and (p_to is null or h.changed_at < p_to)
    ) x
    join public.opportunities o on o.id = x.opportunity_id
    where o.owner_id = v_owner
      and o.status = 'closed'::public.opportunity_status
    group by o.store_id
  )
  select
    s.id,
    s.name,
    s.is_active,
    coalesce(reach.professionals_reached, 0),
    coalesce(projects.projects_received, 0),
    coalesce(sent.proposals_sent, 0),
    coalesce(closed.deals_closed, 0),
    coalesce(closed.total_closed_value, 0::numeric),
    coalesce(closed.total_commission_value, 0::numeric)
  from public.stores s
  left join reach on reach.store_id = s.id
  left join projects on projects.store_id = s.id
  left join sent on sent.store_id = s.id
  left join closed on closed.store_id = s.id
  where s.owner_id = v_owner
  order by
    coalesce(closed.total_commission_value, 0::numeric) desc,
    coalesce(closed.total_closed_value, 0::numeric) desc,
    s.name;
end;
$$;

create or replace function public.get_admin_activity_timeseries(
  p_from timestamptz,
  p_to timestamptz,
  p_bucket text default 'day',
  p_store_id uuid default null
)
returns table (
  bucket_start timestamptz,
  professionals_contacted bigint,
  projects_received bigint,
  deals_closed bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_unit text;
  v_owner uuid;
  v_zone constant text := 'America/Sao_Paulo';
begin
  if not coalesce((select public.is_admin()), false) then
    raise exception 'Not authorized';
  end if;

  v_owner := (select public.current_owner_id());
  if v_owner is null then
    raise exception 'Not authorized';
  end if;

  if p_store_id is not null and not exists (
    select 1 from public.stores s
    where s.id = p_store_id and s.owner_id = v_owner
  ) then
    raise exception 'Not authorized';
  end if;

  -- Nunca interpolar o parâmetro direto no date_trunc.
  v_unit := case when p_bucket = 'month' then 'month' else 'day' end;

  return query
  with buckets as (
    select generate_series(
      date_trunc(v_unit, p_from at time zone v_zone),
      date_trunc(v_unit, (p_to - interval '1 microsecond') at time zone v_zone),
      case when v_unit = 'month' then interval '1 month' else interval '1 day' end
    ) as local_start
  ),
  contacted as (
    select
      date_trunc(v_unit, c.contacted_at at time zone v_zone) as local_start,
      count(distinct c.professional_id)::bigint as total
    from public.contacts c
    where c.owner_id = v_owner
      and c.contacted_at >= p_from
      and c.contacted_at < p_to
      and (
        p_store_id is null
        or exists (
          select 1
          from public.contact_stores cs
          where cs.contact_id = c.id
            and cs.store_id = p_store_id
        )
      )
    group by 1
  ),
  projects as (
    select
      date_trunc(v_unit, o.created_at at time zone v_zone) as local_start,
      count(*)::bigint as total
    from public.opportunities o
    where o.owner_id = v_owner
      and o.created_at >= p_from
      and o.created_at < p_to
      and (p_store_id is null or o.store_id = p_store_id)
    group by 1
  ),
  closed as (
    select
      date_trunc(v_unit, h.changed_at at time zone v_zone) as local_start,
      count(distinct h.opportunity_id)::bigint as total
    from public.opportunity_status_history h
    join public.opportunities o on o.id = h.opportunity_id
    where o.owner_id = v_owner
      and h.to_status = 'closed'::public.opportunity_status
      and o.status = 'closed'::public.opportunity_status
      and h.changed_at >= p_from
      and h.changed_at < p_to
      and (p_store_id is null or o.store_id = p_store_id)
    group by 1
  )
  select
    (b.local_start at time zone v_zone) as bucket_start,
    coalesce(contacted.total, 0),
    coalesce(projects.total, 0),
    coalesce(closed.total, 0)
  from buckets b
  left join contacted on contacted.local_start = b.local_start
  left join projects on projects.local_start = b.local_start
  left join closed on closed.local_start = b.local_start
  order by b.local_start;
end;
$$;

-- --------------------------------------------------------------------------
-- 9. ALCANCE — a "HORN inteira" agora é a HORN de um admin
-- --------------------------------------------------------------------------
-- A decisão de 17/08 (migration 0005) manda mostrar à loja o alcance completo
-- do trabalho da HORN, e não só os contatos em que ela foi marcada. Com dois
-- administradores, "completo" passa a significar o trabalho do admin que
-- representa aquela loja. Sem esse recorte, o dashboard da loja seria
-- exatamente o vazamento que esta migration existe para impedir.

create or replace function public.get_store_reach_breakdown(
  p_store_id uuid,
  p_from timestamptz default null,
  p_to timestamptz default null
)
returns table (
  kind text,
  label text,
  sort_order integer,
  professionals bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_store uuid;
  v_owner uuid;
begin
  v_store := (select public.current_store_id());
  v_owner := (select public.current_owner_id());

  if v_owner is null then
    raise exception 'Not authorized';
  end if;

  -- Admin consulta qualquer loja SUA; usuário de loja, só a própria.
  if not (
    (
      coalesce((select public.is_admin()), false)
      and exists (
        select 1 from public.stores s
        where s.id = p_store_id and s.owner_id = v_owner
      )
    )
    or (v_store is not null and p_store_id = v_store)
  ) then
    raise exception 'Not authorized';
  end if;

  return query
  with reached as (
    select distinct c.professional_id
    from public.contact_stores cs
    join public.contacts c on c.id = cs.contact_id
    where cs.store_id = p_store_id
      and c.owner_id = v_owner
      and (p_from is null or c.contacted_at >= p_from)
      and (p_to is null or c.contacted_at < p_to)
  )
  select
    'segment'::text,
    s.name,
    s.sort_order,
    count(distinct p.id)::bigint
  from public.segments s
  left join public.professionals p on p.segment_id = s.id
  left join reached x on x.professional_id = p.id
  where x.professional_id is not null
  group by s.name, s.sort_order

  union all

  select
    'region'::text,
    r.name,
    r.sort_order,
    count(distinct p.id)::bigint
  from public.regions r
  left join public.professional_regions pr on pr.region_id = r.id
  left join public.professionals p on p.id = pr.professional_id
  left join reached x on x.professional_id = p.id
  where x.professional_id is not null
  group by r.name, r.sort_order

  order by 1, 3, 2;
end;
$$;

create or replace function public.get_horn_reach_breakdown(
  p_from timestamptz default null,
  p_to timestamptz default null
)
returns table (
  kind text,
  label text,
  sort_order integer,
  professionals bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_owner uuid;
begin
  -- `current_owner_id()` já é o portão: só responde para perfil ativo, e
  -- devolve o dono da loja quando quem chama é usuário de loja.
  v_owner := (select public.current_owner_id());

  if v_owner is null then
    raise exception 'Not authorized';
  end if;

  return query
  with reached as (
    select distinct c.professional_id
    from public.contacts c
    where c.owner_id = v_owner
      and (p_from is null or c.contacted_at >= p_from)
      and (p_to is null or c.contacted_at < p_to)
  )
  select
    'segment'::text,
    s.name,
    s.sort_order,
    count(distinct p.id)::bigint
  from public.segments s
  left join public.professionals p on p.segment_id = s.id
  left join reached x on x.professional_id = p.id
  where x.professional_id is not null
  group by s.name, s.sort_order

  union all

  select
    'region'::text,
    r.name,
    r.sort_order,
    count(distinct p.id)::bigint
  from public.regions r
  left join public.professional_regions pr on pr.region_id = r.id
  left join public.professionals p on p.id = pr.professional_id
  left join reached x on x.professional_id = p.id
  where x.professional_id is not null
  group by r.name, r.sort_order

  order by 1, 3, 2;
end;
$$;

-- KPIs da loja. O `cross join` com a loja da sessão vira um join pelo dono:
-- continua sendo o portão de autorização (sem loja ativa, nenhuma linha) e
-- passa a ser também o recorte do alcance.

create or replace function public.get_store_dashboard_metrics(
  p_from timestamptz default null,
  p_to timestamptz default null
)
returns table (
  professionals_contacted bigint,
  contact_events bigint,
  projects_received bigint,
  proposals_received bigint,
  proposals_sent bigint,
  proposals_closed bigint,
  proposals_lost bigint,
  total_proposed_value numeric,
  total_closed_value numeric,
  total_commission_value numeric
)
language sql
stable
security definer
set search_path = ''
as $$
  with current_store as (
    select up.store_id, s.owner_id
    from public.user_profiles up
    join public.stores s on s.id = up.store_id
    where up.id = (select auth.uid())
      and up.role = 'store'::public.app_role
      and up.is_active = true
    limit 1
  ),
  reach as (
    -- Alcance = todo o trabalho do admin que representa esta loja, sem recorte
    -- por loja. Sem loja ativa a CTE não produz linha e os KPIs saem zerados.
    select
      count(distinct c.professional_id)::bigint as professionals_contacted,
      count(distinct c.id)::bigint as contact_events
    from current_store cs0
    join public.contacts c on c.owner_id = cs0.owner_id
    where (p_from is null or c.contacted_at >= p_from)
      and (p_to is null or c.contacted_at < p_to)
  ),
  projects as (
    select count(*)::bigint as projects_received
    from current_store cs0
    join public.opportunities o on o.store_id = cs0.store_id
    where (p_from is null or o.created_at >= p_from)
      and (p_to is null or o.created_at < p_to)
  ),
  received_ids as (
    select distinct h.opportunity_id
    from current_store cs0
    join public.opportunities o on o.store_id = cs0.store_id
    join public.opportunity_status_history h on h.opportunity_id = o.id
    where h.to_status = 'proposal_received'::public.opportunity_status
      and (p_from is null or h.changed_at >= p_from)
      and (p_to is null or h.changed_at < p_to)
  ),
  sent_ids as (
    select distinct h.opportunity_id
    from current_store cs0
    join public.opportunities o on o.store_id = cs0.store_id
    join public.opportunity_status_history h on h.opportunity_id = o.id
    where h.to_status = 'proposal_sent_to_professional'::public.opportunity_status
      and (p_from is null or h.changed_at >= p_from)
      and (p_to is null or h.changed_at < p_to)
  ),
  closed_ids as (
    select distinct h.opportunity_id
    from current_store cs0
    join public.opportunities o on o.store_id = cs0.store_id
    join public.opportunity_status_history h on h.opportunity_id = o.id
    where h.to_status = 'closed'::public.opportunity_status
      and o.status = 'closed'::public.opportunity_status
      and (p_from is null or h.changed_at >= p_from)
      and (p_to is null or h.changed_at < p_to)
  ),
  lost_ids as (
    select distinct h.opportunity_id
    from current_store cs0
    join public.opportunities o on o.store_id = cs0.store_id
    join public.opportunity_status_history h on h.opportunity_id = o.id
    where h.to_status = 'lost'::public.opportunity_status
      and o.status = 'lost'::public.opportunity_status
      and (p_from is null or h.changed_at >= p_from)
      and (p_to is null or h.changed_at < p_to)
  ),
  received_stats as (
    select count(*)::bigint as proposals_received
    from received_ids
  ),
  sent_stats as (
    select
      count(*)::bigint as proposals_sent,
      coalesce(sum(o.proposal_initial_value), 0::numeric) as total_proposed_value
    from sent_ids x
    join public.opportunities o on o.id = x.opportunity_id
  ),
  closed_stats as (
    select
      count(*)::bigint as proposals_closed,
      coalesce(sum(o.final_closed_value), 0::numeric) as total_closed_value,
      coalesce(sum(o.commission_value), 0::numeric) as total_commission_value
    from closed_ids x
    join public.opportunities o on o.id = x.opportunity_id
  ),
  lost_stats as (
    select count(*)::bigint as proposals_lost
    from lost_ids
  )
  select
    coalesce(reach.professionals_contacted, 0),
    coalesce(reach.contact_events, 0),
    coalesce(projects.projects_received, 0),
    coalesce(received_stats.proposals_received, 0),
    coalesce(sent_stats.proposals_sent, 0),
    coalesce(closed_stats.proposals_closed, 0),
    coalesce(lost_stats.proposals_lost, 0),
    coalesce(sent_stats.total_proposed_value, 0::numeric),
    coalesce(closed_stats.total_closed_value, 0::numeric),
    coalesce(closed_stats.total_commission_value, 0::numeric)
  from reach
  cross join projects
  cross join received_stats
  cross join sent_stats
  cross join closed_stats
  cross join lost_stats;
$$;

-- Lista de profissionais alcançados, na visão da loja. Mesmo recorte: os
-- contatos do admin que representa a loja. Continua sem telefone, e-mail,
-- Instagram, endereço, observações — e sem revelar quais lojas foram
-- apresentadas em cada contato.

create or replace function public.get_store_contact_reach(
  p_from timestamptz default null,
  p_to timestamptz default null
)
returns table (
  contact_id uuid,
  professional_id uuid,
  professional_name text,
  segment_name text,
  regions text[],
  contacted_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    c.id as contact_id,
    p.id as professional_id,
    p.name as professional_name,
    s.name as segment_name,
    coalesce(
      array_agg(distinct r.name order by r.name)
        filter (where r.name is not null),
      array[]::text[]
    ) as regions,
    c.contacted_at
  from public.user_profiles up
  join public.stores st
    on st.id = up.store_id
  join public.contacts c
    on c.owner_id = st.owner_id
  join public.professionals p
    on p.id = c.professional_id
  join public.segments s
    on s.id = p.segment_id
  left join public.professional_regions pr
    on pr.professional_id = p.id
  left join public.regions r
    on r.id = pr.region_id
  where up.id = (select auth.uid())
    and up.role = 'store'::public.app_role
    and up.is_active = true
    and (p_from is null or c.contacted_at >= p_from)
    and (p_to is null or c.contacted_at < p_to)
  group by c.id, p.id, p.name, s.name, c.contacted_at
  order by c.contacted_at desc;
$$;

-- --------------------------------------------------------------------------
-- 10. ACESSOS DE LOJA
-- --------------------------------------------------------------------------

-- O painel de acessos passa a listar só os acessos das lojas de quem consulta.
create or replace function public.get_store_access_summary()
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
    and up.owner_id = (select public.current_owner_id())
  order by up.created_at;
$$;

comment on function public.get_store_access_summary() is
'Acessos de loja provisionados nas lojas do admin que consulta, com o e-mail vindo de auth.users.';

-- Adoção do perfil recém-criado pelo trigger de Auth.
--
-- Por que existe: `handle_new_auth_user` roda sem sessão (quem cria a conta é
-- a chave secreta, e `auth.uid()` é nulo lá dentro), então o perfil nasce sem
-- dono. Pela nova policy, um perfil sem dono não é visível nem editável por
-- admin nenhum — o que fecha o sequestro, mas também fecharia o caminho
-- legítimo. Esta função é esse caminho, e ela sozinha decide de quem é o
-- acesso.
--
-- O UPDATE exige `owner_id is null` na própria condição: se dois admins
-- tentarem adotar o mesmo perfil, o segundo não encontra linha e recebe erro,
-- em vez de sobrescrever o vínculo do primeiro.

create or replace function public.claim_store_user(
  p_user_id uuid,
  p_store_id uuid,
  p_full_name text default null
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_owner uuid;
  v_store_name text;
  v_claimed integer;
begin
  if not coalesce((select public.is_admin()), false) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  v_owner := (select public.current_owner_id());
  if v_owner is null then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  select s.name into v_store_name
  from public.stores s
  where s.id = p_store_id
    and s.owner_id = v_owner;

  if v_store_name is null then
    raise exception 'Loja não encontrada' using errcode = 'P0002';
  end if;

  update public.user_profiles up
     set full_name = coalesce(nullif(btrim(coalesce(p_full_name, '')), ''), v_store_name),
         role = 'store'::public.app_role,
         store_id = p_store_id,
         owner_id = v_owner,
         is_active = true
   where up.id = p_user_id
     and up.owner_id is null
     and up.store_id is null;

  get diagnostics v_claimed = row_count;

  if v_claimed = 0 then
    raise exception 'Este acesso já foi configurado' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.claim_store_user(uuid, uuid, text) from public;
revoke all on function public.claim_store_user(uuid, uuid, text) from anon;
grant execute on function public.claim_store_user(uuid, uuid, text) to authenticated;

comment on function public.claim_store_user(uuid, uuid, text) is
'Vincula um perfil recém-criado pelo trigger de Auth a uma loja do admin que chama. Reivindicação única: um perfil já adotado não pode ser tomado pelo outro admin.';

-- --------------------------------------------------------------------------
-- 11. REGISTRO DE CONTATO
-- --------------------------------------------------------------------------
-- Os triggers da seção 5 já recusariam profissional ou loja de outro dono. A
-- checagem explícita aqui existe pela mensagem: o admin precisa entender que
-- selecionou algo que não é dele, não receber "erro ao gravar".

create or replace function public.register_contact(
  p_professional_id uuid,
  p_channel public.contact_channel,
  p_store_ids uuid[],
  p_contacted_at timestamptz default now(),
  p_notes text default null
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_contact_id uuid;
  v_owner uuid;
begin
  if not (select public.is_admin()) then
    raise exception 'Not authorized';
  end if;

  v_owner := (select public.current_owner_id());
  if v_owner is null then
    raise exception 'Not authorized';
  end if;

  if p_store_ids is null or cardinality(p_store_ids) = 0 then
    raise exception 'At least one presented store must be selected';
  end if;

  if not exists (
    select 1 from public.professionals p
    where p.id = p_professional_id and p.owner_id = v_owner
  ) then
    raise exception 'Profissional não encontrado na sua carteira'
      using errcode = 'P0002';
  end if;

  if exists (
    select 1
    from unnest(p_store_ids) as x(store_id)
    where not exists (
      select 1 from public.stores s
      where s.id = x.store_id and s.owner_id = v_owner
    )
  ) then
    raise exception 'Uma das lojas selecionadas não é sua'
      using errcode = 'P0002';
  end if;

  insert into public.contacts (
    professional_id,
    contacted_at,
    channel,
    notes
  ) values (
    p_professional_id,
    coalesce(p_contacted_at, now()),
    p_channel,
    p_notes
  )
  returning id into v_contact_id;

  insert into public.contact_stores (contact_id, store_id)
  select v_contact_id, x.store_id
  from (
    select distinct unnest(p_store_ids) as store_id
  ) x;

  return v_contact_id;
end;
$$;

revoke all on function
  public.register_contact(uuid, public.contact_channel, uuid[], timestamptz, text) from public;
revoke all on function
  public.register_contact(uuid, public.contact_channel, uuid[], timestamptz, text) from anon;
grant execute on function
  public.register_contact(uuid, public.contact_channel, uuid[], timestamptz, text) to authenticated;

-- --------------------------------------------------------------------------
-- 12. FUNÇÕES QUE **NÃO** MUDAM, E POR QUÊ
-- --------------------------------------------------------------------------
-- get_store_opportunities, get_store_opportunities_page e
-- get_store_opportunity_professionals já derivam tudo de `store_id` do perfil
-- autenticado, e uma loja pertence a um único admin — o recorte por dono já é
-- consequência do recorte por loja.
--
-- save_professional (0001) é SECURITY INVOKER: o INSERT recebe dono pelo
-- trigger e o UPDATE é filtrado pela RLS, que agora exige dono. Tentar editar o
-- profissional do outro admin não encontra linha e cai no
-- 'Professional not found or not permitted' que a função já levanta.
--
-- is_admin() e current_store_id() continuam iguais. Elas respondem "que papel"
-- e "qual loja"; "de quem é o dado" é pergunta nova, e tem função própria.

-- --------------------------------------------------------------------------
-- 13. O SEGUNDO ADMIN
-- --------------------------------------------------------------------------
-- A conta de Auth já existe (conferida na seção 0). Aqui ela vira admin ativo,
-- dono de si mesmo e de nada mais: nenhuma loja, nenhum profissional, nenhum
-- contato. A base começa vazia, que é exatamente o ponto.

insert into public.user_profiles (id, full_name, role, store_id, is_active, owner_id)
values (
  'ba0b21c1-fca4-4cf3-96cb-79b4cefd9146',
  'Contatos HORN',
  'admin'::public.app_role,
  null,
  true,
  'ba0b21c1-fca4-4cf3-96cb-79b4cefd9146'
)
on conflict (id) do update
set role = 'admin'::public.app_role,
    store_id = null,
    is_active = true,
    owner_id = excluded.id;

commit;
