import { cache } from "react";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

import {
  DEFAULT_AUTHENTICATED_ROUTE,
  LOGIN_ROUTE,
  NO_ACCESS_ROUTE,
} from "./routes";

/** Perfis de acesso do MVP (public.app_role). */
export type AppRole = "admin" | "store";

export type SessionUser = {
  id: string;
  email: string;
  /** Nome exibido no menu do usuário. Cai para o e-mail quando não houver. */
  name: string;
  initials: string;
  role: AppRole;
  /** Sempre preenchido quando `role` é "store". `null` para admin. */
  storeId: string | null;
  storeName: string | null;
};

/**
 * Por que um usuário autenticado não pode usar o sistema.
 *
 * Cada caso vira uma mensagem própria em /sem-acesso. Nenhum deles cai em
 * acesso parcial ou em admin por omissão.
 */
export type AccessDenialReason =
  | "no_profile"
  | "unknown_role"
  | "store_without_store"
  | "inactive"
  | "profile_error";

export type AccessState =
  | { status: "anonymous" }
  | { status: "denied"; reason: AccessDenialReason; email: string }
  | { status: "granted"; user: SessionUser };

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
 * Resolve o perfil de acesso do usuário autenticado.
 *
 * Usa sempre `getUser()` (que valida o token no servidor de auth) em vez de
 * `getSession()`, que apenas lê o cookie e é falsificável.
 *
 * Regra central desta etapa: **negar por padrão**. Não existe fallback para
 * admin, nem para "todas as lojas" — um perfil ausente, inativo, com papel
 * desconhecido ou sem loja associada bloqueia o acesso.
 *
 * `cache` deduplica a chamada dentro da mesma requisição: layout, página e
 * consultas compartilham o mesmo resultado em vez de repetirem a ida ao
 * servidor de auth.
 */
export const getAccessState = cache(async function getAccessState(): Promise<AccessState> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { status: "anonymous" };

  const email = user.email ?? "";

  const { data: profile, error } = await supabase
    .from("user_profiles")
    .select("full_name, role, store_id, is_active, stores(name)")
    .eq("id", user.id)
    .maybeSingle<UserProfileRow>();

  if (error) {
    console.error("[auth] falha ao carregar o perfil do usuário", error);
    return { status: "denied", reason: "profile_error", email };
  }

  if (!profile) return { status: "denied", reason: "no_profile", email };

  if (profile.role !== "admin" && profile.role !== "store") {
    return { status: "denied", reason: "unknown_role", email };
  }

  // Vem antes de `is_active` de propósito: o check do banco só permite loja sem
  // `store_id` enquanto o perfil está inativo, e "não associado a uma loja" diz
  // ao administrador exatamente o que falta configurar.
  if (profile.role === "store" && !profile.store_id) {
    return { status: "denied", reason: "store_without_store", email };
  }

  if (!profile.is_active) return { status: "denied", reason: "inactive", email };

  const name =
    profile.full_name?.trim() ||
    (user.user_metadata?.full_name as string | undefined)?.trim() ||
    email ||
    "Usuário";

  return {
    status: "granted",
    user: {
      id: user.id,
      email,
      name,
      initials: buildInitials(name),
      role: profile.role,
      storeId: profile.role === "store" ? profile.store_id : null,
      storeName: readStoreName(profile.stores),
    },
  };
});

/** Usuário liberado, ou `null` — sem sessão, sem perfil válido ou sem acesso. */
export async function getSessionUser(): Promise<SessionUser | null> {
  const state = await getAccessState();
  return state.status === "granted" ? state.user : null;
}

/**
 * Usuário liberado, ou redirecionamento.
 *
 * Sem sessão vai para o login; autenticado mas sem acesso válido vai para
 * /sem-acesso, que explica o motivo — nunca para dentro do sistema.
 */
export async function requireSessionUser(): Promise<SessionUser> {
  const state = await getAccessState();

  if (state.status === "anonymous") redirect(LOGIN_ROUTE);
  if (state.status === "denied") redirect(NO_ACCESS_ROUTE);

  return state.user;
}

/**
 * Igual a `requireSessionUser`, mas só deixa passar o admin.
 *
 * É a autorização real das telas administrativas: o proxy também barra a
 * navegação, mas quem garante é esta checagem no servidor, executada antes de
 * a página consultar qualquer dado.
 */
export async function requireAdminUser(): Promise<SessionUser> {
  const user = await requireSessionUser();

  if (user.role !== "admin") redirect(DEFAULT_AUTHENTICATED_ROUTE);

  return user;
}

export type AdminAuthorization =
  | { ok: true; user: SessionUser }
  | { ok: false; message: string };

/**
 * Autorização de admin para Server Actions.
 *
 * Actions não redirecionam: devolvem a mensagem que o formulário mostra. Toda
 * escrita administrativa passa por aqui, então chamar a action diretamente —
 * sem passar pela interface — não contorna nada.
 */
export async function authorizeAdminAction(): Promise<AdminAuthorization> {
  const state = await getAccessState();

  if (state.status === "anonymous") {
    return {
      ok: false,
      message: "Sua sessão expirou. Entre novamente para continuar.",
    };
  }

  if (state.status === "denied") {
    return {
      ok: false,
      message:
        "Seu acesso não está configurado. Procure o administrador da HORN.",
    };
  }

  if (state.user.role !== "admin") {
    return {
      ok: false,
      message: "Você não tem permissão para executar esta ação.",
    };
  }

  return { ok: true, user: state.user };
}
