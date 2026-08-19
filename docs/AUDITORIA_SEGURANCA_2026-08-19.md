# HORN — Auditoria de segurança e isolamento de dados

**Data:** 19/08/2026
**Escopo:** autenticação, roles, autorização, RLS, isolamento entre lojas, Server Actions, rotas, RPCs, Storage, exposição de dados sensíveis
**Alvos testados:** local (`localhost:3000`, branch `controle-de-acesso-por-role`) e produção (`https://plataforma-horn.vercel.app`)
**Branch auditada:** `controle-de-acesso-por-role` @ `f7c10dc`

---

## 1. Resumo

O isolamento entre lojas é feito no banco, com RLS, e **funciona**. Foram executadas 189 verificações automatizadas contra o Supabase real, sempre com sessões de usuário reais — nunca com a service role, que ignora RLS e não provaria nada. Loja A não conseguiu ler, escrever, apagar nem baixar absolutamente nada da Loja B por nenhum dos caminhos testados: id direto, filtro por `store_id`, argumento de RPC adulterado, embed do PostgREST, path forjado no Storage, URL assinada, `move`/`copy` de objeto, Server Action chamada fora da interface, ou manipulação do próprio `user_metadata`.

O desenho da autorização está correto e é a parte mais forte do sistema. A role e o `store_id` **nunca** vêm do cliente: saem sempre de `user_profiles` a partir de `auth.uid()`, dentro de funções `SECURITY DEFINER` com `search_path` fixado. As tabelas de PII (`professionals`, `contacts`, `contact_stores`) são admin-only por RLS, e a loja só as alcança através de RPCs que devolvem exclusivamente os campos aprovados.

Foram encontrados **4 problemas**, sendo **1 de severidade Alta**, e ele não está no código auditado — está no que foi implantado.

> **O achado principal é de processo, não de código:** produção roda a branch `main` (`45f0c1e`), que é **anterior** a toda a implementação de controle de acesso por role. Os dois commits que criam essa camada (`e40afa5` e `f7c10dc`) existem só na branch auditada. Em produção, hoje, não há `requireAdminUser()`, não há `authorizeAdminAction()`, não há gate de rota administrativa, e `getSessionUser()` contém `role: profile?.role ?? "admin"` — exatamente o fallback para admin que esta auditoria proíbe. **Nenhum dado vaza hoje porque a RLS segura sozinha**, o que foi confirmado por teste, mas a margem em produção é zero: é uma única camada, e a segunda e a terceira estão prontas e não implantadas.

As duas correções de severidade Média foram aplicadas na migration `0008_least_privilege_hardening.sql`, já executada no banco e reverificada.

---

## 2. Vulnerabilidades encontradas

### V1 — Produção roda versão sem a camada de autorização da aplicação

| | |
| --- | --- |
| **Severidade** | **Alta** |
| **Componente** | Deploy / branch `main` @ `45f0c1e` |
| **Status** | ⚠️ **Não corrigido** — depende de deploy, não de código |

**Descrição.** A Vercel publica `main`. Os commits `e40afa5` ("Implementa o controle de acesso por usuário e role") e `f7c10dc` ("Provisiona acesso por senha provisória…") estão apenas em `controle-de-acesso-por-role`. Em produção, portanto:

- não existe `requireAdminUser()` em nenhuma página;
- não existe `authorizeAdminAction()` em nenhuma Server Action;
- o proxy não tem o gate `isAdminOnlyRoute`;
- `src/lib/auth/session.ts` faz `role: profile?.role ?? "admin"` — um usuário sem linha em `user_profiles` é tratado como **administrador**;
- `is_active` é ignorado: um perfil desativado continua entrando;
- não existe a tela `/sem-acesso` nem o fluxo de senha provisória.

**Cenário de exploração.** Um usuário de loja acessa `https://plataforma-horn.vercel.app/profissionais` digitando a URL. Em produção a página **responde HTTP 200 e renderiza** (localmente ela redireciona para `/dashboard`). A tela vem vazia porque a RLS devolve zero linhas — mas quem barrou foi o banco, não a aplicação. O mesmo vale para `/contatos` e `/lojas`. Chamando as Server Actions administrativas diretamente por HTTP (sem interface), em produção elas **executam** e só falham no banco: as respostas observadas foram `"Não foi possível alterar o status desta loja."` e `"Este arquivo não existe mais."` — mensagens de erro de dados, não de permissão. Na branch auditada, as mesmas chamadas param antes, com `"Você não tem permissão para executar esta ação."`.

O fallback para admin é o ponto mais grave. Hoje é pouco alcançável, porque o trigger `handle_new_auth_user` cria uma linha em `user_profiles` para todo usuário novo. Basta essa linha faltar — trigger que falhou, perfil apagado à mão — para o usuário ser tratado como admin pela aplicação inteira.

