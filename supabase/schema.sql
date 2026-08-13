-- ============================================================================
-- HORN - Supabase/PostgreSQL schema for MVP
-- Generated from: HORN_PROJECT_SPEC_MVP.md
-- Date: 2026-08-13
--
-- Purpose:
--   Database schema, constraints, RLS, auth profile bootstrap, status history,
--   commission calculation, proposal PDF storage policies, and safe store-facing
--   read functions for the HORN representation-management MVP.
--
-- IMPORTANT PRODUCT RULES ENFORCED/REFLECTED HERE:
--   1. Registering a professional does NOT mean the professional was contacted.
--   2. Contacts are historical events, not a permanent boolean.
--   3. A contact can expose multiple stores and preserves that snapshot.
--   4. Each opportunity belongs to exactly one professional and one store.
--   5. Proposal movement, negotiation, acceptance and refusal happen OUTSIDE
--      the platform. The platform only records the resulting status manually.
--   6. Initial proposal value and final closed value are different fields.
--   7. Commission is calculated only from the final closed value.
--   8. Store users are read-only and isolated to their own commercial data.
--
-- Run this in the Supabase SQL Editor on a NEW/EMPTY project.
-- ============================================================================

begin;

-- --------------------------------------------------------------------------
-- 1. ENUMS
-- --------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_type where typname = 'app_role') then
    create type public.app_role as enum ('admin', 'store');
  end if;

  if not exists (select 1 from pg_type where typname = 'contact_channel') then
    create type public.contact_channel as enum (
      'whatsapp',
      'phone',
      'instagram',
      'email',
      'other'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'opportunity_status') then
    create type public.opportunity_status as enum (
      'project_received',
      'waiting_store_proposal',
      'proposal_received',
      'proposal_sent_to_professional',
      'negotiating',
      'closed',
      'lost'
    );
  end if;
end
$$;

-- --------------------------------------------------------------------------
-- 2. CATALOGS AND CORE TABLES
-- --------------------------------------------------------------------------

create table if not exists public.segments (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null unique,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint segments_slug_not_blank check (btrim(slug) <> ''),
  constraint segments_name_not_blank check (btrim(name) <> '')
);

create table if not exists public.regions (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null unique,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint regions_slug_not_blank check (btrim(slug) <> ''),
  constraint regions_name_not_blank check (btrim(name) <> '')
);

create table if not exists public.stores (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text,
  contact_name text,
  phone text,
  is_active boolean not null default true,
  monthly_fixed_fee numeric(14,2),
  default_commission_percent numeric(5,2),
  start_date date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint stores_name_not_blank check (btrim(name) <> ''),
  constraint stores_monthly_fixed_fee_nonnegative
    check (monthly_fixed_fee is null or monthly_fixed_fee >= 0),
  constraint stores_commission_range
    check (
      default_commission_percent is null
      or (default_commission_percent >= 0 and default_commission_percent <= 100)
    )
);

create table if not exists public.user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  role public.app_role not null default 'store',
  store_id uuid references public.stores(id) on delete restrict,
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_profiles_role_store_consistency check (
    (role = 'admin' and store_id is null)
    or
    (role = 'store' and (is_active = false or store_id is not null))
  )
);

create table if not exists public.professionals (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  segment_id uuid not null references public.segments(id) on delete restrict,
  email text,
  instagram text,
  phone text,
  address text,
  postal_code text,
  city text,
  state text,
  birthday_day smallint,
  birthday_month smallint,
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint professionals_name_not_blank check (btrim(name) <> ''),
  constraint professionals_birthday_day_range
    check (birthday_day is null or birthday_day between 1 and 31),
  constraint professionals_birthday_month_range
    check (birthday_month is null or birthday_month between 1 and 12),
  constraint professionals_birthday_pair check (
    (birthday_day is null and birthday_month is null)
    or
    (birthday_day is not null and birthday_month is not null)
  )
);

