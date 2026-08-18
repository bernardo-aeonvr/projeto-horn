"use server";

import type { PostgrestError } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";

import { authorizeAdminAction } from "@/lib/auth/session";
import { collectFormValues, type SubmittedValues } from "@/lib/form-values";
import { createClient } from "@/lib/supabase/server";

import { listContactsByProfessional } from "./queries";
import type { Contact, ContactFormState } from "./types";
import { parseContactForm } from "./validation";

const CONTATOS_PATH = "/contatos";
const PROFISSIONAIS_PATH = "/profissionais";
const DASHBOARD_PATH = "/dashboard";

function translateDbError(error: PostgrestError): string {
  // A RPC register_contact levanta exceções sem SQLSTATE próprio, então a
  // mensagem crua é a única pista disponível nesses dois casos.
  if (error.message?.includes("Not authorized")) {
    return "Você não tem permissão para registrar contatos.";
  }
  if (error.message?.includes("At least one presented store")) {
    return "Selecione ao menos uma loja apresentada.";
  }

  switch (error.code) {
    case "42501":
      return "Você não tem permissão para alterar contatos.";
    case "23503": // foreign_key_violation
      return "Profissional ou loja inválidos. Recarregue a página e tente de novo.";
    case "22P02": // invalid_text_representation
      return "Canal de contato inválido.";
    case "PGRST202":
      return "A função register_contact não foi encontrada no banco. Verifique o schema.";
    case "PGRST205":
      return "A tabela de contatos não foi encontrada. Verifique se o schema foi aplicado.";
    default:
      console.error("[contatos] erro do banco", error);
      return "Não foi possível salvar. Tente novamente.";
  }
}