**Correção.** Fazer o merge de `controle-de-acesso-por-role` em `main` e publicar. Nenhuma alteração de código é necessária: a correção já está escrita e testada na branch. Enquanto isso não acontecer, **produção depende exclusivamente da RLS**.

---

### V2 — `anon` com permissão de EXECUTE em funções `SECURITY DEFINER`

| | |
| --- | --- |
| **Severidade** | **Média** |
| **Componente** | Banco — grants de função |
| **Status** | ✅ **Corrigido** — migration `0008` |

**Descrição.** Nove funções tinham `EXECUTE` concedido a `anon`, incluindo `get_store_opportunities_page`, `get_store_contact_reach`, `get_store_dashboard_metrics`, `get_store_opportunities`, `get_store_opportunity_professionals`, `is_admin` e `current_store_id`. A causa é o `ALTER DEFAULT PRIVILEGES` do Supabase, que concede `EXECUTE` a `anon`/`authenticated` no momento em que a função é criada: o `revoke all ... from public` do `schema.sql` não desfaz um grant nominal a `anon`. As migrations 0002/0005/0006/0007 já faziam `revoke ... from anon`; as funções do `schema.sql` base ficaram de fora.

**Cenário de exploração.** Testado: um chamador anônimo recebe HTTP 200 com resultado **vazio** — as funções são `SECURITY DEFINER` e todas filtram por `auth.uid()`, que é `NULL` sem sessão. Não há vazamento hoje. O risco é estrutural: a proteção inteira está no corpo da função, e qualquer edição futura que troque o filtro por `auth.uid()` por um parâmetro passa a responder para a internet aberta, sem que nada mais no sistema perceba.

**Correção.** `revoke execute ... from anon` nas nove funções. Mantido o `EXECUTE` de `authenticated`, que é como a aplicação funciona. Reverificado: `anon` não executa mais nenhuma função da aplicação. Sobram apenas as seis funções de trigger (`set_updated_at`, `prepare_opportunity`, etc.), que retornam `trigger`, não são expostas pelo PostgREST (respondem 404) e não podem ser chamadas diretamente.

---

### V3 — `authenticated` com privilégios de tabela além do que o repositório declara

| | |
| --- | --- |
| **Severidade** | **Média** |
| **Componente** | Banco — grants de tabela |
| **Status** | ✅ **Corrigido** — migration `0008` |

**Descrição.** Duas divergências entre o `schema.sql` e o banco real, ambas causadas pelo mesmo `ALTER DEFAULT PRIVILEGES`:

1. `authenticated` tinha `TRUNCATE`, `REFERENCES` e `TRIGGER` nas onze tabelas. **`TRUNCATE` ignora RLS** — é a única operação de escrita em massa que as policies de isolamento por loja não protegeriam.
2. `opportunity_status_history` tinha `INSERT/UPDATE/DELETE` para `authenticated`, embora o `schema.sql` peça `grant select` e só. A tabela é o histórico imutável de transições.

**Cenário de exploração.** Não explorável pelo PostgREST, que não expõe `TRUNCATE` e não oferece passagem de SQL cru; e a RLS já barrava a escrita no histórico (só existe policy de `SELECT`). É remoção de privilégio que nunca deveria existir, não fechamento de brecha ativa — mas o banco precisa corresponder ao que o repositório documenta.

**Correção.** `revoke truncate, references, trigger` das onze tabelas e `revoke insert, update, delete` em `opportunity_status_history`, ambos apenas para `authenticated`. A tentativa da loja de inserir no histórico, que antes era barrada pela RLS, agora é barrada antes: `403 permission denied for table opportunity_status_history`.

**Deliberadamente não alterado:** `INSERT/UPDATE/DELETE` de `authenticated` nas demais tabelas. O administrador é um usuário `authenticated` e escreve via PostgREST; quem separa admin de loja é a RLS, e essa é a arquitetura do projeto. Revogar ali quebraria o Admin sem ganho de segurança.

---

### V4 — `clear_must_change_password()` dá baixa na senha provisória sem exigir a troca

| | |
| --- | --- |
| **Severidade** | **Baixa** |
| **Componente** | `supabase/migrations/0007_provisional_password.sql` |
| **Status** | ⚠️ **Não corrigido** — documentado como risco residual |

**Descrição.** A função é `SECURITY DEFINER`, mexe só na própria linha do chamador e só sabe desligar a marca. Ela não verifica que a senha foi de fato trocada — a aplicação a chama logo após `updateUser({ password })`, mas nada obriga essa ordem. Um usuário de loja pode chamar a RPC direto (`POST /rest/v1/rpc/clear_must_change_password`, confirmado: HTTP 204) e continuar usando indefinidamente a senha provisória que o administrador conhece e que circulou por WhatsApp.

