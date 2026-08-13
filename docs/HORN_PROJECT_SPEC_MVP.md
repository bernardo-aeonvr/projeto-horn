# HORN - Especificação Mestre do Produto (MVP)

**Versão:** 1.0  
**Data:** 13/08/2026  
**Status:** Especificação funcional consolidada para desenvolvimento  
**Objetivo do documento:** servir como fonte principal de verdade para implementação do MVP da plataforma HORN antes da geração do SQL e do início do desenvolvimento pelo agente de código.

> **Regra de precedência:** este documento consolida as reuniões, planilhas, materiais enviados pelo cliente e os alinhamentos posteriores. Quando houver conflito entre uma ideia preliminar da transcrição e uma decisão consolidada neste documento, esta especificação deve prevalecer.

---

## 1. Resumo executivo

A HORN atua como representante comercial de lojas e fornecedores ligados principalmente ao mercado de arquitetura, construção e interiores. O trabalho da HORN consiste em formar uma base de profissionais, apresentar as empresas representadas a esses profissionais, acompanhar solicitações de orçamento/projetos, intermediar o fluxo de propostas e registrar os resultados comerciais gerados.

O produto será uma aplicação web simples, didática e visual. Ele não deve tentar ser um CRM genérico e complexo. Seu objetivo central é substituir e estruturar o controle hoje realizado em planilhas, permitindo que a HORN:

1. mantenha uma base organizada de profissionais;
2. registre os contatos realizados com esses profissionais;
3. registre quando um contato gera uma solicitação de projeto/orçamento;
4. acompanhe manualmente o estágio de cada projeto/proposta ligado a uma loja específica;
5. registre valores propostos e valores efetivamente fechados;
6. calcule automaticamente a comissão da HORN sobre negócios fechados;
7. apresente indicadores gerais para a HORN;
8. disponibilize a cada loja representada um dashboard restrito aos dados relevantes para aquela loja.

A plataforma é, portanto, um **sistema de organização e acompanhamento da representação comercial da HORN**, com forte foco em dashboard e prestação de visibilidade às lojas representadas.

---

## 2. Princípio central do produto

O sistema deve registrar o que aconteceu no processo comercial, mas **não executar o processo comercial em si**.

### 2.1 O que acontece fora da plataforma

Continuam acontecendo por WhatsApp, ligação, e-mail ou outros meios externos:

- o primeiro contato real com o profissional;
- o envio/apresentação das lojas representadas;
- o envio do projeto ou solicitação pelo profissional;
- o encaminhamento do projeto para a loja;
- a elaboração da proposta pela loja;
- o envio da proposta ao profissional;
- a negociação entre as partes;
- o aceite ou a recusa da proposta;
- os pagamentos do cliente final;
- o repasse financeiro da comissão.

### 2.2 O que acontece dentro da plataforma

A HORN entra na aplicação e registra manualmente os fatos ocorridos fora dela:

- cadastro do profissional;
- registro de contato realizado;
- criação de um projeto/demanda quando houver solicitação;
- vínculo desse projeto a uma loja específica;
- atualização manual dos estágios;
- registro do valor inicial da proposta;
- upload opcional do PDF da proposta;
- registro do valor final fechado;
- marcação de negócio fechado ou perdido;
- cálculo da comissão;
- geração dos dashboards.

### 2.3 Linguagem obrigatória da interface

A interface deve evitar verbos que façam parecer que a plataforma realmente executa uma comunicação externa.

Preferir:

- **“Marcar como enviado à loja”** em vez de “Enviar para loja”;
- **“Marcar proposta como enviada”** em vez de “Enviar proposta”;
- **“Marcar como fechada”** ou **“Marcar como perdida”** em vez de “Aceitar” ou “Recusar”.

Não deve existir botão de aceite/recusa destinado ao profissional, porque profissionais não acessam a plataforma.

---

## 3. Escopo técnico definido

### 3.1 Stack principal

- **Frontend / aplicação:** Next.js
- **Linguagem:** TypeScript
- **Estilização:** Tailwind CSS
- **Backend / banco / autenticação:** Supabase
- **Hospedagem:** Vercel
- **Arquivos de proposta:** Supabase Storage, enquanto o volume permanecer compatível com a capacidade disponível
- **Versionamento:** Git

### 3.2 Diretrizes técnicas

- utilizar variáveis de ambiente para URLs, chaves e secrets;
- nunca inserir secrets privilegiados diretamente no bundle do cliente;
- usar Supabase Auth para autenticação por e-mail e senha;
- usar controle de acesso por role;
- utilizar RLS do Supabase como camada obrigatória de isolamento de dados;
- manter a aplicação preparada para deploy na Vercel;
- manter o projeto simples e legível, evitando arquitetura excessivamente complexa para o tamanho do MVP.

### 3.3 Idioma, moeda e datas

- idioma da interface: **Português do Brasil**;
- moeda do MVP: **BRL / R$**;
- datas apresentadas ao usuário: **DD/MM/AAAA**;
- timestamps armazenados de forma consistente no banco;
- interpretação de datas e relatórios no contexto do fuso de São Paulo.

