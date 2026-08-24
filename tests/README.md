# Testes de autorização

Provam que os dois isolamentos do sistema acontecem **no banco**, não na
interface: entre as lojas representadas, e entre os dois administradores.

Cada caso fala direto com PostgREST e com a API de Storage usando o JWT de uma
sessão real, do mesmo jeito que o navegador do usuário faria. Nenhum teste
passa pela UI: esconder o botão não é autorização.

## Regra que não pode ser quebrada

Os testes de autorização **nunca** usam a service role / secret key. Ela ignora
RLS, então uma consulta feita com ela não prova nada sobre uma policy. A
credencial privilegiada aparece só em `fixtures.mjs`, para preparar dados.

## Como rodar

Precisa de `.env.local` com `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY` e
`SUPABASE_ACCESS_TOKEN` (as duas últimas só para criar/remover os fixtures).

```bash
npm run test:authz:setup
npm run test:authz
npm run test:authz:teardown
```

Saída esperada: `RESULTADO: N PASS / 0 FAIL`. Qualquer `FAIL` é regressão de
segurança — a lista de falhas sai no fim.

> Rodam contra o projeto Supabase configurado no `.env.local`, que hoje é o
> mesmo de produção. Todos os fixtures levam o prefixo `SEC_TEST` e são
> removidos no teardown; nenhum registro real é lido para escrita nem alterado.

## O que os fixtures criam

Duas carteiras completas e independentes, uma por administrador.

| Objeto | Dono | Para quê |
| --- | --- | --- |
| `SEC_TEST Loja A` / `SEC_TEST Loja B` | Admin 1 | os dois lados do teste cruzado entre lojas |
| `SEC_TEST Loja C` | Admin 2 | o outro lado do teste cruzado entre admins |
| 5 usuários `sec-test-*@example.com` | — | lojas A, B e C, e os dois admins |
| `SEC_TEST Profissional` | Admin 1 | com telefone, e-mail, endereço e observação interna, para detectar vazamento de PII |
| `SEC_TEST Profissional Admin 2` | Admin 2 | a carteira que o primeiro admin não pode alcançar |
| 1 contato apresentando **as duas lojas** | Admin 1 | base do teste de `contact_stores` |
| 1 contato | Admin 2 | prova que o alcance mostrado à loja é o do dono dela |
| 1 oportunidade fechada por loja | ambos | comissões de 10%, 20% e 30%, para detectar mistura em qualquer soma |
| 1 PDF por loja no bucket `proposal-pdfs` | ambos | teste de Storage e de URL assinada |

Os fixtures preenchem `owner_id` à mão em cada insert. Não é redundância: os
triggers `a_*_set_owner` derivam o dono da sessão, e a service role não tem
uma — sem a coluna preenchida, o setup nem chega a criar os dados.

## O que é coberto

- **Oportunidades** — leitura e escrita, própria loja e loja alheia, incluindo
  IDOR por id direto e por `store_id` no filtro.
- **Somente leitura** — a loja não cria, edita nem exclui nada, nem na própria
  carteira.
- **Profissionais** — a carteira e a PII (telefone, e-mail, Instagram,
  endereço, observações) ficam com a HORN.
- **Contatos** — histórico e observações internas fora do alcance da loja.
- **`contact_stores`** — uma loja não descobre quais outras marcas foram
  apresentadas no mesmo contato, por nenhum caminho.
- **RPCs** — adulteração de argumento (`p_store_id` de outra loja), funções de
  admin chamadas por loja, e chamadas anônimas.
- **Escalação** — mudar a própria `role`, o próprio `store_id`, ou plantar
  `role: admin` no `user_metadata` do Auth.
- **Storage** — URL assinada, download direto, path forjado, listagem, upload,
  exclusão, `move` e `copy` entre lojas.
- **Isolamento entre administradores** — o cruzamento completo entre os dois
  admins: IDOR por id direto, varredura de tabela, escrita no dado alheio,
  criação de oportunidade cruzando profissional e loja de donos diferentes,
  transferência de dono, sequestro de acesso de loja, todas as RPCs de
  dashboard, o painel de acessos e os PDFs no Storage. Inclui o caso mais
  fácil de deixar passar: o alcance "HORN inteira" que o dashboard da loja
  mostra (migration 0005) precisa parar no dono daquela loja — senão vaza pela
  porta da loja, sem ninguém ser admin.
- **Regressão do Admin** — todas as leituras, RPCs, escrita e upload que o
  administrador precisa continuar fazendo.
- **Anônimo** — nenhuma tabela responde sem sessão.

## Ao adicionar tabela, policy ou RPC

Acrescente aqui o caso correspondente, sempre nos dois sentidos: o que o dono
do dado **pode** e o que o outro lado **não pode** — e "o outro lado" agora são
dois: a outra loja e o outro administrador. Um teste que só verifica o caminho
feliz não detecta vazamento.

Atenção especial a função `SECURITY DEFINER` nova: ela roda como dona das
tabelas e a RLS não se aplica por dentro, então o recorte por `owner_id`
precisa estar escrito no corpo dela. É o tipo de esquecimento que passa em
todos os testes de loja e vaza a operação inteira para o outro admin.
