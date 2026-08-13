/**
 * Formatação e parsing dos valores de loja no padrão brasileiro.
 *
 * Usado no servidor (listagem) e no cliente (máscaras de input), então não
 * pode depender de nada específico de um dos dois ambientes.
 */

const CURRENCY = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Sem o símbolo — usado dentro do input, que já tem o prefixo "R$". */
const DECIMAL = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * O PostgREST pode devolver `numeric` como número ou como string,
 * dependendo da precisão. Normaliza os dois casos.
 */
export function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** 1600 → "R$ 1.600,00". Null vira travessão. */
export function formatCurrency(value: number | null): string {
  return value === null ? "—" : CURRENCY.format(value);
}

/** 1600 → "1.600,00" (para o valor exibido dentro do input). */
export function formatDecimal(value: number): string {
  return DECIMAL.format(value);
}

/** 3 → "3%"; 3.5 → "3,5%". Não mostra casas decimais quando são zero. */
export function formatPercent(value: number | null): string {
  if (value === null) return "—";

  const text = Number.isInteger(value)
    ? String(value)
    : String(value).replace(".", ",");

  return `${text}%`;
}

/**
 * "2026-08-13" → "13/08/2026".
 *
 * Faz o split manual de propósito: `new Date("2026-08-13")` é interpretado
 * como UTC e, no fuso de São Paulo, voltaria o dia anterior.
 */
export function formatDate(value: string | null): string {
  if (!value) return "—";

  const [year, month, day] = value.slice(0, 10).split("-");
  if (!year || !month || !day) return "—";

  return `${day}/${month}/${year}`;
}

/**
 * Aplica a máscara de moeda enquanto o usuário digita.
 * Considera os dígitos como centavos: "1600" → "16,00"; "160000" → "1.600,00".
 */
export function maskCurrencyInput(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 13);
  if (!digits) return "";

  return DECIMAL.format(Number(digits) / 100);
}

/** "1.600,00" → 1600. Devolve null quando não há valor. */
export function parseCurrencyInput(raw: string): number | null {
  const digits = raw.replace(/\D/g, "");
  if (!digits) return null;

  return Number(digits) / 100;
}

/**
 * Máscara do percentual: aceita vírgula ou ponto, no máximo duas casas,
 * e limita a 100 para respeitar o CHECK `stores_commission_range`.
 */
export function maskPercentInput(raw: string): string {
  let cleaned = raw.replace(/[^\d.,]/g, "").replace(/\./g, ",");

  // Mantém apenas o primeiro separador decimal.
  const firstComma = cleaned.indexOf(",");
  if (firstComma !== -1) {
    cleaned =
      cleaned.slice(0, firstComma + 1) +
      cleaned.slice(firstComma + 1).replace(/,/g, "");
  }

  const [whole = "", decimals] = cleaned.split(",");
  const limitedWhole = whole.slice(0, 3);
  const result =
    decimals === undefined
      ? limitedWhole
      : `${limitedWhole},${decimals.slice(0, 2)}`;

  const numeric = parsePercentInput(result);
  if (numeric !== null && numeric > 100) return "100";

  return result;
}

/** "3,5" → 3.5. Devolve null quando não há valor. */
export function parsePercentInput(raw: string): number | null {
  const normalized = raw.replace(/\./g, "").replace(",", ".").trim();
  if (!normalized) return null;

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Normaliza texto opcional: string vazia e só-espaços viram null. */
export function emptyToNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}
