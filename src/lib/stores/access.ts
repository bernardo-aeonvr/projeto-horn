import { createClient } from "@/lib/supabase/server";

/**
 * Acesso de uma loja ao sistema.
 *
 * A autenticação é sempre do Supabase Auth: `user_profiles` guarda só os dados
 * adicionais (nome, papel, loja, status). Nenhuma senha passa por aqui.
 */
export type StoreAccess = {
  userId: string;
  email: string;
  fullName: string | null;
  isActive: boolean;
  /** `null` enquanto o lojista nunca entrou. */
  lastSignInAt: string | null;
  createdAt: string;
};

type StoreAccessRow = {
  store_id: string;
  user_id: string;
  email: string | null;
  full_name: string | null;
  is_active: boolean;
  last_sign_in_at: string | null;
  created_at: string;
};

/**
 * Acessos provisionados, agrupados por loja.
 *
 * O e-mail de login mora em `auth.users`, fora do alcance do PostgREST, então
 * a leitura passa por `get_store_access_summary()` — que só responde para
 * admin. Uma loja que chame esta função recebe lista vazia.
 */
export async function listStoreAccess(): Promise<Map<string, StoreAccess[]>> {
  const supabase = await createClient();
  const byStore = new Map<string, StoreAccess[]>();

  const { data, error } = await supabase.rpc("get_store_access_summary");

  if (error) {
    console.error("[lojas] falha ao carregar os acessos das lojas", error);
    return byStore;
  }

  for (const row of (data as StoreAccessRow[] | null) ?? []) {
    const list = byStore.get(row.store_id) ?? [];

    list.push({
      userId: row.user_id,
      email: row.email ?? "",
      fullName: row.full_name,
      isActive: row.is_active,
      lastSignInAt: row.last_sign_in_at,
      createdAt: row.created_at,
    });

    byStore.set(row.store_id, list);
  }

  return byStore;
}
