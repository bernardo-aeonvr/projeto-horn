"use server";

import type { PostgrestError } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";

import { authorizeAdminAction } from "@/lib/auth/session";
import { collectFormValues, type SubmittedValues } from "@/lib/form-values";
import { createClient } from "@/lib/supabase/server";

import { DEFAULT_JOB_ROLES, optionKey } from "./format";
import { listProfessionalsForExport } from "./queries";
import {
  parseProfessionalOptionKind,
  type ProfessionalFilters,
  type ProfessionalFormState,
  type ProfessionalOptionKind,
} from "./types";
import { MAX_OPTION_NAME, parseProfessionalForm } from "./validation";

const PROFISSIONAIS_PATH = "/profissionais";
const DASHBOARD_PATH = "/dashboard";
const CONTATOS_PATH = "/contatos";
const PROJETOS_PATH = "/projetos-propostas";

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

/**
 * A carteira de profissionais é exclusiva da HORN.
 *
 * A tela já é bloqueada para loja, mas uma Server Action é um endpoint: sem
 * esta checagem, uma chamada direta contornaria a interface. A RLS recusa de
 * novo no banco.
 */
async function requireSession() {
  const authorization = await authorizeAdminAction();
  return authorization.ok ? null : authorization.message;
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
    p_company: payload.company,
    p_job_role: payload.job_role,
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
  });

  if (error) return failure(translateDbError(error));

  // Cadastrar um profissional não cria contato nem métrica de contato
  // (spec, seção 27, regra 3). A RPC toca apenas professionals e
  // professional_regions.
  revalidatePath(PROFISSIONAIS_PATH);
  // A carteira alimenta os totais e a distribuição do dashboard.
  revalidatePath(DASHBOARD_PATH);

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

export type DeleteProfessionalResult = { ok: boolean; message: string };

/**
 * Exclui um profissional da carteira.
 *
 * Para quem usa, é uma coisa só: o profissional some. Por baixo são dois
 * caminhos, e QUEM ESCOLHE É O BANCO.
 *
 * A tentativa é sempre o DELETE de verdade. As FKs de `contacts` e
 * `opportunities` são ON DELETE RESTRICT, então o Postgres recusa (23503)
 * exatamente quando existe histórico — e aí a exclusão vira `deleted_at`, que
 * tira o profissional de toda a operação e deixa a linha de pé para os
 * contatos e projetos continuarem resolvendo nome, empresa e segmento.
 *
 * A FK é a verificação de dependências, e é por isso que não existe uma
 * consulta "ele tem contatos?" aqui. Uma pergunta feita antes do DELETE
 * responderia sobre o passado: bastaria um contato ser registrado em outra aba
 * no meio do caminho para a resposta ficar velha e o apagamento levar o
 * histórico junto. A constraint responde no instante da gravação, e não tem
 * como estar desatualizada.
 *
 * Sem histórico, o registro sai da tabela mesmo — junto com as regiões dele,
 * por CASCADE. Nada em `professional_options` é tocado: a empresa e o cargo
 * são listas compartilhadas, e outros profissionais usam as mesmas opções.
 */
export async function deleteProfessionalAction(
  id: string,
): Promise<DeleteProfessionalResult> {
  const sessionError = await requireSession();
  if (sessionError) return { ok: false, message: sessionError };

  const supabase = await createClient();

  const removed = await supabase
    .from("professionals")
    .delete()
    .eq("id", id)
    .select("name");

  if (!removed.error) {
    if (!removed.data || removed.data.length === 0) {
      return {
        ok: false,
        message: "Não foi possível excluir: o profissional não existe mais.",
      };
    }

    return finishDelete(removed.data[0].name as string);
  }

  // 23503 é a única recusa que vira soft delete: significa "existe histórico
  // apontando para ele". Qualquer outro erro é erro mesmo.
  if (removed.error.code !== "23503") {
    return { ok: false, message: translateDbError(removed.error) };
  }

  const softDeleted = await supabase
    .from("professionals")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    // Reexcluir não reescreve a data: uma aba velha clicando de novo não muda
    // nada, e o histórico continua apontando para a exclusão original.
    .is("deleted_at", null)
    .select("name");

  if (softDeleted.error) {
    return { ok: false, message: translateDbError(softDeleted.error) };
  }

  if (!softDeleted.data || softDeleted.data.length === 0) {
    /*
      Nenhuma linha atualizada, mas o DELETE tinha chegado até a constraint —
      ou seja, o registro existe e a RLS deixa mexer nele. Só sobra uma
      explicação: ele já estava excluído. Não é erro; a tela só precisa
      recarregar para parar de mostrá-lo.
    */
    return finishDelete(null);
  }

  return finishDelete(softDeleted.data[0].name as string);
}