create table if not exists public.professional_regions (
  professional_id uuid not null references public.professionals(id) on delete cascade,
  region_id uuid not null references public.regions(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (professional_id, region_id)
);

create table if not exists public.contacts (
  id uuid primary key default gen_random_uuid(),
  professional_id uuid not null references public.professionals(id) on delete restrict,
  contacted_at timestamptz not null default now(),
  channel public.contact_channel not null,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Historical snapshot of the stores/brands presented in each contact.
-- This must NOT be recalculated from the current active stores later.
create table if not exists public.contact_stores (
  contact_id uuid not null references public.contacts(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (contact_id, store_id)
);

create table if not exists public.opportunities (
  id uuid primary key default gen_random_uuid(),
  professional_id uuid not null references public.professionals(id) on delete restrict,
  store_id uuid not null references public.stores(id) on delete restrict,
  title text,
  notes text,
  status public.opportunity_status not null default 'project_received',
  proposal_initial_value numeric(14,2),
  final_closed_value numeric(14,2),
  commission_percent numeric(5,2),
  commission_value numeric(14,2) generated always as (
    case
      when status = 'closed'
        and final_closed_value is not null
        and commission_percent is not null
      then round((final_closed_value * commission_percent / 100.0)::numeric, 2)
      else null
    end
  ) stored,
  loss_reason text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint opportunities_title_not_blank
    check (title is null or btrim(title) <> ''),
  constraint opportunities_initial_value_nonnegative
    check (proposal_initial_value is null or proposal_initial_value >= 0),
  constraint opportunities_final_value_nonnegative
    check (final_closed_value is null or final_closed_value >= 0),
  constraint opportunities_commission_range check (
    commission_percent is null
    or (commission_percent >= 0 and commission_percent <= 100)
  )
);

create table if not exists public.opportunity_status_history (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references public.opportunities(id) on delete cascade,
  from_status public.opportunity_status,
  to_status public.opportunity_status not null,
  changed_at timestamptz not null default now(),
  changed_by uuid references auth.users(id) on delete set null
);

create table if not exists public.proposal_attachments (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references public.opportunities(id) on delete cascade,
  storage_path text not null unique,
  file_name text not null,
  mime_type text not null default 'application/pdf',
  size_bytes bigint,
  uploaded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint proposal_attachments_path_not_blank check (btrim(storage_path) <> ''),
  constraint proposal_attachments_name_not_blank check (btrim(file_name) <> ''),
  constraint proposal_attachments_pdf_only check (mime_type = 'application/pdf'),
  constraint proposal_attachments_size_nonnegative check (size_bytes is null or size_bytes >= 0)
);

-- --------------------------------------------------------------------------
-- 3. INDEXES
-- --------------------------------------------------------------------------

create index if not exists user_profiles_role_idx
  on public.user_profiles(role, is_active);

create index if not exists user_profiles_store_idx
  on public.user_profiles(store_id)
  where store_id is not null;

create index if not exists stores_active_idx
  on public.stores(is_active);

create index if not exists professionals_name_lower_idx
  on public.professionals(lower(name));

create index if not exists professionals_segment_idx
  on public.professionals(segment_id);

create index if not exists professionals_active_idx
  on public.professionals(is_active);

create index if not exists professional_regions_region_idx
  on public.professional_regions(region_id, professional_id);

create index if not exists contacts_professional_date_idx
  on public.contacts(professional_id, contacted_at desc);

create index if not exists contacts_date_idx
  on public.contacts(contacted_at desc);

create index if not exists contact_stores_store_contact_idx
  on public.contact_stores(store_id, contact_id);

create index if not exists opportunities_store_status_idx
  on public.opportunities(store_id, status);

create index if not exists opportunities_store_created_idx
  on public.opportunities(store_id, created_at desc);

create index if not exists opportunities_professional_idx
  on public.opportunities(professional_id, created_at desc);

create index if not exists opportunity_history_opportunity_date_idx
  on public.opportunity_status_history(opportunity_id, changed_at desc);

create index if not exists opportunity_history_status_date_idx
  on public.opportunity_status_history(to_status, changed_at desc);

create index if not exists proposal_attachments_opportunity_idx
  on public.proposal_attachments(opportunity_id, created_at desc);

-- --------------------------------------------------------------------------
-- 4. GENERIC UPDATED_AT TRIGGER
-- --------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create or replace trigger segments_set_updated_at
before update on public.segments
for each row execute function public.set_updated_at();

create or replace trigger regions_set_updated_at
before update on public.regions
for each row execute function public.set_updated_at();

create or replace trigger stores_set_updated_at
before update on public.stores
for each row execute function public.set_updated_at();

create or replace trigger user_profiles_set_updated_at
before update on public.user_profiles
for each row execute function public.set_updated_at();

create or replace trigger professionals_set_updated_at
before update on public.professionals
for each row execute function public.set_updated_at();

create or replace trigger contacts_set_updated_at
before update on public.contacts
for each row execute function public.set_updated_at();

create or replace trigger opportunities_set_updated_at
before update on public.opportunities
for each row execute function public.set_updated_at();

-- Fill actor IDs automatically when the request is authenticated.
create or replace function public.set_created_by_if_null()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.created_by is null then
    new.created_by := (select auth.uid());
  end if;
  return new;
end;
$$;

create or replace function public.set_uploaded_by_if_null()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.uploaded_by is null then
    new.uploaded_by := (select auth.uid());
  end if;
  return new;
end;
$$;

create or replace trigger contacts_set_created_by
before insert on public.contacts
for each row execute function public.set_created_by_if_null();

create or replace trigger opportunities_set_created_by
before insert on public.opportunities
for each row execute function public.set_created_by_if_null();

create or replace trigger proposal_attachments_set_uploaded_by
before insert on public.proposal_attachments
for each row execute function public.set_uploaded_by_if_null();

-- --------------------------------------------------------------------------
-- 5. AUTH PROFILE BOOTSTRAP
-- --------------------------------------------------------------------------
-- New Auth users receive an INACTIVE store profile by default.
-- This intentionally avoids trusting user-controlled signup metadata for roles.
-- An administrator/service role must later assign role/store and activate them.

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.user_profiles (id, full_name, role, store_id, is_active)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.email),
    'store'::public.app_role,
    null,
    false
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

-- Trigger on auth.users. Supabase owns this schema, so recreate explicitly.
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_auth_user();

-- --------------------------------------------------------------------------
-- 6. SECURITY HELPERS FOR RLS
-- --------------------------------------------------------------------------

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_profiles up
    where up.id = (select auth.uid())
      and up.role = 'admin'::public.app_role
      and up.is_active = true
  );
$$;

create or replace function public.current_store_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select up.store_id
  from public.user_profiles up
  where up.id = (select auth.uid())
    and up.role = 'store'::public.app_role
    and up.is_active = true
  limit 1;
$$;

revoke all on function public.is_admin() from public;
revoke all on function public.current_store_id() from public;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.current_store_id() to authenticated;

-- --------------------------------------------------------------------------
-- 7. OPPORTUNITY BUSINESS RULES + AUTOMATIC STATUS HISTORY
-- --------------------------------------------------------------------------

create or replace function public.prepare_opportunity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_default_commission numeric(5,2);
begin
  -- Snapshot the store commission when an opportunity is first created.
  if tg_op = 'INSERT' and new.commission_percent is null then
    select s.default_commission_percent
      into v_default_commission
    from public.stores s
    where s.id = new.store_id;

    new.commission_percent := v_default_commission;
  end if;

  -- If a deal is being closed and no commission was preserved yet,
  -- try the store's current default before rejecting the close.
  if new.status = 'closed'::public.opportunity_status then
    if new.final_closed_value is null then
      raise exception 'A closed opportunity requires final_closed_value';
    end if;

    if new.commission_percent is null then
      select s.default_commission_percent
        into v_default_commission
      from public.stores s
      where s.id = new.store_id;

      new.commission_percent := v_default_commission;
    end if;

    if new.commission_percent is null then
      raise exception 'A closed opportunity requires commission_percent';
    end if;

    -- A closed deal cannot simultaneously carry a loss reason.
    new.loss_reason := null;
  end if;

  return new;
end;
$$;

create or replace trigger opportunities_prepare
before insert or update on public.opportunities
for each row execute function public.prepare_opportunity();

create or replace function public.record_opportunity_status_history()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.opportunity_status_history (
      opportunity_id,
      from_status,
      to_status,
      changed_at,
      changed_by
    ) values (
      new.id,
      null,
      new.status,
      now(),
      (select auth.uid())
    );
  elsif new.status is distinct from old.status then
    insert into public.opportunity_status_history (
      opportunity_id,
      from_status,
      to_status,
      changed_at,
      changed_by
    ) values (
      new.id,
      old.status,
      new.status,
      now(),
      (select auth.uid())
    );
  end if;

  return new;
end;
$$;

create or replace trigger opportunities_record_status_history
after insert or update of status on public.opportunities
for each row execute function public.record_opportunity_status_history();

-- --------------------------------------------------------------------------
-- 8. SEED OFFICIAL SEGMENTS AND REGIONS
-- --------------------------------------------------------------------------

insert into public.segments (slug, name, sort_order)
values
  ('arquiteto', 'Arquiteto', 10),
  ('designer-interior', 'Designer de Interior', 20),
  ('construtor', 'Construtor', 30),
  ('engenheiro', 'Engenheiro', 40),
  ('corretor', 'Corretor', 50)
on conflict (slug) do update
set name = excluded.name,
    sort_order = excluded.sort_order,
    is_active = true;

insert into public.regions (slug, name, sort_order)
values
  ('abc', 'ABC', 10),
  ('zona-sul-oeste', 'Zona Sul / Oeste', 20),
  ('zona-leste', 'Zona Leste', 30),
  ('zona-norte', 'Zona Norte', 40),
  ('interior', 'Interior', 50),
  ('litoral', 'Litoral', 60)
on conflict (slug) do update
set name = excluded.name,
    sort_order = excluded.sort_order,
    is_active = true;

-- --------------------------------------------------------------------------
-- 9. ROW LEVEL SECURITY
-- --------------------------------------------------------------------------

alter table public.segments enable row level security;
alter table public.regions enable row level security;
alter table public.stores enable row level security;
alter table public.user_profiles enable row level security;
alter table public.professionals enable row level security;
alter table public.professional_regions enable row level security;
alter table public.contacts enable row level security;
alter table public.contact_stores enable row level security;
alter table public.opportunities enable row level security;
alter table public.opportunity_status_history enable row level security;
alter table public.proposal_attachments enable row level security;

-- Clean policy names so this file can be safely reapplied during early setup.
drop policy if exists "segments_authenticated_read" on public.segments;
drop policy if exists "segments_admin_insert" on public.segments;
drop policy if exists "segments_admin_update" on public.segments;
drop policy if exists "segments_admin_delete" on public.segments;

drop policy if exists "regions_authenticated_read" on public.regions;
drop policy if exists "regions_admin_insert" on public.regions;
drop policy if exists "regions_admin_update" on public.regions;
drop policy if exists "regions_admin_delete" on public.regions;

drop policy if exists "stores_read" on public.stores;
drop policy if exists "stores_admin_insert" on public.stores;
drop policy if exists "stores_admin_update" on public.stores;
drop policy if exists "stores_admin_delete" on public.stores;

drop policy if exists "user_profiles_read" on public.user_profiles;
drop policy if exists "user_profiles_admin_insert" on public.user_profiles;
drop policy if exists "user_profiles_admin_update" on public.user_profiles;
drop policy if exists "user_profiles_admin_delete" on public.user_profiles;

drop policy if exists "professionals_admin_read" on public.professionals;
drop policy if exists "professionals_admin_insert" on public.professionals;
drop policy if exists "professionals_admin_update" on public.professionals;
drop policy if exists "professionals_admin_delete" on public.professionals;

drop policy if exists "professional_regions_admin_read" on public.professional_regions;
drop policy if exists "professional_regions_admin_insert" on public.professional_regions;
drop policy if exists "professional_regions_admin_update" on public.professional_regions;
drop policy if exists "professional_regions_admin_delete" on public.professional_regions;

drop policy if exists "contacts_admin_read" on public.contacts;
drop policy if exists "contacts_admin_insert" on public.contacts;
drop policy if exists "contacts_admin_update" on public.contacts;
drop policy if exists "contacts_admin_delete" on public.contacts;

drop policy if exists "contact_stores_admin_read" on public.contact_stores;
drop policy if exists "contact_stores_admin_insert" on public.contact_stores;
drop policy if exists "contact_stores_admin_update" on public.contact_stores;
drop policy if exists "contact_stores_admin_delete" on public.contact_stores;

drop policy if exists "opportunities_read" on public.opportunities;
drop policy if exists "opportunities_admin_insert" on public.opportunities;
drop policy if exists "opportunities_admin_update" on public.opportunities;
drop policy if exists "opportunities_admin_delete" on public.opportunities;

drop policy if exists "opportunity_history_read" on public.opportunity_status_history;

drop policy if exists "proposal_attachments_read" on public.proposal_attachments;
drop policy if exists "proposal_attachments_admin_insert" on public.proposal_attachments;
drop policy if exists "proposal_attachments_admin_update" on public.proposal_attachments;
drop policy if exists "proposal_attachments_admin_delete" on public.proposal_attachments;

-- Catalogs: all authenticated users can read; only admin can mutate.
create policy "segments_authenticated_read"
on public.segments for select
to authenticated
using (true);

create policy "segments_admin_insert"
on public.segments for insert
to authenticated
with check ((select public.is_admin()));

create policy "segments_admin_update"
on public.segments for update
to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));

