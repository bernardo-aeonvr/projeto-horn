import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AuthHeading } from "@/components/auth/auth-heading";
import { FormAlert } from "@/components/ui/form-alert";
import { signOutAction } from "@/lib/auth/actions";
import {
  DEFAULT_AUTHENTICATED_ROUTE,
  LOGIN_ROUTE,
} from "@/lib/auth/routes";
import { getAccessState, type AccessDenialReason } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Acesso não configurado" };

/**
 * Cada estado inválido tem sua própria explicação.
 *
 * O texto diz o que fazer e nada mais — nem erro do banco, nem nome de tabela,
 * nem se o e-mail existe. Quem resolve é sempre o administrador.
 */
const DENIALS: Record<
  AccessDenialReason,
  { title: string; description: string; message: string }
> = {
  no_profile: {
    title: "Acesso não configurado",
    description: "Seu login existe, mas ainda não tem um perfil no sistema.",
    message:
      "Seu usuário ainda não foi configurado pela administração da HORN. " +
      "Entre em contato com o administrador para liberar o acesso.",
  },
  store_without_store: {
    title: "Acesso não configurado",
    description: "Falta vincular o seu usuário a uma loja.",
    message:
      "Seu usuário ainda não está associado a uma loja. " +
      "Entre em contato com o administrador.",
  },
  inactive: {
    title: "Acesso inativo",
    description: "Este acesso está desativado no momento.",
    message:
      "Seu acesso foi desativado pela administração da HORN. " +
      "Entre em contato com o administrador para reativá-lo.",
  },
  unknown_role: {
    title: "Acesso não configurado",
    description: "O perfil do seu usuário não é reconhecido pelo sistema.",
    message:
      "Não foi possível identificar o seu perfil de acesso. " +
      "Entre em contato com o administrador da HORN.",
  },
  profile_error: {
    title: "Não foi possível carregar seu acesso",
    description: "Houve uma falha ao consultar o seu perfil.",
    message:
      "Tente novamente em alguns instantes. Se o problema continuar, " +
      "entre em contato com o administrador da HORN.",
  },
};

/**
 * Parada segura para quem está autenticado mas não pode entrar.
 *
 * Fica fora de `(app)` de propósito: sem Sidebar, sem Header e sem nenhuma
 * consulta ao sistema. A única ação disponível é sair.
 */
export default async function NoAccessPage() {
  const state = await getAccessState();

  // Chegar aqui com acesso válido é navegação manual; devolve ao dashboard.
  if (state.status === "granted") redirect(DEFAULT_AUTHENTICATED_ROUTE);
  if (state.status === "anonymous") redirect(LOGIN_ROUTE);

  const denial = DENIALS[state.reason];

  return (
    <>
      <AuthHeading title={denial.title} description={denial.description} />

      <FormAlert tone="error">{denial.message}</FormAlert>

      {state.email ? (
        <p className="mt-6 text-sm text-graphite-500">
          Você entrou como{" "}
          <span className="font-medium text-graphite-800">{state.email}</span>.
        </p>
      ) : null}

      <form action={signOutAction} className="mt-6">
        <button
          type="submit"
          className="inline-flex h-11 w-full items-center justify-center rounded-lg bg-gold-500 px-5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-gold-600"
        >
          Sair e entrar com outro acesso
        </button>
      </form>
    </>
  );
}
