import { parseCurrencyInput, parsePercentInput } from "@/lib/stores/format";

import {
  OPPORTUNITY_STATUSES,
  type OpportunityFormField,
  type OpportunityStatus,
  type StatusFormField,
} from "./types";

const MAX_TITLE = 160;
const MAX_NOTES = 2000;
const MAX_LOSS_REASON = 1000;
/** Limite de `numeric(14,2)` menos as casas decimais. */
const MAX_VALUE = 999_999_999_999;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function read(formData: FormData, field: string): string {
  const value = formData.get(field);
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Relê o número enviado pelos campos com máscara.
 *
 * `CurrencyField` e `PercentField` mandam o valor já normalizado num input
 * oculto, mas a validação não confia nisso e reprocessa o texto recebido —
 * a action é um endpoint público como qualquer outro.
 */
function readNumber(
  formData: FormData,
  field: string,
  kind: "currency" | "percent",
): { present: boolean; raw: string; value: number | null } {
  const present = formData.has(field);
  const raw = read(formData, field);

  if (!raw) return { present, raw, value: null };

  const value = raw.includes(",")
    ? kind === "currency"
      ? parseCurrencyInput(raw)
      : parsePercentInput(raw)
    : Number(raw);

  return { present, raw, value: Number.isFinite(value) ? value : null };
}

/** Arredonda para as duas casas de `numeric(14,2)`. */
function toCents(value: number): number {
  return Math.round(value * 100) / 100;
}

export type OpportunityPayload = {
  professional_id: string;
  store_id: string;
  title: string | null;
  notes: string | null;
  /**
   * Presentes apenas na edição. Ausentes no cadastro para que o trigger
   * `prepare_opportunity` faça o snapshot do percentual da loja sem
   * interferência da aplicação.
   */
  proposal_initial_value?: number | null;
  commission_percent?: number | null;
};

type OpportunityResult =
  | { ok: true; payload: OpportunityPayload }
  | { ok: false; fieldErrors: Partial<Record<OpportunityFormField, string>> };

/**
 * Valida o formulário de projeto.
 *
 * As regras espelham os CHECKs de `public.opportunities`, para que o erro
 * apareça como mensagem de campo em vez de estourar no banco.
 *
 * Valor inicial e percentual só entram no payload quando o formulário os
 * enviou: o cadastro não os exibe, e omiti-los evita apagar o que o banco
 * preservou.
 */
export function parseOpportunityForm(formData: FormData): OpportunityResult {
  const fieldErrors: Partial<Record<OpportunityFormField, string>> = {};

  const professionalId = read(formData, "professional_id");
  if (!professionalId) {
    fieldErrors.professional_id = "Selecione o profissional.";
  } else if (!UUID_PATTERN.test(professionalId)) {
    fieldErrors.professional_id = "Profissional inválido.";
  }

  const storeId = read(formData, "store_id");
  if (!storeId) {
    fieldErrors.store_id = "Selecione a loja.";
  } else if (!UUID_PATTERN.test(storeId)) {
    fieldErrors.store_id = "Loja inválida.";
  }

  const title = read(formData, "title");
  if (title.length > MAX_TITLE) {
    fieldErrors.title = `Máximo de ${MAX_TITLE} caracteres.`;
  }

  const notes = read(formData, "notes");
  if (notes.length > MAX_NOTES) {
    fieldErrors.notes = `Máximo de ${MAX_NOTES} caracteres.`;
  }

  const initial = readNumber(formData, "proposal_initial_value", "currency");
  if (initial.raw && initial.value === null) {
    fieldErrors.proposal_initial_value = "Valor inválido.";
  } else if (initial.value !== null) {
    if (initial.value < 0) {
      fieldErrors.proposal_initial_value = "O valor não pode ser negativo.";
    } else if (initial.value > MAX_VALUE) {
      fieldErrors.proposal_initial_value = "Valor acima do limite permitido.";
    }
  }

  const percent = readNumber(formData, "commission_percent", "percent");
  if (percent.raw && percent.value === null) {
    fieldErrors.commission_percent = "Percentual inválido.";
  } else if (
    percent.value !== null &&
    (percent.value < 0 || percent.value > 100)
  ) {
    fieldErrors.commission_percent = "O percentual deve ficar entre 0 e 100.";
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { ok: false, fieldErrors };
  }

  const payload: OpportunityPayload = {
    professional_id: professionalId,
    store_id: storeId,
    title: title || null,
    notes: notes || null,
  };

  if (initial.present) {
    payload.proposal_initial_value =
      initial.value === null ? null : toCents(initial.value);
  }
  if (percent.present) {
    payload.commission_percent =
      percent.value === null ? null : toCents(percent.value);
  }

  return { ok: true, payload };
}

export type StatusChangePayload = {
  id: string;
  status: OpportunityStatus;
  /** Só presente quando a transição registra o valor devolvido pela loja. */
  proposal_initial_value?: number | null;
  final_closed_value?: number | null;
  commission_percent?: number | null;
  loss_reason?: string | null;
};

type StatusResult =
  | { ok: true; payload: StatusChangePayload }
  | {
      ok: false;
      message?: string;
      fieldErrors: Partial<Record<StatusFormField, string>>;
    };

/**
 * Valida a movimentação de status.
 *
 * Cada transição pede apenas o que faz sentido para ela:
 * proposta recebida aceita o valor inicial, o fechamento exige valor final e
 * percentual, e a perda aceita um motivo livre (spec, seção 17.3).
 */
export function parseStatusChangeForm(formData: FormData): StatusResult {
  const fieldErrors: Partial<Record<StatusFormField, string>> = {};

  const id = read(formData, "id");
  if (!id || !UUID_PATTERN.test(id)) {
    return {
      ok: false,
      message: "Projeto não identificado. Recarregue a página.",
      fieldErrors: {},
    };
  }

  const status = read(formData, "status");
  if (!OPPORTUNITY_STATUSES.includes(status as OpportunityStatus)) {
    return {
      ok: false,
      fieldErrors: { status: "Selecione um status válido." },
    };
  }

  const target = status as OpportunityStatus;
  const payload: StatusChangePayload = { id, status: target };

  if (target === "proposal_received") {
    const initial = readNumber(formData, "proposal_initial_value", "currency");

    if (initial.raw && initial.value === null) {
      fieldErrors.proposal_initial_value = "Valor inválido.";
    } else if (initial.value !== null) {
      if (initial.value < 0) {
        fieldErrors.proposal_initial_value = "O valor não pode ser negativo.";
      } else if (initial.value > MAX_VALUE) {
        fieldErrors.proposal_initial_value = "Valor acima do limite permitido.";
      }
    }

    // O valor pode ainda não ter vindo junto com a proposta; quando vier, é
    // gravado sem tocar em nada que já exista.
    if (initial.present && initial.value !== null) {
      payload.proposal_initial_value = toCents(initial.value);
    }
  }

  if (target === "closed") {
    const final = readNumber(formData, "final_closed_value", "currency");

    if (!final.raw) {
      fieldErrors.final_closed_value = "Informe o valor final fechado.";
    } else if (final.value === null) {
      fieldErrors.final_closed_value = "Valor inválido.";
    } else if (final.value < 0) {
      fieldErrors.final_closed_value = "O valor não pode ser negativo.";
    } else if (final.value > MAX_VALUE) {
      fieldErrors.final_closed_value = "Valor acima do limite permitido.";
    } else {
      payload.final_closed_value = toCents(final.value);
    }

    const percent = readNumber(formData, "commission_percent", "percent");

    if (!percent.raw) {
      fieldErrors.commission_percent =
        "Informe o percentual de comissão deste negócio.";
    } else if (percent.value === null) {
      fieldErrors.commission_percent = "Percentual inválido.";
    } else if (percent.value < 0 || percent.value > 100) {
      fieldErrors.commission_percent = "O percentual deve ficar entre 0 e 100.";
    } else {
      payload.commission_percent = toCents(percent.value);
    }
  }

  if (target === "lost") {
    const reason = read(formData, "loss_reason");

    if (reason.length > MAX_LOSS_REASON) {
      fieldErrors.loss_reason = `Máximo de ${MAX_LOSS_REASON} caracteres.`;
    } else {
      payload.loss_reason = reason || null;
    }
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { ok: false, fieldErrors };
  }

  return { ok: true, payload };
}

const MAX_FILE_NAME = 200;
/**
 * Teto do arquivo aceito. O MVP guarda PDFs de proposta, não projeto de
 * arquitetura: CAD, Revit, SketchUp e documentação pesada ficam de fora
 * (spec, seção 13.1).
 */
export const MAX_PDF_BYTES = 10 * 1024 * 1024;

export type AttachmentInput = {
  opportunityId: string;
  storagePath: string;
  fileName: string;
  sizeBytes: number | null;
};

export function parseAttachmentInput(
  input: AttachmentInput,
): { ok: true; payload: AttachmentInput } | { ok: false; message: string } {
  if (!UUID_PATTERN.test(input.opportunityId)) {
    return { ok: false, message: "Projeto não identificado." };
  }

  const path = input.storagePath.trim();
  if (!path || !path.toLowerCase().endsWith(".pdf")) {
    return { ok: false, message: "Caminho de arquivo inválido." };
  }

  const fileName = input.fileName.trim().slice(0, MAX_FILE_NAME);
  if (!fileName) {
    return { ok: false, message: "Nome de arquivo inválido." };
  }

  if (input.sizeBytes !== null && input.sizeBytes > MAX_PDF_BYTES) {
    return { ok: false, message: "O arquivo passa do limite de 10 MB." };
  }

  return {
    ok: true,
    payload: {
      opportunityId: input.opportunityId,
      storagePath: path,
      fileName,
      sizeBytes:
        input.sizeBytes !== null && input.sizeBytes >= 0
          ? Math.trunc(input.sizeBytes)
          : null,
    },
  };
}

/**
 * Deixa o nome do arquivo seguro para virar chave no Storage.
 *
 * A chave do objeto é usada em URL, então acentos, espaços e barras saem.
 * O nome original continua legível em `proposal_attachments.file_name`.
 */
/** Marcas de acento separadas pela normalização NFD (U+0300 a U+036F). */
const COMBINING_MARKS = new RegExp("[\\u0300-\\u036f]", "g");

export function toStorageFileName(fileName: string): string {
  const base = fileName
    .replace(/\.pdf$/i, "")
    // NFD separa a letra do acento; sem remover as marcas antes, cada acento
    // viraria um hífen no passo seguinte ("revisão" → "revisa-o").
    .normalize("NFD")
    .replace(COMBINING_MARKS, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);

  return base || "proposta";
}