create policy "segments_admin_delete"
on public.segments for delete
to authenticated
using ((select public.is_admin()));

create policy "regions_authenticated_read"
on public.regions for select
to authenticated
using (true);

create policy "regions_admin_insert"
on public.regions for insert
to authenticated
with check ((select public.is_admin()));

create policy "regions_admin_update"
on public.regions for update
to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));

create policy "regions_admin_delete"
on public.regions for delete
to authenticated
using ((select public.is_admin()));

-- Stores: admin sees all; store user sees only their own store record.
create policy "stores_read"
on public.stores for select
to authenticated
using (
  (select public.is_admin())
  or id = (select public.current_store_id())
);

create policy "stores_admin_insert"
on public.stores for insert
to authenticated
with check ((select public.is_admin()));

create policy "stores_admin_update"
on public.stores for update
to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));

create policy "stores_admin_delete"
on public.stores for delete
to authenticated
using ((select public.is_admin()));

-- Profiles: users may read their own profile; admin may read/manage all.
create policy "user_profiles_read"
on public.user_profiles for select
to authenticated
using (
  id = (select auth.uid())
  or (select public.is_admin())
);

create policy "user_profiles_admin_insert"
on public.user_profiles for insert
to authenticated
with check ((select public.is_admin()));

create policy "user_profiles_admin_update"
on public.user_profiles for update
to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));

