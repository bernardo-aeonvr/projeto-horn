import { createClient } from "@/lib/supabase/server";

import {
  PAGE_SIZE,
  PROFESSIONAL_COLUMNS,
  type Professional,
  type ProfessionalFilters,
  type Region,
  type Segment,
} from "./types";

/** Escapa os curingas do LIKE para que o texto digitado seja literal. */
function escapeLikePattern(value: string) {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

/**
 * Cita um valor para uso dentro de `or=(...)`.
 * Sem as aspas, uma vírgula no termo buscado quebraria o filtro do PostgREST.
 */
function quoteOrValue(value: string) {
  return `"${value.replace(/["\\]/g, (char) => `\\${char}`)}"`;
}

type ProfessionalRow = Omit<Professional, "segment" | "regions"> & {
  segment: Segment | Segment[] | null;
};

function readSegment(value: ProfessionalRow["segment"]): Segment | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

export type ProfessionalListResult = {
  professionals: Professional[];
  /** Total que atende aos filtros, para a paginação. */
  filteredCount: number;
  /** Total sem filtro — separa "base vazia" de "busca sem resultado". */
  totalCount: number;
  page: number;
  pageCount: number;
  error: string | null;
};

const EMPTY_RESULT = (page: number, error: string): ProfessionalListResult => ({
  professionals: [],
  filteredCount: 0,
  totalCount: 0,
  page,
  pageCount: 1,
  error,
});

/**
 * Lista profissionais paginados, com os filtros da tela aplicados no banco.
 *
 * São duas consultas por página, ambas limitadas:
 *   1. os profissionais da página (no máximo PAGE_SIZE linhas);
 *   2. as regiões apenas desses profissionais.
 *
 * Trazer as regiões junto no embed não funcionaria com o filtro por região:
 * o `!inner` restringiria o embed à região filtrada e a lista mostraria
 * apenas ela, escondendo as demais regiões do profissional.
 */
export async function listProfessionals(
  filters: ProfessionalFilters,
): Promise<ProfessionalListResult> {
  const supabase = await createClient();

  const selectColumns = filters.regionId
    ? `${PROFESSIONAL_COLUMNS}, professional_regions!inner(region_id)`
    : PROFESSIONAL_COLUMNS;

  let query = supabase
    .from("professionals")
    .select(selectColumns, { count: "exact" });

  if (filters.status === "ativos") query = query.eq("is_active", true);
  if (filters.status === "inativos") query = query.eq("is_active", false);

  if (filters.segmentId) query = query.eq("segment_id", filters.segmentId);

  // Basta o profissional ter a região entre as dele.
  if (filters.regionId) {
    query = query.eq("professional_regions.region_id", filters.regionId);
  }

  const term = filters.q.trim();
  if (term) {
    const pattern = quoteOrValue(`%${escapeLikePattern(term)}%`);
    query = query.or(`name.ilike.${pattern},email.ilike.${pattern}`);
  }

  const from = (filters.page - 1) * PAGE_SIZE;

  const [listResponse, totalResponse] = await Promise.all([
    query.order("name", { ascending: true }).range(from, from + PAGE_SIZE - 1),
    supabase.from("professionals").select("id", { count: "exact", head: true }),
  ]);

  if (listResponse.error) {
    console.error("[profissionais] falha ao listar", listResponse.error);
    return EMPTY_RESULT(
      filters.page,
      "Não foi possível carregar os profissionais. Verifique a conexão e tente novamente.",
    );
  }

  const rows = (listResponse.data ?? []) as unknown as ProfessionalRow[];
  const regionsByProfessional = await fetchRegions(rows.map((row) => row.id));

  const filteredCount = listResponse.count ?? rows.length;

  return {
    professionals: rows.map((row) => ({
      ...row,
      segment: readSegment(row.segment),
      regions: regionsByProfessional.get(row.id) ?? [],
    })),
    filteredCount,
    totalCount: totalResponse.count ?? filteredCount,
    page: filters.page,
    pageCount: Math.max(1, Math.ceil(filteredCount / PAGE_SIZE)),
    error: null,
  };
}

type RegionRow = { professional_id: string; regions: Region | Region[] | null };

/** Regiões dos profissionais informados, agrupadas e ordenadas. */
async function fetchRegions(
  professionalIds: string[],
): Promise<Map<string, Region[]>> {
  const grouped = new Map<string, Region[]>();
  if (professionalIds.length === 0) return grouped;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("professional_regions")
    .select("professional_id, regions(id, slug, name, sort_order)")
    .in("professional_id", professionalIds);

  if (error || !data) {
    console.error("[profissionais] falha ao carregar regiões", error);
    return grouped;
  }

  for (const row of data as unknown as RegionRow[]) {
    const region = Array.isArray(row.regions) ? row.regions[0] : row.regions;
    if (!region) continue;

    const current = grouped.get(row.professional_id) ?? [];
    current.push(region);
    grouped.set(row.professional_id, current);
  }

  for (const regions of grouped.values()) {
    regions.sort((a, b) => a.sort_order - b.sort_order);
  }

  return grouped;
}

/** Um profissional com segmento e regiões, para o detalhe e a edição. */
export async function getProfessional(
  id: string,
): Promise<Professional | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("professionals")
    .select(PROFESSIONAL_COLUMNS)
    .eq("id", id)
    .maybeSingle();

  if (error || !data) return null;

  const row = data as unknown as ProfessionalRow;
  const regions = await fetchRegions([row.id]);

  return {
    ...row,
    segment: readSegment(row.segment),
    regions: regions.get(row.id) ?? [],
  };
}

/** Catálogo oficial de segmentos (spec, seção 7.2). Ids vêm do banco. */
export async function listSegments(): Promise<Segment[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("segments")
    .select("id, slug, name")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  if (error || !data) {
    console.error("[profissionais] falha ao carregar segmentos", error);
    return [];
  }

  return data as Segment[];
}

/** Catálogo oficial de regiões (spec, seção 7.3). Ids vêm do banco. */
export async function listRegions(): Promise<Region[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("regions")
    .select("id, slug, name, sort_order")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  if (error || !data) {
    console.error("[profissionais] falha ao carregar regiões", error);
    return [];
  }

  return data as Region[];
}
