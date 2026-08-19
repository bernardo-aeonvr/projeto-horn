"use server";

import type { PostgrestError } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";

import { authorizeAdminAction, getSessionUser } from "@/lib/auth/session";
import { collectFormValues, type SubmittedValues } from "@/lib/form-values";
import { createClient } from "@/lib/supabase/server";

import {
  getOpportunity,
  listOpportunitiesByProfessional,
  listOpportunityHistory,
  listProposalAttachments,
} from "./queries";
import {
  STATUS_LABELS,
  type ActionResult,
  type Opportunity,
  type OpportunityDetails,
  type OpportunityFormState,
  type OpportunityStatus,
  type StatusFormState,
} from "./types";
import {
  parseAttachmentInput,
  parseOpportunityForm,
  parseStatusChangeForm,
  type StatusChangePayload,
} from "./validation";

const PROJETOS_PATH = "/projetos-propostas";
const PROFISSIONAIS_PATH = "/profissionais";
const DASHBOARD_PATH = "/dashboard";
const BUCKET = "proposal-pdfs";

function translateDbError(error: PostgrestError): string {
  // O trigger `prepare_opportunity` levanta exceções sem SQLSTATE próprio,
  // então a mensagem crua é a única pista nesses dois casos.
  if (error.message?.includes("requires final_closed_value")) {
    return "Para marcar como fechada é preciso informar o valor final fechado.";
  }
  if (error.message?.includes("requires commission_percent")) {
    return (
      "Este negócio não tem percentual de comissão preservado e a loja não tem " +
      "percentual padrão cadastrado. Informe o percentual para fechar."
    );
  }

  switch (error.code) {
    case "42501": // insufficient_privilege — barrado pela RLS
      return "Você não tem permissão para alterar projetos.";
    case "23503": // foreign_key_violation
      return "Profissional ou loja inválidos. Recarregue a página e tente de novo.";
    case "23514": // check_violation
      if (error.message.includes("commission")) {
        return "O percentual de comissão deve ficar entre 0 e 100.";
      }
      if (error.message.includes("value")) {
        return "Os valores informados não podem ser negativos.";
      }
      return "Algum valor informado não é aceito pelo sistema.";
    case "22P02": // invalid_text_representation
      return "Status inválido.";
    case "428C9": // cannot insert into generated column
      return "A comissão é calculada pelo banco e não pode ser enviada pela aplicação.";
    case "PGRST205":
      return "A tabela de projetos não foi encontrada. Verifique se o schema foi aplicado.";
    default:
      console.error("[projetos] erro do banco", error);
      return "Não foi possível salvar. Tente novamente.";
  }
}

function formFailure(
  message: string,
  values: SubmittedValues | null = null,
): OpportunityFormState {
  return {
    status: "error",
    message,
    fieldErrors: {},
    succeededAt: null,
    values,
    attemptedAt: Date.now(),
  };
}

