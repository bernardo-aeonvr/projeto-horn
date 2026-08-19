import { NextResponse, type NextRequest } from "next/server";

import { createAdminClient, SECRET_KEY_ENV_NAME } from "@/lib/supabase/admin";

/**
 * Mantém o projeto Supabase acordado.
 *
 * O plano gratuito pausa projetos sem atividade por alguns dias, e despausar
 * é manual, pelo painel. Um recesso de duas semanas do escritório derrubaria
 * o sistema sem ninguém ter feito nada errado. Esta rota é chamada uma vez por
 * dia pelo cron da Vercel (vercel.json) e faz uma consulta trivial: o que
 * conta como atividade é a requisição chegar ao projeto.
 *
 * A consulta usa a chave secreta porque `anon` não tem privilégio nenhum
 * (migration 0008): uma leitura anônima voltaria negada, e um keep-alive que
 * depende do caminho de erro é um keep-alive que ninguém confere. Sem a chave
 * a rota responde 503 em vez de fingir sucesso — a falha aparece no log de
 * cron da Vercel.
 *
 * `segments` é o catálogo oficial de segmentos: tabela minúscula, estável, e a
 * consulta é `head` (só a contagem, sem trazer linha).
 */

/** Nome da variável que a Vercel injeta no header do cron. */
const CRON_SECRET = process.env.CRON_SECRET;

export async function GET(request: NextRequest) {
  /*
    A rota é pública por natureza (o cron não carrega sessão), então o segredo
    é o que impede terceiros de ficarem batendo nela. Definida CRON_SECRET, a
    Vercel envia `Authorization: Bearer <segredo>` automaticamente. Sem a
    variável, a rota continua funcionando — é uma consulta inofensiva —, mas o
    ideal em produção é configurá-la.
  */
  if (CRON_SECRET) {
    const authorization = request.headers.get("authorization");

    if (authorization !== `Bearer ${CRON_SECRET}`) {
      return NextResponse.json({ ok: false }, { status: 401 });
    }
  }

  const supabase = createAdminClient();

  if (!supabase) {
    return NextResponse.json(
      {
        ok: false,
        error: `${SECRET_KEY_ENV_NAME} não configurada: o keep-alive não consegue consultar o banco.`,
      },
      { status: 503 },
    );
  }

  const startedAt = Date.now();

  const { error } = await supabase
    .from("segments")
    .select("id", { head: true, count: "exact" });

  const elapsedMs = Date.now() - startedAt;

  if (error) {
    console.error("[keep-alive] consulta falhou", error);

    return NextResponse.json(
      { ok: false, error: "Não foi possível consultar o banco.", elapsedMs },
      { status: 502 },
    );
  }

  return NextResponse.json(
    { ok: true, checkedAt: new Date().toISOString(), elapsedMs },
    // Um keep-alive respondido do cache não acorda banco nenhum.
    { headers: { "Cache-Control": "no-store" } },
  );
}
