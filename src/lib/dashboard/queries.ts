import type { PostgrestError } from "@supabase/supabase-js";

import type { ContactChannel } from "@/lib/contacts/types";
import {
  listStoreProfessionalOptions,
  summarizeOpportunitiesInRange,
} from "@/lib/opportunities/queries";
import { EMPTY_STATUS_COUNTS } from "@/lib/opportunities/types";
import { listProfessionalNames } from "@/lib/professionals/queries";
import { toNumber } from "@/lib/stores/format";
import { createClient } from "@/lib/supabase/server";

import { resolveBucket, type PeriodRange } from "./period";
import { buildTopProfessionals, rankingCandidates } from "./ranking";
import {
  EMPTY_METRICS,
  type ActivityMetrics,
  type AdminDashboardData,
  type ContactedProfessional,
  type DistributionSlice,
  type PortfolioTotals,
  type StoreDashboardData,
  type StoreOption,
  type StoreResult,
  type TrendPoint,
} from "./types";

/**
 * As funções de dashboard vivem no banco.
 *
 * O PostgREST não faz COUNT(DISTINCT), GROUP BY nem série temporal, e baixar
 * todos os contatos e transições do período para agregar no servidor não
 * escalaria. Cada bloco desta tela é uma chamada agregada, não uma varredura.
 */

const MISSING_FUNCTION =
  "As funções de dashboard ainda não foram criadas no banco. " +
  "Aplique supabase/migrations/0002_dashboard_metrics.sql no SQL Editor do Supabase.";

/** A lista de contatados é a única parte da tela que veio depois da 0002. */
const MISSING_CONTACTED_FUNCTION =
  "A lista de contatados ainda não foi criada no banco. " +
  "Aplique supabase/migrations/0010_contacted_professionals.sql no SQL Editor do Supabase.";

function translate(error: PostgrestError, scope: string): string {
  // PGRST202 = função não encontrada na API.
  if (error.code === "PGRST202") {
    return scope === "contatados" ? MISSING_CONTACTED_FUNCTION : MISSING_FUNCTION;
  }

  if (error.message?.includes("Not authorized")) {
    return "Você não tem permissão para ver estes indicadores.";
  }

  console.error(`[dashboard] falha em ${scope}`, error);
  return "Não foi possível carregar os indicadores. Verifique a conexão e tente novamente.";
}

/** `numeric` volta como string do PostgREST; `bigint` também. */
function count(value: unknown): number {
  return toNumber(value) ?? 0;
}

type MetricsRow = Record<keyof ActivityMetrics, number | string | null>;

function toMetrics(row: MetricsRow | undefined): ActivityMetrics {
  if (!row) return EMPTY_METRICS;

  return {
    professionals_contacted: count(row.professionals_contacted),
    contact_events: count(row.contact_events),
    projects_received: count(row.projects_received),
    proposals_received: count(row.proposals_received),
    proposals_sent: count(row.proposals_sent),
    proposals_closed: count(row.proposals_closed),
    proposals_lost: count(row.proposals_lost),
    total_proposed_value: count(row.total_proposed_value),
    total_closed_value: count(row.total_closed_value),
    total_commission_value: count(row.total_commission_value),
    professionals_with_projects: count(row.professionals_with_projects),
  };
}

const EMPTY_PORTFOLIO: PortfolioTotals = {
  professionals_total: 0,
  professionals_active: 0,
  professionals_inactive: 0,
  professionals_without_region: 0,
  professionals_never_contacted: 0,
  stores_total: 0,
  stores_active: 0,
  stores_without_projects: 0,
};

type DistributionRow = {
  segment_name?: string;
  region_name?: string;
  active_count: number | string;
  total_count: number | string;
};

function toDistribution(rows: DistributionRow[] | null): DistributionSlice[] {
  return (rows ?? []).map((row) => ({
    label: row.segment_name ?? row.region_name ?? "—",
    active_count: count(row.active_count),
    total_count: count(row.total_count),
  }));
}

type ContactedRow = {
  professional_id: string;
  professional_name: string;
  segment_name: string | null;
  is_active: boolean;
  last_contact_at: string;
  last_channel: ContactChannel;
  contacts: number | string;
  stores_presented: number | string;
};

/**
 * A ordem vem do banco (último contato desc, nome) e é preservada: refazer a
 * ordenação aqui abriria espaço para as duas divergirem.
 */
