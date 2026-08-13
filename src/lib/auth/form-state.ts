/**
 * Estado compartilhado pelos formulários de autenticação.
 *
 * Fica fora de `actions.ts` porque um módulo `"use server"` só pode exportar
 * funções assíncronas.
 */
export type AuthFormState = {
  error: string | null;
  success: string | null;
};

export const initialAuthFormState: AuthFormState = { error: null, success: null };

/** Tamanho mínimo de senha aceito pela aplicação. */
export const MIN_PASSWORD_LENGTH = 8;