---

## 4. Perfis de acesso

O MVP possui dois perfis funcionais.

### 4.1 HORN / Administrador

É o usuário operacional do sistema.

Pode:

- visualizar o dashboard geral;
- cadastrar, editar, ativar e inativar profissionais;
- registrar contatos;
- consultar histórico de contatos;
- cadastrar e editar lojas;
- cadastrar projetos/demandas;
- alterar manualmente o estágio de projetos/propostas;
- registrar valores;
- anexar PDFs de propostas;
- visualizar todas as lojas e todos os projetos/propostas;
- visualizar relatórios e indicadores consolidados;
- corrigir registros inseridos por engano, respeitando o histórico quando aplicável.

### 4.2 Loja

Cada loja representada deve possuir acesso individual por e-mail e senha.

O usuário da loja é **somente leitura no MVP**.

Pode visualizar:

- dashboard daquela loja;
- indicadores de profissionais alcançados por aquela loja;
- distribuição dos profissionais alcançados por segmento e região;
- projetos/demandas destinados àquela loja;
- propostas daquela loja;
- negócios fechados daquela loja;
- valores propostos e fechados daquela loja;
- comissão gerada para a HORN nos negócios daquela loja.

Não pode:

- editar profissionais;
- registrar contatos;
- cadastrar ou movimentar propostas;
- visualizar propostas de outras lojas;
- visualizar valores de outras lojas;
- visualizar o dashboard geral da HORN;
- visualizar quais outras marcas foram apresentadas no mesmo contato;
- acessar informações administrativas de outras lojas.

### 4.3 Profissionais externos

Arquitetos, designers, construtores, engenheiros e corretores **não possuem login** e não acessam a plataforma.

---

## 5. Estrutura principal de navegação

### 5.1 Navegação HORN / Admin

Menu sugerido:

1. **Dashboard**
2. **Profissionais**
3. **Contatos**
4. **Projetos & Propostas**
5. **Lojas**

Uma tela específica de gerenciamento de usuários não é requisito funcional obrigatório do primeiro MVP. Os acessos podem ser provisionados administrativamente enquanto a interface de gestão de usuários não for necessária.

### 5.2 Navegação Loja

Menu reduzido:

1. **Dashboard**
2. **Projetos & Propostas**

A experiência da loja deve ser claramente mais enxuta que a experiência administrativa.

---

## 6. Identidade visual e experiência de uso

### 6.1 Direção visual

A interface deve seguir a identidade visual fornecida da HORN:

- fundo predominantemente claro/branco;
- dourado/amarelo como cor de destaque;
- preto/grafite como cor estrutural e tipográfica;
- aparência limpa e profissional;
- uso do logotipo fornecido;
- evitar excesso de dourado ou efeitos que deixem a interface visualmente pesada.

### 6.2 Princípios de UX

O cliente pediu explicitamente uma solução didática e simples. Portanto:

- priorizar leitura rápida;
- usar cards de números grandes para KPIs;
- usar gráficos apenas quando agregarem entendimento;
- evitar telas cheias de controles desnecessários;
- manter formulários curtos e progressivos;
- oferecer filtros evidentes;
- permitir ações rápidas diretamente nas listas quando fizer sentido;
- ser responsivo para desktop e celular;
- considerar o desktop como ambiente principal de análise e operação, embora a aplicação deva funcionar em telas menores.

---

## 7. Domínio: Profissionais

### 7.1 Definição

Profissional é a pessoa ou contato comercial que faz parte da base da HORN e que pode receber a apresentação das lojas representadas e, posteriormente, gerar projetos/demandas.

### 7.2 Segmentos oficiais

Os segmentos consolidados para o MVP são:

- Arquiteto
- Designer de Interior
- Construtor
- Engenheiro
- Corretor

A interface deve utilizar essas categorias padronizadas.

### 7.3 Regiões oficiais

As regiões consolidadas para o MVP são:

- ABC
- Zona Sul / Oeste
- Zona Leste
- Zona Norte
- Interior
- Litoral

Um profissional pode atuar em **mais de uma região**.

### 7.4 Campos do profissional

#### Obrigatórios

- nome;
- segmento.

#### Opcionais

- e-mail;
- Instagram;
- telefone;
- endereço;
- CEP;
- cidade;
- estado;
- uma ou mais regiões de atuação;
- aniversário;
- observações, se necessário na interface;
- demais dados complementares importados da base antiga quando houver valor válido.

#### Controlados pelo sistema

- status: Ativo / Inativo;
- data/hora de criação;
- data/hora de última atualização.

### 7.5 Regras