function toContactedProfessionals(
  rows: ContactedRow[] | null,
): ContactedProfessional[] {
  return (rows ?? []).map((row) => ({
    professional_id: row.professional_id,
    name: row.professional_name,
    segment_name: row.segment_name,
    is_active: row.is_active,
    last_contact_at: row.last_contact_at,
    last_channel: row.last_channel,
    contacts: count(row.contacts),
    stores_presented: count(row.stores_presented),
  }));
}

/**
 * Carrega o Dashboard HORN inteiro.
 *
 * Tudo em paralelo, cada bloco já agregado no banco. As chamadas que dependem
 * do período recebem o mesmo recorte; as da carteira não recebem nenhum,
 * porque descrevem o estado atual da base.
 */
export async function loadAdminDashboard(
  range: PeriodRange,
  storeId: string,
  channel: ContactChannel | "",
): Promise<AdminDashboardData> {
  const supabase = await createClient();
  const scoped = storeId || null;
  /*
    Canal vazio = "Todos", e vai ao banco como null: nenhuma função recebe
    "todos" como se fosse um valor do enum. Ele só entra nas chamadas que leem
    contato — as de projeto e de carteira nem têm o parâmetro.
  */
  const byChannel = channel || null;

  const [
    portfolioResponse,
    metricsResponse,
    segmentsResponse,
    regionsResponse,
    storeResultsResponse,
    trendResponse,
    storesResponse,
    breakdownResponse,
    projectSummary,
    contactedResponse,
  ] = await Promise.all([
    supabase.rpc("get_admin_portfolio_totals"),
    supabase.rpc("get_admin_dashboard_metrics", {
      p_from: range.from,
      p_to: range.to,
      p_store_id: scoped,
      p_channel: byChannel,
    }),
    supabase.rpc("get_admin_professionals_by_segment"),
    supabase.rpc("get_admin_professionals_by_region"),
    supabase.rpc("get_admin_store_results", {
      p_from: range.from,
      p_to: range.to,
      // Só a coluna "Alcançados" desta tabela nasce de contato; o canal
      // estreita ela, e os números de projeto e dinheiro seguem inteiros.
      p_channel: byChannel,
    }),
    supabase.rpc("get_admin_activity_timeseries", {
      p_from: range.from,
      p_to: range.to,
      p_bucket: resolveBucket(range),
      p_store_id: scoped,
      // Dentro da função o canal toca só a série de contatados; projetos
      // recebidos e negócios fechados não mudam.
      p_channel: byChannel,
    }),
    supabase
      .from("stores")
      .select("id, name, is_active")
      .order("name", { ascending: true }),
    // Só faz sentido com uma loja escolhida; sem filtro, a chamada é pulada.
    scoped
      ? supabase.rpc("get_store_reach_breakdown", {
          p_store_id: scoped,
          p_from: range.from,
          p_to: range.to,
          p_channel: byChannel,
        })
      : Promise.resolve({ data: [], error: null }),
    /*
      Mesmo recorte do KPI "Projetos recebidos", em uma varredura só: os cards
      de status e o ranking de profissionais saem do mesmo conjunto de
      projetos, então não podem discordar dele nem um do outro.
    */
    summarizeOpportunitiesInRange(range, scoped),
    /*
      O KPI "Profissionais contatados" aberto nome a nome. Mesmo recorte da
      CTE `reach` de get_admin_dashboard_metrics — inclusive o filtro de loja,
      que aqui também é "esta marca foi apresentada neste contato".
    */
    supabase.rpc("get_admin_contacted_professionals", {
      p_from: range.from,
      p_to: range.to,
      p_store_id: scoped,
      p_channel: byChannel,
    }),
  ]);

  // Basta uma falhar para a tela ficar enganosa, então o erro é único.
  const failure =
    portfolioResponse.error ??
    metricsResponse.error ??
    segmentsResponse.error ??
    regionsResponse.error ??
    storeResultsResponse.error ??
    trendResponse.error ??
    breakdownResponse.error;

  if (!failure && projectSummary.error) {
    return {
      portfolio: EMPTY_PORTFOLIO,
      metrics: EMPTY_METRICS,
      statusCounts: EMPTY_STATUS_COUNTS,
      topProfessionals: [],
      segments: [],
      regions: [],
      reachSegments: [],
      reachRegions: [],
      contactedProfessionals: [],
      contactedProfessionalsError: null,
      storeResults: [],
      trend: [],
      stores: (storesResponse.data as StoreOption[]) ?? [],
      error: projectSummary.error,
    };
  }

  if (failure) {
    return {
      portfolio: EMPTY_PORTFOLIO,
      metrics: EMPTY_METRICS,
      statusCounts: EMPTY_STATUS_COUNTS,
      topProfessionals: [],
      segments: [],
      regions: [],
      reachSegments: [],
      reachRegions: [],
      contactedProfessionals: [],
      contactedProfessionalsError: null,
      storeResults: [],
      trend: [],
      stores: (storesResponse.data as StoreOption[]) ?? [],
      error: translate(failure, "admin"),
    };
  }

  /*
    O nome só é buscado depois da contagem, e só de quem disputa as cinco
    vagas: uma consulta a mais, com um punhado de ids, em vez de arrastar o
    nome repetido em cada linha da varredura acima.
  */
  const professionalNames = await listProfessionalNames(
    rankingCandidates(projectSummary.projectsByProfessional),
  );

  const breakdown = (breakdownResponse.data as BreakdownRow[] | null) ?? [];
  const reachSlice = (kind: string): DistributionSlice[] =>
    breakdown
      .filter((row) => row.kind === kind)
      .map((row) => ({
        label: row.label,
        active_count: count(row.professionals),
        total_count: count(row.professionals),
      }));

  const portfolioRow = (portfolioResponse.data as PortfolioTotals[] | null)?.[0];

  return {
    portfolio: portfolioRow
      ? {
          professionals_total: count(portfolioRow.professionals_total),
          professionals_active: count(portfolioRow.professionals_active),
          professionals_inactive: count(portfolioRow.professionals_inactive),
          professionals_without_region: count(
            portfolioRow.professionals_without_region,
          ),
          professionals_never_contacted: count(
            portfolioRow.professionals_never_contacted,
          ),
          stores_total: count(portfolioRow.stores_total),
          stores_active: count(portfolioRow.stores_active),
          stores_without_projects: count(portfolioRow.stores_without_projects),
        }
      : EMPTY_PORTFOLIO,
    metrics: toMetrics((metricsResponse.data as MetricsRow[] | null)?.[0]),
    statusCounts: projectSummary.counts,
    topProfessionals: buildTopProfessionals(
      projectSummary.projectsByProfessional,
      professionalNames,
    ),
    contactedProfessionals: toContactedProfessionals(
      contactedResponse.data as ContactedRow[] | null,
    ),
    contactedProfessionalsError: contactedResponse.error
      ? translate(contactedResponse.error, "contatados")
      : null,
    segments: toDistribution(segmentsResponse.data as DistributionRow[] | null),
    regions: toDistribution(regionsResponse.data as DistributionRow[] | null),
    reachSegments: reachSlice("segment"),
    reachRegions: reachSlice("region"),
    storeResults: (
      (storeResultsResponse.data as Record<string, unknown>[] | null) ?? []
    ).map(
      (row): StoreResult => ({
        store_id: String(row.store_id),
        store_name: String(row.store_name),
        is_active: Boolean(row.is_active),
        professionals_reached: count(row.professionals_reached),
        projects_received: count(row.projects_received),
        proposals_sent: count(row.proposals_sent),
        deals_closed: count(row.deals_closed),
        total_closed_value: count(row.total_closed_value),
        total_commission_value: count(row.total_commission_value),
      }),
    ),
    trend: ((trendResponse.data as Record<string, unknown>[] | null) ?? []).map(
      (row): TrendPoint => ({
        bucket_start: String(row.bucket_start),
        professionals_contacted: count(row.professionals_contacted),
        projects_received: count(row.projects_received),
        deals_closed: count(row.deals_closed),
      }),
    ),
    stores: (storesResponse.data as StoreOption[]) ?? [],
    error: null,
  };
}