create policy "user_profiles_admin_delete"
on public.user_profiles for delete
to authenticated
using ((select public.is_admin()));

-- Full professional PII remains admin-only.
-- Store-facing professional data is exposed through restricted RPC functions below.
create policy "professionals_admin_read"
on public.professionals for select
to authenticated
using ((select public.is_admin()));

create policy "professionals_admin_insert"
on public.professionals for insert
to authenticated
with check ((select public.is_admin()));

create policy "professionals_admin_update"
on public.professionals for update
to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));

create policy "professionals_admin_delete"
on public.professionals for delete
to authenticated
using ((select public.is_admin()));

create policy "professional_regions_admin_read"
on public.professional_regions for select
to authenticated
using ((select public.is_admin()));

create policy "professional_regions_admin_insert"
on public.professional_regions for insert
to authenticated
with check ((select public.is_admin()));

create policy "professional_regions_admin_update"
on public.professional_regions for update
to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));

create policy "professional_regions_admin_delete"
on public.professional_regions for delete
to authenticated
using ((select public.is_admin()));

-- Raw contact data/notes remain admin-only. Stores use restricted RPCs.
create policy "contacts_admin_read"
on public.contacts for select
to authenticated
using ((select public.is_admin()));

create policy "contacts_admin_insert"
on public.contacts for insert
to authenticated
with check ((select public.is_admin()));