- cadastrar um profissional **não** significa contatá-lo;
- o profissional não deve possuir um único status comercial do tipo “Negociando”, “Pendente” ou “Finalizado”;
- esses status pertencem ao projeto/proposta, pois um mesmo profissional pode ter várias negociações simultâneas em estágios diferentes;
- um profissional pode ter zero, um ou vários registros de contato;
- um profissional pode ter zero, um ou vários projetos/propostas;
- não usar o nome como identificador único;
- não exigir telefone, e-mail ou Instagram para salvar um cadastro;
- preferir inativação a exclusão quando o profissional já possuir histórico.

### 7.6 Lista de profissionais

A tela deve oferecer:

- busca por nome;
- filtro por segmento;
- filtro por região;
- filtro por ativo/inativo;
- edição;
- visualização do detalhe/histórico;
- ação rápida **Registrar contato**;
- ação para criar projeto/demanda a partir do profissional;
- atalho para WhatsApp quando houver telefone em formato compatível.

Abrir o WhatsApp **não registra automaticamente um contato**. O contato só passa a contar quando a HORN confirma explicitamente o registro.

---

## 8. Domínio: Contatos

### 8.1 Definição

Contato é um evento histórico que registra que a HORN apresentou sua atuação e/ou as lojas representadas a determinado profissional por algum canal externo.

Um contato não é um campo “Sim/Não” permanente no cadastro do profissional. Deve existir como registro próprio, pois o mesmo profissional pode ser contatado em momentos diferentes.

### 8.2 Quando considerar um contato realizado

Conta como contato quando a HORN efetivamente realiza a ação de apresentação, por exemplo:

- envia WhatsApp apresentando a HORN e as empresas;
- realiza ligação apresentando a HORN e as empresas;
- realiza contato equivalente por Instagram, e-mail ou outro meio.

Não é necessário que o profissional responda para o contato contar.

Apenas encontrar um telefone, visitar uma obra ou obter o dado de contato sem realizar a apresentação não deve contar como contato realizado.

### 8.3 Campos do contato

- profissional;
- data e hora do contato;
- canal;
- observação opcional;
- lojas apresentadas/expostas naquele contato;
- usuário responsável pelo registro;
- data de criação do registro.

### 8.4 Canais sugeridos

- WhatsApp
- Ligação
- Instagram
- E-mail
- Outro

### 8.5 Relação contato × lojas

O cliente normalmente apresenta todas as lojas que representa ao realizar um contato.

Portanto, ao registrar um contato:

1. o sistema deve pré-selecionar todas as lojas atualmente ativas;
2. o usuário pode revisar a seleção antes de salvar;
3. o sistema deve salvar a lista de lojas associadas àquele contato como **snapshot histórico**.

Essa relação não deve ser recalculada posteriormente com base nas lojas que estiverem ativas no futuro.

Exemplo:

- em agosto existiam 8 lojas ativas;
- um profissional foi contatado e as 8 foram apresentadas;
- em outubro uma dessas lojas foi inativada;
- o contato de agosto continua registrando que aquela loja recebeu exposição naquele momento.

### 8.6 Correção de contato

Como foi discutida a possibilidade de clique por engano, o administrador deve conseguir remover/corrigir um contato inserido incorretamente.

---

## 9. Domínio: Lojas

### 9.1 Definição

Loja é uma empresa/parceiro comercial representado pela HORN.

### 9.2 Campos

- nome da loja;
- segmento/categoria da loja;
- nome do contato/responsável;
- telefone ou contato principal;
- status: Ativa / Inativa;
- valor fixo mensal, quando houver;
- percentual de comissão, quando houver;
- data de início/contratação, quando essa informação estiver disponível e for útil;
- observações opcionais;
- data/hora de criação;
- data/hora de atualização.

### 9.3 Regras

- para o fluxo operacional do sistema, a loja deve possuir apenas o status **Ativa** ou **Inativa**;
- estados da planilha atual como “Reunião”, “Somente Comissão” e “Não tivemos contato” não devem ser transformados em estágios do fluxo da loja;
- “Somente Comissão” deve ser representado pela ausência de valor fixo mensal e presença de percentual de comissão;
- o valor fixo mensal é uma informação contratual e **não participa do cálculo da comissão de propostas**;
- a comissão de uma proposta fechada deve usar o percentual aplicável ao negócio, preservado historicamente;
- se o percentual padrão da loja mudar no futuro, negócios antigos não podem ter sua comissão recalculada retroativamente.

---

## 10. Domínio: Projetos & Propostas

### 10.1 Definição

O registro de Projeto & Proposta representa a oportunidade comercial que nasce quando um profissional demonstra uma demanda concreta e solicita orçamento/projeto para um serviço fornecido por uma loja representada.

Esse registro une:

- um profissional;
- uma única loja;
- uma demanda/projeto;
- o histórico da proposta correspondente.

### 10.2 Relação obrigatória

Cada registro pertence sempre a:

**1 profissional + 1 loja.**

Uma mesma demanda não deve apontar simultaneamente para várias lojas.

Se um profissional pedir mármore e marcenaria, devem existir dois registros diferentes, cada um ligado à loja correspondente.

### 10.3 Campos principais

