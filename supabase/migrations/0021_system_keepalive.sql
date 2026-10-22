-- ============================================================================
-- HORN — Heartbeat técnico do keep-alive
--
-- O plano gratuito do Supabase pausa projetos com pouca atividade numa janela
-- de 7 dias, e a documentação fala em "alguns" acessos reais ao banco por dia.
-- Até aqui o cron diário (/api/keep-alive) fazia UM `HEAD` com `count=exact`
-- em `segments`: uma requisição por dia, sem nenhuma escrita, e sem deixar
-- rastro no banco. Quando o projeto pausava, não havia como dizer se o cron
-- tinha rodado, se tinha chegado ao Postgres ou se simplesmente não bastava.
--
-- Esta migration cria o lugar onde cada execução do keep-alive deixa prova:
-- uma tabela de UMA linha, técnica e isolada, que a rota atualiza a cada
-- chamada. `last_ping_at` responde "quando foi a última execução que chegou ao
-- banco"; `ping_count` responde "quantas já chegaram".
--
-- NADA DE NEGÓCIO AQUI
--
-- A atividade artificial não toca `professionals`, `stores`, `contacts` nem
-- nenhuma tabela de negócio. Só esta tabela recebe escrita, e as leituras
-- extras da rota são de catálogo (`segments`, `regions`).
--
-- ACESSO
--
-- Só `service_role` (a SUPABASE_SECRET_KEY, usada pela rota no servidor). RLS
-- ligada e sem policy nenhuma: mesmo que um grant volte por engano, anon e
-- authenticated continuam sem enxergar linha. E, como a 0002 e a 0008 já
-- registraram, o Supabase concede tudo a anon/authenticated por default
-- privileges no momento da criação — por isso os revokes nominais abaixo.
--
-- ORDEM: aplicado depois de 0020. Não depende de nenhuma tabela anterior.
-- ============================================================================

begin;

-- --------------------------------------------------------------------------
-- 1. A TABELA
-- --------------------------------------------------------------------------
-- `id = 1` fixo, garantido por CHECK: não existe segunda linha para a rota
-- atualizar por engano nem para crescer com o tempo.

create table if not exists public.system_keepalive (
  id smallint primary key default 1 check (id = 1),
  last_ping_at timestamptz not null default now(),
  ping_count bigint not null default 0,
  source text
);

comment on table public.system_keepalive is
'Heartbeat técnico do keep-alive (/api/keep-alive). Uma única linha (id = 1), atualizada a cada execução do cron. Não é dado de negócio; só service_role acessa.';

comment on column public.system_keepalive.last_ping_at is
'Momento da última execução do keep-alive que chegou ao banco.';

comment on column public.system_keepalive.ping_count is
'Total de execuções do keep-alive que chegaram ao banco desde a criação da tabela.';

comment on column public.system_keepalive.source is
'Quem disparou a última execução: "vercel-cron" (agendada) ou "manual".';

insert into public.system_keepalive (id, ping_count)
values (1, 0)
on conflict (id) do nothing;

alter table public.system_keepalive enable row level security;

revoke all on table public.system_keepalive from public, anon, authenticated;
grant select, insert, update on table public.system_keepalive to service_role;

-- --------------------------------------------------------------------------
-- 2. O PING
-- --------------------------------------------------------------------------
-- O PostgREST não sabe fazer `ping_count = ping_count + 1` num PATCH — só
-- grava valor literal. Ler e regravar da aplicação perderia incremento quando
-- a Vercel entrega o mesmo cron duas vezes (ela avisa que isso acontece). A
-- função faz a escrita inteira numa instrução só, atômica, e devolve a linha.
--
-- O upsert recria a linha se alguém a apagar: o heartbeat não depende do
-- insert da seção 1 ter sobrevivido.
--
-- SECURITY INVOKER: quem chama é service_role, que já tem o grant da tabela.
-- Não há motivo para a função rodar com mais privilégio que o chamador.

create or replace function public.keepalive_ping(p_source text default null)
returns public.system_keepalive
language sql
volatile
security invoker
set search_path = ''
as $function$
  insert into public.system_keepalive as k (id, last_ping_at, ping_count, source)
  values (1, now(), 1, p_source)
  on conflict (id) do update
     set last_ping_at = now(),
         ping_count = k.ping_count + 1,
         source = excluded.source
  returning k.*;
$function$;

comment on function public.keepalive_ping(text) is
'Registra uma execução do keep-alive: atualiza last_ping_at, incrementa ping_count e devolve a linha. Só service_role executa.';

revoke all on function public.keepalive_ping(text) from public, anon, authenticated;
grant execute on function public.keepalive_ping(text) to service_role;

commit;
