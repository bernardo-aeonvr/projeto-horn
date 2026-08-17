import type { PostgrestError } from "@supabase/supabase-js";

import { toNumber } from "@/lib/stores/format";
import { createClient } from "@/lib/supabase/server";

import { resolveBucket, type PeriodRange } from "./period";
import {
  EMPTY_METRICS,
  type ActivityMetrics,
  type AdminDashboardData,
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

function translate(error: PostgrestError, scope: string): string {
  // PGRST202 = função não encontrada na API.
  if (error.code === "PGRST202") return MISSING_FUNCTION;

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
  stores_total: 0,
  stores_active: 0,
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

/**
 * Carrega o Dashboard HORN inteiro.
 *
 * Sete chamadas em paralelo, cada uma já agregada no banco. As quatro que
 * dependem do período recebem o mesmo recorte; as da carteira não recebem
 * nenhum, porque descrevem o estado atual da base.
 */
export async function loadAdminDashboard(
  range: PeriodRange,
  storeId: string,
): Promise<AdminDashboardData> {
  const supabase = await createClient();
  const scoped = storeId || null;

  const [
    portfolioResponse,
    metricsResponse,
    segmentsResponse,
    regionsResponse,
    storeResultsResponse,
    trendResponse,
    storesResponse,
    breakdownResponse,
  ] = await Promise.all([
    supabase.rpc("get_admin_portfolio_totals"),
    supabase.rpc("get_admin_dashboard_metrics", {
      p_from: range.from,
      p_to: range.to,
      p_store_id: scoped,
    }),
    supabase.rpc("get_admin_professionals_by_segment"),
    supabase.rpc("get_admin_professionals_by_region"),
    supabase.rpc("get_admin_store_results", {
      p_from: range.from,
      p_to: range.to,
    }),
    supabase.rpc("get_admin_activity_timeseries", {
      p_from: range.from,
      p_to: range.to,
      p_bucket: resolveBucket(range),
      p_store_id: scoped,
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
        })
      : Promise.resolve({ data: [], error: null }),
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

  if (failure) {
    return {
      portfolio: EMPTY_PORTFOLIO,
      metrics: EMPTY_METRICS,
      segments: [],
      regions: [],
      reachSegments: [],
      reachRegions: [],
      storeResults: [],
      trend: [],
      stores: (storesResponse.data as StoreOption[]) ?? [],
      error: translate(failure, "admin"),
    };
  }

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
          stores_total: count(portfolioRow.stores_total),
          stores_active: count(portfolioRow.stores_active),
        }
      : EMPTY_PORTFOLIO,
    metrics: toMetrics((metricsResponse.data as MetricsRow[] | null)?.[0]),
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

type ReachRow = {
  contact_id: string;
  professional_id: string;
  professional_name: string;
  segment_name: string | null;
  regions: string[] | null;
  contacted_at: string;
};

type BreakdownRow = {
  kind: string;
  label: string;
  professionals: number | string;
};

/**
 * Carrega o Dashboard da Loja.
 *
 * Roda inteiro sobre funções SECURITY DEFINER travadas em
 * `current_store_id()`: mesmo que a requisição seja adulterada, não existe
 * parâmetro de loja para trocar. `get_store_reach_breakdown` recebe o id, mas
 * rejeita qualquer loja que não seja a do próprio usuário.
 */
export async function loadStoreDashboard(
  range: PeriodRange,
  storeId: string | null,
  storeName: string | null,
): Promise<StoreDashboardData> {
  const supabase = await createClient();

  const [metricsResponse, reachResponse, breakdownResponse] = await Promise.all([
    supabase.rpc("get_store_dashboard_metrics", {
      p_from: range.from,
      p_to: range.to,
    }),
    supabase.rpc("get_store_contact_reach", {
      p_from: range.from,
      p_to: range.to,
    }),
    storeId
      ? supabase.rpc("get_store_reach_breakdown", {
          p_store_id: storeId,
          p_from: range.from,
          p_to: range.to,
        })
      : Promise.resolve({ data: [], error: null }),
  ]);

  const failure =
    metricsResponse.error ?? reachResponse.error ?? breakdownResponse.error;

  if (failure) {
    return {
      metrics: EMPTY_METRICS,
      segments: [],
      regions: [],
      reached: [],
      storeName,
      error: translate(failure, "loja"),
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
    segments: slice("segment"),
    regions: slice("region"),
    reached: ((reachResponse.data as ReachRow[] | null) ?? []).map((row) => ({
      contact_id: row.contact_id,
      professional_id: row.professional_id,
      professional_name: row.professional_name,
      segment_name: row.segment_name,
      regions: row.regions ?? [],
      contacted_at: row.contacted_at,
    })),
    storeName,
    error: null,
  };
}
