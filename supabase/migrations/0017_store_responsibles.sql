-- ============================================================================
-- HORN — Vários responsáveis por loja
--
-- Uma coluna. É a migration inteira.
--
-- O PROBLEMA
--
-- `stores.contact_name` guarda um nome só, e uma marmoraria costuma ter dois
-- donos. Quem cuida do relacionamento precisa lembrar dos DOIS na hora de
-- convidar a loja para um evento — hoje o segundo nome não tem onde morar.
--
-- POR QUE UM ARRAY, E NÃO UMA TABELA
--
-- Um responsável aqui é um NOME, e nada além disso: não tem telefone próprio,
-- não vira contato, não vira profissional, não vira acesso, não entra em
-- métrica e ninguém filtra por ele. Uma tabela `store_contacts` traria id,
-- dono, RLS, policies e grants para guardar uma lista de strings que só é lida
-- junto com a loja e sempre inteira.
--
-- `text[]` é lido e gravado pelo PostgREST como uma lista comum, cabe no mesmo
-- INSERT que já grava a loja, e herda a RLS de `public.stores` sem nenhuma
-- policy nova. Se um dia o responsável ganhar telefone, cargo ou vínculo com
-- profissional, aí sim vira tabela — e aí a migration terá um motivo.
--
-- POR QUE `contact_name` CONTINUA EXISTINDO
--
-- A coluna antiga não é removida nem esvaziada. Ela passa a ser o espelho do
-- PRIMEIRO responsável, mantido pela aplicação a cada gravação. Assim o
-- dev_seed, qualquer consulta SQL antiga e qualquer backup restaurado
-- continuam encontrando o que sempre encontraram, e a leitura da aplicação
-- ainda cai nela quando o array está vazio — uma loja inserida por fora, sem
-- passar pela tela, aparece com o responsável dela mesmo assim.
--
-- Remover `contact_name` é decisão de outra etapa, quando não sobrar ninguém
-- lendo a coluna.
--
-- NOT NULL COM DEFAULT '{}'
--
-- "Sem responsável" é uma lista vazia, não um NULL: evita o terceiro estado e
-- deixa a leitura em `array_length` / `.length` sem checagem de nulo. No
-- Postgres moderno a coluna nova com default não reescreve a tabela.
--
-- ORDEM: aplicado depois de 0016.
-- ============================================================================

begin;

alter table public.stores
  add column if not exists contact_names text[] not null default '{}';

comment on column public.stores.contact_names is
'Responsáveis da loja (sócios, gerentes) em ordem de exibição. Lista de nomes, sem vínculo com acesso à plataforma nem com profissionais.';

comment on column public.stores.contact_name is
'LEGADO: espelho do primeiro item de contact_names, mantido pela aplicação. Nenhuma tela lê esta coluna diretamente — use contact_names.';

-- --------------------------------------------------------------------------
-- OS RESPONSÁVEIS QUE JÁ EXISTEM
-- --------------------------------------------------------------------------
-- Toda loja que já tem um nome em `contact_name` passa a ter esse nome como
-- primeiro (e único) responsável. Nada é reescrito nem apagado: a coluna
-- antiga continua com o mesmo valor, e as lojas sem responsável ficam com a
-- lista vazia, que é o padrão da coluna.
--
-- `is distinct from '{}'` protege a reaplicação: se alguém já mexeu na lista
-- pela tela, esta migration não passa por cima.

update public.stores
   set contact_names = array[btrim(contact_name)]
 where contact_names = '{}'::text[]
   and contact_name is not null
   and btrim(contact_name) <> '';

commit;