**Cenário de exploração.** Autoinfligido: quem contorna é o próprio dono da conta, e quem já tem a senha já tem o acesso. O controle que se perde é a rotação obrigatória — o objetivo declarado da coluna é que "a senha que circulou por fora não vale mais nada", e esse objetivo deixa de ser garantido.

**Por que não foi corrigido.** Não existe, no banco, um sinal confiável de "esta senha acabou de ser trocada": `auth.users.updated_at` muda por vários motivos. Qualquer verificação seria heurística e frágil, e a instrução desta auditoria é fazer mudanças mínimas e justificadas, não especulativas. Fica registrado para decisão. Se for tratado, o caminho natural é mover a baixa para o servidor, dentro da mesma Server Action que troca a senha, usando credencial administrativa — e aí a RPC pode deixar de existir.

---

### Observação não-vulnerabilidade — divergência de regra de negócio que precisa de confirmação

A migration `0005_store_reach_horn_wide.sql` (17/08/2026) mudou, deliberadamente, o significado de "alcance" no Dashboard da Loja: cada loja passa a ver **todos os profissionais contatados pela HORN no período**, inclusive nos contatos em que ela não foi apresentada. A spec, seção 15.2, dizia "profissionais contatados no período **nos quais a loja foi apresentada**".

Isso **não é uma falha** — está documentado no cabeçalho da migration com a justificativa (demonstrar à marca o tamanho real do esforço da HORN), e a auditoria não deve reverter regra de negócio por preferência arquitetural. Mas é uma ampliação real de compartilhamento de dados e vale confirmação explícita: **hoje a Loja A enxerga o nome, segmento e região de profissionais que a HORN apresentou apenas para concorrentes.**

O que continua protegido, e foi testado: a loja **não** descobre o vínculo contato × loja. Os dados comerciais (projetos, propostas, valores, comissão) continuam estritamente por loja.

---

## 3. RLS por entidade

Todas as onze tabelas têm RLS **habilitada**. Resultado verificado com sessões reais:

| Entidade | Admin | Store (própria) | Store (outra) | Anônimo | Resultado |
| --- | --- | --- | --- | --- | --- |
| `segments` | CRUD | SELECT | — (catálogo) | ❌ negado | ✅ |
| `regions` | CRUD | SELECT | — (catálogo) | ❌ negado | ✅ |
| `stores` | CRUD | SELECT (só a própria linha) | ❌ invisível | ❌ negado | ✅ |
| `user_profiles` | CRUD | SELECT (só o próprio) | ❌ invisível | ❌ negado | ✅ |
| `professionals` | CRUD | ❌ **negado** | ❌ negado | ❌ negado | ✅ |
| `professional_regions` | CRUD | ❌ **negado** | ❌ negado | ❌ negado | ✅ |
| `contacts` | CRUD | ❌ **negado** | ❌ negado | ❌ negado | ✅ |
| `contact_stores` | CRUD | ❌ **negado** | ❌ negado | ❌ negado | ✅ |
| `opportunities` | CRUD | **SELECT apenas** | ❌ negado | ❌ negado | ✅ |
| `opportunity_status_history` | SELECT | SELECT (da própria oportunidade) | ❌ negado | ❌ negado | ✅ |
| `proposal_attachments` | CRUD | **SELECT apenas** (da própria oportunidade) | ❌ negado | ❌ negado | ✅ |

Notas relevantes:

- **Nenhuma escrita para Store em lugar nenhum.** `INSERT`/`UPDATE`/`DELETE` são negados até na própria loja — a loja é read-only conforme a spec 4.2, e isso vale inclusive para a própria carteira.
- `professionals` e `contacts` são **admin-only por RLS**. A loja não lê essas tabelas nem para o profissional do próprio projeto; o que ela vê chega por RPC que devolve só nome, segmento, região e data.
- `opportunity_status_history` não tem policy de escrita: quem grava é o trigger `SECURITY DEFINER`, que roda como owner.
- Não existem views nem matviews no schema `public` — nenhuma superfície que pudesse contornar RLS por `security_invoker` desligado.
- `anon` não tem **nenhum** privilégio de tabela. Toda leitura anônima responde `401 permission denied`.

---

## 4. Storage

Bucket `proposal-pdfs`: **privado**, `allowed_mime_types = ['application/pdf']`. Convenção de path `{store_uuid}/{opportunity_uuid}/{arquivo}.pdf`. A policy da loja **não confia no path**: além de conferir o prefixo, valida que a oportunidade daquele segundo nível pertence de fato à loja do usuário.