- profissional;
- loja;
- título ou descrição curta da demanda;
- observações;
- status atual;
- valor inicial da proposta;
- valor final fechado;
- percentual de comissão aplicado ao negócio;
- valor de comissão gerado;
- motivo/observação de perda, opcional;
- data/hora de criação;
- data/hora de atualização;
- histórico de mudanças de status;
- um ou mais PDFs de proposta, opcionais.

### 10.4 Percentual histórico da comissão

No momento relevante do negócio, o percentual de comissão usado deve ser preservado no próprio registro da oportunidade/proposta.

Isso evita que uma alteração futura no cadastro da loja modifique resultados antigos.

### 10.5 Valores

Existem dois valores distintos:

#### Valor inicial da proposta

É o valor retornado inicialmente pela loja para aquele projeto.

#### Valor final fechado

É o valor efetivamente negociado e aceito externamente.

A comissão é calculada sobre o **valor final fechado**, não sobre o valor inicial.

Fórmula:

`comissão gerada = valor final fechado × percentual de comissão do negócio`

Exemplo:

- proposta inicial: R$ 20.000,00;
- valor fechado após negociação: R$ 18.000,00;
- comissão: 3%;
- comissão gerada: R$ 540,00.

---

## 11. Fluxo funcional oficial

Este é o fluxo que deve orientar a implementação do MVP.

### Etapa 1 - Profissional cadastrado

A HORN insere o profissional na base.

Resultado:

- profissional aparece na carteira;
- ainda não conta como contato realizado;
- ainda não existe projeto/proposta.

### Etapa 2 - Contato realizado

A HORN entra em contato externamente via WhatsApp, ligação ou outro meio e apresenta a HORN/lojas.

Depois disso, entra no sistema e registra o contato.

Resultado:

- contato ganha data/hora;
- lojas apresentadas ficam registradas;
- dashboards passam a contabilizar o profissional alcançado no período.

### Etapa 3 - Profissional gera uma demanda

O profissional retorna externamente, agenda uma conversa ou envia uma solicitação de orçamento/projeto.

Quando existir uma demanda concreta que deve seguir para uma loja, a HORN cria um registro de Projeto & Proposta.

Resultado:

- oportunidade passa a existir;
- profissional e loja ficam vinculados;
- a conversão contato → projeto passa a poder ser medida.

### Etapa 4 - Projeto recebido

Status inicial do registro:

**Projeto recebido**

Significa que a HORN recebeu a demanda/projeto do profissional.

### Etapa 5 - Projeto encaminhado externamente para a loja

A HORN realiza o envio fora da plataforma.

Depois atualiza manualmente no sistema:

**Aguardando proposta da loja**

O sistema registra automaticamente a data/hora da mudança.

### Etapa 6 - Loja retorna a proposta externamente

Quando a loja devolver a proposta, a HORN atualiza manualmente:

**Proposta recebida**

Nesse estágio deve ser possível:

- registrar o valor inicial da proposta;
- anexar o PDF da proposta.

### Etapa 7 - Proposta enviada externamente ao profissional

A HORN encaminha o PDF/valor ao profissional por fora do sistema.

Depois marca no sistema:

**Proposta enviada ao profissional**

A plataforma não envia a proposta.

### Etapa 8 - Negociação externa

Caso haja negociação, a HORN pode marcar:

**Em negociação**

A negociação continua acontecendo fora da plataforma.

### Etapa 9A - Negócio fechado

Quando houver aceite externo, a HORN marca manualmente:

**Fechada**

Para fechar, deve registrar o valor final efetivamente negociado.

O sistema calcula a comissão automaticamente.

### Etapa 9B - Negócio perdido

Quando houver recusa ou encerramento sem venda, a HORN marca:

**Perdida**

Pode ser registrada uma observação/motivo opcional.

### Fluxo resumido

`Profissional cadastrado`

→ `Contato realizado`

→ `Projeto recebido`

→ `Aguardando proposta da loja`

→ `Proposta recebida`

→ `Proposta enviada ao profissional`

→ `Em negociação` (quando aplicável)

→ `Fechada` **ou** `Perdida`

> **Importante:** “Contato realizado” pertence ao histórico de contatos e não é tecnicamente um status da proposta. O funil de Projeto & Proposta começa quando surge uma demanda concreta.

---

## 12. Histórico de status

Cada alteração de status em Projeto & Proposta deve gerar automaticamente um registro histórico contendo, no mínimo:

- oportunidade/proposta;
- status anterior;
- novo status;
- data/hora;
- usuário responsável.

O usuário não deve precisar preencher manualmente a data de cada mudança.

Esse histórico é necessário tanto para auditoria quanto para dashboards por período.

A alteração do status atual e a criação do registro de histórico devem ocorrer de maneira consistente, evitando estado atualizado sem histórico correspondente.

---

## 13. PDFs de proposta

### 13.1 Escopo

O MVP pode armazenar PDFs de propostas.

Não deve armazenar arquivos pesados de projeto de arquitetura/engenharia como requisito do MVP.

### 13.2 Regras

