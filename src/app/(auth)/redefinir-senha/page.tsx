import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { AuthHeading } from "@/components/auth/auth-heading";
import { FormAlert } from "@/components/ui/form-alert";
import { createClient } from "@/lib/supabase/server";

import { ResetPasswordForm } from "./reset-password-form";

export const metadata: Metadata = { title: "Definir nova senha" };

export default async function ResetPasswordPage() {
  const supabase = await createClient();

  // O link de recuperação chega aqui já com sessão (criada em /auth/callback).
  // Esta tela também é usada por quem já está logado para trocar a própria senha.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <>
        <AuthHeading
          title="Link expirado"
          description="Não encontramos uma sessão válida para redefinir a senha."
        />

        <FormAlert tone="error">
          O link de recuperação é válido apenas por um período curto e só pode
          ser usado uma vez. Solicite um novo link para continuar.
        </FormAlert>

        <Link
          href="/esqueci-a-senha"
          className="mt-6 inline-flex h-11 w-full items-center justify-center rounded-lg bg-gold-500 px-5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-gold-600"
        >
          Solicitar novo link
        </Link>

        <Link
          href="/login"
          className="mt-6 inline-flex items-center gap-1.5 rounded text-sm font-medium text-graphite-600 transition-colors hover:text-graphite-900"
        >
          <ArrowLeft className="size-4" aria-hidden />
          Voltar para o login
        </Link>
      </>
    );
  }

  /*
    Quem chega aqui com senha provisória foi mandado por `requireSessionUser`,
    e não sai enquanto não trocar. O texto precisa explicar isso — senão a tela
    parece um erro, e a pessoa acabou de digitar uma senha que funcionou.
  */
  const { data: profile } = await supabase
    .from("user_profiles")
    .select("must_change_password")
    .eq("id", user.id)
    .maybeSingle<{ must_change_password: boolean | null }>();

  const isProvisional = profile?.must_change_password === true;

  return (
    <>
      <AuthHeading
        title={isProvisional ? "Crie sua senha" : "Definir nova senha"}
        description={
          isProvisional
            ? `A senha que você recebeu é provisória. Escolha uma senha só sua para o acesso ${user.email}.`
            : `Escolha uma nova senha para o acesso ${user.email}.`
        }
      />

      {isProvisional ? (
        <FormAlert tone="info" className="mb-5">
          Depois de salvar, a senha enviada pela HORN deixa de funcionar.
        </FormAlert>
      ) : null}

      <ResetPasswordForm />
    </>
  );
}