| Teste | Esperado | Resultado |
| --- | --- | --- |
| Admin assina URL do PDF da Loja A | ✅ permitido | **PASS** |
| Admin assina URL do PDF da Loja B | ✅ permitido | **PASS** |
| Store A assina URL do próprio PDF | ✅ permitido | **PASS** |
| Store A assina URL do PDF da Loja B | ❌ negado | **PASS** (`Object not found`) |
| Store B assina URL do PDF da Loja A | ❌ negado | **PASS** (`Object not found`) |
| Anônimo assina URL de PDF | ❌ negado | **PASS** |
| Store A baixa o próprio objeto direto | ✅ permitido | **PASS** |
| Store A baixa o objeto da Loja B direto | ❌ negado | **PASS** |
| Anônimo baixa pela rota `/object/public/` | ❌ negado | **PASS** (`Bucket not found`) |
| **Store A forja path** (`storeA/oppB/arquivo-b.pdf`) | ❌ negado | **PASS** — a policy valida o vínculo real, não o prefixo |
| Store A lista o bucket inteiro | só a própria pasta | **PASS** — vê 1 pasta (a sua); Admin vê 3 |
| Store A lista a pasta da Loja B | ❌ negado | **PASS** (0 entradas) |
| Store A faz upload na **própria** pasta | ❌ negado | **PASS** (`violates row-level security policy`) |
| Store A faz upload na pasta da Loja B | ❌ negado | **PASS** |
| Store A apaga o próprio PDF | ❌ negado | **PASS** (403 `AccessDenied`) |
| Store A apaga o PDF da Loja B | ❌ negado | **PASS** |
| Store A apaga PDFs em lote (`remove`) | ❌ negado | **PASS** (0 objetos apagados) |
| Store A move o PDF da Loja B para a própria pasta | ❌ negado | **PASS** |
| Store A copia o PDF da Loja B | ❌ negado | **PASS** |
| Admin faz upload de PDF | ✅ permitido | **PASS** |

**Signed URLs.** Geradas com a sessão do usuário, expiração de 300s, criadas sob demanda e nunca persistidas. O token é assinado **por objeto**: reaproveitar o token emitido para o PDF da Loja A no path do PDF da Loja B devolve `InvalidSignature`. A service role não participa da geração.

---

## 5. Roles e `store_id`

**Origem da autoridade.** A role e o `store_id` saem sempre de `public.user_profiles`, resolvidos a partir de `auth.uid()` dentro de funções `SECURITY DEFINER` com `set search_path = ''`. A sessão é sempre validada com `getUser()` (que confere o token no servidor de auth), nunca com `getSession()`, que só lê o cookie e é falsificável.

**Nada vindo do cliente é confiável, e isso foi testado:**

| Tentativa | Resultado |
| --- | --- |
| Store A faz `PATCH user_profiles` mudando a própria `role` para `admin` | **PASS** — negado (só admin tem policy de UPDATE) |
| Store A muda o próprio `store_id` para a Loja B | **PASS** — negado |
| Store A faz upsert do próprio perfil como admin | **PASS** — negado (`violates RLS policy`) |
| Store A grava `role: "admin"` no `user_metadata` do Auth e tenta ler a Loja B | **PASS** — o metadata é gravado, e **não muda nada**: a role real vem do banco |
| Store A enumera perfis de outros usuários | **PASS** — enxerga 1 perfil (o seu) |
| Store A passa `p_store_id` da Loja B para `get_store_reach_breakdown` | **PASS** — `Not authorized` (exceção, não lista vazia) |

**Negar por padrão (branch auditada).** `getAccessState()` trata cinco motivos de recusa — `no_profile`, `unknown_role`, `store_without_store`, `inactive`, `profile_error` — e todos levam a `/sem-acesso`. Não existe caminho para admin por omissão, para "todas as lojas" ou para "a primeira loja encontrada". Erro ao ler o perfil também bloqueia. Em produção isso ainda não vale — ver **V1**.

---

## 6. Rotas e Server Actions

**Classificação.** Admin-only: `/profissionais`, `/contatos`, `/lojas` (fonte única em `src/lib/auth/routes.ts`, consumida pela Sidebar, pelo proxy e pelas páginas). Admin + Store: `/dashboard`, `/projetos-propostas`.

**Três camadas na branch:** o proxy corta a navegação, cada página administrativa chama `requireAdminUser()`, e a RLS recusa no banco.

| Teste (via HTTP, sem passar pela interface) | LOCAL | PROD |
| --- | --- | --- |
| Loja A acessa `/profissionais` | **PASS** (307 → `/dashboard`) | **FAIL** (200 — ver V1) |
| Loja A acessa `/contatos` | **PASS** (307) | **FAIL** (200 — ver V1) |
| Loja A acessa `/lojas` | **PASS** (307) | **FAIL** (200 — ver V1) |
| Loja A acessa `/profissionais/qualquer` (subrota) | **PASS** | **PASS** (404) |
| Admin acessa as três rotas | **PASS** | **PASS** |
| Anônimo acessa qualquer rota privada | **PASS** (307 → `/login`) | **PASS** |
| Loja A pede `/dashboard?loja=<Loja B>` | **PASS** — sem vazamento | **PASS** |
| Loja A pede `/projetos-propostas?loja=<Loja B>` | **PASS** — sem vazamento | **PASS** |
| Listagem da loja expõe `notes` internas da HORN | **PASS** — não expõe | **PASS** |
| Dashboard da loja expõe PII do profissional | **PASS** — não expõe | **PASS** |
| Dashboard da loja cita o nome de outra loja | **PASS** — não cita | **PASS** |