- upload opcional;
- aceitar PDF;
- permitir mais de um PDF por Projeto & Proposta para preservar revisões quando necessário;
- registrar data de upload;
- relacionar o arquivo à oportunidade e, consequentemente, à loja;
- a HORN pode acessar todos os PDFs;
- uma loja só pode acessar PDFs ligados às próprias propostas;
- se o limite de armazenamento do serviço se tornar insuficiente no futuro, avaliar armazenamento externo sem alterar o fluxo principal.

---

## 14. Dashboard HORN

### 14.1 Objetivo

Dar à HORN uma visão consolidada da carteira, do trabalho realizado e dos resultados comerciais.

### 14.2 Indicadores principais

#### Carteira

- total de profissionais cadastrados;
- total de profissionais ativos;
- profissionais por segmento;
- profissionais por região.

#### Atividade no período

- profissionais contatados;
- total de registros de contato;
- projetos/demandas recebidos;
- propostas recebidas das lojas;
- propostas enviadas aos profissionais;
- propostas fechadas;
- propostas perdidas.

#### Valores

- valor total das propostas enviadas;
- valor total fechado;
- comissão total gerada.

#### Comparativos

- resultado por loja;
- distribuição por segmento;
- distribuição por região;
- conversão entre contatos e projetos, quando a informação for útil para análise.

### 14.3 Semântica dos KPIs de contato

Para evitar inflar a percepção de alcance:

- **Profissionais contatados** = quantidade de profissionais distintos com pelo menos um contato registrado no período;
- **Contatos realizados** = quantidade total de eventos de contato registrados no período.

O KPI principal apresentado às lojas deve ser “Profissionais contatados”.

### 14.4 Filtros

Permitir no mínimo:

- período personalizado;
- mês;
- trimestre;
- semestre;
- ano;
- loja, na visão administrativa;
- segmento;
- região.

O filtro mensal deve ser especialmente simples, pois é o recorte mais utilizado pelo cliente.

### 14.5 Regra temporal dos indicadores

Cada indicador deve usar a data do evento que realmente representa aquele KPI.

Exemplos:

- profissionais contatados → data do contato;
- projetos recebidos → data de criação/recebimento do projeto;
- propostas enviadas → data da transição para “Proposta enviada ao profissional”;
- negócios fechados → data da transição para “Fechada”;
- valor fechado/comissão → negócios que foram fechados no período.

Não usar apenas `created_at` da oportunidade para todos os indicadores.

---

## 15. Dashboard da Loja

### 15.1 Objetivo

Mostrar de forma simples e convincente o trabalho que a HORN está realizando para aquela marca e os resultados comerciais relacionados exclusivamente àquela loja.

### 15.2 Indicadores

- profissionais contatados no período nos quais a loja foi apresentada;
- profissionais contatados por segmento;
- profissionais contatados por região;
- projetos/demandas recebidos para a loja;
- propostas recebidas/enviadas relacionadas à loja;
- quantidade de fechamentos;
- quantidade de perdas;
- valor total de propostas enviadas;
- valor total fechado;
- comissão gerada para a HORN.

### 15.3 Visibilidade de profissionais

Como detalhamento dos indicadores, pode existir uma lista restrita contendo informações suficientes para demonstrar o trabalho realizado, como:

- nome;
- segmento;
- região;
- data do contato.

Telefone, e-mail, Instagram e demais dados completos da base não são requisito de exibição para a loja no MVP e não devem ser expostos por padrão.

### 15.4 Isolamento

Uma loja nunca deve conseguir visualizar:

- oportunidades de outra loja;
- valores de outra loja;
- comissão de outra loja;
- anexos de outra loja;
- métricas específicas de outra loja;
- lista de quais outras lojas foram apresentadas no mesmo contato.

---

## 16. Tela de Projetos & Propostas

### 16.1 Lista

A HORN deve conseguir consultar os registros com:

- profissional;
- loja;
- descrição curta;
- status atual;
- valor inicial;
- valor final, quando fechado;
- comissão, quando fechada;
- data de criação;
- última atualização.

### 16.2 Filtros

- status;
- loja;
- profissional;
- período;
- fechadas/perdidas/abertas.

### 16.3 Detalhe

Exibir:

- profissional;
- loja;
- descrição da demanda;
- status atual;
- timeline/histórico de status;
- valores;
- comissão;
- PDFs;
- observações.

### 16.4 Atualização manual

Toda movimentação é manual e deve refletir fatos externos.

Exemplos de ações:

- “Marcar como aguardando proposta da loja”;
- “Marcar proposta como recebida”;
- “Marcar proposta como enviada ao profissional”;
- “Marcar como em negociação”;
- “Marcar como fechada”;
- “Marcar como perdida”.

---

## 17. Regras de validação

### 17.1 Profissional

- nome obrigatório;
- segmento obrigatório;
- telefone opcional;
- e-mail opcional;
- Instagram opcional;
- regiões opcionais e múltiplas.

### 17.2 Contato

