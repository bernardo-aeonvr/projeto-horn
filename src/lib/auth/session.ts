import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

/** Perfis de acesso do MVP (public.app_role). */
export type AppRole = "admin" | "store";

export type SessionUser = {
  id: string;
  email: string;
  /** Nome exibido no menu do usuário. Cai para o e-mail quando não houver. */
  name: string;
  initials: string;
  role: AppRole;
  storeId: string | null;
  storeName: string | null;
};

type UserProfileRow = {
  full_name: string | null;
  role: AppRole | null;
  store_id: string | null;
  is_active: boolean | null;
  stores: { name: string } | { name: string }[] | null;
};

function buildInitials(name: string) {
  const parts = name
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);

  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();

  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function readStoreName(stores: UserProfileRow["stores"]) {
  if (!stores) return null;
  return Array.isArray(stores) ? (stores[0]?.name ?? null) : stores.name;
}

/**
 * Devolve o usuário autenticado com o perfil de acesso, ou `null`.
 *
 * Usa sempre `getUser()` (que valida o token no servidor de auth) em vez de
 * `getSession()`, que apenas lê o cookie e é falsificável.
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("full_name, role, store_id, is_active, stores(name)")
    .eq("id", user.id)
    .maybeSingle<UserProfileRow>();

  const email = user.email ?? "";
  const name =
    profile?.full_name?.trim() ||
    (user.user_metadata?.full_name as string | undefined)?.trim() ||
    email ||
    "Usuário";

  return {
    id: user.id,
    email,
    name,
    initials: buildInitials(name),
    // Enquanto a área da loja não existe, um usuário sem linha em
    // `user_profiles` (schema ainda não aplicado ou acesso não provisionado)
    // é tratado como admin para que o sistema seja utilizável. Revisar quando
    // os acessos de loja forem liberados — o isolamento real é feito por RLS.
    role: profile?.role ?? "admin",
    storeId: profile?.store_id ?? null,
    storeName: readStoreName(profile?.stores ?? null),
  };
}

/** Igual a `getSessionUser`, mas redireciona para o login quando não houver sessão. */
export async function requireSessionUser(): Promise<SessionUser> {
  const user = await getSessionUser();

  if (!user) redirect("/login");

  return user;
}
