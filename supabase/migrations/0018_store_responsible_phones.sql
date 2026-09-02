-- ============================================================================
-- HORN — Telefone por responsável da loja
--
-- `stores.contact_names text[]` (0017) vira `stores.responsibles jsonb`, uma
-- lista de `{ "name": ..., "phone": ... }`.
--
-- POR QUE A LISTA DE TEXTO NÃO SERVE MAIS
--
-- Cada responsável passa a ter telefone próprio. Duas colunas paralelas —
-- nomes em uma, telefones em outra — casariam as duas listas pela POSIÇÃO:
-- bastaria alguém remover um nome sem remover o telefone correspondente para o
-- número da Carol aparecer embaixo do nome do Leandro, e nada no banco
-- perceberia. Nome e telefone precisam viajar juntos, e é o que o objeto faz.
--
-- POR QUE JSONB, E NÃO UMA TABELA `store_responsibles`
--
-- Continua sendo informação da loja, lida sempre inteira e junto com ela:
-- ninguém busca por responsável, ninguém filtra, ninguém referencia. Uma
-- tabela traria id, dono, RLS, policies, grants, o trigger de coerência de
-- dono da 0009 e uma RPC para gravar o diff numa transação — tudo isso para
-- guardar nome e telefone.
--
-- O jsonb cabe no mesmo INSERT que já grava a loja, herda a RLS de
-- `public.stores` sem policy nova, e a ordem da lista é a ordem do array, sem
-- coluna de ordenação para manter.
--
-- A hora de virar tabela é quando o responsável for REFERENCIADO por outra
-- coisa — um convite de evento, um contato, um profissional. Aí ele precisa de
-- id, e aí a migration tem motivo. Enquanto for nome e telefone lidos junto
-- com a loja, não tem.
--
-- POR QUE `contact_names` É REMOVIDA E `contact_name` NÃO
--
-- `contact_names` nasceu na migration anterior, ainda não foi liberada e é
-- lida apenas pelo código desta mesma leva — copiada para `responsibles` aqui,
-- não sobra ninguém para ler. Manter as duas deixaria TRÊS representações da
-- mesma coisa no schema, e a próxima pessoa a abrir a tabela não teria como
-- saber qual manda.
--
-- `contact_name` (singular) é diferente: é a coluna original, existe desde o
-- schema base, está no dev_seed e pode estar em consulta, backup ou relatório
-- fora deste repositório. Ela continua onde está, como espelho do nome do
-- primeiro responsável, mantido pela aplicação.
--
-- ORDEM: aplicado depois de 0017.
-- ============================================================================

begin;

-- --------------------------------------------------------------------------
-- 1. A COLUNA
-- --------------------------------------------------------------------------
-- "Sem responsável" é uma lista vazia, não NULL — mesma decisão da 0017, pelo
-- mesmo motivo: evita o terceiro estado na leitura.
--
-- O CHECK garante apenas que é um ARRAY. Não é validação de conteúdo (isso é
-- da aplicação): é a proteção contra alguém gravar um objeto ou um número
-- solto e quebrar toda leitura da tela de uma vez.

alter table public.stores
  add column if not exists responsibles jsonb not null default '[]'::jsonb;

alter table public.stores
  drop constraint if exists stores_responsibles_is_array;

alter table public.stores
  add constraint stores_responsibles_is_array
  check (jsonb_typeof(responsibles) = 'array');

comment on column public.stores.responsibles is
'Responsáveis da loja: [{"name": "...", "phone": "..."}], na ordem de exibição. Telefone opcional. Sem vínculo com acesso à plataforma, contato ou profissional.';

-- --------------------------------------------------------------------------
-- 2. OS RESPONSÁVEIS QUE JÁ EXISTEM
-- --------------------------------------------------------------------------
-- Cada nome da lista antiga vira um objeto com telefone nulo — ninguém tinha
-- telefone para preencher ainda. `with ordinality` preserva a ordem em que os
-- nomes estavam.

update public.stores s
   set responsibles = coalesce((
         select jsonb_agg(
                  jsonb_build_object('name', btrim(nome), 'phone', null)
                  order by posicao
                )
           from unnest(s.contact_names) with ordinality as t(nome, posicao)
          where btrim(nome) <> ''
       ), '[]'::jsonb)
 where s.responsibles = '[]'::jsonb
   and coalesce(array_length(s.contact_names, 1), 0) > 0;

-- --------------------------------------------------------------------------
-- 3. A COLUNA INTERMEDIÁRIA SAI
-- --------------------------------------------------------------------------
-- Só depois da cópia acima, e na mesma transação: ou as duas coisas
-- acontecem, ou nenhuma.

alter table public.stores
  drop column if exists contact_names;

commit;