- profissional obrigatório;
- data/hora obrigatória, preenchida por padrão com o momento atual;
- pelo menos um canal de contato;
- lojas apresentadas pré-selecionadas a partir das lojas ativas, mas revisáveis antes de salvar.

### 17.3 Projeto & Proposta

- profissional obrigatório;
- loja obrigatória;
- descrição curta recomendada;
- não permitir loja inativa para novas oportunidades sem confirmação explícita do administrador;
- ao marcar “Proposta recebida”, solicitar o valor inicial quando ele estiver disponível;
- ao marcar “Fechada”, exigir valor final fechado;
- ao marcar “Fechada”, exigir percentual de comissão válido ou usar o percentual previamente preservado;
- calcular comissão automaticamente;
- ao marcar “Perdida”, permitir motivo opcional.

---

## 18. Modelo conceitual de dados

Esta seção define entidades e relações. O SQL será produzido separadamente no próximo passo.

### 18.1 Entidades

#### `user_profiles`

Representa os usuários autenticados e seus papéis.

Principais conceitos:

- referência ao usuário do Supabase Auth;
- nome;
- role (`admin` ou `store`);
- loja relacionada quando role = `store`;
- ativo/inativo.

#### `stores`

Cadastro das lojas representadas.

#### `professionals`

Cadastro mestre dos profissionais.

#### `segments`

Catálogo dos segmentos oficiais.

#### `regions`

Catálogo das regiões oficiais.

#### `professional_regions`

Relação muitos-para-muitos entre profissionais e regiões.

#### `contacts`

Eventos de contato com profissionais.

#### `contact_stores`

Relação histórica entre um contato e as lojas apresentadas naquele contato.

#### `opportunities`

Registro principal de Projeto & Proposta, ligado a um profissional e uma loja.

#### `opportunity_status_history`

Histórico das mudanças de status das oportunidades.

#### `proposal_attachments`

Metadados dos PDFs ligados a oportunidades.

### 18.2 Relações principais

- um profissional possui várias regiões;
- um profissional possui vários contatos;
- um contato pertence a um profissional;
- um contato pode estar associado a várias lojas apresentadas;
- uma loja pode estar associada a vários contatos;
- um profissional possui várias oportunidades;
- uma loja possui várias oportunidades;
- uma oportunidade pertence exatamente a um profissional e uma loja;
- uma oportunidade possui vários registros de histórico;
- uma oportunidade pode possuir vários PDFs.

---

## 19. Segurança mínima obrigatória do MVP

Embora exista uma etapa posterior de hardening de segurança, o MVP colocado na internet não deve nascer com isolamento inexistente.

### 19.1 Requisitos mínimos

- autenticação por Supabase Auth;
- RLS ativada nas tabelas de dados sensíveis;
- role admin com acesso administrativo;
- role store restrita à própria loja;
- usuário de loja sem permissão de escrita nos dados comerciais;
- secrets privilegiados apenas no servidor/ambiente apropriado;
- políticas de storage para impedir acesso a PDFs de outras lojas;
- consultas de dashboard não podem permitir que um usuário altere `store_id` no cliente e obtenha dados de outra loja.

### 19.2 Hardening posterior

Quando o produto estiver funcionalmente maduro, executar revisão dedicada de:

- políticas RLS;
- rotas e ações server-side;
- validação de inputs;
- storage;
- permissões;
- exposição de dados;
- testes automatizados de isolamento entre lojas.

---

## 20. Migração da base atual

### 20.1 Fonte

O arquivo atual `Base Dados.xlsx` possui uma aba `CRM`, com 435 registros de profissionais e as colunas:

- Profissional
- E-mail
- Instagram
- Telefone
- Status
- Ocupação
- Endereço
- CEP
- Cidade
- Estado
- Região de atuação
- Aniversário - Dia
- Aniversário - Mês
- Negociando
- Pendente
- Finalizado
- Cadastrado em

### 20.2 Observações da base

- os 435 registros atuais estão marcados como Ativo;
- a base atual é majoritariamente composta por profissionais classificados como “Arquiteta”;
- existem poucos campos completos de endereço/cidade;
- telefone, e-mail, Instagram, região e aniversário estão ausentes em muitos registros;
- regiões atuais aparecem em texto livre e, em alguns casos, contêm várias regiões no mesmo campo;
- existem formatos diferentes de telefone, incluindo links `wa.me`;
- existem inconsistências de datas/aniversários decorrentes do formato da planilha;
- existem nomes potencialmente duplicados ou registros duplicados com variações de escrita e contato;
- as colunas “Negociando”, “Pendente” e “Finalizado” não possuem conteúdo útil na base fornecida e não devem virar status do profissional no novo domínio.

### 20.3 Estratégia de importação