create policy "contacts_admin_update"
on public.contacts for update
to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));

create policy "contacts_admin_delete"
on public.contacts for delete
to authenticated
using ((select public.is_admin()));

create policy "contact_stores_admin_read"
on public.contact_stores for select
to authenticated
using ((select public.is_admin()));

create policy "contact_stores_admin_insert"
on public.contact_stores for insert
to authenticated
with check ((select public.is_admin()));

create policy "contact_stores_admin_update"
on public.contact_stores for update
to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));

create policy "contact_stores_admin_delete"
on public.contact_stores for delete
to authenticated
using ((select public.is_admin()));

-- Opportunities: store users are read-only and can only read their own store rows.
create policy "opportunities_read"
on public.opportunities for select
to authenticated
using (
  (select public.is_admin())
  or store_id = (select public.current_store_id())
);

create policy "opportunities_admin_insert"
on public.opportunities for insert
to authenticated
with check ((select public.is_admin()));

create policy "opportunities_admin_update"
on public.opportunities for update
to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));

create policy "opportunities_admin_delete"
on public.opportunities for delete
to authenticated
using ((select public.is_admin()));

-- Status history is immutable to normal authenticated clients.
-- It is written by a SECURITY DEFINER trigger and can be read by admin/owning store.
create policy "opportunity_history_read"
on public.opportunity_status_history for select
to authenticated
using (
  (select public.is_admin())
  or exists (
    select 1
    from public.opportunities o
    where o.id = opportunity_status_history.opportunity_id
      and o.store_id = (select public.current_store_id())
  )
);

