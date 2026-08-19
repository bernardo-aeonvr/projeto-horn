# HORN — Sistema interno

Aplicação web interna da HORN para gestão da carteira de profissionais, registro
de contatos, acompanhamento de projetos/propostas por loja e apresentação dos
resultados às lojas representadas.

A especificação funcional completa está em
[`docs/HORN_PROJECT_SPEC_MVP.md`](docs/HORN_PROJECT_SPEC_MVP.md).

O material bruto do cliente (gravação da reunião, planilhas e logos originais)
fica em `Refs/`, fora do versionamento — são arquivos grandes e com dados de
contato.

## Stack

| Camada | Tecnologia |
| --- | --- |
| Aplicação | Next.js 16 (App Router) + TypeScript |
| Estilo | Tailwind CSS v4 |
| Tipografia | Poppins (`next/font`) |
| Ícones | lucide-react |
| Banco, auth e storage | Supabase |
| Hospedagem prevista | Vercel |

## Rodando localmente

```bash
npm install
```

Copie `.env.example` para `.env.local` e preencha com as chaves do projeto
Supabase:

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
NEXT_PUBLIC_SITE_URL=          # opcional em dev, obrigatório em produção
```

> Somente a *publishable key* deve entrar aqui. Chaves privilegiadas
> (`service_role` / secret) nunca vão para o `.env.local` do frontend nem para o
> código.

```bash
npm run dev
```

A aplicação sobe em <http://localhost:3000>.

## Configuração do Supabase

Estes passos ainda **não foram executados** no projeto Supabase atual — as
tabelas não existem lá.

1. **Aplicar o schema.** No SQL Editor do Supabase, rode `supabase/schema.sql`.
   Ele cria as tabelas, os enums, os índices, as políticas de RLS, o bucket
   `proposal-pdfs` e as funções de apoio.

   Em seguida rode, em ordem, os arquivos de `supabase/migrations/`. Eles são
   as alterações feitas depois do schema base e são necessários para a
   aplicação funcionar.

2. **Criar o primeiro admin.** Em *Authentication → Users*, crie o usuário com
   e-mail e senha. O trigger `on_auth_user_created` cria um perfil inativo
   automaticamente. Promova-o pelo SQL Editor:

   ```sql
   update public.user_profiles
      set role = 'admin', store_id = null, is_active = true
    where id = '<AUTH_USER_UUID>';
   ```

3. **Liberar as URLs de redirecionamento.** Em *Authentication → URL
   Configuration → Redirect URLs*, adicione:

   ```
   http://localhost:3000/auth/callback
   https://<dominio-de-producao>/auth/callback
   ```

   Sem isso o link do e-mail de recuperação de senha não volta para a aplicação.

Enquanto não houver linha em `user_profiles`, o usuário logado é tratado como
`admin` pela interface (ver `src/lib/auth/session.ts`). O isolamento real entre
lojas é feito por RLS no banco, não pela navegação.

## Estrutura

```
src/
  app/
    (app)/                 área autenticada — layout com sidebar + header
      dashboard/
      profissionais/
      contatos/
      projetos-propostas/
      lojas/
    (auth)/                login e recuperação de senha
      login/
      esqueci-a-senha/
      redefinir-senha/
    auth/callback/         troca o link do e-mail por uma sessão
  components/
    brand/                 lockups da marca
    layout/                app shell, sidebar, header, menus
    ui/                    botão, campo de texto, alerta, dropdown
  lib/
    auth/                  server actions, sessão, rotas públicas
    supabase/              clients de browser e servidor
    navigation.ts          itens do menu por perfil de acesso
  proxy.ts                 renovação de sessão e gate de rotas
supabase/
  schema.sql               schema base do MVP
  migrations/              alterações aplicadas depois do schema base
docs/                      especificação funcional
scripts/                   utilitários de build e de setup
```

## Identidade visual

- Dourado `#CD9738` — destaque: item ativo, foco, ações primárias.
- Grafite `#282C30` — texto, avatar e o painel lateral das telas de login.
- Superfícies claras — branco nos cartões e `#F6F7F8` no fundo da área de trabalho.