- importar sem exigir que todos os campos estejam preenchidos;
- normalizar o segmento antigo para as categorias oficiais quando a correspondência for clara;
- mapear regiões antigas para as categorias oficiais apenas quando a correspondência for inequívoca;
- casos ambíguos devem ser marcados para revisão, não adivinhados;
- não mesclar automaticamente possíveis duplicidades;
- normalizar telefones quando possível, preservando o dado original se necessário;
- converter aniversários somente quando a interpretação for segura;
- preservar data de cadastro antiga quando houver valor confiável;
- não importar “Negociando”, “Pendente” e “Finalizado” como atributos comerciais do profissional.

---

## 21. Dados de lojas existentes

A planilha/material atual de lojas deve ser usada como referência para os cadastros iniciais.

O novo sistema deve representar de forma estruturada principalmente:

- nome;
- segmento da loja;
- responsável/contato;
- status ativa/inativa;
- valor fixo mensal, quando houver;
- percentual de comissão, quando houver.

Os estados operacionais da planilha atual não devem ser copiados literalmente como funil da loja.

Os valores e nomes atuais são dados iniciais, não regras hardcoded no código.

---

## 22. Funcionalidades explicitamente fora do MVP

Não implementar no primeiro MVP:

- integração real com WhatsApp;
- disparo automático de mensagens;
- leitura automática de WhatsApp;
- automação de follow-up;
- IA para movimentar funil;
- e-mails automáticos;
- notificações e reativação automática;
- geração automática de proposta;
- envio da proposta pela plataforma;
- aceite ou recusa da proposta dentro da plataforma;
- assinatura eletrônica;
- portal do profissional;
- contas a pagar;
- contas a receber;
- conciliação financeira;
- parcelamento do cliente final;
- controle de repasses parcelados de comissão;
- integração bancária;
- armazenamento de arquivos pesados de projeto;
- módulo completo de eventos/showroom;
- agenda de convidados e confirmações de eventos;
- automações complexas de CRM.

A ausência dessas funcionalidades é intencional e faz parte do escopo.

---

## 23. Módulo de eventos/showroom

A ideia de registrar visitas, eventos, convites e presenças surgiu na reunião, porém foi reconhecida como uma funcionalidade separada do fluxo principal de contatos e propostas.

Portanto:

- **não faz parte do MVP atual**;
- não deve ser simulada como status de proposta;
- pode virar módulo futuro com suas próprias entidades de evento, convidados, confirmações e presença.

---

## 24. Requisitos de responsividade

A aplicação deve funcionar em:

- desktop;
- notebook;
- tablet;
- celular.

Entretanto, não é necessário otimizar a primeira experiência como uma ferramenta de trabalho em obra/campo. O próprio cliente indicou que o preenchimento principal será feito posteriormente, normalmente em ambiente de escritório.

No celular, priorizar:

- consulta;
- edição simples;
- cadastro rápido;
- registro rápido de contato.

---

## 25. Critérios de aceite do MVP

### 25.1 Autenticação

- [ ] Admin consegue fazer login.
- [ ] Usuário de loja consegue fazer login.
- [ ] Usuário não autenticado não acessa áreas privadas.
- [ ] Loja não acessa dados de outra loja.

### 25.2 Profissionais

- [ ] Admin cadastra profissional com nome e segmento.
- [ ] Campos opcionais não impedem cadastro.
- [ ] Profissional aceita múltiplas regiões.
- [ ] Lista permite busca e filtros.
- [ ] Admin edita e inativa profissional.
- [ ] Cadastro não cria contato automaticamente.

### 25.3 Contatos

- [ ] Admin registra contato para um profissional.
- [ ] Data/hora é registrada.
- [ ] Canal é registrado.
- [ ] Lojas ativas aparecem pré-selecionadas.
- [ ] Relação com lojas é salva historicamente.
- [ ] Dashboard contabiliza o contato no período correto.
- [ ] Contato inserido por engano pode ser corrigido/removido.

### 25.4 Lojas

- [ ] Admin cadastra loja.
- [ ] Admin informa valor fixo mensal quando aplicável.
- [ ] Admin informa percentual de comissão quando aplicável.
- [ ] Loja pode ser ativada/inativada.
- [ ] Loja inativa não aparece automaticamente em novos contatos.

### 25.5 Projetos & Propostas

- [ ] Admin cria oportunidade ligada a um profissional e uma loja.
- [ ] Uma oportunidade não pode pertencer a várias lojas.
- [ ] Admin movimenta status manualmente.
- [ ] Cada mudança gera histórico com timestamp.
- [ ] Admin registra valor inicial da proposta.
- [ ] Admin pode anexar PDF.
- [ ] Admin marca proposta como enviada sem a plataforma realizar o envio.
- [ ] Admin marca negócio como fechado ou perdido após resultado externo.
- [ ] Fechamento exige valor final.
- [ ] Comissão é calculada sobre o valor final.
- [ ] Percentual usado no negócio é preservado historicamente.

### 25.6 Dashboard HORN

