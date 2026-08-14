import type { PeriodPreset } from "./types";

/**
 * Recortes de período no fuso de São Paulo (spec, seção 3.3).
 *
 * O Brasil aboliu o horário de verão em 2019, então São Paulo é UTC-3 o ano
 * inteiro. Montar as fronteiras como `AAAA-MM-DDTHH:MM:SS-03:00` deixa o
 * instante exato e dispensa biblioteca de fuso.
 */
const SP_OFFSET = "-03:00";
const SP_TIME_ZONE = "America/Sao_Paulo";

/** Data de hoje em São Paulo, no formato AAAA-MM-DD. */
export function todayInSaoPaulo(): string {
  // en-CA formata como AAAA-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: SP_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** Data e hora atuais em São Paulo, no formato aceito por datetime-local. */
export function nowForDateTimeInput(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: SP_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";

  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

/** Soma dias a uma data AAAA-MM-DD, sem envolver fuso. */
export function addDays(isoDate: string, days: number): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);

  return date.toISOString().slice(0, 10);
}

/** Índice do dia da semana com segunda-feira = 0. */
function weekdayIndex(isoDate: string): number {
  const [year, month, day] = isoDate.split("-").map(Number);
  const sundayBased = new Date(Date.UTC(year, month - 1, day)).getUTCDay();

  return (sundayBased + 6) % 7;
}

/** Instante do começo do dia em São Paulo. */
function startOfDay(isoDate: string): string {
  return `${isoDate}T00:00:00${SP_OFFSET}`;
}

export type PeriodRange = {
  /** Inclusivo. Null significa sem limite inferior. */
  from: string | null;
  /** Exclusivo. Null significa sem limite superior. */
  to: string | null;
};

/**
 * Converte o preset escolhido em um intervalo de timestamps.
 * `to` é sempre exclusivo, para não depender de milissegundos na borda.
 */
export function resolvePeriod(
  preset: PeriodPreset,
  customFrom: string,
  customTo: string,
): PeriodRange {
  const today = todayInSaoPaulo();

  switch (preset) {
    case "hoje":
      return { from: startOfDay(today), to: startOfDay(addDays(today, 1)) };

    case "semana": {
      const monday = addDays(today, -weekdayIndex(today));
      return { from: startOfDay(monday), to: startOfDay(addDays(monday, 7)) };
    }

    case "mes": {
      const firstDay = `${today.slice(0, 7)}-01`;
      const nextMonth = addDays(`${today.slice(0, 7)}-28`, 7).slice(0, 7);
      return { from: startOfDay(firstDay), to: startOfDay(`${nextMonth}-01`) };
    }

    case "personalizado":
      return {
        from: customFrom ? startOfDay(customFrom) : null,
        // O dia final entra inteiro: soma um dia e mantém o limite exclusivo.
        to: customTo ? startOfDay(addDays(customTo, 1)) : null,
      };

    default:
      return { from: null, to: null };
  }
}

/**
 * `AAAA-MM-DDTHH:MM` do input → timestamp com o fuso de São Paulo.
 * Devolve null quando o valor não tem o formato esperado.
 */
export function dateTimeInputToTimestamp(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;

  const timestamp = `${value}:00${SP_OFFSET}`;
  return Number.isNaN(Date.parse(timestamp)) ? null : timestamp;
}

/** Timestamp do banco → `AAAA-MM-DDTHH:MM` para preencher o input na edição. */
export function timestampToDateTimeInput(value: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: SP_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(value));

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";

  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

/** Timestamp do banco → "13/08/2026, 15:42" no fuso de São Paulo. */
export function formatContactedAt(value: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: SP_TIME_ZONE,
  }).format(new Date(value));
}

/** Timestamp do banco → "13/08/2026". */
export function formatContactedDate(value: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: SP_TIME_ZONE,
  }).format(new Date(value));
}
