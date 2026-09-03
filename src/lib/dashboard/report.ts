import { formatContactedDate } from "@/lib/contacts/period";
import { CHANNEL_LABELS, type ContactChannel } from "@/lib/contacts/types";
import {
  STATUS_BADGE_LABELS,
  type OpportunityStatusCounts,
} from "@/lib/opportunities/types";
import { formatCurrency } from "@/lib/stores/format";
import type { SheetCell } from "@/lib/xlsx/sheet";

import {
  PERIOD_LABELS,
  resolveBucket,
  type DashboardPeriod,
  type PeriodRange,
} from "./period";
import type {
  AdminDashboardData,
  ContactedProfessional,
  StoreDashboardData,
  StoreResult,
  TrendPoint,
} from "./types";

/**
 * O dashboard descrito como relatório.
 *
 * Uma camada só, entre a tela e o PDF, e ela não calcula nada: recebe os
 * mesmos objetos que os componentes renderizam e devolve texto já formatado
 * pelos mesmos utilitários (`formatCurrency`, `formatContactedDate`,
 * `STATUS_BADGE_LABELS`, `CHANNEL_LABELS`). O gerador de PDF, por
 * consequência, não tem como discordar da tela: ele nunca vê um número, só a
 * string que a tela também mostraria.
 *
 * E nada aqui consulta o banco, de propósito. Os dados chegam prontos do
 * servidor, já recortados por período, por loja e pela RLS do usuário — o
 * relatório é uma segunda leitura do MESMO payload, não uma segunda consulta.
 * Um usuário de loja não consegue exportar o que a tela dele não recebeu,
 * porque não existe caminho daqui até o banco.
 */

/**
 * Uma célula do relatório.
 *
 * É a célula de planilha compartilhada (`@/lib/xlsx/sheet`): `text` é o que a
 * tela mostra e o PDF imprime, `value` é o dado cru. As duas saem do mesmo
 * lugar, na mesma linha de código, então não têm como discordar — e onde a
 * tela escreve "—" para o vazio, o valor continua sendo 0, porque o traço é
 * convenção de leitura e uma coluna de moeda com traço no meio não soma.
 *
 * Hoje só o PDF lê estas células, e ele lê apenas `text`: o dashboard deixou
 * de exportar Excel quando cada módulo operacional passou a exportar o próprio
 * (Profissionais, Contatos, Projetos & Propostas). O `value` ficou porque o
 * tipo é o mesmo daquelas planilhas e porque montar a célula com as duas caras
 * juntas é o que impede que elas divirjam — não porque haja um Excel aqui.
 */
export type ReportCell = SheetCell;

export type ReportKpi = { label: string; hint: string; cell: ReportCell };
export type ReportRow = { label: string; cell: ReportCell };

export type ReportTable = {
  title: string;
  head: string[];
  /** Índices das colunas numéricas — alinhadas à direita no PDF. */
  numeric: number[];
  rows: ReportCell[][];
  emptyMessage: string;
  note?: string;
};

export type ReportChart = {
  title: string;
  note: string;
  bucket: "day" | "month";
  points: TrendPoint[];
  series: { key: TrendSeriesKey; label: string; color: string }[];
};

type TrendSeriesKey = Exclude<keyof TrendPoint, "bucket_start">;

export type DashboardReport = {
  /** Sem extensão: cada formato pendura a sua. */
  fileBaseName: string;
  /** "Relatório de Performance" — o mesmo nos dois perfis. */
  title: string;
  /** Linhas do cabeçalho: período, loja e geração. */
  context: ReportRow[];
  kpis: ReportKpi[];
  funnel: ReportRow[];
  funnelNote: string;
  chart: ReportChart | null;
  portfolio: ReportRow[];
  distributions: ReportTable[];
  ranking: ReportTable;
  tables: ReportTable[];
};

const REPORT_TITLE = "Relatório de Performance";

const integer = (value: number) => value.toLocaleString("pt-BR");

const text = (value: string): ReportCell => ({ kind: "text", text: value });

const count = (value: number): ReportCell => ({
  kind: "number",
  text: integer(value),
  value,
});