Os tokens ficam em `src/app/globals.css`, no bloco `@theme`.

Os arquivos em `public/brand/` são gerados a partir dos PNGs originais do
cliente (fundo branco chapado) por:

```bash
node scripts/prepare-brand-assets.mjs
```

O script remove o fundo, recorta o conteúdo e exporta o lockup completo, o
símbolo, o wordmark e o ícone do app. Só precisa ser rodado de novo se a logo
original mudar.

## Deploy na Vercel

Em *Project → Settings → Environment Variables*:

| Variável | Ambientes | Valor |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Production, Preview, Development | igual ao `.env.local` |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Production, Preview, Development | igual ao `.env.local` |
| `NEXT_PUBLIC_SITE_URL` | apenas Production | a URL final da aplicação |
| `SUPABASE_SECRET_KEY` | Production (Preview, se for usar lá) | igual ao `.env.local` |
| `CRON_SECRET` | apenas Production | um valor aleatório qualquer |

`NEXT_PUBLIC_SITE_URL` deve ficar **vazia em Preview**: cada deploy de preview tem
uma URL própria, e `getSiteUrl()` cai no header `x-forwarded-host` quando a
variável não existe, fazendo o link de recuperação apontar para o preview certo.

Variáveis `NEXT_PUBLIC_*` são embutidas no bundle em tempo de build — alterar
qualquer uma exige um novo deploy.

Depois do primeiro deploy, atualize no Supabase (*Authentication → URL
Configuration*):

- **Site URL** → a URL de produção;
- **Redirect URLs** → acrescente `https://<dominio>/auth/callback` e, se quiser
  que a recuperação funcione nos previews, o padrão dos previews da Vercel
  (`https://*.vercel.app/**`).

## Keep-alive do banco

O plano gratuito do Supabase pausa projetos sem atividade por alguns dias, e
despausar é manual, pelo painel. Um recesso do escritório derrubaria o sistema
sem ninguém ter feito nada errado.

O `vercel.json` agenda uma chamada diária a `/api/keep-alive`, que faz uma
consulta trivial no banco — o que conta como atividade é a requisição chegar ao
projeto. A rota usa `SUPABASE_SECRET_KEY`, porque o papel anônimo não tem
privilégio nenhum desde a migration `0008`; sem a chave ela responde **503** em
vez de fingir sucesso, e a falha aparece em *Vercel → Project → Cron Jobs*.

Vale conferir depois do deploy:

- o cron aparece em *Settings → Cron Jobs* (só roda em Production);
- no plano Hobby a Vercel executa **uma vez por dia**, em horário aproximado —
  o `0 9 * * *` do `vercel.json` é 06:00 em São Paulo;
- `CRON_SECRET` cadastrada: a Vercel passa a mandar `Authorization: Bearer …`
  sozinha, e a rota recusa quem chegar sem o segredo.

Para testar à mão:

```bash
curl -i https://<dominio>/api/keep-alive -H "Authorization: Bearer $CRON_SECRET"
```

## Scripts

| Comando | O que faz |
| --- | --- |
| `npm run dev` | Servidor de desenvolvimento |
| `npm run build` | Build de produção |
| `npm run start` | Sobe o build de produção |
| `npm run lint` | ESLint |

## Estado atual

Pronto:

- estrutura do projeto, tokens da marca e tipografia Poppins;
- login, recuperação e redefinição de senha via Supabase Auth;
- proteção de rotas e renovação de sessão no proxy;
- app shell responsivo: sidebar (expandida, recolhida e gaveta no mobile),
  header com título da área, notificações e menu do usuário;
- as cinco áreas do menu, com conteúdo placeholder.

Próximos passos, na ordem sugerida pela especificação (seção 26): lojas,
segmentos e regiões, profissionais, contatos, projetos & propostas e dashboards.

Fora do escopo do MVP: envio de propostas, aceite/recusa na plataforma,
automações de WhatsApp/e-mail, notificações automáticas e módulo de eventos.