type BreakdownRow = {
  kind: string;
  label: string;
  professionals: number | string;
};

/**
 * Carrega o Dashboard da Loja.
 *
 * UMA SEMÂNTICA SÓ: tudo nesta tela é desta loja.
 *
 * Foi assim que o cliente reverteu a decisão da migration 0005, que mandava
 * mostrar à loja o alcance da HORN inteira. Aquele número contava conversas em
 * que a marca nem tinha sido apresentada e saía idêntico em painéis de lojas
 * diferentes; agora cada bloco responde pela própria loja:
 *
 *   - alcance (contatados, lista, segmentos, regiões) = contatos em que ESTA
 *     loja foi apresentada, pela relação `contact_stores`;
 *   - comercial (projetos, propostas, status, ranking, valores) = os registros
 *     desta loja, como já era.
 *
 * O recorte não é feito aqui. Cada função abaixo deriva a loja da sessão ou
 * recusa uma loja que não seja a de quem chama — filtrar no cliente depois de
 * receber o conjunto grande seria exatamente o que esta correção evita.
 */
export async function loadStoreDashboard(
  range: PeriodRange,
  storeId: string | null,
  storeName: string | null,
  channel: ContactChannel | "",
): Promise<StoreDashboardData> {
  const supabase = await createClient();
  // Vazio = todos. O recorte por loja continua vindo da sessão, não daqui.
  const byChannel = channel || null;

  const [
    metricsResponse,
    breakdownResponse,
    projectSummary,
    professionals,
    contactedResponse,
  ] = await Promise.all([
      supabase.rpc("get_store_dashboard_metrics", {
        p_from: range.from,
        p_to: range.to,
        p_channel: byChannel,
      }),
      /*
        Segmentos e regiões de quem ESTA loja alcançou. A função recebe a loja
        por parâmetro, mas não confia nela: para um usuário de loja ela só
        aceita a própria (migration 0009), então mandar outro id devolve
        'Not authorized' em vez de dado alheio.
      */
      supabase.rpc("get_store_reach_breakdown", {
        p_store_id: storeId,
        p_from: range.from,
        p_to: range.to,
        p_channel: byChannel,
      }),
      /*
        Sem loja por parâmetro, igual ao resto da tela: a policy
        `opportunities_read` só devolve as linhas da própria loja, então o
        recorte continua sendo decidido no banco pelo perfil do usuário.
      */
      summarizeOpportunitiesInRange(range, null),
      /*
        Os nomes do ranking. `professionals` é admin-only por RLS, então aqui
        eles vêm da mesma função SECURITY DEFINER que já abastece o filtro por
        profissional de Projetos & Propostas (migration 0004): ela devolve
        exatamente quem já gerou projeto PARA ESTA LOJA — nunca a carteira.
        Nada disso vai para o cliente: só as cinco posições do card viajam.

        Como a busca não depende do resultado da varredura, ela entra no mesmo
        paralelo, sem ida e volta extra.
      */
      listStoreProfessionalOptions(),
      /*
        A lista por trás do KPI "Profissionais contatados", com a mesma regra
        dele: os contatos em que esta loja foi apresentada. Sem parâmetro de
        loja — a função resolve pelo perfil autenticado — e sem a coluna de
        quantas marcas havia no mesmo contato, que é dado das concorrentes.
      */
      supabase.rpc("get_store_contacted_professionals", {
        p_from: range.from,
        p_to: range.to,
        p_channel: byChannel,
      }),
    ]);

  const failure = metricsResponse.error ?? breakdownResponse.error;

  if (failure || projectSummary.error) {
    return {
      metrics: EMPTY_METRICS,
      statusCounts: EMPTY_STATUS_COUNTS,
      topProfessionals: [],
      contactedProfessionals: [],
      contactedProfessionalsError: null,
      segments: [],
      regions: [],
      storeName,
      error: failure ? translate(failure, "loja") : projectSummary.error,
    };
  }

  const breakdown = (breakdownResponse.data as BreakdownRow[] | null) ?? [];
  const slice = (kind: string): DistributionSlice[] =>
    breakdown
      .filter((row) => row.kind === kind)
      .map((row) => ({
        label: row.label,
        active_count: count(row.professionals),
        total_count: count(row.professionals),
      }));

  return {
    metrics: toMetrics((metricsResponse.data as MetricsRow[] | null)?.[0]),
    statusCounts: projectSummary.counts,
    topProfessionals: buildTopProfessionals(
      projectSummary.projectsByProfessional,
      new Map(professionals.map(({ id, name }) => [id, name])),
    ),
    contactedProfessionals: toContactedProfessionals(
      contactedResponse.data as ContactedRow[] | null,
    ),
    contactedProfessionalsError: contactedResponse.error
      ? translate(contactedResponse.error, "contatados")
      : null,
    segments: slice("segment"),
    regions: slice("region"),
    storeName,
    error: null,
  };
}