function failure(
  message: string,
  values: SubmittedValues | null = null,
): ContactFormState {
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
 * Registrar e consultar contatos é privativo do admin.
 *
 * Um contato guarda quais lojas foram apresentadas juntas — abrir isso para
 * uma loja revelaria as outras marcas representadas (spec, seção 4.2). A RLS
 * recusa de novo no banco.
 */
async function requireSession() {
  const authorization = await authorizeAdminAction();
  return authorization.ok ? null : authorization.message;
}

function revalidate() {
  revalidatePath(CONTATOS_PATH);
  // O histórico do profissional muda junto.
  revalidatePath(PROFISSIONAIS_PATH);
  // Contato entra direto em "Profissionais contatados" e no alcance por loja.
  revalidatePath(DASHBOARD_PATH);
}

/**
 * Registra um contato usando a RPC `register_contact` do schema.
 *
 * A função grava `contacts` e o snapshot em `contact_stores` na mesma
 * transação, então não existe contato criado sem as lojas apresentadas.
 *
 * Registrar contato não cria oportunidade, projeto ou proposta, e não mexe
 * em nenhum funil: são entidades separadas (spec, seção 27).
 */
export async function createContactAction(
  _prevState: ContactFormState,
  formData: FormData,
): Promise<ContactFormState> {
  const sessionError = await requireSession();
  if (sessionError) return failure(sessionError);

  const parsed = parseContactForm(formData);
  if (!parsed.ok) {
    return {
      status: "error",
      message: "Revise os campos destacados.",
      fieldErrors: parsed.fieldErrors,
      succeededAt: null,
      values: collectFormValues(formData, ["store_ids"]),
      attemptedAt: Date.now(),
    };
  }

  const supabase = await createClient();
  const { payload } = parsed;

  // Nada impede vários contatos para o mesmo profissional: recontato faz
  // parte do negócio (spec, seção 8.1).
  const { error } = await supabase.rpc("register_contact", {
    p_professional_id: payload.professionalId,
    p_channel: payload.channel,
    p_store_ids: payload.storeIds,
    p_contacted_at: payload.contactedAt,
    p_notes: payload.notes,
  });

  if (error) return failure(translateDbError(error));

  revalidate();

  return {
    status: "success",
    message: "Contato registrado.",
    fieldErrors: {},
    succeededAt: Date.now(),
    values: null,
    attemptedAt: null,
  };
}

/**
 * Corrige um contato registrado por engano.
 *
 * Diferente da criação, o schema não traz RPC de edição, e o PostgREST não
 * tem transação entre requisições. A atualização acontece em duas etapas com
 * compensação: se as lojas falharem, o estado anterior do contato é
 * restaurado. Ver a nota em supabase/migrations sobre um save_contact.
 */
export async function updateContactAction(
  _prevState: ContactFormState,
  formData: FormData,
): Promise<ContactFormState> {
  const sessionError = await requireSession();
  if (sessionError) return failure(sessionError);

  const id = formData.get("id");
  if (typeof id !== "string" || !id) {
    return failure("Contato não identificado. Recarregue a página.");
  }

  const parsed = parseContactForm(formData);
  if (!parsed.ok) {
    return {
      status: "error",
      message: "Revise os campos destacados.",
      fieldErrors: parsed.fieldErrors,
      succeededAt: null,
      values: collectFormValues(formData, ["store_ids"]),
      attemptedAt: Date.now(),
    };
  }

  const supabase = await createClient();
  const { payload } = parsed;

  const { data: previous, error: readError } = await supabase
    .from("contacts")
    .select("professional_id, contacted_at, channel, notes")
    .eq("id", id)
    .maybeSingle();

  if (readError) return failure(translateDbError(readError));
  if (!previous) {
    return failure("Este contato não existe mais. Recarregue a página.");
  }

  const { data: updated, error: updateError } = await supabase
    .from("contacts")
    .update({
      professional_id: payload.professionalId,
      contacted_at: payload.contactedAt,
      channel: payload.channel,
      notes: payload.notes,
    })
    .eq("id", id)
    .select("id");

  if (updateError) return failure(translateDbError(updateError));

  if (!updated || updated.length === 0) {
    return failure(
      "Não foi possível salvar: o contato não existe mais ou você não tem permissão.",
    );
  }

  const storeError = await syncContactStores(supabase, id, payload.storeIds);

  if (storeError) {
    // Desfaz o update para não deixar o contato com dados novos e o snapshot
    // de lojas antigo.
    await supabase.from("contacts").update(previous).eq("id", id);

    console.error("[contatos] falha ao sincronizar lojas", storeError);
    return failure(
      "Não foi possível atualizar as lojas apresentadas, então nada foi alterado. Tente novamente.",
    );
  }

  revalidate();

  return {
    status: "success",
    message: "Contato atualizado.",
    fieldErrors: {},
    succeededAt: Date.now(),
    values: null,
    attemptedAt: null,
  };
}

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

/** Sincroniza `contact_stores` tocando apenas o diff. */
async function syncContactStores(
  supabase: SupabaseServerClient,
  contactId: string,
  storeIds: string[],
): Promise<PostgrestError | null> {
  const { data: current, error: readError } = await supabase
    .from("contact_stores")
    .select("store_id")
    .eq("contact_id", contactId);

  if (readError) return readError;

  const currentIds = new Set(
    (current ?? []).map((row: { store_id: string }) => row.store_id),
  );
  const nextIds = new Set(storeIds);

  const toRemove = [...currentIds].filter((id) => !nextIds.has(id));
  const toAdd = [...nextIds].filter((id) => !currentIds.has(id));

  if (toRemove.length > 0) {
    const { error } = await supabase
      .from("contact_stores")
      .delete()
      .eq("contact_id", contactId)
      .in("store_id", toRemove);

    if (error) return error;
  }

  if (toAdd.length > 0) {
    const { error } = await supabase
      .from("contact_stores")
      .insert(
        toAdd.map((storeId) => ({ contact_id: contactId, store_id: storeId })),
      );

    if (error) return error;
  }

  return null;
}

export type DeleteContactResult = { ok: boolean; message: string };

/**
 * Remove um contato registrado por engano.
 *
 * Os vínculos em `contact_stores` saem junto pelo ON DELETE CASCADE da FK,
 * então não sobram registros órfãos.
 */
export async function deleteContactAction(
  id: string,
): Promise<DeleteContactResult> {
  const sessionError = await requireSession();
  if (sessionError) return { ok: false, message: sessionError };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("contacts")
    .delete()
    .eq("id", id)
    .select("id");

  if (error) return { ok: false, message: translateDbError(error) };

  if (!data || data.length === 0) {
    return {
      ok: false,
      message: "Não foi possível remover: o contato não existe mais.",
    };
  }

  revalidate();

  return { ok: true, message: "Contato removido do histórico." };
}

/**
 * Histórico de contatos de um profissional.
 *
 * Carregado sob demanda ao abrir o detalhe, para não pesar a listagem.
 */
export async function getProfessionalContactsAction(
  professionalId: string,
): Promise<Contact[]> {
  const authorization = await authorizeAdminAction();
  if (!authorization.ok) return [];

  return listContactsByProfessional(professionalId);
}