/** Moeda. O traço da tela vira 0 na planilha, sem deixar de ser traço no PDF. */
const money = (value: number): ReportCell => ({
  kind: "currency",
  text: value > 0 ? formatCurrency(value) : "—",
  value,
});

const share = (part: number, total: number): ReportCell =>
  total > 0
    ? {
        kind: "percent",
        text: `${Math.round((part / total) * 100)}%`,
        value: part / total,
      }
    : text("—");

/**
 * Data de contato, para as duas saídas.
 *
 * O valor é construído a partir do TEXTO já formatado em São Paulo, e não do
 * instante cru: o Excel serializa datas pelos componentes UTC, então
 * `2026-08-01T02:00:00Z` — 31/07 em São Paulo — apareceria na planilha como
 * 01/08 e brigaria com a data que a tela mostra. Montando de volta a partir do
 * dia formatado, célula e tela dizem o mesmo dia sempre.
 */
const day = (iso: string): ReportCell => {
  const formatted = formatContactedDate(iso);
  const [d, m, y] = formatted.split("/").map(Number);

  return {
    kind: "date",
    text: formatted,
    value: new Date(Date.UTC(y, m - 1, d)),
  };
};

/**
 * As mesmas três séries do gráfico da tela, com as mesmas cores.
 *
 * O PDF desenha SEMPRE as três. Esconder uma linha é uma lupa momentânea para
 * ler outra — estado de leitura, não recorte de negócio —, e um relatório
 * levado para uma reunião não pode depender de qual linha estava desligada na
 * hora do clique. Período e loja, esses sim mandam nos dados, e chegam aqui
 * já aplicados.
 */
const TREND_SERIES: ReportChart["series"] = [
  {
    key: "professionals_contacted",
    label: "Profissionais contatados",
    color: "#cd9738",
  },
  { key: "projects_received", label: "Projetos recebidos", color: "#7b858f" },
  { key: "deals_closed", label: "Negócios fechados", color: "#059669" },
];

/** Os seis status do resumo do funil, na ordem da tela. */
const FUNNEL_STATUSES = [
  "project_received",
  "waiting_store_proposal",
  "proposal_sent_to_professional",
  "negotiating",
  "closed",
  "lost",
] as const;

const FUNNEL_NOTE =
  "Situação de hoje dos projetos que entraram no período. “Proposta recebida” não tem card, então a soma pode ficar abaixo de “Projetos recebidos”.";

/**
 * A mesma régua de "teve atividade" da tabela Resultados por loja.
 *
 * Exportada e usada pelos dois lados para que tela e relatório não possam
 * divergir sobre quais lojas entram na lista.
 */
export function hasStoreActivity(row: StoreResult): boolean {
  return (
    row.professionals_reached > 0 ||
    row.projects_received > 0 ||
    row.proposals_sent > 0 ||
    row.deals_closed > 0
  );
}

/**
 * Momento da geração: texto para o PDF, data de verdade no `value`.
 * Mesma conversão de fuso do `day` acima, e pelo mesmo motivo.
 */
function generatedCell(now: Date): ReportCell {
  const formatted = formatGeneratedAt(now);
  const [date, time] = formatted.split(", ");
  const [d, m, y] = date.split("/").map(Number);
  const [hour, minute] = (time ?? "00:00").split(":").map(Number);

  return {
    kind: "datetime",
    text: formatted,
    value: new Date(Date.UTC(y, m - 1, d, hour, minute)),
  };
}

/** "13/08/2026, 15:42", no fuso de São Paulo como o resto do produto. */
function formatGeneratedAt(now: Date): string {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  }).format(now);
}

/**
 * Nome de arquivo legível e seguro.
 *
 * Os acentos são decompostos e removidos e o resto vira hífen: um nome de loja
 * com "ç", espaço ou barra não pode virar um arquivo impossível de salvar.
 */
