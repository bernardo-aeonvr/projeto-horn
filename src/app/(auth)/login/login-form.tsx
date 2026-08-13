"use client";

import Link from "next/link";
import { useActionState } from "react";

import { SubmitButton } from "@/components/auth/submit-button";
import { FormAlert } from "@/components/ui/form-alert";
import { TextField } from "@/components/ui/text-field";
import { signInAction } from "@/lib/auth/actions";
import { initialAuthFormState } from "@/lib/auth/form-state";

type LoginFormProps = {
  redirectTo: string;
  /** Mensagem vinda de outro fluxo, ex.: link de recuperação inválido. */
  initialError?: string;
};

export function LoginForm({ redirectTo, initialError }: LoginFormProps) {
  const [state, formAction, pending] = useActionState(
    signInAction,
    initialError ? { error: initialError, success: null } : initialAuthFormState,
  );

  return (
    <form action={formAction} className="space-y-5">
      {state.error ? <FormAlert tone="error">{state.error}</FormAlert> : null}

      <input type="hidden" name="redirectTo" value={redirectTo} />

      <TextField
        label="E-mail"
        name="email"
        type="email"
        autoComplete="username"
        placeholder="voce@horn.com.br"
        required
        autoFocus
      />

      <TextField
        label="Senha"
        name="password"
        type="password"
        autoComplete="current-password"
        placeholder="••••••••"
        required
        labelAction={
          <Link
            href="/esqueci-a-senha"
            className="rounded text-xs font-medium text-gold-700 transition-colors hover:text-gold-800 hover:underline"
          >
            Esqueci minha senha
          </Link>
        }
      />

      <SubmitButton pending={pending} pendingLabel="Entrando...">
        Entrar
      </SubmitButton>
    </form>
  );
}
