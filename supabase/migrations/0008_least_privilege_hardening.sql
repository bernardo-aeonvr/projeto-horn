-- ============================================================================
-- HORN — Menor privilégio: alinha os GRANTs ao que o repositório já declara
--
-- Origem: auditoria de segurança de 18/08/2026. Nenhuma policy muda aqui e
-- nenhum comportamento da aplicação muda. O que muda é o piso: hoje o banco
-- concede mais do que o schema.sql pediu, porque o Supabase aplica
-- ALTER DEFAULT PRIVILEGES concedendo tudo a anon/authenticated no momento em
-- que a tabela ou a função é criada. Um `grant select` posterior soma; não
-- substitui. E um `revoke ... from public` não desfaz um grant nominal a anon.
--
-- As três correções abaixo foram confirmadas por teste, não por suposição:
--
--   1. anon com EXECUTE nas funções store-facing
--      Hoje elas não vazam nada: são SECURITY DEFINER e todas filtram por
--      auth.uid(), que é NULL para anon — o teste anônimo devolveu vazio. Mas
--      a proteção está inteiramente no corpo da função. Qualquer edição futura
--      que troque o filtro por auth.uid() por um parâmetro passa a responder
--      para a internet inteira. As migrations 0002/0005/0006/0007 já revogam
--      de anon; isto estende a mesma regra às funções do schema.sql base.
--
--   2. authenticated com TRUNCATE/REFERENCES/TRIGGER em todas as tabelas
--      TRUNCATE é o motivo real: no PostgreSQL, RLS **não se aplica** a
--      TRUNCATE. A policy de isolamento por loja não protegeria essa operação.
--      Não há caminho pelo PostgREST para chamá-la hoje, então não é uma falha
--      explorável — é a remoção de um privilégio que nunca deveria existir.
--
--   3. authenticated com INSERT/UPDATE/DELETE em opportunity_status_history
--      O schema.sql pede `grant select` e só. A tabela é escrita pelo trigger
--      record_opportunity_status_history, que é SECURITY DEFINER e roda como
--      owner — não depende deste grant. A RLS já barra a escrita (só existe
--      policy de SELECT), então isto é a segunda tranca na mesma porta, e faz
--      o banco corresponder ao que o repositório documenta.
--
-- O QUE DELIBERADAMENTE **NÃO** MUDA:
--   INSERT/UPDATE/DELETE de `authenticated` nas demais tabelas. O admin é um
--   usuário `authenticated` e escreve por PostgREST; quem separa admin de loja
--   é a RLS, e essa é a arquitetura do projeto. Revogar aqui quebraria o
--   Admin sem ganho de segurança.
-- ============================================================================

begin;

-- --------------------------------------------------------------------------
-- 1. anon não executa mais nenhuma função da aplicação
-- --------------------------------------------------------------------------
-- Mantido o EXECUTE de `authenticated`: é por ele que a aplicação funciona.

revoke execute on function public.is_admin() from anon;
revoke execute on function public.current_store_id() from anon;

revoke execute on function
  public.get_store_contact_reach(timestamptz, timestamptz) from anon;
revoke execute on function
  public.get_store_opportunities(timestamptz, timestamptz) from anon;
revoke execute on function
  public.get_store_dashboard_metrics(timestamptz, timestamptz) from anon;
revoke execute on function
  public.get_store_opportunities_page(text, text, uuid, timestamptz, timestamptz, integer, integer) from anon;
revoke execute on function
  public.get_store_opportunity_professionals() from anon;

-- SECURITY INVOKER e já checam is_admin() internamente; revogadas por
-- consistência, para que nenhuma função da aplicação responda a anon.
revoke execute on function
  public.register_contact(uuid, public.contact_channel, uuid[], timestamptz, text) from anon;
revoke execute on function
  public.save_professional(
    text, uuid, uuid[], uuid, text, text, text, text, text, text, text,
    smallint, smallint, text, boolean
  ) from anon;

-- --------------------------------------------------------------------------
-- 2. Privilégios que a aplicação nunca usa
-- --------------------------------------------------------------------------
-- TRUNCATE ignora RLS; REFERENCES e TRIGGER são privilégios de DDL. Nenhum dos
-- três é alcançável pelo PostgREST, e nenhum é usado pela aplicação.

revoke truncate, references, trigger on table
  public.segments,
  public.regions,
  public.stores,
  public.user_profiles,
  public.professionals,
  public.professional_regions,
  public.contacts,
  public.contact_stores,
  public.opportunities,
  public.opportunity_status_history,
  public.proposal_attachments
from authenticated;

-- --------------------------------------------------------------------------
-- 3. O histórico de status volta a ser somente leitura, como o schema declara
-- --------------------------------------------------------------------------
-- Quem escreve é o trigger SECURITY DEFINER, que roda como owner e não usa
-- este grant. A aplicação só faz SELECT nesta tabela
-- (src/lib/opportunities/queries.ts → listOpportunityHistory).

revoke insert, update, delete on table
  public.opportunity_status_history from authenticated;

-- --------------------------------------------------------------------------
-- 4. Reforço do piso para anon
-- --------------------------------------------------------------------------
-- O schema.sql já revoga; repetido aqui para que esta migration descreva
-- sozinha o estado final esperado, inclusive se aplicada a um projeto novo.

revoke all on table
  public.segments,
  public.regions,
  public.stores,
  public.user_profiles,
  public.professionals,
  public.professional_regions,
  public.contacts,
  public.contact_stores,
  public.opportunities,
  public.opportunity_status_history,
  public.proposal_attachments
from anon;

commit;
