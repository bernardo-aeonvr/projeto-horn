import { timingSafeEqual } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Heartbeat do keep-alive — a parte que fala com o banco.
 *
 * A rota (`src/app/api/keep-alive/route.ts`) cuida de HTTP: segredo do cron,
 * status e cabeçalhos. Aqui fica o que decide se houve atividade de verdade:
 * quais operações rodam, quantas tentativas cada uma tem e o que conta como
 * sucesso. Separado da rota para que retry, timeout e verificação possam ser
 * testados sem banco (`tests/domain.test.mjs`).
 *
 * Cada execução faz quatro requisições reais ao PostgREST, em sequência:
 *
 *   1. `keepalive_ping()` — UPDATE atômico em `system_keepalive` (migration
 *      0021): `last_ping_at = now()`, `ping_count + 1`;
 *   2. relê a linha e confere que a escrita está lá;
 *   3. lê UM id de `segments`;
 *   4. lê UM id de `regions`, com contagem.
 *
 * Nenhuma lista inteira, nenhuma tabela de negócio. Qualquer operação que
 * falhe depois das tentativas derruba a execução inteira: a rota só responde
 * `ok: true` quando as quatro voltaram do banco.
 */

/** Tentativas por operação, contando a primeira. */
export const ATTEMPTS = 3;

/** Tempo máximo de cada tentativa antes de abortar a requisição. */
export const ATTEMPT_TIMEOUT_MS = 5_000;

/** Espera antes da 2ª e da 3ª tentativa. */
export const BACKOFF_MS = [500, 1_500] as const;

export type KeepAliveSource = "vercel-cron" | "manual";

/** O pedaço da resposta do supabase-js que a rotina lê. */
export type DbResponse<T> = {
  data: T | null;
  error: { message: string; code?: string } | null;
  status: number;
};

export type HeartbeatRow = {
  id: number;
  last_ping_at: string;
  ping_count: number;
  source: string | null;
};

export type KeepAliveResult = {
  lastPingAt: string;
  pingCount: number;
  databaseOperations: number;
};

type Log = (message: string, detail?: Record<string, unknown>) => void;

type RetryOptions = {
  attempts?: number;
  timeoutMs?: number;
  backoffMs?: readonly number[];
  sleep?: (ms: number) => Promise<void>;
  log?: Log;
};

/** Falha de uma operação depois de esgotadas as tentativas. */
export class KeepAliveError extends Error {
  readonly operation: string;
  readonly attempts: number;
  readonly status: number;
  readonly code: string | undefined;
  /** Operações que chegaram ao banco antes desta falhar. */
  completedOperations = 0;

  constructor(
    operation: string,
    attempts: number,
    status: number,
    code: string | undefined,
    message: string,
  ) {
    super(message);
    this.name = "KeepAliveError";
    this.operation = operation;
    this.attempts = attempts;
    this.status = status;
    this.code = code;
  }
}

/**
 * Confere o `Authorization` que a Vercel manda no cron (`Bearer <CRON_SECRET>`).
 * Comparação em tempo constante: o tamanho é o único dado que vaza.
 */
export function isAuthorizedCronRequest(
  authorization: string | null,
  secret: string,
) {
  if (!authorization) return false;

  const received = Buffer.from(authorization);
  const expected = Buffer.from(`Bearer ${secret}`);

  return (
    received.length === expected.length && timingSafeEqual(received, expected)
  );
}

/**
 * Só vale tentar de novo o que pode ser passageiro: rede (status 0, que é como
 * o supabase-js devolve fetch abortado ou recusado), timeout, rate limit e 5xx.
 * Chave recusada ou tabela inexistente falham igual na terceira tentativa.
 */
export function isRetryableStatus(status: number) {
  return status === 0 || status === 408 || status === 429 || status >= 500;
}

/** Dica de diagnóstico para o log, a partir do que o PostgREST devolveu. */
export function failureHint(status: number, code: string | undefined) {
  if (status === 401 || status === 403 || code === "42501") {
    return "chave recusada: confira SUPABASE_SECRET_KEY na Vercel";
  }
  if (code === "PGRST202" || code === "PGRST205" || code === "42P01" || code === "42883") {
    return "tabela ou função ausente: a migration 0021_system_keepalive foi aplicada?";
  }
  if (status === 0 || status >= 500) {
    return "banco indisponível, lento ou projeto pausado: confira o painel do Supabase";
  }
  return "erro do PostgREST: veja code e message";
}

/**
 * A releitura confirma a escrita. `>=` e não `===` porque a Vercel pode
 * entregar o mesmo cron duas vezes, e o segundo ping pode cair entre a escrita
 * e a releitura deste.
 */
