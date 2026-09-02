"use server";

import type { PostgrestError } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";

import { authorizeAdminAction } from "@/lib/auth/session";
import { collectFormValues, type SubmittedValues } from "@/lib/form-values";
import { createClient } from "@/lib/supabase/server";

import { STORE_LOGO_BUCKET } from "./logo";
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
    createdId: null,
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
      values: collectFormValues(formData, [
        "responsible_names",
        "responsible_phones",
      ]),
      attemptedAt: Date.now(),
      createdId: null,
    };
  }

  const supabase = await createClient();
  /*
    O id volta do insert porque o logotipo depende dele: a imagem é enviada
    para a pasta `{loja}/` do bucket, que só existe depois que a loja existe.
  */
  const { data, error } = await supabase
    .from("stores")
    .insert(parsed.payload)
    .select("id")
    .maybeSingle<{ id: string }>();

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
    createdId: data?.id ?? null,
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
      values: collectFormValues(formData, [
        "responsible_names",
        "responsible_phones",
      ]),
      attemptedAt: Date.now(),
      createdId: null,
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
    createdId: null,
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

// --------------------------------------------------------------------------
// Logotipo
// --------------------------------------------------------------------------
// O arquivo já subiu ao bucket pelo navegador, com a sessão de quem está
// logado — as policies `store_logos_*` são a autorização real. Estas duas
// actions só cuidam do ponteiro na tabela e da limpeza do arquivo antigo.

/** Remove um objeto do bucket, ignorando falha — é só limpeza. */
async function discardLogo(path: string | null) {
  if (!path) return;

  try {
    const supabase = await createClient();
    await supabase.storage.from(STORE_LOGO_BUCKET).remove([path]);
  } catch (error) {
    console.error("[lojas] falha ao limpar logotipo", error);
  }
}

/** Lê o logotipo atual antes de trocar, para saber o que apagar depois. */
async function currentLogoPath(id: string): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("stores")
    .select("logo_path")
    .eq("id", id)
    .maybeSingle<{ logo_path: string | null }>();

  return data?.logo_path ?? null;
}

/**
 * Aponta a loja para um logotipo recém-enviado.
 *
 * A ORDEM IMPORTA. O arquivo novo já está no bucket quando esta action roda;
 * o antigo só é apagado depois que a tabela passou a apontar para o novo. Se a
 * gravação falhar, quem some é o arquivo novo — a loja continua com o logotipo
 * que já tinha, em vez de ficar apontando para nada.
 */
export async function setStoreLogoAction(
  id: string,
  path: string,
): Promise<ToggleStoreResult> {
  const sessionError = await requireSession();
  if (sessionError) {
    await discardLogo(path);
    return { ok: false, message: sessionError };
  }

  // A pasta é o que as policies do bucket conferem; um caminho fora da
  // convenção não pode virar o logotipo de outra loja.
  if (!path.startsWith(`${id}/`)) {
    await discardLogo(path);
    return {
      ok: false,
      message: "Caminho da imagem fora do padrão. Tente enviar novamente.",
    };
  }

  const previous = await currentLogoPath(id);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("stores")
    .update({ logo_path: path })
    .eq("id", id)
    .select("name");

  if (error) {
    await discardLogo(path);
    return { ok: false, message: translateDbError(error) };
  }

  // A RLS devolve zero linhas em vez de erro quando o update não é permitido.
  if (!data || data.length === 0) {
    await discardLogo(path);
    return {
      ok: false,
      message: "Não foi possível salvar o logotipo desta loja.",
    };
  }

  if (previous && previous !== path) await discardLogo(previous);

  revalidatePath(LOJAS_PATH);
  revalidatePath(DASHBOARD_PATH);

  return { ok: true, message: "Logotipo atualizado." };
}

/**
 * Tira o logotipo da loja.
 *
 * Mesma ordem: primeiro a loja deixa de apontar para o arquivo, depois o
 * arquivo é removido. A loja segue válida sem ele.
 */
export async function removeStoreLogoAction(
  id: string,
): Promise<ToggleStoreResult> {
  const sessionError = await requireSession();
  if (sessionError) return { ok: false, message: sessionError };

  const previous = await currentLogoPath(id);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("stores")
    .update({ logo_path: null })
    .eq("id", id)
    .select("name");

  if (error) return { ok: false, message: translateDbError(error) };

  if (!data || data.length === 0) {
    return {
      ok: false,
      message: "Não foi possível remover o logotipo desta loja.",
    };
  }

  await discardLogo(previous);

  revalidatePath(LOJAS_PATH);
  revalidatePath(DASHBOARD_PATH);

  return { ok: true, message: "Logotipo removido." };
}
