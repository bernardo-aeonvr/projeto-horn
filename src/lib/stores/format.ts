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

// --------------------------------------------------------------------------
// Responsáveis da loja
// --------------------------------------------------------------------------

/** Teto de responsáveis por loja. Não é regra de negócio — é sanidade de formulário. */
export const MAX_RESPONSIBLES = 20;

/** Nome e telefone de quem responde pela loja. Espelha `StoreResponsible`. */
type Responsible = { name: string; phone: string | null };

/**
 * Limpa uma lista de responsáveis: sem espaço nas pontas, sem quem ficou sem
 * nome e sem a mesma pessoa duas vezes.
 *
 * A comparação de duplicata é pelo NOME, ignorando caixa e espaços — "Leandro
 * Pereira" e " leandro pereira " são a mesma pessoa. O telefone não entra na
 * comparação de propósito: duas pessoas podem dividir o telefone da loja, e
 * isso não faz delas a mesma pessoa.
 *
 * Quando o mesmo nome aparece duas vezes, vence o PRIMEIRO registro inteiro —
 * a grafia e o telefone de quem foi digitado antes. O nome de alguém não é
 * reescrito para caber numa chave.
 *
 * Registro sem nome é descartado, com ou sem telefone: uma linha em branco no
 * formulário é alguém que desistiu de digitar, e um telefone sozinho não é um
 * responsável.
 */
export function normalizeResponsibles(
  values: readonly { name: string; phone?: string | null }[],
): Responsible[] {
  const byName = new Map<string, Responsible>();

  for (const value of values) {
    const name = (value.name ?? "").trim();
    if (!name) continue;

    const key = name.toLowerCase();
    if (byName.has(key)) continue;

    const phone = (value.phone ?? "").trim();
    byName.set(key, { name, phone: phone || null });
  }

  return [...byName.values()];
}

/**
 * Os responsáveis de uma loja, venha ela de onde vier.
 *
 * É o único lugar que conhece a coluna legada e o formato do jsonb. Três
 * situações, nesta ordem:
 *
 *   1. `responsibles` preenchido — o caso normal;
 *   2. lista vazia e `contact_name` preenchido — loja anterior a esta feature,
 *      ou gravada por fora da tela: o nome vira um responsável sem telefone;
 *   3. nada — lista vazia.
 *
 * A leitura do jsonb é defensiva de propósito. A coluna é `jsonb` e o CHECK do
 * banco só garante que é um array; se alguém gravar `["Leandro"]` ou um objeto
 * sem `name`, a tela ignora o que não entende em vez de quebrar a listagem
 * inteira de lojas.
 */
export function storeResponsibles(store: {
  responsibles?: unknown;
  contact_name?: string | null;
}): Responsible[] {
  const raw = Array.isArray(store.responsibles) ? store.responsibles : [];

  const parsed = raw.flatMap((item): { name: string; phone: string | null }[] => {
    if (typeof item === "string") return [{ name: item, phone: null }];
    if (!item || typeof item !== "object") return [];

    const record = item as Record<string, unknown>;
    const name = typeof record.name === "string" ? record.name : "";
    const phone = typeof record.phone === "string" ? record.phone : null;

    return [{ name, phone }];
  });

  const list = normalizeResponsibles(parsed);
  if (list.length > 0) return list;

  return normalizeResponsibles([{ name: store.contact_name ?? "", phone: null }]);
}
