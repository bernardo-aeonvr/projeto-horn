import { createClient } from "@/lib/supabase/server";

import { toNumber } from "./format";
import { STORE_COLUMNS, type Store, type StoreFilters } from "./types";

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
  /** Total sem o recorte de busca/segmento — usado para diferenciar os vazios. */
  totalCount: number;
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

  let query = supabase.from("stores").select(STORE_COLUMNS);

  if (filters.status === "ativas") query = query.eq("is_active", true);
  if (filters.status === "inativas") query = query.eq("is_active", false);

  const term = filters.q.trim();
  if (term) query = query.ilike("name", `%${escapeLikePattern(term)}%`);

  if (filters.category) query = query.eq("category", filters.category);

  const [listResponse, countResponse] = await Promise.all([
    query.order("name", { ascending: true }),
    supabase.from("stores").select("id", { count: "exact", head: true }),
  ]);

  if (listResponse.error) {
    console.error("[lojas] falha ao listar", listResponse.error);
    return {
      stores: [],
      totalCount: 0,
      error:
        "Não foi possível carregar as lojas. Verifique a conexão e tente novamente.",
    };
  }

  return {
    stores: (listResponse.data as StoreRow[]).map(toStore),
    totalCount: countResponse.count ?? listResponse.data.length,
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
