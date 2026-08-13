"use server";

import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";

import { getSessionUser } from "@/lib/auth/session";
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
    case "PGRST205":
      return "A tabela de profissionais não foi encontrada. Verifique se o schema foi aplicado.";
    default:
      console.error("[profissionais] erro do banco", error);
      return "Não foi possível salvar. Tente novamente.";
  }
}

function failure(message: string): ProfessionalFormState {
  return { status: "error", message, fieldErrors: {}, succeededAt: null };
}

async function requireSession() {
  const user = await getSessionUser();
  return user ? null : "Sua sessão expirou. Entre novamente para continuar.";
}

/**
 * Sincroniza `professional_regions` com a seleção do formulário.
 *
 * Só o que mudou é tocado — as associações mantidas continuam com o
 * `created_at` original.
 */
async function syncRegions(
  supabase: SupabaseClient,
  professionalId: string,
  regionIds: string[],
): Promise<PostgrestError | null> {
  const { data: current, error: readError } = await supabase
    .from("professional_regions")
    .select("region_id")
    .eq("professional_id", professionalId);

  if (readError) return readError;

  const currentIds = new Set(
    (current ?? []).map((row: { region_id: string }) => row.region_id),
  );
  const nextIds = new Set(regionIds);

  const toRemove = [...currentIds].filter((id) => !nextIds.has(id));
  const toAdd = [...nextIds].filter((id) => !currentIds.has(id));

  if (toRemove.length > 0) {
    const { error } = await supabase
      .from("professional_regions")
      .delete()
      .eq("professional_id", professionalId)
      .in("region_id", toRemove);

    if (error) return error;
  }

  if (toAdd.length > 0) {
    const { error } = await supabase.from("professional_regions").insert(
      toAdd.map((regionId) => ({
        professional_id: professionalId,
        region_id: regionId,
      })),
    );

    if (error) return error;
  }

  return null;
}

export async function createProfessionalAction(
  _prevState: ProfessionalFormState,
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
    };
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("professionals")
    .insert(parsed.payload)
    .select("id")
    .single();

  if (error || !data) {
    return failure(
      error ? translateDbError(error) : "Não foi possível salvar. Tente novamente.",
    );
  }

  const regionError = await syncRegions(supabase, data.id, parsed.regionIds);

  // PostgREST não expõe transação entre requisições. Se as regiões falharem,
  // desfaz o insert para não deixar um profissional pela metade.
  if (regionError) {
    await supabase.from("professionals").delete().eq("id", data.id);

    return failure(
      "Não foi possível salvar as regiões de atuação, então o cadastro foi desfeito. Tente novamente.",
    );
  }

  // Cadastrar um profissional não cria contato nem métrica de contato
  // (spec, seção 27, regra 3). Nada além destas duas tabelas é tocado aqui.
  revalidatePath(PROFISSIONAIS_PATH);

  return {
    status: "success",
    message: `Profissional "${parsed.payload.name}" cadastrado.`,
    fieldErrors: {},
    succeededAt: Date.now(),
  };
}

export async function updateProfessionalAction(
  _prevState: ProfessionalFormState,
  formData: FormData,
): Promise<ProfessionalFormState> {
  const sessionError = await requireSession();
  if (sessionError) return failure(sessionError);

  const id = formData.get("id");
  if (typeof id !== "string" || !id) {
    return failure(
      "Profissional não identificado. Recarregue a página e tente de novo.",
    );
  }

  const parsed = parseProfessionalForm(formData);
  if (!parsed.ok) {
    return {
      status: "error",
      message: "Revise os campos destacados.",
      fieldErrors: parsed.fieldErrors,
      succeededAt: null,
    };
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("professionals")
    .update(parsed.payload)
    .eq("id", id)
    .select("id");

  if (error) return failure(translateDbError(error));

  // A RLS devolve zero linhas em vez de erro quando o update não é permitido.
  if (!data || data.length === 0) {
    return failure(
      "Não foi possível salvar: o profissional não existe mais ou você não tem permissão.",
    );
  }

  const regionError = await syncRegions(supabase, id, parsed.regionIds);

  if (regionError) {
    console.error("[profissionais] falha ao sincronizar regiões", regionError);
    return failure(
      "Os dados foram salvos, mas as regiões de atuação não. Reabra a edição e ajuste as regiões.",
    );
  }

  revalidatePath(PROFISSIONAIS_PATH);

  return {
    status: "success",
    message: `Profissional "${parsed.payload.name}" atualizado.`,
    fieldErrors: {},
    succeededAt: Date.now(),
  };
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