function slugify(value: string): string {
  return value
    .normalize("NFD")
    // Faixa das marcas combinantes: o que sobra do "ç" depois do NFD.
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** "2026-08" para um mês fechado; senão as duas pontas do intervalo. */
function periodSlug(range: PeriodRange): string {
  const from = range.from.slice(0, 10);

  // `to` é exclusivo: o último dia do recorte é o anterior a ele. O meio-dia
  // evita que o fuso empurre a data para o dia errado.
  const end = new Date(`${range.to.slice(0, 10)}T12:00:00Z`);
  end.setUTCDate(end.getUTCDate() - 1);
  const to = end.toISOString().slice(0, 10);

  const wholeMonth = from.slice(0, 7) === to.slice(0, 7) && from.endsWith("-01");

  return wholeMonth ? from.slice(0, 7) : `${from}-a-${to}`;
}

function fileBaseName(range: PeriodRange, storeName: string | null): string {
  const scope = storeName ? `-${slugify(storeName)}` : "";
  return `horn-dashboard${scope}-${periodSlug(range)}`;
}

/**
 * "Este mês (agosto de 2026)": o preset diz o que foi escolhido, o rótulo do
 * recorte diz em que datas isso deu.
 */
function periodLabel(period: DashboardPeriod, range: PeriodRange): string {
  return `${PERIOD_LABELS[period]} (${range.label})`;
}

/**
 * A linha "Canal" do cabeçalho, só quando há canal escolhido.
 *
 * Com "Todos" ela não aparece: um relatório sem restrição de canal não precisa
 * dizer isso, e o cabeçalho fica com as três linhas de sempre. Com um canal
 * escolhido, ela é obrigatória — sem ela o leitor veria "Profissionais
 * contatados: 4" sem saber que são só os do WhatsApp.
 */
function channelContext(channel: ContactChannel | ""): ReportRow[] {
  if (!channel) return [];

  return [{ label: "Canal", cell: text(CHANNEL_LABELS[channel]) }];
}

function distributionTable(
  title: string,
  items: { label: string; active_count: number }[],
  emptyMessage: string,
  note?: string,
): ReportTable {
  const total = items.reduce((sum, item) => sum + item.active_count, 0);

  return {
    title,
    head: ["Categoria", "Profissionais", "Participação"],
    numeric: [1, 2],
    rows: items.map((item) => [
      text(item.label),
      count(item.active_count),
      share(item.active_count, total),
    ]),
    emptyMessage,
    note,
  };
}

function rankingTable(
  items: { professional_id: string; name: string; projects: number }[],
): ReportTable {
  return {
    title: "Top 5 profissionais",
    head: ["#", "Profissional", "Projetos"],
    numeric: [2],
    rows: items.map((item, index) => [
      count(index + 1),
      text(item.name),
      count(item.projects),
    ]),
    emptyMessage: "Nenhum projeto registrado neste período.",
    note: "Quem mais gerou projeto no período. Cada projeto conta uma vez, esteja em que status estiver hoje.",
  };
}

/**
 * A lista de contatados, para os dois perfis.
 *
 * Uma definição só de colunas e formato; o que muda é a coluna "Lojas", que o
 * relatório da loja não recebe — quantas marcas havia no mesmo contato é dado
 * das concorrentes dela.
 */
function contactedTable(
  rows: ContactedProfessional[],
  error: string | null,
  withStores: boolean,
): ReportTable {
  const head = [
    "Profissional",
    "Segmento",
    "Último contato",
    "Canal",
    "Contatos",
  ];

  return {
    title: "Profissionais contatados no período",
    head: withStores ? [...head, "Lojas"] : head,
    numeric: withStores ? [4, 5] : [4],
    rows: rows.map((row) => {
      const cells = [
        text(row.name),
        text(row.segment_name ?? "—"),
        day(row.last_contact_at),
        text(CHANNEL_LABELS[row.last_channel]),
        count(row.contacts),
      ];

      return withStores ? [...cells, count(row.stores_presented ?? 0)] : cells;
    }),
    emptyMessage: error ?? "Nenhum profissional contatado neste período.",
    note: "Lista completa do período, uma linha por profissional — não a página aberta na tela.",
  };
}

function funnelRows(counts: OpportunityStatusCounts): ReportRow[] {
  return FUNNEL_STATUSES.map((status) => ({
    label: STATUS_BADGE_LABELS[status],
    cell: count(counts[status]),
  }));
}

/** Relatório do Dashboard HORN (admin). */
export function buildAdminReport(
  data: AdminDashboardData,
  range: PeriodRange,
  period: DashboardPeriod,
  storeId: string,
  channel: ContactChannel | "",
  now = new Date(),
): DashboardReport {
  const { metrics, portfolio } = data;
  const store = data.stores.find((option) => option.id === storeId) ?? null;

  /*
    A mesma seleção da tela: com uma loja filtrada, a composição da carteira
    inteira não diz nada sobre ela, e o que entra é quem aquela marca alcançou.
    Sem filtro, entram a carteira e a distribuição dela.
  */
  const distributions = store
    ? [
        distributionTable(
          `Segmentos alcançados por ${store.name}`,
          data.reachSegments,
          "Esta loja ainda não foi apresentada a nenhum profissional neste período.",
          "Profissionais distintos que receberam esta marca em um contato do período.",
        ),
        distributionTable(
          "Regiões alcançadas",
          data.reachRegions,
          "Sem alcance registrado neste período.",
          "Um profissional pode atuar em mais de uma região, então a soma passa do total de alcançados.",
        ),
      ]
    : [
        distributionTable(
          "Profissionais por segmento",
          data.segments,
          "Nenhum profissional cadastrado ainda.",
          "Composição da carteira.",
        ),
        distributionTable(
          "Profissionais por região",
          data.regions,
          "Nenhuma região atribuída ainda.",
          "Um profissional pode atuar em várias regiões, então a soma passa do total da carteira.",
        ),
      ];

  const storeRows = (
    storeId
      ? data.storeResults.filter((row) => row.store_id === storeId)
      : data.storeResults
  ).filter(hasStoreActivity);

  return {
    fileBaseName: fileBaseName(range, store?.name ?? null),
    title: REPORT_TITLE,
    context: [
      { label: "Período", cell: text(periodLabel(period, range)) },
      { label: "Loja", cell: text(store ? store.name : "Todas as lojas") },
      ...channelContext(channel),
      { label: "Gerado em", cell: generatedCell(now) },
    ],
    kpis: [
      {
        label: "Profissionais contatados",
        cell: count(metrics.professionals_contacted),
        hint: "pessoas distintas no período",
      },
      {
        label: "Projetos recebidos",
        cell: count(metrics.projects_received),
        hint: "demandas que entraram",
      },
      {
        label: "Propostas enviadas",
        cell: count(metrics.proposals_sent),
        hint: "encaminhadas ao profissional",
      },
      {
        label: "Negócios fechados",
        cell: count(metrics.proposals_closed),
        hint: "aceites registrados",
      },
      {
        label: "Negócios perdidos",
        cell: count(metrics.proposals_lost),
        hint: "recusas registradas",
      },
      {
        label: "Valor total de fechamentos",
        cell: money(metrics.total_closed_value),
        hint: "volume de venda dos negócios fechados",
      },
      {
        label: "Comissão gerada",
        cell: money(metrics.total_commission_value),
        hint: "receita da HORN nos negócios fechados",
      },
    ],
    funnel: funnelRows(data.statusCounts),
    funnelNote: FUNNEL_NOTE,
    chart: {
      title: "Evolução no período",
      note: "Cada ponto usa a data do próprio acontecimento: o contato, a criação do projeto e o fechamento.",
      bucket: resolveBucket(range),
      points: data.trend,
      series: TREND_SERIES,
    },
    /*
      A carteira descreve o cadastro hoje e não reage ao período. Com uma loja
      filtrada ela sai do relatório, como sai da tela.
    */
    portfolio: store
      ? []
      : [
          {
            // Profissional não tem mais status: o número é a carteira inteira.
            label: "Profissionais",
            cell: text(`${integer(portfolio.professionals_total)} cadastrados`),
          },
          {
            label: "Lojas ativas",
            cell: text(
              `${integer(portfolio.stores_active)} de ${integer(portfolio.stores_total)} cadastradas`,
            ),
          },
        ],
    distributions,
    ranking: rankingTable(data.topProfessionals),
    tables: [
      contactedTable(
        data.contactedProfessionals,
        data.contactedProfessionalsError,
        true,
      ),
      {
        title: "Resultados por loja",
        head: [
          "Loja",
          "Alcançados",
          "Projetos",
          "Propostas",
          "Fechados",
          "Valor fechado",
          "Comissão",
        ],
        numeric: [1, 2, 3, 4, 5, 6],
        rows: storeRows.map((row) => [
          text(row.is_active ? row.store_name : `${row.store_name} (inativa)`),
          count(row.professionals_reached),
          count(row.projects_received),
          count(row.proposals_sent),
          count(row.deals_closed),
          money(row.total_closed_value),
          money(row.total_commission_value),
        ]),
        emptyMessage: "Nenhuma loja teve atividade neste período.",
        note: "Todas as lojas com atividade no período — não a página aberta na tela.",
      },
    ],
  };
}

/**
 * Relatório do Dashboard da Loja.
 *
 * Sai do `StoreDashboardData` e de mais nada: o que não chega àquela tela não
 * existe aqui. Sem carteira e sem comparativo entre lojas — as duas coisas que
 * a loja não vê no dashboard dela.
 *
 * Todo o resto é desta loja e só dela, inclusive o alcance: desde a migration
 * 0012 os contatados são os das conversas em que esta marca foi apresentada.
 */
export function buildStoreReport(
  data: StoreDashboardData,
  range: PeriodRange,
  period: DashboardPeriod,
  channel: ContactChannel | "",
  now = new Date(),
): DashboardReport {
  const { metrics } = data;

  return {
    fileBaseName: fileBaseName(range, data.storeName),
    title: REPORT_TITLE,
    context: [
      { label: "Período", cell: text(periodLabel(period, range)) },
      { label: "Loja", cell: text(data.storeName ?? "—") },
      ...channelContext(channel),
      { label: "Gerado em", cell: generatedCell(now) },
    ],
    kpis: [
      {
        label: "Profissionais contatados",
        cell: count(metrics.professionals_contacted),
        hint: "pessoas distintas a quem sua loja foi apresentada",
      },
      {
        label: "Projetos recebidos",
        cell: count(metrics.projects_received),
        hint: "demandas encaminhadas à sua loja",
      },
      {
        label: "Propostas enviadas",
        cell: count(metrics.proposals_sent),
        hint: "levadas ao profissional",
      },
      {
        label: "Negócios fechados",
        cell: count(metrics.proposals_closed),
        hint: "aceites registrados",
      },
      {
        label: "Negócios perdidos",
        cell: count(metrics.proposals_lost),
        hint: "recusas registradas",
      },
      {
        label: "Valor total de fechamentos",
        cell: money(metrics.total_closed_value),
        hint: "volume de venda dos negócios fechados",
      },
      {
        label: "Comissão HORN",
        cell: money(metrics.total_commission_value),
        hint: "sobre os negócios fechados no período",
      },
    ],
    funnel: funnelRows(data.statusCounts),
    funnelNote: FUNNEL_NOTE,
    // O dashboard da loja não tem gráfico de evolução; o relatório não inventa
    // um a partir de dados que aquela tela não recebe.
    chart: null,
    portfolio: [],
    distributions: [
      distributionTable(
        "Segmentos alcançados",
        data.segments,
        "Nenhum profissional alcançado neste período.",
        "Profissionais a quem sua loja foi apresentada no período, por área de atuação.",
      ),
      distributionTable(
        "Regiões alcançadas",
        data.regions,
        "Nenhuma região alcançada neste período.",
        "Um profissional pode atuar em mais de uma região, então a soma passa do total de alcançados.",
      ),
    ],
    ranking: rankingTable(data.topProfessionals),
    tables: [
      contactedTable(
        data.contactedProfessionals,
        data.contactedProfessionalsError,
        // Sem a coluna "Lojas": ver quantas marcas dividiram a conversa é
        // informação das concorrentes desta loja.
        false,
      ),
    ],
  };
}