-- Attachment metadata follows opportunity access. Only admin may write.
create policy "proposal_attachments_read"
on public.proposal_attachments for select
to authenticated
using (
  (select public.is_admin())
  or exists (
    select 1
    from public.opportunities o
    where o.id = proposal_attachments.opportunity_id
      and o.store_id = (select public.current_store_id())
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
  )
);

create policy "proposal_attachments_admin_update"
on public.proposal_attachments for update
to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));

create policy "proposal_attachments_admin_delete"
on public.proposal_attachments for delete
to authenticated
using ((select public.is_admin()));

-- --------------------------------------------------------------------------
-- 10. TABLE PRIVILEGES
-- --------------------------------------------------------------------------
-- RLS performs the actual row authorization. These grants only permit the
-- authenticated Postgres role to attempt the operation.

revoke all on table public.segments from anon;
revoke all on table public.regions from anon;
revoke all on table public.stores from anon;
revoke all on table public.user_profiles from anon;
revoke all on table public.professionals from anon;
revoke all on table public.professional_regions from anon;
revoke all on table public.contacts from anon;
revoke all on table public.contact_stores from anon;
revoke all on table public.opportunities from anon;
revoke all on table public.opportunity_status_history from anon;
revoke all on table public.proposal_attachments from anon;

grant select, insert, update, delete on table public.segments to authenticated;
grant select, insert, update, delete on table public.regions to authenticated;
grant select, insert, update, delete on table public.stores to authenticated;
grant select, insert, update, delete on table public.user_profiles to authenticated;
grant select, insert, update, delete on table public.professionals to authenticated;
grant select, insert, update, delete on table public.professional_regions to authenticated;
grant select, insert, update, delete on table public.contacts to authenticated;
grant select, insert, update, delete on table public.contact_stores to authenticated;
grant select, insert, update, delete on table public.opportunities to authenticated;
grant select on table public.opportunity_status_history to authenticated;
grant select, insert, update, delete on table public.proposal_attachments to authenticated;

-- --------------------------------------------------------------------------
-- 11. ADMIN RPC: REGISTER CONTACT + STORE SNAPSHOT ATOMICALLY
-- --------------------------------------------------------------------------
-- The UI should pre-select active stores and let the admin review them.
-- This RPC persists the contact and the selected store snapshot in one
-- transaction, avoiding a partially-created contact with missing store links.

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
begin
  if not (select public.is_admin()) then
    raise exception 'Not authorized';
  end if;

  if p_store_ids is null or cardinality(p_store_ids) = 0 then
    raise exception 'At least one presented store must be selected';
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

revoke all on function public.register_contact(uuid, public.contact_channel, uuid[], timestamptz, text) from public;
grant execute on function public.register_contact(uuid, public.contact_channel, uuid[], timestamptz, text) to authenticated;

-- --------------------------------------------------------------------------
-- 12. SAFE STORE-FACING RPC: PROFESSIONAL REACH
-- --------------------------------------------------------------------------
-- Returns only the fields approved for store visibility:
-- professional name, segment, regions and contact date.
-- It intentionally does NOT return phone, email, Instagram, address or notes.
-- p_from is inclusive; p_to is exclusive.

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
  join public.contact_stores cs
    on cs.store_id = up.store_id
  join public.contacts c
    on c.id = cs.contact_id
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

revoke all on function public.get_store_contact_reach(timestamptz, timestamptz) from public;
grant execute on function public.get_store_contact_reach(timestamptz, timestamptz) to authenticated;

