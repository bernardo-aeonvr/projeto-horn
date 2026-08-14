import { dateTimeInputToTimestamp } from "./period";
import {
  CONTACT_CHANNELS,
  type ContactChannel,
  type ContactFormField,
} from "./types";

export type ContactPayload = {
  professionalId: string;
  contactedAt: string;
  channel: ContactChannel;
  storeIds: string[];
  notes: string | null;
};

type ValidationResult =
  | { ok: true; payload: ContactPayload }
  | { ok: false; fieldErrors: Partial<Record<ContactFormField, string>> };

const MAX_NOTES = 2000;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function read(formData: FormData, field: string): string {
  const value = formData.get(field);
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Converte o FormData do formulário de contato em payload validado.
 *
 * Pelo menos uma loja é exigida: um contato existe justamente para registrar
 * que a marca de alguma loja foi apresentada (spec, seção 8.2). A própria
 * função register_contact rejeita lista vazia.
 */
export function parseContactForm(formData: FormData): ValidationResult {
  const fieldErrors: Partial<Record<ContactFormField, string>> = {};

  const professionalId = read(formData, "professional_id");
  if (!professionalId) {
    fieldErrors.professional_id = "Selecione o profissional.";
  } else if (!UUID_PATTERN.test(professionalId)) {
    fieldErrors.professional_id = "Profissional inválido.";
  }

  const contactedAtRaw = read(formData, "contacted_at");
  const contactedAt = dateTimeInputToTimestamp(contactedAtRaw);
  if (!contactedAtRaw) {
    fieldErrors.contacted_at = "Informe a data e a hora do contato.";
  } else if (!contactedAt) {
    fieldErrors.contacted_at = "Data ou hora inválida.";
  } else if (Date.parse(contactedAt) > Date.now() + 60_000) {
    fieldErrors.contacted_at = "O contato não pode estar no futuro.";
  }

  const channel = read(formData, "channel");
  if (!channel) {
    fieldErrors.channel = "Selecione o canal utilizado.";
  } else if (!CONTACT_CHANNELS.includes(channel as ContactChannel)) {
    fieldErrors.channel = "Canal inválido.";
  }

  const storeIds = [...new Set(formData.getAll("store_ids") as string[])]
    .map((value) => value.trim())
    .filter(Boolean);

  if (storeIds.length === 0) {
    fieldErrors.store_ids = "Selecione ao menos uma loja apresentada.";
  } else if (storeIds.some((id) => !UUID_PATTERN.test(id))) {
    fieldErrors.store_ids = "Loja inválida.";
  }

  const notes = read(formData, "notes");
  if (notes.length > MAX_NOTES) {
    fieldErrors.notes = `Máximo de ${MAX_NOTES} caracteres.`;
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { ok: false, fieldErrors };
  }

  return {
    ok: true,
    payload: {
      professionalId,
      contactedAt: contactedAt as string,
      channel: channel as ContactChannel,
      storeIds,
      notes: notes || null,
    },
  };
}
