/**
 * Formatação e normalização dos dados de profissional.
 *
 * Usado no servidor (listagem) e no cliente (máscaras), então não pode
 * depender de nada específico de um dos dois ambientes.
 */

export const MONTHS = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
] as const;

/** Unidades federativas, para o select de estado. */
export const BRAZILIAN_STATES = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS",
  "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC",
  "SP", "SE", "TO",
] as const;

/**
 * Cargos oferecidos desde sempre, sem ninguém precisar cadastrá-los.
 *
 * NÃO são um enum nem uma restrição: entram na lista junto com os cargos que o
 * admin criar, e qualquer outro valor é igualmente válido. Existem porque uma
 * lista vazia no primeiro uso obrigaria a criar "Sócio" à mão em toda conta
 * nova — e porque estes dois cobrem a maior parte dos cadastros.
 */
export const DEFAULT_JOB_ROLES = ["Sócio", "Equipe"] as const;

/**
 * Chave de comparação de uma opção de empresa ou cargo.
 *
 * É a MESMA normalização do índice único do banco — `lower(btrim(name))` — e
 * precisa continuar sendo. Se aqui dobrasse acento e no banco não, "Aliás" e
 * "Alias" seriam a mesma opção para a tela e duas para o banco, e o valor
 * gravado em um profissional poderia sumir do seletor dele.
 */
export function optionKey(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * Junta listas de opções, sem repetir e em ordem alfabética.
 *
 * A primeira grafia encontrada é a que fica: o catálogo vem antes dos padrões,
 * então uma empresa cadastrada como "Studio Forma" não é reescrita por causa
 * de um "studio forma" vindo de outra lista.
 */
export function mergeOptionNames(...lists: readonly string[][]): string[] {
  const byKey = new Map<string, string>();

  for (const list of lists) {
    for (const value of list) {
      const name = value.trim();
      if (!name) continue;

      const key = optionKey(name);
      if (!byKey.has(key)) byKey.set(key, name);
    }
  }

  return [...byKey.values()].sort((a, b) => a.localeCompare(b, "pt-BR"));
}

/** Normaliza texto opcional: string vazia e só-espaços viram null. */
export function emptyToNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

/**
 * Máscara de telefone brasileiro aplicada durante a digitação.
 * Limita a 11 dígitos: (11) 98765-4321 ou (11) 3456-7890.
 */
export function maskPhoneInput(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 11);
  if (!digits) return "";

  if (digits.length <= 2) return `(${digits}`;
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;

  const cut = digits.length <= 10 ? 6 : 7;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, cut)}-${digits.slice(cut)}`;
}

/** Máscara de CEP: 00000-000. */
export function maskPostalCodeInput(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 5) return digits;

  return `${digits.slice(0, 5)}-${digits.slice(5)}`;
}

/**
 * Número no formato aceito pelo wa.me, ou null quando não dá para montar
 * um link confiável.
 *
 * A base antiga tem telefones em formatos variados, inclusive links wa.me
 * já com DDI, então o DDI 55 só é acrescentado quando falta.
 */
export function toWhatsAppNumber(phone: string | null): string | null {
  if (!phone) return null;

  const digits = phone.replace(/\D/g, "");

  // Fixo com DDD (10) ou celular com DDD (11): falta o DDI.
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;

  // Já veio com DDI.
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith("55")) {
    return digits;
  }

  return null;
}

export function toWhatsAppUrl(phone: string | null): string | null {
  const number = toWhatsAppNumber(phone);
  return number ? `https://wa.me/${number}` : null;
}

/** Aceita @usuario, usuario, instagram.com/usuario ou a URL completa. */
export function toInstagramHandle(value: string | null): string | null {
  const trimmed = emptyToNull(value);
  if (!trimmed) return null;

  const handle = trimmed
    .replace(/^https?:\/\//i, "")
    .replace(/^(www\.)?instagram\.com\//i, "")
    .replace(/^@/, "")
    .replace(/[/?#].*$/, "")
    .trim();

  return handle || null;
}

export function toInstagramUrl(value: string | null): string | null {
  const handle = toInstagramHandle(value);
  return handle ? `https://instagram.com/${handle}` : null;
}

/** 13 e 8 → "13/08". Sem ano: o schema guarda só dia e mês. */
export function formatBirthday(
  day: number | null,
  month: number | null,
): string {
  if (day === null || month === null) return "—";

  return `${String(day).padStart(2, "0")}/${String(month).padStart(2, "0")}`;
}

/** 13 e 8 → "13 de agosto". Usado no detalhe, onde há espaço. */
export function formatBirthdayLong(
  day: number | null,
  month: number | null,
): string {
  if (day === null || month === null) return "—";

  return `${day} de ${MONTHS[month - 1].toLowerCase()}`;
}

/**
 * Timestamp do banco → "13/08/2026".
 *
 * Interpreta no fuso de São Paulo, conforme a seção 3.3 da especificação.
 */
export function formatTimestamp(value: string | null): string {
  if (!value) return "—";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "America/Sao_Paulo",
  }).format(date);
}

/** Igual ao anterior, com hora — para "última atualização". */
export function formatTimestampWithTime(value: string | null): string {
  if (!value) return "—";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  }).format(date);
}