/** Revalida as rotas afetadas e devolve a confirmação da exclusão. */
function finishDelete(name: string | null): DeleteProfessionalResult {
  revalidatePath(PROFISSIONAIS_PATH);
  // A carteira alimenta os totais e a distribuição do dashboard.
  revalidatePath(DASHBOARD_PATH);
  // O seletor de profissional das duas telas deixa de oferecê-lo.
  revalidatePath(CONTATOS_PATH);
  revalidatePath(PROJETOS_PATH);

  return {
    ok: true,
    message: name
      ? `Profissional "${name}" excluído.`
      : "Este profissional já havia sido excluído.",
  };
}

// --------------------------------------------------------------------------
// Listas de empresa e cargo
// --------------------------------------------------------------------------

export type CreateProfessionalOptionResult =
  | { ok: true; name: string; created: boolean }
  | { ok: false; message: string };

/**
 * Cadastra uma empresa ou um cargo na lista do admin da sessão.
 *
 * DUPLICATA NÃO VIRA ERRO
 *
 * Quem digita "aliás arquitetura" onde já existe "Aliás Arquitetura" não errou
 * — quis a mesma empresa. Então a resposta é a opção que já existe, com a
 * grafia que já estava gravada, e o formulário segue com ela selecionada. É
 * também o que impede a lista de encher de variações da mesma coisa.
 *
 * A comparação é a mesma do índice único do banco (`optionKey`), e o banco
 * continua sendo quem decide: duas abas criando o mesmo nome ao mesmo tempo
 * passam pela verificação daqui e colidem lá, e o 23505 é tratado como o que é
 * — a opção existe, siga com ela.
 *
 * A grafia de quem cadastrou primeiro é preservada. Esta função nunca renomeia
 * uma opção existente.
 */
export async function createProfessionalOptionAction(
  kind: ProfessionalOptionKind,
  rawName: string,
): Promise<CreateProfessionalOptionResult> {
  const sessionError = await requireSession();
  if (sessionError) return { ok: false, message: sessionError };

  const optionKind = parseProfessionalOptionKind(kind);
  if (!optionKind) {
    return { ok: false, message: "Lista inválida. Recarregue a página." };
  }

  const name = typeof rawName === "string" ? rawName.trim() : "";
  if (!name) {
    return { ok: false, message: "Informe um nome." };
  }
  if (name.length > MAX_OPTION_NAME) {
    return { ok: false, message: `Máximo de ${MAX_OPTION_NAME} caracteres.` };
  }

  const supabase = await createClient();

  // A lista cabe num seletor, então ela vem inteira e a comparação acontece
  // aqui — com a mesma normalização usada para exibi-la, sem risco de a tela
  // achar equivalente o que o banco acha diferente.
  const existing = await supabase
    .from("professional_options")
    .select("name")
    .eq("kind", optionKind);

  if (existing.error) {
    return { ok: false, message: translateDbError(existing.error) };
  }

  const known = (existing.data ?? []).map((row) => row.name as string);
  // Os cargos padrão são oferecidos sem estar no banco: sem esta linha,
  // cadastrar "Sócio" criaria uma segunda opção idêntica à que já aparece.
  if (optionKind === "job_role") known.push(...DEFAULT_JOB_ROLES);

  const match = known.find((value) => optionKey(value) === optionKey(name));
  if (match) return { ok: true, name: match, created: false };

  const inserted = await supabase
    .from("professional_options")
    .insert({ kind: optionKind, name })
    .select("name")
    .single();

  if (inserted.error) {
    // 23505: outra aba criou o mesmo nome no meio do caminho. Não é erro para
    // quem está na tela — o valor que ele queria existe.
    if (inserted.error.code === "23505") {
      return { ok: true, name, created: false };
    }
    return { ok: false, message: translateDbError(inserted.error) };
  }

  // Para que a opção nova apareça nos outros formulários da sessão, e não só
  // no que a criou.
  revalidatePath(PROFISSIONAIS_PATH);

  return { ok: true, name: inserted.data.name as string, created: true };
}

// --------------------------------------------------------------------------
// Exportação
// --------------------------------------------------------------------------

export type ProfessionalExportPayload = {
  professionals: Awaited<
    ReturnType<typeof listProfessionalsForExport>
  >["professionals"];
  truncated: boolean;
  error: string | null;
};

/**
 * A carteira filtrada inteira, para a planilha.
 *
 * A tela pagina de 25 em 25; a exportação precisa do conjunto todo, e é aqui
 * que ele é montado — no servidor, com a sessão de quem pediu. O navegador
 * recebe as linhas prontas e só desenha o arquivo.
 *
 * `authorizeAdminAction` é o mesmo portão da página (que já é admin-only), e a
 * RLS decide de novo no banco: exportar não alcança um profissional que a
 * listagem não alcançaria.
 */
export async function exportProfessionalsAction(
  filters: ProfessionalFilters,
): Promise<ProfessionalExportPayload> {
  const authorization = await authorizeAdminAction();
  if (!authorization.ok) {
    return { professionals: [], truncated: false, error: authorization.message };
  }

  const result = await listProfessionalsForExport(filters);

  return {
    professionals: result.professionals,
    truncated: result.truncated,
    error: result.error,
  };
}
