import { emptyToNull } from "./format";
import type { ProfessionalFormField } from "./types";

/** Payload de `professionals`, já normalizado. */
export type ProfessionalPayload = {
  name: string;
  segment_id: string;
  email: string | null;
  instagram: string | null;
  phone: string | null;
  address: string | null;
  postal_code: string | null;
  city: string | null;
  state: string | null;
  birthday_day: number | null;
  birthday_month: number | null;
  notes: string | null;
  is_active: boolean;
};

type ValidationResult =
  | { ok: true; payload: ProfessionalPayload; regionIds: string[] }
  | { ok: false; fieldErrors: Partial<Record<ProfessionalFormField, string>> };

const MAX_NAME = 160;
const MAX_SHORT_TEXT = 160;
const MAX_NOTES = 2000;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Dias por mês, para não aceitar 31/02. Ano bissexto é ignorado de propósito. */
const DAYS_IN_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

function read(formData: FormData, field: string): string {
  const value = formData.get(field);
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Converte o FormData do formulário de profissional em payload validado.
 *
 * Só nome e segmento são obrigatórios (spec, seção 17.1). A base real tem
 * muitos registros incompletos, então nada além disso pode barrar o cadastro.
 */
export function parseProfessionalForm(formData: FormData): ValidationResult {
  const fieldErrors: Partial<Record<ProfessionalFormField, string>> = {};

  const name = read(formData, "name");
  if (!name) {
    fieldErrors.name = "Informe o nome do profissional.";
  } else if (name.length > MAX_NAME) {
    fieldErrors.name = `Máximo de ${MAX_NAME} caracteres.`;
  }

  const segmentId = read(formData, "segment_id");
  if (!segmentId) {
    fieldErrors.segment_id = "Selecione o segmento.";
  } else if (!UUID_PATTERN.test(segmentId)) {
    fieldErrors.segment_id = "Segmento inválido.";
  }

  // Validação deliberadamente leve: e-mail só precisa parecer um e-mail.
  const email = read(formData, "email");
  if (email && !EMAIL_PATTERN.test(email)) {
    fieldErrors.email = "E-mail inválido.";
  } else if (email.length > MAX_SHORT_TEXT) {
    fieldErrors.email = `Máximo de ${MAX_SHORT_TEXT} caracteres.`;
  }

  // Telefone não é validado por formato: a base tem padrões variados.
  const phone = read(formData, "phone");
  if (phone.length > MAX_SHORT_TEXT) {
    fieldErrors.phone = `Máximo de ${MAX_SHORT_TEXT} caracteres.`;
  }

  const instagram = read(formData, "instagram");
  if (instagram.length > MAX_SHORT_TEXT) {
    fieldErrors.instagram = `Máximo de ${MAX_SHORT_TEXT} caracteres.`;
  }

  const address = read(formData, "address");
  if (address.length > MAX_SHORT_TEXT * 2) {
    fieldErrors.address = "Endereço muito longo.";
  }

  const postalCode = read(formData, "postal_code");
  if (postalCode && !/^\d{5}-?\d{3}$/.test(postalCode)) {
    fieldErrors.postal_code = "CEP inválido. Use 00000-000.";
  }

  const city = read(formData, "city");
  if (city.length > MAX_SHORT_TEXT) {
    fieldErrors.city = `Máximo de ${MAX_SHORT_TEXT} caracteres.`;
  }

  const state = read(formData, "state");
  if (state && !/^[A-Z]{2}$/.test(state)) {
    fieldErrors.state = "Estado inválido.";
  }

  // O CHECK `professionals_birthday_pair` exige dia e mês juntos ou nenhum.
  const dayRaw = read(formData, "birthday_day");
  const monthRaw = read(formData, "birthday_month");
  let birthdayDay: number | null = null;
  let birthdayMonth: number | null = null;

  if (dayRaw || monthRaw) {
    if (!dayRaw || !monthRaw) {
      fieldErrors.birthday = "Informe o dia e o mês, ou deixe os dois em branco.";
    } else {
      birthdayDay = Number(dayRaw);
      birthdayMonth = Number(monthRaw);

      const validMonth =
        Number.isInteger(birthdayMonth) &&
        birthdayMonth >= 1 &&
        birthdayMonth <= 12;
      const validDay = Number.isInteger(birthdayDay) && birthdayDay >= 1;

      if (!validMonth || !validDay) {
        fieldErrors.birthday = "Data de aniversário inválida.";
      } else if (birthdayDay > DAYS_IN_MONTH[birthdayMonth - 1]) {
        fieldErrors.birthday = "Este mês não tem esse dia.";
      }
    }
  }

  const notes = read(formData, "notes");
  if (notes.length > MAX_NOTES) {
    fieldErrors.notes = `Máximo de ${MAX_NOTES} caracteres.`;
  }

  const regionIds = [...new Set(formData.getAll("region_ids") as string[])]
    .map((value) => value.trim())
    .filter(Boolean);

  if (regionIds.some((id) => !UUID_PATTERN.test(id))) {
    fieldErrors.regions = "Região inválida.";
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { ok: false, fieldErrors };
  }

  return {
    ok: true,
    regionIds,
    payload: {
      name,
      segment_id: segmentId,
      email: emptyToNull(email)?.toLowerCase() ?? null,
      instagram: emptyToNull(instagram),
      phone: emptyToNull(phone),
      address: emptyToNull(address),
      postal_code: emptyToNull(postalCode),
      city: emptyToNull(city),
      state: emptyToNull(state),
      birthday_day: birthdayDay,
      birthday_month: birthdayMonth,
      notes: emptyToNull(notes),
      is_active: formData.get("is_active") !== "false",
    },
  };
}
