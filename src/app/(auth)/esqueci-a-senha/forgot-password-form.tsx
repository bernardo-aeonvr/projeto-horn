"use client";

import { useActionState } from "react";

import { SubmitButton } from "@/components/auth/submit-button";
import { FormAlert } from "@/components/ui/form-alert";
import { TextField } from "@/components/ui/text-field";
import { requestPasswordResetAction } from "@/lib/auth/actions";
import { initialAuthFormState } from "@/lib/auth/form-state";

export function ForgotPasswordForm() {
  const [state, formAction, pending] = useActionState(
    requestPasswordResetAction,
    initialAuthFormState,
  );

  if (state.success) {
    return <FormAlert tone="success">{state.success}</FormAlert>;
  }

  return (
    <form action={formAction} className="space-y-5">
      {state.error ? <FormAlert tone="error">{state.error}</FormAlert> : null}

      <TextField
        label="E-mail"
        name="email"
        type="email"
        autoComplete="username"
        placeholder="voce@horn.com.br"
        required
        autoFocus
      />

      <SubmitButton pending={pending} pendingLabel="Enviando...">
        Enviar link de recuperação
      </SubmitButton>
    </form>
  );
}
