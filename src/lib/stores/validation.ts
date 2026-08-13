import {
  emptyToNull,
  parseCurrencyInput,
  parsePercentInput,
} from "./format";
import type { StoreFormField } from "./types";

/** Payload já normalizado, pronto para ir ao banco. */
export type StorePayload = {
  name: string;
  category: string | null;
  contact_name: string | null;
  phone: string | null;
  is_active: boolean;
  monthly_fixed_fee: number | null;
  default_commission_percent: number | null;
  start_date: string | null;
  notes: string | null;
};

type ValidationResult =
  | { ok: true; payload: StorePayload }
  | { ok: false; fieldErrors: Partial<Record<StoreFormField, string>> };

const MAX_NAME = 120;
const MAX_SHORT_TEXT = 120;
const MAX_NOTES = 2000;
/** Limite de `numeric(14,2)` menos as casas decimais. */
const MAX_MONTHLY_FEE = 999_999_999_999;

function read(formData: FormData, field: string): string {
  const value = formData.get(field);
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Converte o FormData do formulário de loja em um payload validado.
 *
 * As regras espelham os CHECKs de `public.stores`, para que o erro apareça
 * como mensagem de campo em vez de estourar no banco.
 */
export function parseStoreForm(formData: FormData): ValidationResult {
  const fieldErrors: Partial<Record<StoreFormField, string>> = {};

  const name = read(formData, "name");
  if (!name) {
    fieldErrors.name = "Informe o nome da loja.";
  } else if (name.length > MAX_NAME) {
    fieldErrors.name = `Máximo de ${MAX_NAME} caracteres.`;
  }

  const category = read(formData, "category");
  if (category.length > MAX_SHORT_TEXT) {
    fieldErrors.category = `Máximo de ${MAX_SHORT_TEXT} caracteres.`;
  }

  const contactName = read(formData, "contact_name");
  if (contactName.length > MAX_SHORT_TEXT) {
    fieldErrors.contact_name = `Máximo de ${MAX_SHORT_TEXT} caracteres.`;
  }

  const phone = read(formData, "phone");
  if (phone.length > MAX_SHORT_TEXT) {
    fieldErrors.phone = `Máximo de ${MAX_SHORT_TEXT} caracteres.`;
  }

  // Os inputs mascarados enviam o valor já numérico em um campo oculto,
  // mas a validação não confia nisso e reprocessa o texto recebido.
  const monthlyRaw = read(formData, "monthly_fixed_fee");
  const monthlyFixedFee = monthlyRaw.includes(",")
    ? parseCurrencyInput(monthlyRaw)
    : monthlyRaw
      ? Number(monthlyRaw)
      : null;

  if (monthlyRaw && monthlyFixedFee === null) {
    fieldErrors.monthly_fixed_fee = "Valor inválido.";
  } else if (monthlyFixedFee !== null) {
    if (!Number.isFinite(monthlyFixedFee) || monthlyFixedFee < 0) {
      fieldErrors.monthly_fixed_fee = "O valor não pode ser negativo.";
    } else if (monthlyFixedFee > MAX_MONTHLY_FEE) {
      fieldErrors.monthly_fixed_fee = "Valor acima do limite permitido.";
    }
  }

  const commissionRaw = read(formData, "default_commission_percent");
  const commission = commissionRaw.includes(",")
    ? parsePercentInput(commissionRaw)
    : commissionRaw
      ? Number(commissionRaw)
      : null;

  if (commissionRaw && commission === null) {
    fieldErrors.default_commission_percent = "Percentual inválido.";
  } else if (commission !== null) {
    if (!Number.isFinite(commission) || commission < 0 || commission > 100) {
      fieldErrors.default_commission_percent =
        "O percentual deve ficar entre 0 e 100.";
    }
  }

  const startDate = read(formData, "start_date");
  if (startDate && !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
    fieldErrors.start_date = "Data inválida.";
  } else if (startDate && Number.isNaN(Date.parse(startDate))) {
    fieldErrors.start_date = "Data inválida.";
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
      name,
      category: emptyToNull(category),
      contact_name: emptyToNull(contactName),
      phone: emptyToNull(phone),
      is_active: formData.get("is_active") !== "false",
      monthly_fixed_fee:
        monthlyFixedFee === null ? null : Math.round(monthlyFixedFee * 100) / 100,
      default_commission_percent:
        commission === null ? null : Math.round(commission * 100) / 100,
      start_date: emptyToNull(startDate),
      notes: emptyToNull(notes),
    },
  };
}
