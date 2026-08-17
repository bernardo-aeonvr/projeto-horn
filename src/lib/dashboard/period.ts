import { addDays, todayInSaoPaulo } from "@/lib/contacts/period";

/**
 * Recortes de período do dashboard.
 *
 * Reaproveita os utilitários de fuso de Contatos: São Paulo é UTC-3 o ano
 * inteiro desde o fim do horário de verão, então montar a fronteira como
 * `AAAA-MM-DDT00:00:00-03:00` já fixa o instante certo. É isso que evita o bug
 * de um contato às 23:00 aparecer no dia seguinte.
 *
 * Os limites seguem a convenção das funções do banco: `from` inclusivo,
 * `to` exclusivo.
 */
const SP_OFFSET = "-03:00";

export const PERIOD_PRESETS = [
  "semana",
  "mes",
  "mes-anterior",
  "trimestre",
  "semestre",
  "ano",
  "personalizado",
] as const;

export type DashboardPeriod = (typeof PERIOD_PRESETS)[number];

export const PERIOD_LABELS: Record<DashboardPeriod, string> = {
  semana: "Esta semana",
  mes: "Este mês",
  "mes-anterior": "Mês anterior",
  trimestre: "Este trimestre",
  semestre: "Este semestre",
  ano: "Este ano",
  personalizado: "Período personalizado",
};

export function parsePeriod(value: string | undefined): DashboardPeriod {
  return PERIOD_PRESETS.includes(value as DashboardPeriod)
    ? (value as DashboardPeriod)
    : "mes";
}

function startOfDay(isoDate: string): string {
  return `${isoDate}T00:00:00${SP_OFFSET}`;
}

/** Soma meses a um `AAAA-MM`, atravessando a virada de ano. */
function shiftMonth(yearMonth: string, delta: number): string {
  const [year, month] = yearMonth.split("-").map(Number);
  const total = year * 12 + (month - 1) + delta;

  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`;
}

/** Índice do dia da semana com segunda-feira = 0. */
function weekdayIndex(isoDate: string): number {
  const [year, month, day] = isoDate.split("-").map(Number);
  return (new Date(Date.UTC(year, month - 1, day)).getUTCDay() + 6) % 7;
}

export type PeriodRange = {
  /** Inclusivo, no formato aceito por timestamptz. */
  from: string;
  /** Exclusivo. */
  to: string;
  /** Rótulo legível do recorte, exibido junto aos KPIs. */
  label: string;
};

/**
 * Converte o preset em um intervalo concreto.
 *
 * Diferente dos filtros de listagem, o dashboard sempre tem um intervalo: um
 * KPI de atividade sem recorte temporal não significa nada. Um personalizado
 * incompleto cai para o mês corrente.
 */
export function resolvePeriod(
  preset: DashboardPeriod,
  customFrom: string,
  customTo: string,
): PeriodRange {
  const today = todayInSaoPaulo();
  const currentMonth = today.slice(0, 7);
  const [year, month] = currentMonth.split("-").map(Number);

  const monthRange = (yearMonth: string, months: number): PeriodRange => ({
    from: startOfDay(`${yearMonth}-01`),
    to: startOfDay(`${shiftMonth(yearMonth, months)}-01`),
    label: describeRange(`${yearMonth}-01`, shiftMonth(yearMonth, months)),
  });

  switch (preset) {
    case "semana": {
      const monday = addDays(today, -weekdayIndex(today));
      const nextMonday = addDays(monday, 7);
      return {
        from: startOfDay(monday),
        to: startOfDay(nextMonday),
        label: `${formatDay(monday)} a ${formatDay(addDays(nextMonday, -1))}`,
      };
    }

    case "mes-anterior":
      return monthRange(shiftMonth(currentMonth, -1), 1);

    case "trimestre": {
      // Trimestre civil: o mês inicial é sempre 1, 4, 7 ou 10.
      const firstMonth = Math.floor((month - 1) / 3) * 3 + 1;
      return monthRange(`${year}-${String(firstMonth).padStart(2, "0")}`, 3);
    }

    case "semestre": {
      const firstMonth = month <= 6 ? 1 : 7;
      return monthRange(`${year}-${String(firstMonth).padStart(2, "0")}`, 6);
    }

    case "ano":
      return monthRange(`${year}-01`, 12);

    case "personalizado": {
      // Um intervalo pela metade não é utilizável; volta para o mês corrente.
      if (!customFrom || !customTo) return monthRange(currentMonth, 1);

      // Datas invertidas são corrigidas em vez de devolver período vazio.
      const [start, end] =
        customFrom <= customTo ? [customFrom, customTo] : [customTo, customFrom];

      return {
        from: startOfDay(start),
        // O dia final entra inteiro: soma um dia mantendo o limite exclusivo.
        to: startOfDay(addDays(end, 1)),
        label: `${formatDay(start)} a ${formatDay(end)}`,
      };
    }

    default:
      return monthRange(currentMonth, 1);
  }
}

const MONTH_NAMES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

function formatDay(isoDate: string): string {
  const [year, month, day] = isoDate.split("-");
  return `${day}/${month}/${year}`;
}

/** "agosto de 2026" para um mês inteiro; senão a faixa de datas. */
function describeRange(fromDate: string, exclusiveEndMonth: string): string {
  const [year, month] = fromDate.split("-").map(Number);
  const lastDay = addDays(`${exclusiveEndMonth}-01`, -1);

  const spansOneMonth = fromDate.slice(0, 7) === lastDay.slice(0, 7);
  if (spansOneMonth) return `${MONTH_NAMES[month - 1]} de ${year}`;

  return `${formatDay(fromDate)} a ${formatDay(lastDay)}`;
}

/**
 * Granularidade do gráfico de evolução.
 *
 * Até dois meses o corte diário ainda é legível; acima disso vira ruído e o
 * agrupamento passa a ser mensal.
 */
export function resolveBucket(range: PeriodRange): "day" | "month" {
  const days =
    (Date.parse(range.to) - Date.parse(range.from)) / (1000 * 60 * 60 * 24);

  return days <= 62 ? "day" : "month";
}

/** Rótulo curto de cada ponto do gráfico. */
export function formatBucketLabel(
  value: string,
  bucket: "day" | "month",
): string {
  const date = new Date(value);

  return bucket === "day"
    ? new Intl.DateTimeFormat("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        timeZone: "America/Sao_Paulo",
      }).format(date)
    : new Intl.DateTimeFormat("pt-BR", {
        month: "short",
        year: "2-digit",
        timeZone: "America/Sao_Paulo",
      }).format(date);
}
