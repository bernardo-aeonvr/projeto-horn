"use client";

import Link from "next/link";
import { useActionState } from "react";

import { SubmitButton } from "@/components/auth/submit-button";
import { FormAlert } from "@/components/ui/form-alert";
import { TextField } from "@/components/ui/text-field";
import { updatePasswordAction } from "@/lib/auth/actions";
import {
  initialAuthFormState,
  MIN_PASSWORD_LENGTH,
} from "@/lib/auth/form-state";
import { DEFAULT_AUTHENTICATED_ROUTE } from "@/lib/auth/routes";

export function ResetPasswordForm() {
  const [state, formAction, pending] = useActionState(
    updatePasswordAction,
    initialAuthFormState,
  );

  if (state.success) {
    return (
      <div className="space-y-5">
        <FormAlert tone="success">{state.success}</FormAlert>
        <Link
          href={DEFAULT_AUTHENTICATED_ROUTE}
          className="inline-flex h-11 w-full items-center justify-center rounded-lg bg-gold-500 px-5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-gold-600"
        >
          Ir para o Dashboard
        </Link>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-5">
      {state.error ? <FormAlert tone="error">{state.error}</FormAlert> : null}

      <TextField
        label="Nova senha"
        name="password"
        type="password"
        autoComplete="new-password"
        placeholder="••••••••"
        minLength={MIN_PASSWORD_LENGTH}
        required
        autoFocus
        hint={`Mínimo de ${MIN_PASSWORD_LENGTH} caracteres.`}
      />

      <TextField
        label="Confirmar nova senha"
        name="passwordConfirmation"
        type="password"
        autoComplete="new-password"
        placeholder="••••••••"
        minLength={MIN_PASSWORD_LENGTH}
        required
      />

      <SubmitButton pending={pending} pendingLabel="Salvando...">
        Salvar nova senha
      </SubmitButton>
    </form>
  );
}
