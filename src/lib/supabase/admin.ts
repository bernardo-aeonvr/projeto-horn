import { createClient as createSupabaseClient } from "@supabase/supabase-js";

import { getSupabaseEnv } from "./env";

/**
 * Cliente administrativo do Supabase — apenas para o servidor.
 *
 * Serve a uma única finalidade: criar a conta de Auth de um usuário de loja,
 * operação que a chave publishable não executa (e não deve executar). Todo o
 * resto do provisionamento continua passando pela sessão do administrador,
 * sujeito à RLS.
 *
 * A chave é lida sem o prefixo `NEXT_PUBLIC_`, então o Next nunca a injeta no
 * bundle do navegador. Este módulo só pode ser importado por Server Actions e
 * Server Components: um `"use client"` que o importasse quebraria o build,
 * porque `@supabase/supabase-js` receberia uma chave indefinida.
 *
 * Se a variável não estiver configurada, `createAdminClient()` devolve `null`
 * e a interface explica o que falta — nada aqui inventa um caminho alternativo
 * inseguro.
 */

/**
 * Nomenclatura nova do Supabase (`sb_secret_...`), com queda para a legada
 * (`service_role`) em projetos que ainda não migraram.
 */
const SECRET_KEY =
  process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;

/** Nome da variável esperada, usado nas mensagens de configuração. */
export const SECRET_KEY_ENV_NAME = "SUPABASE_SECRET_KEY";

export function isAdminApiConfigured(): boolean {
  return Boolean(SECRET_KEY?.trim());
}

export function createAdminClient() {
  if (!SECRET_KEY?.trim()) return null;

  const { url } = getSupabaseEnv();

  return createSupabaseClient(url, SECRET_KEY, {
    auth: {
      // O cliente administrativo não tem usuário: nada de sessão ou refresh.
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
