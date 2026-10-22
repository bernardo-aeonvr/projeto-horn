import { NextResponse, type NextRequest } from "next/server";

import {
  failureHint,
  isAuthorizedCronRequest,
  KeepAliveError,
  runKeepAlive,
  type KeepAliveSource,
} from "@/lib/keep-alive/heartbeat";
import { createAdminClient, SECRET_KEY_ENV_NAME } from "@/lib/supabase/admin";

/**
 * Mantém o projeto Supabase acordado.
 *
 * O plano gratuito pausa projetos com pouca atividade numa janela de 7 dias, e
 * despausar é manual, pelo painel. Um recesso do escritório derrubaria o
 * sistema sem ninguém ter feito nada errado. Esta rota é chamada uma vez por
 * dia pelo cron da Vercel (vercel.json).
 *
 * Cada chamada grava um heartbeat em `system_keepalive` (migration 0021) e faz
 * mais três leituras leves — o detalhe está em `src/lib/keep-alive/heartbeat.ts`.
 * `last_ping_at` e `ping_count` naquela tabela são a prova, no próprio banco,
 * de que a execução chegou lá.
 *
 * A rota usa a chave secreta porque `anon` não tem privilégio nenhum
 * (migration 0008), e a tabela do heartbeat é só de `service_role`. Sem a
 * chave, sem a migration ou com o banco fora do ar, a rota responde erro em
 * vez de fingir sucesso — e a falha aparece no log de cron da Vercel.
 */

/*
  Sem isso a rota já seria dinâmica: desde o Next 15 um GET de Route Handler
  não é cacheado, e esta lê `request.headers`. O `force-dynamic` deixa a
  garantia escrita em vez de implícita, e força `no-store` nos fetches do
  supabase-js. `revalidate = 0` seria redundante com ele.

  Vale enquanto o projeto não liga `cacheComponents`: com ele, o Next 16 recusa
  `dynamic` no build, e a troca é por `await connection()`.
*/
export const dynamic = "force-dynamic";

/** Folga para o pior caso de retry (3 tentativas de 5s em cada operação). */
export const maxDuration = 60;

const NO_STORE = { "Cache-Control": "no-store" };

function respond(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status, headers: NO_STORE });
}

export async function GET(request: NextRequest) {
  /*
    A rota é pública por natureza (o cron não carrega sessão; o proxy a deixa
    passar em `PUBLIC_ROUTES`), então o segredo é o que impede terceiros de
    ficarem batendo nela. Definida CRON_SECRET, a Vercel envia
    `Authorization: Bearer <segredo>` sozinha em toda chamada agendada.
  */
  const cronSecret = process.env.CRON_SECRET?.trim();

  if (cronSecret) {
    if (!isAuthorizedCronRequest(request.headers.get("authorization"), cronSecret)) {
      console.warn("[keep-alive] chamada recusada: Authorization ausente ou inválido");
      return respond({ ok: false }, 401);
    }
  } else if (process.env.VERCEL_ENV === "production") {
    console.warn(
      "[keep-alive] CRON_SECRET não configurada em produção: a rota aceita qualquer chamada",
    );
  }

  // Header que a Vercel põe em toda chamada de cron; o resto é teste à mão.
  const source: KeepAliveSource = request.headers.has("x-vercel-cron-schedule")
    ? "vercel-cron"
    : "manual";

  const startedAt = Date.now();
  console.log(`[keep-alive] starting (source=${source})`);

  let supabase: ReturnType<typeof createAdminClient>;

  try {
    supabase = createAdminClient();
  } catch (error) {
    // `getSupabaseEnv()` lança quando falta a URL do projeto.
    console.error("[keep-alive] configuração do Supabase ausente", {
      message: error instanceof Error ? error.message : String(error),
    });
    return respond(
      { ok: false, error: "Configuração do Supabase ausente.", databaseOperations: 0 },
      503,
    );
  }

  if (!supabase) {
    console.error(`[keep-alive] ${SECRET_KEY_ENV_NAME} não configurada: nenhuma operação feita`);
    return respond(
      {
        ok: false,
        error: `${SECRET_KEY_ENV_NAME} não configurada: o keep-alive não consegue consultar o banco.`,
        databaseOperations: 0,
      },
      503,
    );
  }

  try {
    const result = await runKeepAlive(supabase, source, {
      log: (message, detail) =>
        detail ? console.log(message, detail) : console.log(message),
    });
    const elapsedMs = Date.now() - startedAt;

    console.log(
      `[keep-alive] success - ${result.databaseOperations} database operations - ${elapsedMs}ms`,
      { pingCount: result.pingCount, lastPingAt: result.lastPingAt },
    );

    return respond({
      ok: true,
      checkedAt: new Date().toISOString(),
      source,
      lastPingAt: result.lastPingAt,
      pingCount: result.pingCount,
      databaseOperations: result.databaseOperations,
      elapsedMs,
    });
  } catch (error) {
    const elapsedMs = Date.now() - startedAt;

    if (error instanceof KeepAliveError) {
      // `withRetry` já registrou status, code e message de cada tentativa.
      console.error(`[keep-alive] ${error.operation} failed - ${elapsedMs}ms`, {
        attempts: error.attempts,
        status: error.status,
        code: error.code,
        completedOperations: error.completedOperations,
        hint: failureHint(error.status, error.code),
      });

      return respond(
        {
          ok: false,
          error: "O keep-alive não conseguiu completar as operações no banco.",
          failedOperation: error.operation,
          attempts: error.attempts,
          databaseOperations: error.completedOperations,
          elapsedMs,
        },
        502,
      );
    }

    console.error(`[keep-alive] erro inesperado - ${elapsedMs}ms`, {
      message: error instanceof Error ? error.message : String(error),
    });

    return respond(
      { ok: false, error: "Erro inesperado no keep-alive.", elapsedMs },
      500,
    );
  }
}
