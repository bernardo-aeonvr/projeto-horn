import type { Metadata } from "next";

import { AuthHeading } from "@/components/auth/auth-heading";
import { safeRedirectTo } from "@/lib/auth/routes";

import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Entrar" };

/** Mensagens que outros fluxos podem repassar para a tela de login. */
const ERROR_MESSAGES: Record<string, string> = {
  link_invalido:
    "O link de recuperação é inválido ou já expirou. Solicite um novo abaixo.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ redirectTo?: string; erro?: string }>;
}) {
  const params = await searchParams;

  return (
    <>
      <AuthHeading
        title="Entrar"
        description="Acesse o sistema interno da HORN com o e-mail cadastrado pela administração."
      />

      <LoginForm
        redirectTo={safeRedirectTo(params.redirectTo)}
        initialError={params.erro ? ERROR_MESSAGES[params.erro] : undefined}
      />

      <p className="mt-8 text-center text-xs leading-relaxed text-graphite-500">
        Os acessos são criados internamente pela administração da HORN. Se você
        ainda não tem um login, fale com o administrador.
      </p>
    </>
  );
}
