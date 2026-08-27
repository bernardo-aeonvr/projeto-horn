-- ============================================================================
-- HORN — Evento como canal de contato
--
-- Um valor a mais no enum `public.contact_channel`. É a migration inteira.
--
-- POR QUE NÃO EXISTE TABELA DE EVENTO
--
-- Uma visita, um tour ou uma palestra na loja é a HORN alcançando um
-- profissional — a mesma coisa que uma mensagem no WhatsApp ou uma ligação,
-- por outro meio. O registro já tem tudo que isso precisa: profissional, data,
-- lojas apresentadas e observação. O que aconteceu no evento é descrito na
-- observação, como em qualquer outro canal.
--
-- Modelar evento como entidade própria criaria participantes, status e
-- presença — e um contato de evento deixaria de contar como contato nas
-- métricas que já existem, que é justamente o contrário do que se quer.
--
-- POR QUE 'event' E NÃO 'evento'
--
-- Os valores internos do enum são em inglês desde o schema inicial
-- ('whatsapp', 'phone', 'instagram', 'email', 'other') e o rótulo em português
-- vive na aplicação, em CHANNEL_LABELS. Gravar 'evento' misturaria as duas
-- convenções dentro do mesmo tipo. Na tela ele continua sendo "Evento".
--
-- POR QUE NO FIM DA LISTA
--
-- `add value` sem `before`/`after` acrescenta no fim, e a aplicação percorre
-- os canais na ordem do enum. Então "Evento" aparece depois de "Outro" no
-- formulário, no filtro de Contatos e no filtro do dashboard, sem que nenhuma
-- tela precise ordenar nada.
--
-- POR QUE NENHUMA FUNÇÃO MUDA
--
-- As funções do dashboard (0013) recebem `p_channel public.contact_channel` e
-- comparam por igualdade dentro da CTE que lê `public.contacts`. Um valor novo
-- do tipo passa por elas sem alteração — inclusive nas versões da loja, que
-- continuam recortando pela loja do perfil autenticado. Nenhuma métrica de
-- projeto/proposta lê canal, e isso não muda aqui.
--
-- POR QUE SEM begin/commit
--
-- `alter type ... add value` é uma instrução só, atômica por si. Deixá-la fora
-- de um bloco de transação evita a regra do Postgres que impede USAR o valor
-- novo na mesma transação que o criou — aqui não se usa, mas a migration fica
-- segura de rodar de qualquer jeito, em qualquer versão.
--
-- Os contatos que já existem não são tocados: nenhum valor é renomeado,
-- migrado ou reinterpretado.
--
-- ORDEM: aplicado depois de 0013.
-- ============================================================================

alter type public.contact_channel add value if not exists 'event';

comment on type public.contact_channel is
  'Meio pelo qual a HORN alcançou o profissional. "event" cobre visita, tour e '
  'palestra na loja: continua sendo um contato, sem entidade de evento.';