Nos três `FAIL` de produção a página responde 200 mas **renderiza vazia**: nenhum nome de profissional, nenhuma PII, nenhum dado administrativo. Quem barrou foi a RLS. É falha de camada, não vazamento.

**Server Actions chamadas diretamente.** Os IDs foram extraídos do bundle de cada alvo e invocados por HTTP com o header `Next-Action`, usando a sessão da Loja A e argumentos apontando para a Loja B. **25 PASS / 0 FAIL** nos dois alvos.

| Action | Argumento | LOCAL | PROD |
| --- | --- | --- | --- |
| `getOpportunityAction` | oportunidade da Loja B | `null` | `null` |
| `getOpportunityDetailsAction` | oportunidade da Loja B | vazio | vazio |
| `createAttachmentUrlAction` | anexo da Loja B | `Arquivo não encontrado` | `Arquivo não encontrado` |
| `getProfessionalOpportunitiesAction` | profissional compartilhado | vazio | `[]` |
| `getProfessionalContactsAction` | profissional compartilhado | vazio | `[]` |
| `moveOpportunityStatusAction` | oportunidade da Loja B → `lost` | **sem permissão** | negado pelo banco |
| `removeProposalAttachmentAction` | anexo da Loja B | **sem permissão** | negado pelo banco |
| `registerProposalAttachmentAction` | anexar na Loja B | **sem permissão** | negado pelo banco |
| `setProfessionalActiveAction` | inativar profissional | não alcançável | negado pelo banco |
| `setStoreActiveAction` | inativar Loja B | não alcançável | negado pelo banco |
| `deleteContactAction` | apagar contato | não alcançável | negado pelo banco |
| `provisionStoreAccessAction` / `resetStoreAccessPasswordAction` / `setStoreAccessActiveAction` | Loja B | não alcançável | não existe em `main` |

A diferença de mensagem é a diferença de camada: em **LOCAL** a action para em `authorizeAdminAction()` antes de tocar o banco; em **PROD** ela executa e o banco recusa.

**Route Handlers.** Existe um só: `src/app/auth/callback/route.ts`, o callback do Supabase Auth. Não recebe identificador de recurso, não consulta dado de negócio e não tem superfície de autorização. Não há `/api/*` no projeto.

---

## 7. RPCs

Dezenove funções em `public`, sendo dezessete `SECURITY DEFINER`. **Todas** têm `set search_path = ''` — nenhuma vulnerável a sequestro de `search_path`. Todas pertencem a `postgres`.

| Função | Como autoriza | Bypass? |
| --- | --- | --- |
| `is_admin()` / `current_store_id()` | leem `user_profiles` por `auth.uid()` | não |
| `get_store_dashboard_metrics` | CTE `current_store` a partir de `auth.uid()`; sem loja ativa, não produz linha | não |
| `get_store_contact_reach` | filtra por `auth.uid()` + role `store` + `is_active` | não |
| `get_store_opportunities` | idem | não |
| `get_store_opportunities_page` | resolve `v_store_id` do perfil; `null` → retorna vazio. **Não aceita loja por parâmetro** | não |
| `get_store_opportunity_professionals` | join com `user_profiles` por `auth.uid()` | não |
| `get_horn_reach_breakdown` | exige perfil ativo com role `store` ou `admin` | não |
| `get_store_reach_breakdown(p_store_id, …)` | **recebe loja por parâmetro** — ver abaixo | não |
| `get_admin_*` (6 funções) | `if not coalesce(is_admin(), false) then raise` | não |
| `get_store_access_summary` | `where (select is_admin())` | não |
| `register_contact` / `save_professional` | `SECURITY INVOKER` + `is_admin()` explícito; RLS como segunda camada | não |
| `clear_must_change_password` | só a própria linha, só desliga a marca | ver **V4** |
| triggers (`prepare_opportunity`, `record_opportunity_status_history`, `set_*`) | rodam como owner; PostgREST não as expõe (404) | não |

**`get_store_reach_breakdown` merece destaque** porque é a única que aceita `p_store_id` do cliente. A validação está correta e trata o caso sutil: resolve `current_store_id()` numa variável **antes** de comparar, porque uma comparação direta devolveria `NULL` para quem não tem loja, e `NULL` não entra no `if not (...)` — o chamador passaria sem autorização. Testado: Loja A pedindo a Loja B recebe exceção `Not authorized`, não lista vazia; pedindo a própria loja, funciona; Admin consulta qualquer uma.

