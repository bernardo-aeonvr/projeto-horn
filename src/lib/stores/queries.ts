import { createClient } from "@/lib/supabase/server";

import { toNumber } from "./format";
import { PAGE_SIZE, STORE_COLUMNS, type Store, type StoreFilters } from "./types";

type StoreRow = Omit<
  Store,
  "monthly_fixed_fee" | "default_commission_percent"
> & {
  monthly_fixed_fee: number | string | null;
  default_commission_percent: number | string | null;
};

function toStore(row: StoreRow): Store {
  return {
    ...row,
    monthly_fixed_fee: toNumber(row.monthly_fixed_fee),
    default_commission_percent: toNumber(row.default_commission_percent),
  };
}

/** Escapa os curingas do LIKE para que o texto digitado seja literal. */
function escapeLikePattern(value: string) {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

export type StoreListResult = {
  stores: Store[];
  /** Quantas lojas atendem aos filtros. Base da paginação. */
  filteredCount: number;
  /** Total sem o recorte de busca/segmento — usado para diferenciar os vazios. */
  totalCount: number;
  page: number;
  pageCount: number;
  error: string | null;
};

/**
 * Lista as lojas aplicando os filtros da tela.
 *
 * A leitura é feita com a sessão do usuário, então a policy `stores_read`
 * continua valendo: admin vê todas, usuário de loja veria só a própria.
 */
export async function listStores(
  filters: StoreFilters,
): Promise<StoreListResult> {
  const supabase = await createClient();

  let query = supabase
    .from("stores")
    .select(STORE_COLUMNS, { count: "exact" });

  if (filters.status === "ativas") query = query.eq("is_active", true);
  if (filters.status === "inativas") query = query.eq("is_active", false);

  const term = filters.q.trim();
  if (term) query = query.ilike("name", `%${escapeLikePattern(term)}%`);

  if (filters.category) query = query.eq("category", filters.category);

  // A paginação acontece no banco: a base tem dezenas de lojas e vai crescer.
  const offset = (filters.page - 1) * PAGE_SIZE;

  const [listResponse, countResponse] = await Promise.all([
    query
      .order("name", { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1),
    supabase.from("stores").select("id", { count: "exact", head: true }),
  ]);

  if (listResponse.error) {
    console.error("[lojas] falha ao listar", listResponse.error);
    return {
      stores: [],
      filteredCount: 0,
      totalCount: 0,
      page: filters.page,
      pageCount: 1,
      error:
        "Não foi possível carregar as lojas. Verifique a conexão e tente novamente.",
    };
  }

  const filteredCount = listResponse.count ?? listResponse.data.length;

  return {
    stores: (listResponse.data as StoreRow[]).map(toStore),
    filteredCount,
    totalCount: countResponse.count ?? filteredCount,
    page: filters.page,
    pageCount: Math.max(1, Math.ceil(filteredCount / PAGE_SIZE)),
    error: null,
  };
}

/**
 * Segmentos já cadastrados, para alimentar o filtro e o autocomplete.
 *
 * `stores.category` é texto livre no schema — não existe catálogo de
 * segmentos de loja, então as opções vêm dos próprios registros.
 */
export async function listStoreCategories(): Promise<string[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("stores")
    .select("category")
    .not("category", "is", null)
    .order("category", { ascending: true });

  if (error || !data) return [];

  const unique = new Set<string>();
  for (const row of data as { category: string | null }[]) {
    const value = row.category?.trim();
    if (value) unique.add(value);
  }

  return [...unique].sort((a, b) => a.localeCompare(b, "pt-BR"));
}
