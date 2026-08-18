"use server";

import type { PostgrestError } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";

import { authorizeAdminAction } from "@/lib/auth/session";
import { collectFormValues, type SubmittedValues } from "@/lib/form-values";
import { createClient } from "@/lib/supabase/server";

import type { StoreFormState } from "./types";
import { parseStoreForm } from "./validation";

const LOJAS_PATH = "/lojas";
const DASHBOARD_PATH = "/dashboard";

/** Traduz os erros do Postgres/PostgREST que o usuário pode realmente causar. */
function translateDbError(error: PostgrestError): string {
  switch (error.code) {
    case "42501": // insufficient_privilege — barrado pela RLS
      return "Você não tem permissão para alterar lojas.";
    case "23514": // check_violation
      if (error.message.includes("commission")) {
        return "O percentual de comissão deve ficar entre 0 e 100.";
      }
      if (error.message.includes("monthly_fixed_fee")) {
        return "O valor fixo mensal não pode ser negativo.";
      }
      return "Algum valor informado não é aceito pelo sistema.";
    case "23503": // foreign_key_violation
      return "Esta loja está vinculada a outros registros e não pode ser removida.";
    case "PGRST205":
      return "A tabela de lojas não foi encontrada no banco. Verifique se o schema foi aplicado.";
    default:
      console.error("[lojas] erro do banco", error);
      return "Não foi possível salvar. Tente novamente.";
  }
}

function failure(
  message: string,
  values: SubmittedValues | null = null,
): StoreFormState {
  return {
    status: "error",
    message,
    fieldErrors: {},
    succeededAt: null,
    values,
    attemptedAt: Date.now(),
  };
}

/**
 * Só o admin cadastra e edita lojas.
 *
 * Inclui a própria loja do usuário: ela não altera comissão, valor fixo nem
 * status (spec, seção 4.2). A RLS recusa de novo no banco.
 */
async function requireSession() {
  const authorization = await authorizeAdminAction();
  return authorization.ok ? null : authorization.message;
}

export async function createStoreAction(
  _prevState: StoreFormState,
  formData: FormData,
): Promise<StoreFormState> {
  const sessionError = await requireSession();
  if (sessionError) return failure(sessionError);

  const parsed = parseStoreForm(formData);
  if (!parsed.ok) {
    return {
      status: "error",
      message: "Revise os campos destacados.",
      fieldErrors: parsed.fieldErrors,
      succeededAt: null,
      values: collectFormValues(formData, []),
      attemptedAt: Date.now(),
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("stores").insert(parsed.payload);

  if (error) return failure(translateDbError(error));

  revalidatePath(LOJAS_PATH);
  // A loja aparece no comparativo e no filtro do dashboard.
  revalidatePath(DASHBOARD_PATH);

  return {
    status: "success",
    message: `Loja "${parsed.payload.name}" cadastrada.`,
    fieldErrors: {},
    succeededAt: Date.now(),
    values: null,
    attemptedAt: null,
  };
}

export async function updateStoreAction(
  _prevState: StoreFormState,
  formData: FormData,
): Promise<StoreFormState> {
  const sessionError = await requireSession();
  if (sessionError) return failure(sessionError);

  const id = formData.get("id");
  if (typeof id !== "string" || !id) {
    return failure(
      "Loja não identificada. Recarregue a página e tente de novo.",
    );
  }

  const parsed = parseStoreForm(formData);
  if (!parsed.ok) {
    return {
      status: "error",
      message: "Revise os campos destacados.",
      fieldErrors: parsed.fieldErrors,
      succeededAt: null,
      values: collectFormValues(formData, []),
      attemptedAt: Date.now(),
    };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("stores")
    .update(parsed.payload)
    .eq("id", id)
    .select("id");

  if (error) return failure(translateDbError(error));

  // A RLS devolve zero linhas em vez de erro quando o update não é permitido.
  if (!data || data.length === 0) {
    return failure(
      "Não foi possível salvar: a loja não existe mais ou você não tem permissão.",
    );
  }

  revalidatePath(LOJAS_PATH);
  // A loja aparece no comparativo e no filtro do dashboard.
  revalidatePath(DASHBOARD_PATH);

  return {
    status: "success",
    message: `Loja "${parsed.payload.name}" atualizada.`,
    fieldErrors: {},
    succeededAt: Date.now(),
    values: null,
    attemptedAt: null,
  };
}

export type ToggleStoreResult = { ok: boolean; message: string };

/**
 * Ativa ou inativa uma loja.
 *
 * A inativação substitui a exclusão no fluxo normal: a loja deixa de ser
 * oferecida em novos contatos, mas o histórico dela é preservado
 * (spec, seções 9.3 e 8.5).
 */
export async function setStoreActiveAction(
  id: string,
  isActive: boolean,
): Promise<ToggleStoreResult> {
  const sessionError = await requireSession();
  if (sessionError) return { ok: false, message: sessionError };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("stores")
    .update({ is_active: isActive })
    .eq("id", id)
    .select("name");

  if (error) return { ok: false, message: translateDbError(error) };

  if (!data || data.length === 0) {
    return {
      ok: false,
      message: "Não foi possível alterar o status desta loja.",
    };
  }

  revalidatePath(LOJAS_PATH);
  // A loja aparece no comparativo e no filtro do dashboard.
  revalidatePath(DASHBOARD_PATH);

  return {
    ok: true,
    message: `Loja "${data[0].name}" ${isActive ? "ativada" : "inativada"}.`,
  };
}