Os `coalesce((select public.is_admin()), false)` nas funções de admin são o mesmo cuidado: `is_admin()` retornando `NULL` não passaria pelo `if not`.

---

## 8. Contact Stores

**Uma loja consegue descobrir quais outras marcas participaram do mesmo contato? Não.**

Este foi o teste mais dirigido da auditoria. O fixture criou um contato apresentando **as duas lojas ao mesmo tempo** — exatamente o cenário do enunciado (Contato X → Loja A, Loja B). Tentativas, todas com a sessão real da Loja A:

| Caminho | Resultado |
| --- | --- |
| `GET contact_stores?select=*` (tabela inteira) | **PASS** — negado, zero linhas |
| `GET contact_stores?contact_id=eq.<contato compartilhado>` | **PASS** — negado, zero linhas |
| `GET contact_stores?store_id=eq.<própria loja>` (os próprios vínculos) | **PASS** — negado, zero linhas |
| Embed do PostgREST: `opportunities?select=...,contacts(...)` | **PASS** — sem relação exposta no schema cache |
| `GET stores?select=id,name` (enumerar lojas) | **PASS** — enxerga **1** loja: a sua |
| `get_store_contact_reach` devolve `store_id`/`store_name`? | **PASS** — não devolve nenhum campo de loja |
| Dashboard da loja renderizado cita "SEC_TEST Loja B"? | **PASS** — não cita (local e prod) |

`contact_stores` é **admin-only por RLS**, sem exceção — a loja não lê nem as próprias linhas. As RPCs que alimentam o Dashboard da Loja devolvem profissional, segmento, região e data, e nunca a relação contato × loja. A loja também só enxerga a si mesma em `stores`, então não tem sequer o vocabulário de nomes para inferir.

Uma consequência da decisão de negócio da migration 0005 vale registrar com clareza: a Loja A **vê o nome dos profissionais** contatados pela HORN no período, mesmo os apresentados só a concorrentes. Ela não descobre *para quem* foram apresentados — mas sabe que foram contatados. Isso é intencional e está documentado; a confirmação está pedida na seção 2.

---

## 9. Testes Loja A × Loja B

Os cenários pedidos no enunciado, verificados com sessões reais:

| # | Cenário | Esperado | Resultado |
| --- | --- | --- | --- |
| 1 | Store A consulta oportunidade A | ✅ permitido | **PASS** |
| 2 | Store A consulta oportunidade B | ❌ negado | **PASS** |
| 3 | Store A manda `store_id` da Loja B no request | ❌ negado | **PASS** |
| 4 | Store A edita oportunidade A (própria) | ❌ negado | **PASS** |
| 5 | Store A edita oportunidade B | ❌ negado | **PASS** |
| 6 | Store A cria oportunidade | ❌ negado | **PASS** |
| 7 | Store A exclui oportunidade | ❌ negado | **PASS** |

Matriz do enunciado, item 31:

```
Admin   -> Opportunity Loja A  -> allowed        PASS
Admin   -> Opportunity Loja B  -> allowed        PASS
Store A -> Opportunity Loja A  -> read allowed   PASS
Store A -> Opportunity Loja A  -> write denied   PASS
Store A -> Opportunity Loja B  -> read denied    PASS
Store A -> Opportunity Loja B  -> write denied   PASS
Store B -> Opportunity Loja A  -> denied         PASS
Anonymous -> Private data      -> denied         PASS

Store A -> PDF Loja A          -> allowed        PASS
Store A -> PDF Loja B          -> denied         PASS
Anonymous -> PDF               -> denied         PASS

Store A -> contacts completos          -> denied  PASS
Store A -> professional private fields -> denied  PASS
```

**O teste mais importante (item 38)** — como Store A, deliberadamente:

| # | Tentativa | Resultado |
| --- | --- | --- |
| 1 | Obter projeto da Loja B | **PASS** — falhou |
| 2 | Obter valor de projeto da Loja B | **PASS** — falhou |
| 3 | Obter PDF da Loja B | **PASS** — falhou |
| 4 | Obter profissionais completos | **PASS** — falhou |
| 5 | Obter contatos administrativos | **PASS** — falhou |
| 6 | Obter relações `contact_stores` de outras lojas | **PASS** — falhou |
| 7 | Obter Dashboard da Loja B | **PASS** — falhou |
| 8 | Alterar oportunidade da própria loja | **PASS** — falhou |
| 9 | Alterar oportunidade da Loja B | **PASS** — falhou |
| 10 | Acessar tela administrativa | **PASS** local · ⚠️ 200 vazio em prod (V1) |
| 11 | Chamar action administrativa | **PASS** — falhou nos dois alvos |
| 12 | Mudar o próprio `store_id` | **PASS** — falhou |
| 13 | Mudar a própria role para Admin | **PASS** — falhou |

