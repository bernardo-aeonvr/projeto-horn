/**
 * Leitura das variáveis públicas do Supabase.
 *
 * Apenas a URL e a publishable key entram no bundle do cliente — nenhuma chave
 * privilegiada (service_role / secret) deve ser lida aqui.
 *
 * As referências precisam ser literais `process.env.NOME` para que o Next
 * consiga fazer a substituição estática no build.
 */
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export function getSupabaseEnv() {
  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
    throw new Error(
      "Configuração do Supabase ausente. Defina NEXT_PUBLIC_SUPABASE_URL e " +
        "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY no .env.local (veja .env.example).",
    );
  }

  return { url: SUPABASE_URL, publishableKey: SUPABASE_PUBLISHABLE_KEY };
}