export function confirmsHeartbeat(written: HeartbeatRow, readBack: HeartbeatRow) {
  return (
    readBack.ping_count >= written.ping_count &&
    Date.parse(readBack.last_ping_at) >= Date.parse(written.last_ping_at)
  );
}

const defaultSleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

const silent: Log = () => {};

/**
 * Roda uma operação com timeout e retry curto. Nunca mais que `attempts`
 * tentativas; a última falha vira `KeepAliveError`.
 */
export async function withRetry<T>(
  operation: string,
  run: (signal: AbortSignal) => PromiseLike<DbResponse<T>>,
  {
    attempts = ATTEMPTS,
    timeoutMs = ATTEMPT_TIMEOUT_MS,
    backoffMs = BACKOFF_MS,
    sleep = defaultSleep,
    log = silent,
  }: RetryOptions = {},
): Promise<{ data: T | null; attempts: number }> {
  for (let attempt = 1; ; attempt++) {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;

    // A corrida garante o limite mesmo se `run` ignorar o sinal.
    const timeout = new Promise<DbResponse<T>>((resolve) => {
      timer = setTimeout(() => {
        controller.abort();
        resolve({
          data: null,
          error: { message: `timeout de ${timeoutMs}ms` },
          status: 0,
        });
      }, timeoutMs);
    });

    let response: DbResponse<T>;

    try {
      response = await Promise.race([run(controller.signal), timeout]);
    } catch (error) {
      response = {
        data: null,
        error: { message: error instanceof Error ? error.message : String(error) },
        status: 0,
      };
    } finally {
      clearTimeout(timer);
    }

    if (!response.error) return { data: response.data, attempts: attempt };

    const { status } = response;
    const { code, message } = response.error;
    const retry = attempt < attempts && isRetryableStatus(status);

    log(`[keep-alive] ${operation} falhou (tentativa ${attempt}/${attempts})`, {
      status,
      code,
      message,
      ...(retry ? {} : { hint: failureHint(status, code) }),
    });

    if (!retry) {
      throw new KeepAliveError(operation, attempt, status, code, message);
    }

    await sleep(backoffMs[Math.min(attempt - 1, backoffMs.length - 1)] ?? 0);
  }
}

/**
 * A execução completa: as quatro operações, em ordem. Devolve o estado do
 * heartbeat gravado no banco — a prova de que a execução chegou lá.
 */
export async function runKeepAlive(
  supabase: SupabaseClient,
  source: KeepAliveSource,
  { log = silent, ...retry }: RetryOptions = {},
): Promise<KeepAliveResult> {
  const options = { ...retry, log };
  let databaseOperations = 0;

  try {
    const heartbeat = await withRetry<HeartbeatRow>(
      "heartbeat",
      (signal) =>
        supabase.rpc("keepalive_ping", { p_source: source }).abortSignal(signal),
      options,
    );

    if (!heartbeat.data) {
      throw new KeepAliveError(
        "heartbeat",
        heartbeat.attempts,
        200,
        undefined,
        "keepalive_ping não devolveu a linha atualizada",
      );
    }

    const written = heartbeat.data;
    databaseOperations++;
    log("[keep-alive] heartbeat update ok", {
      pingCount: written.ping_count,
      lastPingAt: written.last_ping_at,
    });

    const readBack = await withRetry<HeartbeatRow>(
      "database check 1 (system_keepalive)",
      (signal) =>
        supabase
          .from("system_keepalive")
          .select("id, last_ping_at, ping_count, source")
          .eq("id", 1)
          .abortSignal(signal)
          .maybeSingle(),
      options,
    );

    if (!readBack.data || !confirmsHeartbeat(written, readBack.data)) {
      throw new KeepAliveError(
        "database check 1 (system_keepalive)",
        readBack.attempts,
        200,
        undefined,
        "a releitura não confirmou o heartbeat gravado",
      );
    }

    databaseOperations++;
    log("[keep-alive] database check 1 ok (system_keepalive)");

    await withRetry(
      "database check 2 (segments)",
      (signal) => supabase.from("segments").select("id").limit(1).abortSignal(signal),
      options,
    );
    databaseOperations++;
    log("[keep-alive] database check 2 ok (segments)");

    await withRetry(
      "database check 3 (regions)",
      (signal) =>
        supabase
          .from("regions")
          .select("id", { count: "exact" })
          .limit(1)
          .abortSignal(signal),
      options,
    );
    databaseOperations++;
    log("[keep-alive] database check 3 ok (regions)");

    return {
      lastPingAt: readBack.data.last_ping_at,
      pingCount: readBack.data.ping_count,
      databaseOperations,
    };
  } catch (error) {
    if (error instanceof KeepAliveError) {
      error.completedOperations = databaseOperations;
    }
    throw error;
  }
}