**Todas falharam.** Também testados e negados: manipular `user_metadata` do Auth, forjar path no Storage, reusar token de URL assinada em outro objeto, `move`/`copy` de objeto entre lojas, varredura de `proposal_attachments`, escrita no histórico de status, edição do cadastro da própria loja.

**Totais.** 189 verificações: 109 na suíte de banco/Storage (versão do repositório), 42 de rotas HTTP, 16 de cache/isolamento, 25 de Server Actions, mais as verificações de introspeção. **186 PASS / 3 FAIL**, os três atribuíveis exclusivamente ao V1 (defasagem de deploy).

---

## 10. Alterações

**Arquivos criados**

| Arquivo | Por quê |
| --- | --- |
| `supabase/migrations/0008_least_privilege_hardening.sql` | Correções V2 e V3 |
| `tests/authz.test.mjs` | Suíte de autorização — 109 casos (item 31) |
| `tests/fixtures.mjs` | Criação e remoção dos fixtures SEC_TEST |
| `tests/lib/client.mjs` | Clientes HTTP + mini runner, sem dependências |
| `tests/lib/env.mjs` | Leitura de `.env.local` sem imprimir valores |
| `tests/README.md` | Como rodar, o que é coberto, a regra de não usar service role |
| `docs/AUDITORIA_SEGURANCA_2026-08-19.md` | Este relatório |

**Arquivos alterados**

| Arquivo | Alteração |
| --- | --- |
| `package.json` | 3 scripts: `test:authz:setup`, `test:authz`, `test:authz:teardown` |
| `.gitignore` | Ignora `/tests/fixtures.json` (contém ids e senhas de teste) |

**Nenhum arquivo de aplicação foi alterado.** Nenhuma regra de negócio foi mexida. Nenhuma policy foi reescrita. `npm run lint` limpo e `npm run build` bem-sucedido após as mudanças.

---

## 11. SQL

Uma migration, `0008_least_privilege_hardening.sql`, **já aplicada** ao banco via `scripts/apply-sql.mjs --apply` e reverificada por introspeção. Não altera policy, função, tabela ou dado — só grants.

1. `revoke execute ... from anon` em 9 funções (`is_admin`, `current_store_id`, `get_store_contact_reach`, `get_store_opportunities`, `get_store_dashboard_metrics`, `get_store_opportunities_page`, `get_store_opportunity_professionals`, `register_contact`, `save_professional`).
2. `revoke truncate, references, trigger` de `authenticated` nas 11 tabelas.
3. `revoke insert, update, delete` de `authenticated` em `opportunity_status_history`.
4. `revoke all ... from anon` nas 11 tabelas (reforço idempotente, para a migration descrever o estado final sozinha).

O `schema.sql` **não foi alterado**: sua intenção já estava correta (ele pede `grant select` no histórico). A divergência vinha do `ALTER DEFAULT PRIVILEGES` do Supabase, não do arquivo. Isso segue a convenção do repositório, em que `schema.sql` é o bootstrap e `migrations/` carrega as mudanças posteriores.

Verificação depois de aplicar: `anon` não executa mais nenhuma função da aplicação; `opportunity_status_history` ficou `SELECT` apenas; `anon` sem nenhum privilégio de tabela; **Admin continua fazendo tudo** — `register_contact`, `save_professional`, `PATCH` em oportunidade, upload e delete de PDF, leitura do histórico, todas as RPCs, todas confirmadas em HTTP 200.

---

## 12. Fixtures

Criados durante a auditoria, todos com prefixo `SEC_TEST`, e **já removidos**. O banco foi conferido ao final e está exatamente como estava antes: 55 lojas, 5 perfis, 65 profissionais, 90 contatos, 315 `contact_stores`, 33 oportunidades, 1 anexo, 1 objeto no bucket — todos os números batendo com a contagem inicial. Zero resíduo `SEC_TEST`.

O que foi criado e removido: `SEC_TEST Loja A` e `SEC_TEST Loja B`; usuários `sec-test-loja-a@example.com`, `sec-test-loja-b@example.com`, `sec-test-admin@example.com`; `SEC_TEST Profissional` (com telefone, e-mail, Instagram, endereço e observação interna, usados como iscas de vazamento); um contato apresentando as duas lojas; uma oportunidade fechada por loja com valores e comissões distintos; um PDF por loja no bucket.

Para recriar e remover:

```bash
npm run test:authz:setup
```

```bash
npm run test:authz:teardown
```

O teardown apaga apenas registros com prefixo `SEC_TEST` e os três usuários listados. Nenhum dado real foi lido para escrita, alterado ou removido em nenhum momento da auditoria — nenhuma proposta real foi marcada como fechada ou perdida para testar autorização.

---

## 13. Pendências

