import { createClient } from "@/lib/supabase/server";

import { resolvePeriod } from "./period";
import {
  CONTACT_COLUMNS,
  PAGE_SIZE,
  type Contact,
  type ContactFilters,
  type ContactStore,
} from "./types";

function escapeLikePattern(value: string) {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

type EmbeddedSegment = { name: string } | { name: string }[] | null;
type EmbeddedProfessional =
  | { id: string; name: string; segment: EmbeddedSegment }
  | { id: string; name: string; segment: EmbeddedSegment }[]
  | null;

type ContactRow = Omit<Contact, "professional" | "stores"> & {
  professional: EmbeddedProfessional;
};

function readProfessional(value: EmbeddedProfessional) {
  const row = Array.isArray(value) ? value[0] : value;
  if (!row) return null;

  const segment = Array.isArray(row.segment) ? row.segment[0] : row.segment;

  return {
    id: row.id,
    name: row.name,
    segment_name: segment?.name ?? null,
  };
}

export type ContactListResult = {
  contacts: Contact[];
  filteredCount: number;
  /** Total sem filtro — separa "base vazia" de "busca sem resultado". */
  totalCount: number;
  page: number;
  pageCount: number;
  error: string | null;
};

/**
 * Lista contatos paginados com os filtros da tela aplicados no banco.
 *
 * Duas consultas por página, ambas limitadas: os contatos da página e, em
 * seguida, as lojas apresentadas apenas nesses contatos. Trazer as lojas no
 * mesmo embed quebraria o filtro por loja — o `!inner` restringiria o embed
 * à loja filtrada e a lista esconderia as demais lojas do contato.
 */
export async function listContacts(
  filters: ContactFilters,
): Promise<ContactListResult> {
  const supabase = await createClient();

  const selectColumns = filters.storeId
    ? `${CONTACT_COLUMNS}, contact_stores!inner(store_id)`
    : CONTACT_COLUMNS;

  let query = supabase
    .from("contacts")
    .select(selectColumns, { count: "exact" });

  const term = filters.q.trim();
  if (term) {
    // Filtro sobre o recurso embutido; o professionals!inner já está no select.
    query = query.ilike("professional.name", `%${escapeLikePattern(term)}%`);
  }

  if (filters.channel) query = query.eq("channel", filters.channel);

  if (filters.storeId) {
    query = query.eq("contact_stores.store_id", filters.storeId);
  }

  const { from, to } = resolvePeriod(filters.period, filters.from, filters.to);
  if (from) query = query.gte("contacted_at", from);
  if (to) query = query.lt("contacted_at", to);

  const offset = (filters.page - 1) * PAGE_SIZE;

  const [listResponse, totalResponse] = await Promise.all([
    query
      .order("contacted_at", { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1),
    supabase.from("contacts").select("id", { count: "exact", head: true }),
  ]);

  if (listResponse.error) {
    console.error("[contatos] falha ao listar", listResponse.error);
    return {
      contacts: [],
      filteredCount: 0,
      totalCount: 0,
      page: filters.page,
      pageCount: 1,
      error:
        "Não foi possível carregar os contatos. Verifique a conexão e tente novamente.",
    };
  }

  const rows = (listResponse.data ?? []) as unknown as ContactRow[];
  const storesByContact = await fetchContactStores(rows.map((row) => row.id));
  const filteredCount = listResponse.count ?? rows.length;

  return {
    contacts: rows.map((row) => ({
      ...row,
      professional: readProfessional(row.professional),
      stores: storesByContact.get(row.id) ?? [],
    })),
    filteredCount,
    totalCount: totalResponse.count ?? filteredCount,
    page: filters.page,
    pageCount: Math.max(1, Math.ceil(filteredCount / PAGE_SIZE)),
    error: null,
  };
}

type ContactStoreRow = {
  contact_id: string;
  stores:
    | { id: string; name: string; is_active: boolean }
    | { id: string; name: string; is_active: boolean }[]
    | null;
};

/**
 * Lojas apresentadas nos contatos informados, agrupadas por contato.
 *
 * Lê de contact_stores, que é o snapshot do momento do contato — uma loja
 * inativada depois continua aparecendo aqui.
 */
async function fetchContactStores(
  contactIds: string[],
): Promise<Map<string, ContactStore[]>> {
  const grouped = new Map<string, ContactStore[]>();
  if (contactIds.length === 0) return grouped;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("contact_stores")
    .select("contact_id, stores(id, name, is_active)")
    .in("contact_id", contactIds);

  if (error || !data) {
    console.error("[contatos] falha ao carregar lojas apresentadas", error);
    return grouped;
  }

  for (const row of data as unknown as ContactStoreRow[]) {
    const store = Array.isArray(row.stores) ? row.stores[0] : row.stores;
    if (!store) continue;

    const current = grouped.get(row.contact_id) ?? [];
    current.push(store);
    grouped.set(row.contact_id, current);
  }

  for (const stores of grouped.values()) {
    stores.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  }

  return grouped;
}

/** Histórico completo de um profissional, do mais recente para o mais antigo. */
export async function listContactsByProfessional(
  professionalId: string,
): Promise<Contact[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("contacts")
    .select(CONTACT_COLUMNS)
    .eq("professional_id", professionalId)
    .order("contacted_at", { ascending: false });

  if (error || !data) {
    console.error("[contatos] falha ao carregar histórico", error);
    return [];
  }

  const rows = data as unknown as ContactRow[];
  const storesByContact = await fetchContactStores(rows.map((row) => row.id));

  return rows.map((row) => ({
    ...row,
    professional: readProfessional(row.professional),
    stores: storesByContact.get(row.id) ?? [],
  }));
}

/** Um contato com as lojas apresentadas, para a edição. */
export async function getContact(id: string): Promise<Contact | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("contacts")
    .select(CONTACT_COLUMNS)
    .eq("id", id)
    .maybeSingle();

  if (error || !data) return null;

  const row = data as unknown as ContactRow;
  const stores = await fetchContactStores([row.id]);

  return {
    ...row,
    professional: readProfessional(row.professional),
    stores: stores.get(row.id) ?? [],
  };
}

export type StoreOption = { id: string; name: string; is_active: boolean };

/**
 * Lojas ativas, que o formulário oferece para marcação.
 *
 * Só as ativas são oferecidas: uma loja inativa não é mais representada e não
 * deve entrar em contatos novos (spec, seção 25.4). A seleção em si começa
 * vazia — ver a nota em contact-form.tsx.
 */
export async function listActiveStores(): Promise<StoreOption[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("stores")
    .select("id, name, is_active")
    .eq("is_active", true)
    .order("name", { ascending: true });

  if (error || !data) {
    console.error("[contatos] falha ao carregar lojas ativas", error);
    return [];
  }

  return data as StoreOption[];
}

/** Todas as lojas, para o filtro por loja apresentada da listagem. */
export async function listAllStores(): Promise<StoreOption[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("stores")
    .select("id, name, is_active")
    .order("name", { ascending: true });

  if (error || !data) return [];

  return data as StoreOption[];
}

export type ProfessionalOption = {
  id: string;
  name: string;
  segment_name: string | null;
};

type ProfessionalOptionRow = {
  id: string;
  name: string;
  segment: { name: string } | { name: string }[] | null;
};

/**
 * Profissionais que podem receber contato.
 *
 * Traz os ativos e, na edição, garante que o profissional já registrado
 * apareça mesmo que tenha sido inativado depois.
 */
export async function listProfessionalOptions(
  includeId?: string | null,
): Promise<ProfessionalOption[]> {
  const supabase = await createClient();

  let query = supabase
    .from("professionals")
    .select("id, name, segment:segments(name)")
    .order("name", { ascending: true });

  query = includeId
    ? query.or(`is_active.eq.true,id.eq.${includeId}`)
    : query.eq("is_active", true);

  const { data, error } = await query;

  if (error || !data) {
    console.error("[contatos] falha ao carregar profissionais", error);
    return [];
  }

  return (data as unknown as ProfessionalOptionRow[]).map((row) => {
    const segment = Array.isArray(row.segment) ? row.segment[0] : row.segment;
    return { id: row.id, name: row.name, segment_name: segment?.name ?? null };
  });
}
