"use server";

import type { AuthError } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

import { type AuthFormState, MIN_PASSWORD_LENGTH } from "./form-state";
import { LOGIN_ROUTE, safeRedirectTo } from "./routes";
import { getSiteUrl } from "./site-url";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Traduz os erros do Supabase Auth para mensagens em português. */
function translateAuthError(error: AuthError): string {
  switch (error.code) {
    case "invalid_credentials":
      return "E-mail ou senha incorretos.";
    case "email_not_confirmed":
      return "Este e-mail ainda não foi confirmado. Procure o administrador.";
    case "user_banned":
      return "Este acesso está bloqueado. Procure o administrador.";
    case "over_request_rate_limit":
    case "over_email_send_rate_limit":
      return "Muitas tentativas seguidas. Aguarde alguns minutos e tente novamente.";
    case "same_password":
      return "A nova senha precisa ser diferente da atual.";
    case "weak_password":
      return "Senha muito fraca. Use uma combinação mais difícil de adivinhar.";
    case "session_expired":
    case "session_not_found":
      return "Sua sessão expirou. Solicite um novo link de recuperação.";
    default:
      if (error.status === 429) {
        return "Muitas tentativas seguidas. Aguarde alguns minutos e tente novamente.";
      }
      return "Não foi possível concluir a operação. Tente novamente.";
  }
}

function readTrimmed(formData: FormData, field: string) {
  const value = formData.get(field);
  return typeof value === "string" ? value.trim() : "";
}

export async function signInAction(
  _prevState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const email = readTrimmed(formData, "email").toLowerCase();
  const password = formData.get("password");
  const redirectTo = safeRedirectTo(readTrimmed(formData, "redirectTo"));

  if (!email || typeof password !== "string" || !password) {
    return { error: "Informe o e-mail e a senha.", success: null };
  }

  if (!EMAIL_PATTERN.test(email)) {
    return { error: "Informe um e-mail válido.", success: null };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return { error: translateAuthError(error), success: null };
  }

  revalidatePath("/", "layout");
  redirect(redirectTo);
}

export async function requestPasswordResetAction(
  _prevState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const email = readTrimmed(formData, "email").toLowerCase();

  if (!EMAIL_PATTERN.test(email)) {
    return { error: "Informe um e-mail válido.", success: null };
  }

  const supabase = await createClient();
  const siteUrl = await getSiteUrl();

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${siteUrl}/auth/callback?next=/redefinir-senha`,
  });

  // Só o rate limit é devolvido como erro. Nos demais casos a resposta é sempre
  // a mesma, para não revelar quais e-mails existem na base.
  if (error && (error.status === 429 || error.code?.includes("rate_limit"))) {
    return { error: translateAuthError(error), success: null };
  }

  return {
    error: null,
    success:
      "Se este e-mail estiver cadastrado, enviamos um link para redefinir a senha. " +
      "Verifique também a caixa de spam.",
  };
}

export async function updatePasswordAction(
  _prevState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const password = formData.get("password");
  const confirmation = formData.get("passwordConfirmation");

  if (typeof password !== "string" || password.length < MIN_PASSWORD_LENGTH) {
    return {
      error: `A senha precisa ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres.`,
      success: null,
    };
  }

  if (password !== confirmation) {
    return { error: "As senhas não coincidem.", success: null };
  }

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      error:
        "O link de recuperação expirou ou já foi usado. Solicite um novo em “Esqueci minha senha”.",
      success: null,
    };
  }

  const { error } = await supabase.auth.updateUser({ password });

  if (error) {
    return { error: translateAuthError(error), success: null };
  }

  revalidatePath("/", "layout");

  return { error: null, success: "Senha alterada com sucesso." };
}

export async function signOutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();

  revalidatePath("/", "layout");
  redirect(LOGIN_ROUTE);
}