function statusFailure(
  message: string,
  values: SubmittedValues | null = null,
): StatusFormState {
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
 * Toda escrita de projeto é privativa do admin.
 *
 * A loja é somente leitura (spec, seção 4.2), e esconder o botão não basta:
 * uma Server Action é um endpoint. Esta checagem roda antes de qualquer
 * gravação, e a RLS recusa de novo no banco caso algo escape daqui.
 */
async function requireAdmin() {
  const authorization = await authorizeAdminAction();
  return authorization.ok ? null : authorization.message;
}

/** Leituras sob demanda: basta uma sessão válida, o recorte é feito pela RLS. */
async function requireSession() {
  const user = await getSessionUser();
  return user ? null : "Sua sessão expirou. Entre novamente para continuar.";
}

function revalidate() {
  revalidatePath(PROJETOS_PATH);
  // A ficha do profissional lista os projetos dele.
  revalidatePath(PROFISSIONAIS_PATH);
  // Criar projeto ou movimentar status muda KPI, evolução e resultado da loja.
  revalidatePath(DASHBOARD_PATH);
}

// --------------------------------------------------------------------------
// Cadastro e edição
// --------------------------------------------------------------------------

/**
 * Cria um projeto/oportunidade.
 *
 * O status inicial e o percentual de comissão não são enviados de propósito:
 * a coluna `status` tem default `project_received` e o trigger
 * `prepare_opportunity` copia `stores.default_commission_percent` para o
 * registro. Assim o percentual fica preservado no negócio e uma mudança
 * futura no cadastro da loja não altera resultados antigos (spec, seção 10.4).
 *
 * O trigger `opportunities_record_status_history` grava o primeiro evento da
 * timeline na mesma transação do INSERT.
 */
export async function createOpportunityAction(
  _prevState: OpportunityFormState,
  formData: FormData,
): Promise<OpportunityFormState> {
  const sessionError = await requireAdmin();
  if (sessionError) return formFailure(sessionError);

  const parsed = parseOpportunityForm(formData);
  if (!parsed.ok) {
    return {
      status: "error",
      message: "Revise os campos destacados.",
      fieldErrors: parsed.fieldErrors,
      succeededAt: null,
      values: collectFormValues(formData),
      attemptedAt: Date.now(),
    };
  }

  const supabase = await createClient();
  const { payload } = parsed;

  const { error } = await supabase.from("opportunities").insert({
    professional_id: payload.professional_id,
    store_id: payload.store_id,
    title: payload.title,
    notes: payload.notes,
  });

  if (error) {
    return formFailure(translateDbError(error), collectFormValues(formData));
  }

  revalidate();

  return {
    status: "success",
    message: "Projeto registrado.",
    fieldErrors: {},
    succeededAt: Date.now(),
    values: null,
    attemptedAt: null,
  };
}

/**
 * Corrige os dados cadastrais de um projeto.
 *
 * Diferente da criação, o formulário de edição envia o valor inicial e o
 * percentual de comissão — é por aqui que um registro histórico é acertado.
 * O status continua sendo alterado apenas pelas ações de movimentação, para
 * que toda mudança passe pelo trigger de histórico.
 */
export async function updateOpportunityAction(
  _prevState: OpportunityFormState,
  formData: FormData,
): Promise<OpportunityFormState> {
  const sessionError = await requireAdmin();
  if (sessionError) return formFailure(sessionError);

  const id = formData.get("id");
  if (typeof id !== "string" || !id) {
    return formFailure("Projeto não identificado. Recarregue a página.");
  }

  const parsed = parseOpportunityForm(formData);
  if (!parsed.ok) {
    return {
      status: "error",
      message: "Revise os campos destacados.",
      fieldErrors: parsed.fieldErrors,
      succeededAt: null,
      values: collectFormValues(formData),
      attemptedAt: Date.now(),
    };
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("opportunities")
    .update(parsed.payload)
    .eq("id", id)
    .select("id");

  if (error) {
    return formFailure(translateDbError(error), collectFormValues(formData));
  }

  if (!data || data.length === 0) {
    return formFailure(
      "Não foi possível salvar: o projeto não existe mais ou você não tem permissão.",
    );
  }

  revalidate();

  return {
    status: "success",
    message: "Projeto atualizado.",
    fieldErrors: {},
    succeededAt: Date.now(),
    values: null,
    attemptedAt: null,
  };
}

// --------------------------------------------------------------------------
// Movimentação do funil
// --------------------------------------------------------------------------

/**
 * Aplica a mudança de status.
 *
 * A plataforma não envia projeto nem proposta e não coleta aceite: aqui só se
 * registra manualmente um fato que já aconteceu por fora (spec, seção 2).
 *
 * O histórico não é escrito aqui. O trigger
 * `opportunities_record_status_history` grava a transição na mesma transação
 * do UPDATE, então não existe status novo sem o evento correspondente.
 *
 * A comissão também não é calculada aqui: `opportunities.commission_value` é
 * uma coluna gerada pelo banco a partir do valor final e do percentual
 * preservado, e só quando o status é `closed`.
 */
async function applyStatusChange(
  payload: StatusChangePayload,
): Promise<ActionResult> {
  const supabase = await createClient();

  const update: Record<string, unknown> = { status: payload.status };

  if (payload.proposal_initial_value !== undefined) {
    update.proposal_initial_value = payload.proposal_initial_value;
  }
  if (payload.final_closed_value !== undefined) {
    update.final_closed_value = payload.final_closed_value;
  }
  if (payload.commission_percent !== undefined) {
    update.commission_percent = payload.commission_percent;
  }

  // O motivo pertence ao estado "perdida". Ao sair dele, o texto sai junto
  // para o registro não ficar com uma justificativa de perda contraditória.
  // O banco já faz o mesmo ao fechar um negócio.
  update.loss_reason =
    payload.status === "lost" ? (payload.loss_reason ?? null) : null;

  const { data, error } = await supabase
    .from("opportunities")
    .update(update)
    .eq("id", payload.id)
    .select("id, status");

  if (error) return { ok: false, message: translateDbError(error) };

  if (!data || data.length === 0) {
    return {
      ok: false,
      message:
        "Não foi possível movimentar: o projeto não existe mais ou você não tem permissão.",
    };
  }

  revalidate();

  return {
    ok: true,
    message: `Status atualizado para "${STATUS_LABELS[payload.status]}".`,
  };
}

/**
 * Movimentação vinda de um diálogo com campos (proposta recebida, fechamento,
 * perda e correção administrativa).
 */
export async function changeOpportunityStatusAction(
  _prevState: StatusFormState,
  formData: FormData,
): Promise<StatusFormState> {
  const sessionError = await requireAdmin();
  if (sessionError) return statusFailure(sessionError);

  const parsed = parseStatusChangeForm(formData);
  if (!parsed.ok) {
    return {
      status: "error",
      message: parsed.message ?? "Revise os campos destacados.",
      fieldErrors: parsed.fieldErrors,
      succeededAt: null,
      values: collectFormValues(formData),
      attemptedAt: Date.now(),
    };
  }

  const result = await applyStatusChange(parsed.payload);

  if (!result.ok) {
    return statusFailure(result.message, collectFormValues(formData));
  }

  return {
    status: "success",
    message: result.message,
    fieldErrors: {},
    succeededAt: Date.now(),
    values: null,
    attemptedAt: null,
  };
}

/** Movimentação de um clique só, para as transições que não pedem dados. */
export async function moveOpportunityStatusAction(
  id: string,
  status: OpportunityStatus,
): Promise<ActionResult> {
  const sessionError = await requireAdmin();
  if (sessionError) return { ok: false, message: sessionError };

  return applyStatusChange({ id, status });
}

// --------------------------------------------------------------------------
// Carregamento sob demanda
// --------------------------------------------------------------------------

/**
 * Histórico e anexos de um projeto.
 *
 * Carregados ao abrir o detalhe: a listagem não precisa desses dados e não
 * deve pagar por eles.
 */
export async function getOpportunityDetailsAction(
  opportunityId: string,
): Promise<OpportunityDetails> {
  const user = await getSessionUser();
  if (!user) {
    return {
      history: [],
      attachments: [],
      error: "Sua sessão expirou. Entre novamente para continuar.",
    };
  }

  const [history, attachments] = await Promise.all([
    listOpportunityHistory(opportunityId),
    listProposalAttachments(opportunityId),
  ]);

  return { history, attachments, error: null };
}

/** Projeto recarregado do banco, para atualizar o detalhe após uma ação. */
export async function getOpportunityAction(
  id: string,
): Promise<Opportunity | null> {
  const user = await getSessionUser();
  if (!user) return null;

  return getOpportunity(id);
}

/** Projetos de um profissional, exibidos na ficha dele — tela só do admin. */
export async function getProfessionalOpportunitiesAction(
  professionalId: string,
): Promise<Opportunity[]> {
  const authorization = await authorizeAdminAction();
  if (!authorization.ok) return [];

  return listOpportunitiesByProfessional(professionalId);
}

// --------------------------------------------------------------------------
// PDFs da proposta
// --------------------------------------------------------------------------

export type RegisterAttachmentInput = {
  opportunityId: string;
  storagePath: string;
  fileName: string;
  sizeBytes: number | null;
};

/**
 * Registra em `proposal_attachments` um PDF já enviado ao Storage.
 *
 * O upload do arquivo acontece no navegador, direto para o bucket, com a
 * sessão do próprio usuário — as policies `proposal_pdfs_*` continuam sendo a
 * autorização real. Passar o arquivo por uma Server Action esbarraria no
 * limite de 1 MB do corpo da requisição, pequeno demais para uma proposta.
 *
 * Se a gravação do metadado falhar, o objeto recém-enviado é removido para
 * não sobrar arquivo órfão no bucket.
 */
export async function registerProposalAttachmentAction(
  input: RegisterAttachmentInput,
): Promise<ActionResult> {
  const sessionError = await requireAdmin();
  if (sessionError) return { ok: false, message: sessionError };

  const parsed = parseAttachmentInput(input);
  if (!parsed.ok) return { ok: false, message: parsed.message };

  const { payload } = parsed;
  const supabase = await createClient();

  const opportunity = await getOpportunity(payload.opportunityId);
  if (!opportunity || !opportunity.store) {
    await discardObject(payload.storagePath);
    return { ok: false, message: "Projeto não encontrado. Recarregue a página." };
  }

  // Convenção de caminho do schema (seção 15):
  // proposal-pdfs/{STORE_UUID}/{OPPORTUNITY_UUID}/{ARQUIVO}.pdf
  // É ela que permite à policy da loja liberar só os PDFs das próprias
  // propostas, então um caminho fora do padrão não pode ser registrado.
  const expectedPrefix = `${opportunity.store.id}/${opportunity.id}/`;
  if (!payload.storagePath.startsWith(expectedPrefix)) {
    await discardObject(payload.storagePath);
    return {
      ok: false,
      message: "Caminho do arquivo fora do padrão. Tente enviar novamente.",
    };
  }

  const { error } = await supabase.from("proposal_attachments").insert({
    opportunity_id: payload.opportunityId,
    storage_path: payload.storagePath,
    file_name: payload.fileName,
    mime_type: "application/pdf",
    size_bytes: payload.sizeBytes,
  });

  if (error) {
    await discardObject(payload.storagePath);
    console.error("[projetos] falha ao registrar anexo", error);
    return {
      ok: false,
      message:
        error.code === "42501"
          ? "Você não tem permissão para anexar propostas."
          : "Não foi possível registrar o arquivo. Tente novamente.",
    };
  }

  revalidate();

  return { ok: true, message: "PDF anexado à proposta." };
}

/** Remove um objeto do bucket, ignorando falha — é só limpeza. */
async function discardObject(path: string) {
  try {
    const supabase = await createClient();
    await supabase.storage.from(BUCKET).remove([path]);
  } catch (error) {
    console.error("[projetos] falha ao descartar arquivo órfão", error);
  }
}

/**
 * Link temporário para abrir um PDF.
 *
 * O bucket é privado e continua privado: o link é assinado na hora, com a
 * sessão do usuário, e expira em minutos. Um usuário de loja só
 * consegue assinar arquivos das próprias propostas, porque a policy
 * `proposal_pdfs_store_select` é avaliada nesta chamada.
 */
export async function createAttachmentUrlAction(
  attachmentId: string,
  /**
   * `inline` devolve a URL sem `Content-Disposition: attachment`, que é o que
   * permite ao navegador renderizar o PDF na própria página. `download` força
   * o salvamento com o nome original.
   */
  mode: "inline" | "download" = "download",
): Promise<{ ok: boolean; url?: string; message?: string }> {
  const sessionError = await requireSession();
  if (sessionError) return { ok: false, message: sessionError };

  const supabase = await createClient();

  const { data: attachment, error: readError } = await supabase
    .from("proposal_attachments")
    .select("storage_path, file_name")
    .eq("id", attachmentId)
    .maybeSingle<{ storage_path: string; file_name: string }>();

  if (readError || !attachment) {
    return { ok: false, message: "Arquivo não encontrado." };
  }

  // A visualização vive mais que o clique de baixar: quem lê uma proposta na
  // tela passa dos 5 minutos, e o visualizador do navegador volta ao arquivo
  // conforme a pessoa navega pelas páginas.
  const expiresIn = mode === "inline" ? 900 : 300;

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(
      attachment.storage_path,
      expiresIn,
      mode === "download" ? { download: attachment.file_name } : undefined,
    );

  if (error || !data?.signedUrl) {
    console.error("[projetos] falha ao assinar URL", error);
    return {
      ok: false,
      message: "Não foi possível abrir o arquivo. Tente novamente.",
    };
  }

  return { ok: true, url: data.signedUrl };
}

/**
 * Remove um PDF anexado por engano.
 *
 * Apaga o metadado primeiro: se o objeto do bucket falhar depois, sobra um
 * arquivo inacessível, o que é bem melhor do que uma linha apontando para um
 * arquivo que não existe mais.
 */
export async function removeProposalAttachmentAction(
  attachmentId: string,
): Promise<ActionResult> {
  const sessionError = await requireAdmin();
  if (sessionError) return { ok: false, message: sessionError };

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("proposal_attachments")
    .delete()
    .eq("id", attachmentId)
    .select("storage_path");

  if (error) {
    return {
      ok: false,
      message:
        error.code === "42501"
          ? "Você não tem permissão para remover anexos."
          : "Não foi possível remover o arquivo. Tente novamente.",
    };
  }

  if (!data || data.length === 0) {
    return { ok: false, message: "Este arquivo não existe mais." };
  }

  await discardObject((data[0] as { storage_path: string }).storage_path);

  revalidate();

  return { ok: true, message: "PDF removido da proposta." };
}