-- --------------------------------------------------------------------------
-- 13. SAFE STORE-FACING RPC: OPPORTUNITIES WITH PROFESSIONAL IDENTITY
-- --------------------------------------------------------------------------
-- Avoids exposing the full professionals table while still allowing a store
-- to understand which professional generated each of its projects/proposals.

create or replace function public.get_store_opportunities(
  p_from timestamptz default null,
  p_to timestamptz default null
)
returns table (
  opportunity_id uuid,
  professional_id uuid,
  professional_name text,
  segment_name text,
  regions text[],
  title text,
  status public.opportunity_status,
  proposal_initial_value numeric,
  final_closed_value numeric,
  commission_percent numeric,
  commission_value numeric,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    o.id as opportunity_id,
    p.id as professional_id,
    p.name as professional_name,
    s.name as segment_name,
    coalesce(
      array_agg(distinct r.name order by r.name)
        filter (where r.name is not null),
      array[]::text[]
    ) as regions,
    o.title,
    o.status,
    o.proposal_initial_value,
    o.final_closed_value,
    o.commission_percent,
    o.commission_value,
    o.created_at,
    o.updated_at
  from public.user_profiles up
  join public.opportunities o
    on o.store_id = up.store_id
  join public.professionals p
    on p.id = o.professional_id
  join public.segments s
    on s.id = p.segment_id
  left join public.professional_regions pr
    on pr.professional_id = p.id
  left join public.regions r
    on r.id = pr.region_id
  where up.id = (select auth.uid())
    and up.role = 'store'::public.app_role
    and up.is_active = true
    and (p_from is null or o.created_at >= p_from)
    and (p_to is null or o.created_at < p_to)
  group by
    o.id,
    p.id,
    p.name,
    s.name,
    o.title,
    o.status,
    o.proposal_initial_value,
    o.final_closed_value,
    o.commission_percent,
    o.commission_value,
    o.created_at,
    o.updated_at
  order by o.created_at desc;
$$;

revoke all on function public.get_store_opportunities(timestamptz, timestamptz) from public;
grant execute on function public.get_store_opportunities(timestamptz, timestamptz) to authenticated;

-- --------------------------------------------------------------------------
-- 14. SAFE STORE DASHBOARD METRICS RPC
-- --------------------------------------------------------------------------
-- Uses the event date appropriate to each KPI, matching the project spec:
--   contacts             -> contacts.contacted_at
--   projects received    -> opportunities.created_at
--   proposal received    -> status-history transition timestamp
--   proposal sent        -> status-history transition timestamp
--   closed/lost          -> status-history transition timestamp
-- p_from is inclusive; p_to is exclusive.

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
    select up.store_id
    from public.user_profiles up
    where up.id = (select auth.uid())
      and up.role = 'store'::public.app_role
      and up.is_active = true
    limit 1
  ),
  reach as (
    select
      count(distinct c.professional_id)::bigint as professionals_contacted,
      count(distinct c.id)::bigint as contact_events
    from current_store cs0
    join public.contact_stores cs on cs.store_id = cs0.store_id
    join public.contacts c on c.id = cs.contact_id
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
      and (p_from is null or h.changed_at >= p_from)
      and (p_to is null or h.changed_at < p_to)
  ),
  lost_ids as (
    select distinct h.opportunity_id
    from current_store cs0
    join public.opportunities o on o.store_id = cs0.store_id
    join public.opportunity_status_history h on h.opportunity_id = o.id
    where h.to_status = 'lost'::public.opportunity_status
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

revoke all on function public.get_store_dashboard_metrics(timestamptz, timestamptz) from public;
grant execute on function public.get_store_dashboard_metrics(timestamptz, timestamptz) to authenticated;

-- --------------------------------------------------------------------------
-- 15. SUPABASE STORAGE BUCKET + RLS FOR PROPOSAL PDFs
-- --------------------------------------------------------------------------
-- Expected object path convention:
--   {store_uuid}/{opportunity_uuid}/{unique-file-name}.pdf
--
-- Admin uploads/manages files. Store users are read-only and may read only
-- files whose path maps to an opportunity belonging to their store.

insert into storage.buckets (id, name, public, allowed_mime_types)
values (
  'proposal-pdfs',
  'proposal-pdfs',
  false,
  array['application/pdf']::text[]
)
on conflict (id) do update
set public = false,
    allowed_mime_types = array['application/pdf']::text[];

-- Storage object policies
-- Note: storage.objects already uses RLS in Supabase Storage.
drop policy if exists "proposal_pdfs_admin_select" on storage.objects;
drop policy if exists "proposal_pdfs_admin_insert" on storage.objects;
drop policy if exists "proposal_pdfs_admin_update" on storage.objects;
drop policy if exists "proposal_pdfs_admin_delete" on storage.objects;
drop policy if exists "proposal_pdfs_store_select" on storage.objects;

create policy "proposal_pdfs_admin_select"
on storage.objects for select
to authenticated
using (
  bucket_id = 'proposal-pdfs'
  and (select public.is_admin())
);

create policy "proposal_pdfs_admin_insert"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'proposal-pdfs'
  and (select public.is_admin())
);

