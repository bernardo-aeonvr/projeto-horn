import { resolvePeriod } from "@/lib/contacts/period";
import type { PeriodPreset } from "@/lib/contacts/types";
import { toNumber } from "@/lib/stores/format";
import { createClient } from "@/lib/supabase/server";

import {
  EMPTY_STATUS_COUNTS,
  OPEN_STATUSES,
  OPPORTUNITY_COLUMNS,
  OPPORTUNITY_STATUSES,
  PAGE_SIZE,
  type Opportunity,
  type OpportunityFilters,
  type OpportunityStatusCounts,
  type OpportunityStatusEvent,
  type OpportunityStore,
  type ProposalAttachment,
} from "./types";

/** Escapa os curingas do LIKE para que o texto digitado seja literal. */
function escapeLikePattern(value: string) {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

/**
 * Prepara o termo para entrar dentro de um `or(...)` do PostgREST.
 *
 * Ali a gramática é posicional: vírgula separa condições, parênteses delimitam
 * a lista e o ponto separa coluna/operador/valor. Não há como escapar esses
 * caracteres no meio do valor, então eles são removidos — buscar por vírgula
 * ou parêntese no título de um projeto não é um caso real.
 */
function sanitizeForOrFilter(value: string) {
  return escapeLikePattern(value).replace(/[,()."\\]/g, " ").trim();
}

type EmbeddedSegment = { name: string } | { name: string }[] | null;

type EmbeddedProfessional =
  | { id: string; name: string; segment: EmbeddedSegment }
  | { id: string; name: string; segment: EmbeddedSegment }[]
  | null;

type EmbeddedStore =
  | {
      id: string;
      name: string;
      is_active: boolean;
      default_commission_percent: number | string | null;
    }
  | {
      id: string;
      name: string;
      is_active: boolean;
      default_commission_percent: number | string | null;
    }[]
  | null;

type OpportunityRow = Omit<
  Opportunity,
  | "professional"
  | "store"
  | "proposal_initial_value"
  | "final_closed_value"
  | "commission_percent"
  | "commission_value"
> & {
  proposal_initial_value: number | string | null;
  final_closed_value: number | string | null;
  commission_percent: number | string | null;
  commission_value: number | string | null;
  professional: EmbeddedProfessional;
  store: EmbeddedStore;
};

function first<T>(value: T | T[] | null): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

/**
 * Converte a linha do PostgREST no tipo do domínio.
 *
 * `numeric` pode chegar como número ou string dependendo da precisão, então
 * todos os valores monetários e percentuais passam por `toNumber`.
 */
function toOpportunity(row: OpportunityRow): Opportunity {
  const professional = first(row.professional);
  const store = first(row.store);
  const segment = professional ? first(professional.segment) : null;

  return {
    ...row,
    proposal_initial_value: toNumber(row.proposal_initial_value),
    final_closed_value: toNumber(row.final_closed_value),
    commission_percent: toNumber(row.commission_percent),
    commission_value: toNumber(row.commission_value),
    professional: professional
      ? {
          id: professional.id,
          name: professional.name,
          segment_name: segment?.name ?? null,
        }
      : null,
    store: store
      ? {
          id: store.id,
          name: store.name,
          is_active: store.is_active,
          default_commission_percent: toNumber(store.default_commission_percent),
        }
      : null,
  };
}

/** Ids de profissionais e lojas cujo nome casa com o termo buscado. */
async function findMatchingIds(term: string) {
  const supabase = await createClient();
  const pattern = `%${escapeLikePattern(term)}%`;

  const [professionals, stores] = await Promise.all([
    supabase.from("professionals").select("id").ilike("name", pattern).limit(200),
    supabase.from("stores").select("id").ilike("name", pattern).limit(100),
  ]);

  return {
    professionalIds: (professionals.data ?? []).map(
      (row: { id: string }) => row.id,
    ),
    storeIds: (stores.data ?? []).map((row: { id: string }) => row.id),
  };
}

export type OpportunityListResult = {
  opportunities: Opportunity[];
  filteredCount: number;
  /** Total sem filtro — separa "base vazia" de "busca sem resultado". */
  totalCount: number;
  /**
   * Quantos projetos cada status tem dentro do mesmo recorte da listagem,
   * ignorando apenas o próprio filtro de status — senão o status escolhido
   * zeraria todos os outros cards.
   */
  statusCounts: OpportunityStatusCounts;
  page: number;
  pageCount: number;
  error: string | null;
};

/**
 * Lista as oportunidades paginadas, com os filtros aplicados no banco.
 *
 * A busca cobre profissional, loja e título da demanda. Como o PostgREST não
 * faz `or` entre colunas de dois recursos embutidos diferentes, os nomes são
 * resolvidos antes em ids e o `or` final roda sobre a própria tabela.
 *
 * A leitura usa a sessão do usuário, então a policy `opportunities_read`
 * continua valendo: admin vê tudo, usuário de loja veria só a própria loja.
 */
export async function listOpportunities(
  filters: OpportunityFilters,
): Promise<OpportunityListResult> {
  const supabase = await createClient();

  const term = filters.q.trim();
  const search = term ? await buildSearchConditions(term) : null;

  // Nenhuma condição possível significa que nada pode casar.
  if (search !== null && search.length === 0) {
    return {
      opportunities: [],
      filteredCount: 0,
      totalCount: await countAll(),
      statusCounts: EMPTY_STATUS_COUNTS,
      page: filters.page,
      pageCount: 1,
      error: null,
    };
  }

  let query = applyScopeFilters(
    supabase
      .from("opportunities")
      .select(OPPORTUNITY_COLUMNS, { count: "exact" }),
    filters,
    search,
  );

  if (filters.status === "abertas") {
    query = query.in("status", OPEN_STATUSES);
  } else if (filters.status) {
    query = query.eq("status", filters.status);
  }

  const offset = (filters.page - 1) * PAGE_SIZE;

  const [listResponse, totalCount, statusCounts] = await Promise.all([
    // Ordena pela última movimentação: o que andou recentemente vem primeiro.
    query
      .order("updated_at", { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1),
    countAll(),
    countByStatus(filters, search),
  ]);

  if (listResponse.error) {
    console.error("[projetos] falha ao listar", listResponse.error);
    return {
      opportunities: [],
      filteredCount: 0,
      totalCount: 0,
      statusCounts: EMPTY_STATUS_COUNTS,
      page: filters.page,
      pageCount: 1,
      error:
        "Não foi possível carregar os projetos. Verifique a conexão e tente novamente.",
    };
  }

  const rows = (listResponse.data ?? []) as unknown as OpportunityRow[];
  const filteredCount = listResponse.count ?? rows.length;

  return {
    opportunities: rows.map(toOpportunity),
    filteredCount,
    totalCount,
    statusCounts,
    page: filters.page,
    pageCount: Math.max(1, Math.ceil(filteredCount / PAGE_SIZE)),
    error: null,
  };
}

/**
 * Traduz o termo buscado nas condições de um `or(...)` do PostgREST.
 *
 * Lista vazia é resposta legítima: o termo não casa com nenhum profissional,
 * loja nem título, então nada pode voltar.
 */
async function buildSearchConditions(term: string): Promise<string[]> {
  const { professionalIds, storeIds } = await findMatchingIds(term);
  const safeTerm = sanitizeForOrFilter(term);

  const conditions: string[] = [];
  if (safeTerm) conditions.push(`title.ilike.*${safeTerm}*`);
  if (professionalIds.length > 0) {
    conditions.push(`professional_id.in.(${professionalIds.join(",")})`);
  }
  if (storeIds.length > 0) {
    conditions.push(`store_id.in.(${storeIds.join(",")})`);
  }

  return conditions;
}

/** O mínimo do construtor do PostgREST que os filtros compartilhados usam. */
interface ScopedQuery {
  or(filters: string): this;
  eq(column: string, value: string): this;
  gte(column: string, value: string): this;
  lt(column: string, value: string): this;
}

/**
 * Aplica busca, loja, profissional e período — tudo menos o status.
 *
 * É o recorte que a listagem e a contagem por status compartilham. O status
 * fica de fora de propósito: os cards mostram a distribuição dentro do mesmo
 * recorte, e aplicar ali o status escolhido zeraria todos os outros.
 */
function applyScopeFilters<T>(
  query: T,
  filters: OpportunityFilters,
  search: string[] | null,
): T {
  /*
    O construtor entra e sai pelo mesmo tipo, mas dentro daqui ele é visto
    apenas como `ScopedQuery`. Amarrar o genérico à interface faria o
    TypeScript tentar instanciar os tipos gerados do PostgREST a cada chamada,
    o que estoura o limite de profundidade na consulta com embeds.
  */
  let scoped = query as ScopedQuery;

  if (search !== null && search.length > 0) {
    scoped = scoped.or(search.join(","));
  }

  if (filters.storeId) scoped = scoped.eq("store_id", filters.storeId);
  if (filters.professionalId) {
    scoped = scoped.eq("professional_id", filters.professionalId);
  }

  // O período recorta a criação do projeto — a data em que a demanda entrou.
  // Os KPIs por transição de status virão do histórico, no dashboard.
  const { from, to } = resolvePeriod(
    filters.period as PeriodPreset,
    filters.from,
    filters.to,
  );
  if (from) scoped = scoped.gte("created_at", from);
  if (to) scoped = scoped.lt("created_at", to);

  return scoped as T;
}

/**
 * Quantos projetos há em cada status dentro do recorte atual.
 *
 * Uma contagem `head` por status, em paralelo. O PostgREST não agrupa, e
 * baixar todas as linhas só para somar aqui esbarraria no teto de linhas da
 * API — e devolveria números errados em silêncio quando esbarrasse.
 *
 * As contagens rodam sem os embeds de profissional e loja da listagem. Isso
 * não muda o resultado: as duas chaves são `not null`, então o join interno
 * da listagem nunca derruba linha.
 */
async function countByStatus(
  filters: OpportunityFilters,
  search: string[] | null,
): Promise<OpportunityStatusCounts> {
  const supabase = await createClient();

  const entries = await Promise.all(
    OPPORTUNITY_STATUSES.map(async (status) => {
      const { count, error } = await applyScopeFilters(
        supabase
          .from("opportunities")
          .select("id", { count: "exact", head: true }),
        filters,
        search,
      ).eq("status", status);

      if (error) {
        console.error("[projetos] falha ao contar status", status, error);
        return [status, 0] as const;
      }

      return [status, count ?? 0] as const;
    }),
  );

  return Object.fromEntries(entries) as OpportunityStatusCounts;
}

async function countAll(): Promise<number> {
  const supabase = await createClient();
  const { count } = await supabase
    .from("opportunities")
    .select("id", { count: "exact", head: true });

  return count ?? 0;
}

type StoreOpportunityRow = {
  id: string;
  professional_id: string;
  professional_name: string;
  segment_name: string | null;
  store_id: string;
  store_name: string;
  store_is_active: boolean;
  title: string | null;
  status: Opportunity["status"];
  proposal_initial_value: number | string | null;
  final_closed_value: number | string | null;
  commission_percent: number | string | null;
  commission_value: number | string | null;
  loss_reason: string | null;
  created_at: string;
  updated_at: string;
  filtered_count: number | string;
  total_count: number | string;
};

/**
 * Listagem de projetos vista pelo usuário de loja.
 *
 * Caminho separado por necessidade, não por escolha: a listagem do admin
 * embute `professionals!inner`, e `professionals` é admin-only por RLS — o
 * join interno derrubaria todas as linhas e a loja veria a tela vazia.
 *
 * `get_store_opportunities_page` resolve a loja pelo perfil do usuário
 * autenticado; não existe parâmetro de loja para adulterar. Ela também não
 * devolve as observações internas da HORN.
 */
export async function listStoreOpportunities(
  filters: OpportunityFilters,
): Promise<OpportunityListResult> {
  const supabase = await createClient();

  const { from, to } = resolvePeriod(
    filters.period as PeriodPreset,
    filters.from,
    filters.to,
  );

  const [{ data, error }, statusCounts] = await Promise.all([
    supabase.rpc("get_store_opportunities_page", {
      p_q: filters.q.trim() || null,
      p_status: filters.status || null,
      p_professional_id: filters.professionalId || null,
      p_from: from || null,
      p_to: to || null,
      p_limit: PAGE_SIZE,
      p_offset: (filters.page - 1) * PAGE_SIZE,
    }),
    countStoreByStatus(filters),
  ]);

  if (error) {
    console.error("[projetos] falha ao listar projetos da loja", error);
    return {
      opportunities: [],
      filteredCount: 0,
      totalCount: 0,
      statusCounts: EMPTY_STATUS_COUNTS,
      page: filters.page,
      pageCount: 1,
      error:
        "Não foi possível carregar os projetos. Verifique a conexão e tente novamente.",
    };
  }

  const rows = (data as StoreOpportunityRow[] | null) ?? [];

  // As contagens viajam repetidas em cada linha. Sem nenhuma linha nesta página
  // elas não vêm, e o total precisa de uma segunda chamada — é ele que separa
  // "a loja não tem projetos" de "o filtro não encontrou nada".
  const filteredCount =
    rows.length > 0 ? (toNumber(rows[0].filtered_count) ?? 0) : 0;
  const totalCount =
    rows.length > 0
      ? (toNumber(rows[0].total_count) ?? 0)
      : await countStoreOpportunities();

  return {
    opportunities: rows.map(
      (row): Opportunity => ({
        id: row.id,
        professional_id: row.professional_id,
        store_id: row.store_id,
        title: row.title,
        // As observações internas da HORN não são expostas à loja.
        notes: null,
        status: row.status,
        proposal_initial_value: toNumber(row.proposal_initial_value),
        final_closed_value: toNumber(row.final_closed_value),
        commission_percent: toNumber(row.commission_percent),
        commission_value: toNumber(row.commission_value),
        loss_reason: row.loss_reason,
        created_at: row.created_at,
        updated_at: row.updated_at,
        professional: {
          id: row.professional_id,
          name: row.professional_name,
          segment_name: row.segment_name,
        },
        store: {
          id: row.store_id,
          name: row.store_name,
          is_active: row.store_is_active,
          // Só interessa ao formulário de projeto, que a loja não abre.
          default_commission_percent: null,
        },
      }),
    ),
    filteredCount,
    totalCount: Math.max(totalCount, filteredCount),
    statusCounts,
    page: filters.page,
    pageCount: Math.max(1, Math.ceil(filteredCount / PAGE_SIZE)),
    error: null,
  };
}

/**
 * Distribuição por status vista pelo usuário de loja.
 *
 * Não dá para contar direto na tabela como no caminho do admin: a busca por
 * nome de profissional depende de `professionals`, que é admin-only por RLS.
 * Então a contagem reusa a própria função da listagem, uma vez por status,
 * pedindo só a primeira linha — `filtered_count` já vem calculado nela. Assim
 * os cards e a lista nunca podem discordar: o filtro é literalmente o mesmo.
 */
async function countStoreByStatus(
  filters: OpportunityFilters,
): Promise<OpportunityStatusCounts> {
  const supabase = await createClient();

  const { from, to } = resolvePeriod(
    filters.period as PeriodPreset,
    filters.from,
    filters.to,
  );

  const entries = await Promise.all(
    OPPORTUNITY_STATUSES.map(async (status) => {
      const { data, error } = await supabase.rpc(
        "get_store_opportunities_page",
        {
          p_q: filters.q.trim() || null,
          p_status: status,
          p_professional_id: filters.professionalId || null,
          p_from: from || null,
          p_to: to || null,
          // Uma linha basta: a contagem viaja repetida em todas elas.
          p_limit: 1,
          p_offset: 0,
        },
      );

      if (error) {
        console.error("[projetos] falha ao contar status da loja", status, error);
        return [status, 0] as const;
      }

      const rows = (data as StoreOpportunityRow[] | null) ?? [];
      // Sem linha nenhuma, não há o que contar naquele status.
      const count = rows.length > 0 ? (toNumber(rows[0].filtered_count) ?? 0) : 0;

      return [status, count] as const;
    }),
  );

  return Object.fromEntries(entries) as OpportunityStatusCounts;
}

/** Total de projetos da própria loja, sem nenhum filtro. */
async function countStoreOpportunities(): Promise<number> {
  const supabase = await createClient();

  // A policy `opportunities_read` já restringe a contagem à própria loja.
  const { count } = await supabase
    .from("opportunities")
    .select("id", { count: "exact", head: true });

  return count ?? 0;
}

/**
 * Profissionais que a loja pode citar: só os que já geraram projeto para ela.
 * Resolve o nome no chip de filtro sem abrir a carteira da HORN.
 */
export async function listStoreProfessionalOptions(): Promise<
  { id: string; name: string }[]
> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc(
    "get_store_opportunity_professionals",
  );

  if (error || !data) {
    console.error("[projetos] falha ao carregar profissionais da loja", error);
    return [];
  }

  return (data as { professional_id: string; professional_name: string }[]).map(
    (row) => ({ id: row.professional_id, name: row.professional_name }),
  );
}

/** Uma oportunidade com profissional e loja resolvidos. */
export async function getOpportunity(id: string): Promise<Opportunity | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("opportunities")
    .select(OPPORTUNITY_COLUMNS)
    .eq("id", id)
    .maybeSingle();

  if (error || !data) return null;

  return toOpportunity(data as unknown as OpportunityRow);
}

/** Projetos de um profissional, do mais recente para o mais antigo. */
export async function listOpportunitiesByProfessional(
  professionalId: string,
): Promise<Opportunity[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("opportunities")
    .select(OPPORTUNITY_COLUMNS)
    .eq("professional_id", professionalId)
    .order("created_at", { ascending: false });

  if (error || !data) {
    console.error("[projetos] falha ao carregar projetos do profissional", error);
    return [];
  }

  return (data as unknown as OpportunityRow[]).map(toOpportunity);
}

type HistoryRow = Omit<OpportunityStatusEvent, "changed_by_name">;

/**
 * Timeline de mudanças de status, da mais recente para a mais antiga.
 *
 * As linhas são escritas pelo trigger `opportunities_record_status_history` —
 * a aplicação nunca insere aqui, e o `grant` do schema só concede SELECT.
 *
 * O nome de quem movimentou vem de uma segunda consulta: a FK de `changed_by`
 * aponta para `auth.users`, não para `user_profiles`, então o PostgREST não
 * consegue montar o embed sozinho.
 */
export async function listOpportunityHistory(
  opportunityId: string,
): Promise<OpportunityStatusEvent[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("opportunity_status_history")
    .select("id, from_status, to_status, changed_at, changed_by")
    .eq("opportunity_id", opportunityId)
    .order("changed_at", { ascending: false });

  if (error || !data) {
    console.error("[projetos] falha ao carregar histórico", error);
    return [];
  }

  const rows = data as unknown as HistoryRow[];
  const names = await fetchUserNames(
    rows.map((row) => row.changed_by).filter((id): id is string => Boolean(id)),
  );

  return rows.map((row) => ({
    ...row,
    changed_by_name: row.changed_by ? (names.get(row.changed_by) ?? null) : null,
  }));
}

async function fetchUserNames(ids: string[]): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  const unique = [...new Set(ids)];
  if (unique.length === 0) return names;

  const supabase = await createClient();
  const { data } = await supabase
    .from("user_profiles")
    .select("id, full_name")
    .in("id", unique);

  for (const row of (data ?? []) as { id: string; full_name: string | null }[]) {
    if (row.full_name?.trim()) names.set(row.id, row.full_name.trim());
  }

  return names;
}

type AttachmentRow = Omit<ProposalAttachment, "size_bytes"> & {
  size_bytes: number | string | null;
};

/** PDFs da proposta, do mais recente para o mais antigo. */
export async function listProposalAttachments(
  opportunityId: string,
): Promise<ProposalAttachment[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("proposal_attachments")
    .select("id, opportunity_id, storage_path, file_name, size_bytes, created_at")
    .eq("opportunity_id", opportunityId)
    .order("created_at", { ascending: false });

  if (error || !data) {
    console.error("[projetos] falha ao carregar anexos", error);
    return [];
  }

  return (data as unknown as AttachmentRow[]).map((row) => ({
    ...row,
    size_bytes: toNumber(row.size_bytes),
  }));
}

type StoreOptionRow = {
  id: string;
  name: string;
  is_active: boolean;
  default_commission_percent: number | string | null;
};

function toStoreOption(row: StoreOptionRow): OpportunityStore {
  return {
    id: row.id,
    name: row.name,
    is_active: row.is_active,
    default_commission_percent: toNumber(row.default_commission_percent),
  };
}

/**
 * Lojas oferecidas ao criar um projeto.
 *
 * Traz as ativas — uma loja inativa deixou de ser representada e não deve
 * receber demandas novas (spec, seção 17.3). Na edição, `includeId` garante
 * que a loja já vinculada continue na lista mesmo depois de inativada, para
 * não impedir a correção de um registro histórico.
 */
export async function listOpportunityStoreOptions(
  includeId?: string | null,
): Promise<OpportunityStore[]> {
  const supabase = await createClient();

  let query = supabase
    .from("stores")
    .select("id, name, is_active, default_commission_percent")
    .order("name", { ascending: true });

  query = includeId
    ? query.or(`is_active.eq.true,id.eq.${includeId}`)
    : query.eq("is_active", true);

  const { data, error } = await query;

  if (error || !data) {
    console.error("[projetos] falha ao carregar lojas", error);
    return [];
  }

  return (data as StoreOptionRow[]).map(toStoreOption);
}

/** Todas as lojas, incluindo inativas, para o filtro da listagem. */
export async function listAllStoreOptions(): Promise<OpportunityStore[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("stores")
    .select("id, name, is_active, default_commission_percent")
    .order("name", { ascending: true });

  if (error || !data) return [];

  return (data as StoreOptionRow[]).map(toStoreOption);
}
