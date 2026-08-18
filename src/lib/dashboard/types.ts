/**
 * Domínio Dashboard — espelha o retorno das funções de leitura do banco.
 *
 * Nada aqui é calculado no cliente: cada número vem agregado do Postgres, pelas
 * funções de supabase/migrations/0002_dashboard_metrics.sql (visão admin) e
 * pelas funções de loja que já vinham no schema.
 *
 * A separação abaixo é a regra mais importante da tela (spec, seção 14.2):
 * `PortfolioTotals` descreve a carteira HOJE e não reage ao filtro de período;
 * `ActivityMetrics` conta EVENTOS ocorridos dentro do período.
 */

/** Estado atual da base. Independente do período selecionado. */
export type PortfolioTotals = {
  professionals_total: number;
  professionals_active: number;
  /** Fora da carteira ativa. Não vai à tela: é `total - ativos`. */
  professionals_inactive: number;
  /** Ativos sem nenhuma região cadastrada — o gráfico de regiões não os cobre. */
  professionals_without_region: number;
  /**
   * Ativos que nunca receberam contato, em toda a história.
   * A regra central do produto em forma de número: estar cadastrado não
   * significa ter sido contatado.
   */
  professionals_never_contacted: number;
  stores_total: number;
  stores_active: number;
  /** Lojas ativas que nunca receberam projeto: apresentadas, mas sem demanda. */
  stores_without_projects: number;
};

/** Eventos do período. Cada campo usa a data do acontecimento que representa. */
export type ActivityMetrics = {
  /** Profissionais DISTINTOS com ao menos um contato no período. */
  professionals_contacted: number;
  /** Total de eventos de contato no período. Sempre >= o campo acima. */
  contact_events: number;
  projects_received: number;
  proposals_received: number;
  proposals_sent: number;
  proposals_closed: number;
  proposals_lost: number;
  /** Valor inicial das propostas ENVIADAS no período. */
  total_proposed_value: number;
  /** Valor final dos negócios FECHADOS no período. */
  total_closed_value: number;
  /** Comissão preservada nos negócios fechados no período. */
  total_commission_value: number;
  /** Profissionais distintos que geraram projeto no período (conversão). */
  professionals_with_projects: number;
};

export const EMPTY_METRICS: ActivityMetrics = {
  professionals_contacted: 0,
  contact_events: 0,
  projects_received: 0,
  proposals_received: 0,
  proposals_sent: 0,
  proposals_closed: 0,
  proposals_lost: 0,
  total_proposed_value: 0,
  total_closed_value: 0,
  total_commission_value: 0,
  professionals_with_projects: 0,
};

/** Uma fatia da distribuição da carteira (segmento ou região). */
export type DistributionSlice = {
  label: string;
  active_count: number;
  total_count: number;
};

export type StoreResult = {
  store_id: string;
  store_name: string;
  is_active: boolean;
  professionals_reached: number;
  projects_received: number;
  proposals_sent: number;
  deals_closed: number;
  total_closed_value: number;
  total_commission_value: number;
};

export type TrendPoint = {
  bucket_start: string;
  professionals_contacted: number;
  projects_received: number;
  deals_closed: number;
};

/** Profissional alcançado, na visão que a loja pode ver. */
export type ReachedProfessional = {
  contact_id: string;
  professional_id: string;
  professional_name: string;
  segment_name: string | null;
  regions: string[];
  contacted_at: string;
};

export type StoreOption = { id: string; name: string; is_active: boolean };

/** Tudo que o Dashboard Admin renderiza de uma vez. */
export type AdminDashboardData = {
  portfolio: PortfolioTotals;
  metrics: ActivityMetrics;
  /** Distribuição da carteira inteira, por segmento. */
  segments: DistributionSlice[];
  /** Distribuição da carteira inteira, por região. */
  regions: DistributionSlice[];
  /**
   * Segmentos e regiões dos profissionais ALCANÇADOS, preenchidos só quando o
   * admin filtra por uma loja. Com uma loja selecionada, a composição da
   * carteira inteira não diz nada sobre ela — o que importa é quem aquela
   * marca alcançou. Usa a mesma função do Dashboard da Loja.
   */
  reachSegments: DistributionSlice[];
  reachRegions: DistributionSlice[];
  storeResults: StoreResult[];
  trend: TrendPoint[];
  stores: StoreOption[];
  error: string | null;
};

/** Tudo que o Dashboard da Loja renderiza. */
export type StoreDashboardData = {
  metrics: ActivityMetrics;
  segments: DistributionSlice[];
  regions: DistributionSlice[];
  reached: ReachedProfessional[];
  storeName: string | null;
  error: string | null;
};

/*
 * A conversão contato → projeto saiu do dashboard: ela era construída a partir
 * de "profissionais contatados" e "projetos recebidos", que já são dois cards.
 * `professionals_with_projects` continua vindo do banco e no tipo, pronto para
 * quando houver uma tela que a use sem repetir outro indicador.
 */