create policy "proposal_pdfs_admin_update"
on storage.objects for update
to authenticated
using (
  bucket_id = 'proposal-pdfs'
  and (select public.is_admin())
)
with check (
  bucket_id = 'proposal-pdfs'
  and (select public.is_admin())
);

create policy "proposal_pdfs_admin_delete"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'proposal-pdfs'
  and (select public.is_admin())
);

create policy "proposal_pdfs_store_select"
on storage.objects for select
to authenticated
using (
  bucket_id = 'proposal-pdfs'
  and (storage.foldername(name))[1] = (select public.current_store_id())::text
  and exists (
    select 1
    from public.opportunities o
    where o.id::text = (storage.foldername(name))[2]
      and o.store_id = (select public.current_store_id())
  )
);

-- --------------------------------------------------------------------------
-- 16. COMMENTS / DOCUMENTATION FOR THE AGENT
-- --------------------------------------------------------------------------

comment on table public.contacts is
'Historical contact events. Creating a professional never creates a contact automatically.';

comment on table public.contact_stores is
'Historical snapshot of which represented stores/brands were presented in a specific contact.';

comment on table public.opportunities is
'Project/proposal tracking record. External communication, negotiation, acceptance and refusal happen outside the platform; this table records the resulting manual state.';

comment on column public.opportunities.proposal_initial_value is
'Initial amount returned by the represented store.';

comment on column public.opportunities.final_closed_value is
'Final amount externally negotiated and accepted. Commission is based on this value.';

comment on column public.opportunities.commission_percent is
'Commission percentage preserved on the opportunity so future store changes do not recalculate historical deals.';

comment on table public.opportunity_status_history is
'Automatic immutable history of opportunity status transitions. Dashboard event dates should come from this table when the KPI represents a status transition.';

comment on table public.proposal_attachments is
'Metadata for proposal PDFs stored in the private Supabase Storage bucket proposal-pdfs.';

commit;

-- ============================================================================
-- POST-INSTALL BOOTSTRAP (MANUAL)
-- ============================================================================
-- 1. Create the first HORN admin user in Supabase Auth.
-- 2. The trigger above creates an inactive store profile automatically.
-- 3. Promote that Auth user from the SQL Editor / service role:
--
--    update public.user_profiles
--       set role = 'admin',
--           store_id = null,
--           is_active = true
--     where id = '<AUTH_USER_UUID>';
--
-- 4. For each store user, create the Auth account and then assign:
--
--    update public.user_profiles
--       set role = 'store',
--           store_id = '<STORE_UUID>',
--           is_active = true
--     where id = '<AUTH_USER_UUID>';
--
-- 5. Application convention for proposal PDF uploads:
--      proposal-pdfs/{STORE_UUID}/{OPPORTUNITY_UUID}/{UNIQUE_FILENAME}.pdf
--
-- 6. Recommended status labels in the UI:
--      project_received               -> Projeto recebido
--      waiting_store_proposal         -> Aguardando proposta da loja
--      proposal_received              -> Proposta recebida
--      proposal_sent_to_professional  -> Proposta enviada ao profissional
--      negotiating                    -> Em negociação
--      closed                         -> Fechada
--      lost                           -> Perdida
--
-- 7. IMPORTANT: UI actions should say "Marcar como...". The application does
--    not perform proposal sending, negotiation, acceptance, or refusal.
-- ============================================================================