1. **V1 — deploy da branch (Alta).** Depende de merge em `main` e publicação. É a única pendência que muda a postura de segurança de produção, e não é resolvível por código: o código já está pronto.
2. **V4 — `clear_must_change_password` (Baixa).** Documentada, não corrigida, pelo motivo explicado na seção 2.
3. **Confirmação da regra de alcance HORN-wide.** Precisa de um "sim, é isso mesmo" seu, não de código.
4. **Não testado: e-mail de recuperação de senha ponta a ponta.** O projeto não tem SMTP próprio; o fluxo é `/esqueci-a-senha` → link do Supabase. Verificado o que é verificável sem enviar e-mail: `disable_signup: true`, usuários anônimos desabilitados, rotação de refresh token ativa, `uri_allow_list` restrita aos domínios do projeto (`plataforma-horn.vercel.app`, previews `plataforma-horn-*`, `localhost:3000`) — o curinga genérico `*.vercel.app`, que deixaria qualquer app hospedado lá receber um token de recuperação, **não** está presente. `safeRedirectTo()` rejeita open redirect.
5. **Rate limiting de login.** Depende dos limites padrão do Supabase; não há proteção adicional na aplicação e `security_captcha_enabled` está desligado. Aceitável para o MVP com acessos provisionados internamente e signup desabilitado; vale revisitar se a base de lojas crescer.
6. **`SUPABASE_ACCESS_TOKEN` no `.env.local`.** É um personal access token da Management API, usado só por `scripts/apply-sql.mjs`. O próprio comentário do arquivo pede para revogá-lo após o setup. Como ele **executa DDL arbitrário no projeto**, convém revogá-lo quando não estiver aplicando migrations.

**Verificado e sem pendência:** XSS (nenhum `dangerouslySetInnerHTML`, `innerHTML`, `eval` ou `new Function` no projeto — registrado como verificado, item 29); mass assignment (todo `insert`/`update` lista campos explicitamente, nenhum spread de dado do cliente, e `commission_value` é coluna gerada que o banco recusa receber); secrets (a chave secreta aparece só em `src/lib/supabase/admin.ts`, sem prefixo `NEXT_PUBLIC_`, importada apenas por Server Component e `"use server"`, nunca no bundle do browser; nenhum `.env` versionado); logs (nenhuma senha, token, JWT ou cookie registrado — só `console.error` com tag de escopo e o objeto de erro); mensagens de erro (traduzidas para linguagem de usuário, sem stack trace, SQL, nome de policy ou estrutura interna); cache entre usuários (16/16 PASS na sequência Admin → Loja A → Loja B na mesma sessão de navegador, com `cache-control: private, no-cache, no-store` em produção); CORS (não há endpoint customizado nem configuração aberta).

---

## 14. Conclusão

### É seguro disponibilizar esta versão para testes do cliente?

## SIM, COM RESSALVAS

**O que sustenta o SIM.** O isolamento entre lojas é real e está no lugar certo — no banco. Foram 189 tentativas deliberadas de contornar a interface, e nenhuma delas conseguiu fazer a Loja A alcançar dado da Loja B: nem projeto, nem valor, nem comissão, nem PDF, nem profissional, nem contato, nem a relação `contact_stores` que revelaria as marcas concorrentes. A loja é efetivamente read-only, inclusive na própria carteira. A role e o `store_id` não são influenciáveis pelo cliente por nenhum caminho testado, incluindo escrita no `user_metadata` do Auth. O bucket é privado, as URLs assinadas são por objeto e expiram, e o path forjado não engana a policy. As duas falhas de menor privilégio encontradas foram corrigidas, aplicadas e reverificadas, sem quebrar nada do Admin.

**A ressalva, e ela é condicional e específica.** O que foi auditado como "bom" é a branch `controle-de-acesso-por-role`. **Produção roda outra coisa** — uma versão anterior a todo o controle de acesso por role, que inclui o fallback `role ?? "admin"` e não tem nenhuma verificação de autorização na aplicação. Hoje isso não vaza dado, porque a RLS segura sozinha e isso foi confirmado por teste contra a URL de produção. Mas é uma camada única, e o próprio objeto desta auditoria — o controle de acesso por role — não está no ar.

**Portanto:**

- **Liberar para o cliente testar a branch (após merge e deploy): SIM.** Sem ressalva de segurança relevante. Recomendo apenas confirmar antes a regra de alcance HORN-wide da seção 2, que é decisão de produto e não de segurança.
- **Liberar produção como está hoje, sem o deploy: NÃO recomendo.** Não por vazamento comprovado — não há —, mas porque um sistema multi-inquilino apoiado numa única camada não tem margem para erro, e a segunda camada já está escrita, testada e a um merge de distância.

O caminho é curto: fazer o merge, publicar, e rodar `npm run test:authz` contra o ambiente publicado. Se sair `109 PASS / 0 FAIL`, a ressalva cai.

---

*Nenhum commit foi feito. As alterações estão no diretório de trabalho para sua revisão.*