- [ ] Exibe tamanho da base.
- [ ] Exibe profissionais por segmento.
- [ ] Exibe profissionais por região.
- [ ] Exibe profissionais contatados no período.
- [ ] Exibe projetos recebidos.
- [ ] Exibe propostas enviadas.
- [ ] Exibe fechamentos.
- [ ] Exibe valores propostos e fechados.
- [ ] Exibe comissão gerada.
- [ ] Permite filtro por período.
- [ ] Permite visão por loja.

### 25.7 Dashboard Loja

- [ ] Loja vê somente os próprios indicadores.
- [ ] Loja vê profissionais alcançados para a sua marca.
- [ ] Loja vê distribuição por segmento/região.
- [ ] Loja vê somente seus projetos/propostas.
- [ ] Loja vê seus valores fechados e comissão correspondente.
- [ ] Loja não vê dados comerciais de outra loja.

### 25.8 Arquivos

- [ ] Admin pode anexar PDF à oportunidade.
- [ ] Loja só acessa PDF de oportunidade da própria loja.
- [ ] Arquivos pesados de projeto não fazem parte do fluxo.

---

## 26. Ordem recomendada de implementação

### Fase 1 - Estrutura

1. criar projeto Next.js + TypeScript + Tailwind;
2. configurar Supabase;
3. configurar Vercel e variáveis de ambiente;
4. configurar autenticação;
5. criar layout principal e identidade HORN.

### Fase 2 - Domínio básico

1. lojas;
2. segmentos e regiões;
3. profissionais;
4. relação profissional × região;
5. importação inicial da planilha.

### Fase 3 - Contatos

1. registro de contatos;
2. associação contato × lojas;
3. histórico/listagem;
4. métricas de contato.

### Fase 4 - Projetos & Propostas

1. criação da oportunidade;
2. estágios;
3. histórico automático;
4. valores;
5. comissão;
6. PDFs.

### Fase 5 - Dashboards

1. dashboard HORN;
2. filtros por período;
3. visão por loja;
4. dashboard de usuário loja;
5. gráficos e cards.

### Fase 6 - Validação

1. teste interno;
2. deploy preview Vercel;
3. validação com cliente;
4. correções de fluxo e interface.

### Fase 7 - Hardening

1. auditoria de RLS;
2. testes de isolamento entre lojas;
3. revisão de storage;
4. validações server-side;
5. revisão de exposição de dados;
6. segurança final antes da produção definitiva.

---

## 27. Regras que o agente de desenvolvimento NÃO deve reinterpretar

1. **O sistema não envia propostas.** Ele registra que a proposta foi enviada externamente.
2. **O sistema não recebe aceite/recusa do profissional.** A HORN registra manualmente o resultado ocorrido fora.
3. **Cadastrar profissional não significa contato realizado.**
4. **Contato é histórico, não booleano permanente.**
5. **Um contato pode representar exposição para várias lojas.**
6. **Uma oportunidade/proposta pertence a uma única loja.**
7. **Um profissional pode ter várias oportunidades simultâneas.**
8. **Status comercial pertence à oportunidade, não ao profissional.**
9. **Comissão é calculada sobre o valor final fechado.**
10. **Valor inicial e valor final são informações diferentes.**
11. **Valor fixo mensal da loja não faz parte do cálculo da proposta.**
12. **Não implementar contas a receber/parcelamento no MVP.**
13. **Não implementar eventos/showroom no MVP.**
14. **Não implementar automação de WhatsApp ou e-mail no MVP.**
15. **Não transformar a planilha existente em interface 1:1.** Os dados devem ser normalizados para o novo domínio.
16. **Não expor dados de outras lojas para usuário de loja.**
17. **Não mesclar duplicidades da importação automaticamente.**
18. **Não adivinhar mapeamentos ambíguos de região ou data durante a importação.**

---

## 28. Resultado esperado do MVP

Ao final do MVP, a HORN deve conseguir demonstrar algo como:

> “Neste mês, nossa carteira possui X profissionais. Entramos em contato com Y profissionais e apresentamos sua marca a eles. Desses contatos surgiram Z projetos para sua loja. A loja retornou N propostas, M foram enviadas aos profissionais, K negócios foram fechados, gerando R$ V em vendas e R$ C em comissão.”

Essa é a essência do produto.

Se uma funcionalidade não contribui diretamente para cadastrar a carteira, registrar o trabalho realizado, acompanhar projetos/propostas, calcular o resultado ou apresentar esses indicadores às lojas, ela deve ser questionada antes de entrar no MVP.

---

## 29. Fontes consolidadas para esta especificação

Esta especificação foi elaborada a partir de:

- reunião de requisitos com o cliente em 11/08/2026;
- fluxo escrito posteriormente pelo cliente com segmentos, regiões e sequência operacional;
- arquivo `Base Dados.xlsx`;
- material visual da planilha de lojas/clientes;
- logotipo/material visual da HORN;
- reunião técnica posterior sobre stack, processo de desenvolvimento e uso de IA;
- alinhamentos posteriores, especialmente a confirmação de que envio, negociação, aceite e recusa de propostas acontecem fora da plataforma e são apenas registrados manualmente no sistema.

---

# Fim da especificação
