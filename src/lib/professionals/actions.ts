"use server";

import type { PostgrestError } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";

import { getSessionUser } from "@/lib/auth/session";
import { collectFormValues, type SubmittedValues } from "@/lib/form-values";
import { createClient } from "@/lib/supabase/server";

import type { ProfessionalFormState } from "./types";
import { parseProfessionalForm } from "./validation";

const PROFISSIONAIS_PATH = "/profissionais";

function translateDbError(error: PostgrestError): string {
  switch (error.code) {
    case "42501": // insufficient_privilege — barrado pela RLS
      return "Você não tem permissão para alterar profissionais.";
    case "23503": // foreign_key_violation
      return "Segmento ou região inválidos. Recarregue a página e tente de novo.";
    case "23514": // check_violation
      if (error.message.includes("birthday")) {
        return "Data de aniversário inválida.";
      }
      if (error.message.includes("name")) {
        return "O nome não pode ficar em branco.";
      }
      return "Algum valor informado não é aceito pelo sistema.";
    case "P0002": // no_data_found — levantado por save_professional
      return "Este profissional não existe mais. Recarregue a página.";
    case "PGRST202":
      return "A função save_professional não foi encontrada no banco. Aplique supabase/migrations.";
    case "PGRST205":
      return "A tabela de profissionais não foi encontrada. Verifique se o schema foi aplicado.";
    default:
      console.error("[profissionais] erro do banco", error);
      return "Não foi possível salvar. Tente novamente.";
  }
}

function failure(
  message: string,
  values: SubmittedValues | null = null,
): ProfessionalFormState {
  return {
    status: "error",
    message,
    fieldErrors: {},
    succeededAt: null,
    values,
    attemptedAt: Date.now(),
  };
}

async function requireSession() {
  const user = await getSessionUser();
  return user ? null : "Sua sessão expirou. Entre novamente para continuar.";
}

/**
 * Grava o profissional e suas regiões pela RPC `save_professional`.
 *
 * A função do banco resolve tudo numa transação só: se as regiões falharem,
 * o profissional também não é gravado. Ver
 * supabase/migrations/0001_save_professional.sql.
 */
async function saveProfessional(
  id: string | null,
  formData: FormData,
): Promise<ProfessionalFormState> {
  const sessionError = await requireSession();
  if (sessionError) return failure(sessionError);

  const parsed = parseProfessionalForm(formData);
  if (!parsed.ok) {
    return {
      status: "error",
      message: "Revise os campos destacados.",
      fieldErrors: parsed.fieldErrors,
      succeededAt: null,
      values: collectFormValues(formData, ["region_ids"]),
      attemptedAt: Date.now(),
    };
  }

  const supabase = await createClient();
  const { payload } = parsed;

  const { error } = await supabase.rpc("save_professional", {
    p_id: id,
    p_name: payload.name,
    p_segment_id: payload.segment_id,
    p_region_ids: parsed.regionIds,
    p_email: payload.email,
    p_instagram: payload.instagram,
    p_phone: payload.phone,
    p_address: payload.address,
    p_postal_code: payload.postal_code,
    p_city: payload.city,
    p_state: payload.state,
    p_birthday_day: payload.birthday_day,
    p_birthday_month: payload.birthday_month,
    p_notes: payload.notes,
    p_is_active: payload.is_active,
  });

  if (error) return failure(translateDbError(error));

  // Cadastrar um profissional não cria contato nem métrica de contato
  // (spec, seção 27, regra 3). A RPC toca apenas professionals e
  // professional_regions.
  revalidatePath(PROFISSIONAIS_PATH);

  return {
    status: "success",
    message: `Profissional "${payload.name}" ${id ? "atualizado" : "cadastrado"}.`,
    fieldErrors: {},
    succeededAt: Date.now(),
    values: null,
    attemptedAt: null,
  };
}

export async function createProfessionalAction(
  _prevState: ProfessionalFormState,
  formData: FormData,
): Promise<ProfessionalFormState> {
  return saveProfessional(null, formData);
}

export async function updateProfessionalAction(
  _prevState: ProfessionalFormState,
  formData: FormData,
): Promise<ProfessionalFormState> {
  const id = formData.get("id");

  if (typeof id !== "string" || !id) {
    return failure(
      "Profissional não identificado. Recarregue a página e tente de novo.",
    );
  }

  return saveProfessional(id, formData);
}

export type ToggleProfessionalResult = { ok: boolean; message: string };

/**
 * Ativa ou inativa um profissional.
 *
 * Substitui a exclusão no fluxo normal: o registro precisa continuar
 * existindo para preservar contatos e oportunidades (spec, seção 7.5).
 */
export async function setProfessionalActiveAction(
  id: string,
  isActive: boolean,
): Promise<ToggleProfessionalResult> {
  const sessionError = await requireSession();
  if (sessionError) return { ok: false, message: sessionError };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("professionals")
    .update({ is_active: isActive })
    .eq("id", id)
    .select("name");

  if (error) return { ok: false, message: translateDbError(error) };

  if (!data || data.length === 0) {
    return {
      ok: false,
      message: "Não foi possível alterar o status deste profissional.",
    };
  }

  revalidatePath(PROFISSIONAIS_PATH);

  return {
    ok: true,
    message: `Profissional "${data[0].name}" ${isActive ? "ativado" : "inativado"}.`,
  };
}
