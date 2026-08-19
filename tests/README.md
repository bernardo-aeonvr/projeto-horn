# Testes de autorização

Provam que o isolamento entre lojas acontece **no banco**, não na interface.

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

| Objeto | Para quê |
| --- | --- |
| `SEC_TEST Loja A` / `SEC_TEST Loja B` | os dois lados do teste cruzado |
| 3 usuários `sec-test-*@example.com` | loja A, loja B e um admin |
| `SEC_TEST Profissional` | com telefone, e-mail, endereço e observação interna, para detectar vazamento de PII |
| 1 contato apresentando **as duas lojas** | base do teste de `contact_stores` |
| 1 oportunidade fechada por loja | valores e comissões diferentes, para detectar mistura |
| 1 PDF por loja no bucket `proposal-pdfs` | teste de Storage e de URL assinada |

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
- **Regressão do Admin** — todas as leituras, RPCs, escrita e upload que o
  administrador precisa continuar fazendo.
- **Anônimo** — nenhuma tabela responde sem sessão.

## Ao adicionar tabela, policy ou RPC

Acrescente aqui o caso correspondente, sempre nos dois sentidos: o que o dono
do dado **pode** e o que a outra loja **não pode**. Um teste que só verifica o
caminho feliz não detecta vazamento.
