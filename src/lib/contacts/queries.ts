import { RANGE_NOT_SATISFIABLE } from "@/lib/pagination";
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
 * Colunas pedidas ao PostgREST.
 *
 * Com filtro de loja entra o `contact_stores!inner`, que é o que permite
 * filtrar por loja apresentada. Ele NÃO serve para exibir as lojas: sendo
 * `inner` e filtrado, o embed traria só a loja escolhida e a tela esconderia
 * as outras que foram apresentadas junto. Quem as traz é `fetchContactStores`.
 */
function selectColumns(filters: ContactFilters): string {
  return filters.storeId
    ? `${CONTACT_COLUMNS}, contact_stores!inner(store_id)`
    : CONTACT_COLUMNS;
}

/** O mínimo do construtor do PostgREST que o recorte compartilhado usa. */
interface ScopedQuery {
  ilike(column: string, pattern: string): this;
  eq(column: string, value: string): this;
  gte(column: string, value: string): this;
  lt(column: string, value: string): this;
}

/**
 * Busca, canal, loja apresentada e período — o recorte inteiro da tela.
 *
 * Uma definição só, usada pela listagem paginada e pela exportação. É o que
 * garante que a planilha traga exatamente as linhas que a tela conta: não
 * existe um segundo conjunto de filtros para divergir do primeiro.
 */
function applyContactFilters<T>(query: T, filters: ContactFilters): T {
  /*
    O construtor entra e sai pelo mesmo tipo, mas dentro daqui ele é visto
    apenas como `ScopedQuery`. Amarrar o genérico à interface faria o
    TypeScript instanciar os tipos gerados do PostgREST a cada chamada, o que
    estoura o limite de profundidade na consulta com embeds.
  */
  let scoped = query as ScopedQuery;

  const term = filters.q.trim();
  if (term) {
    // Filtro sobre o recurso embutido; o professionals!inner já está no select.
    scoped = scoped.ilike("professional.name", `%${escapeLikePattern(term)}%`);
  }

  if (filters.channel) scoped = scoped.eq("channel", filters.channel);

  if (filters.storeId) {
    scoped = scoped.eq("contact_stores.store_id", filters.storeId);
  }

  const { from, to } = resolvePeriod(filters.period, filters.from, filters.to);
  if (from) scoped = scoped.gte("contacted_at", from);
  if (to) scoped = scoped.lt("contacted_at", to);

  return scoped as T;
}

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

  const pageQuery = (page: number) => {
    const offset = (page - 1) * PAGE_SIZE;
    return applyContactFilters(
      supabase
        .from("contacts")
        .select(selectColumns(filters), { count: "exact" }),
      filters,
    )
      .order("contacted_at", { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1);
  };

  let page = filters.page;

  const [firstAttempt, totalResponse] = await Promise.all([
    pageQuery(page),
    supabase.from("contacts").select("id", { count: "exact", head: true }),
  ]);
  let listResponse = firstAttempt;

  // Página além do fim do resultado: volta para a primeira em vez de virar
  // erro de carregamento. Ver a nota em `@/lib/pagination`.
  if (listResponse.error?.code === RANGE_NOT_SATISFIABLE && page !== 1) {
    page = 1;
    listResponse = await pageQuery(page);
  }

  if (listResponse.error) {
    console.error("[contatos] falha ao listar", listResponse.error);
    return {
      contacts: [],
      filteredCount: 0,
      totalCount: 0,
      page,
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
    page,
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

/** Ids por consulta: um `in(...)` com milhares deles estoura a URL. */
const CONTACT_ID_CHUNK = 200;

/**
 * Lojas apresentadas nos contatos informados, agrupadas por contato.
 *
 * Lê de contact_stores, que é o snapshot do momento do contato — uma loja
 * inativada depois continua aparecendo aqui.
 *
 * Em lotes porque a exportação chama isto com a lista inteira: na página são
 * 25 ids, na planilha podem ser milhares, e o filtro do PostgREST viaja na
 * query string. Uma consulta por lote, nunca uma por contato.
 */
async function fetchContactStores(
  contactIds: string[],
): Promise<Map<string, ContactStore[]>> {
  const grouped = new Map<string, ContactStore[]>();
  if (contactIds.length === 0) return grouped;

  const supabase = await createClient();

  for (let start = 0; start < contactIds.length; start += CONTACT_ID_CHUNK) {
    const chunk = contactIds.slice(start, start + CONTACT_ID_CHUNK);
    const { data, error } = await supabase
      .from("contact_stores")
      .select("contact_id, stores(id, name, is_active)")
      .in("contact_id", chunk);

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
  }

  for (const stores of grouped.values()) {
    stores.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  }

  return grouped;
}

// --------------------------------------------------------------------------
// Exportação
// --------------------------------------------------------------------------

/** Linhas por ida ao banco na exportação. É o teto do PostgREST. */
const EXPORT_PAGE = 1000;

/** Teto de segurança da exportação. Documentado no aviso da tela. */
export const MAX_EXPORT_ROWS = 5000;

export type ContactExportResult = {
  contacts: Contact[];
  /** True quando o teto foi atingido e a planilha não traz tudo. */
  truncated: boolean;
  error: string | null;
};

/**
 * TODOS os contatos que atendem aos filtros, sem a paginação da tela.
 *
 * Mesmo recorte da listagem — `applyContactFilters`, a mesma função que
 * `listContacts` usa —, só que percorrido até o fim. A página continua sendo
 * página: esta função é chamada só pela exportação e não muda nada do que o
 * usuário está vendo.
 *
 * A ordenação é a da tela (contato mais recente primeiro), com o id como
 * critério de desempate. Sem ele, dois contatos registrados no mesmo instante
 * poderiam trocar de lugar entre duas idas ao banco e cair na planilha
 * duplicados — ou nem cair.
 *
 * As lojas apresentadas vêm depois, em lotes, para TODOS os contatos de uma
 * vez. Duas coisas dependem disso: não haver uma consulta por contato, e o
 * contato filtrado por uma loja continuar mostrando as outras lojas que
 * estavam junto naquele dia — o `!inner` do filtro recortaria o embed.
 */
export async function listContactsForExport(
  filters: ContactFilters,
): Promise<ContactExportResult> {
  const supabase = await createClient();

  const rows: ContactRow[] = [];
  let truncated = false;

  for (let offset = 0; offset < MAX_EXPORT_ROWS; offset += EXPORT_PAGE) {
    const size = Math.min(EXPORT_PAGE, MAX_EXPORT_ROWS - offset);

    const { data, error } = await applyContactFilters(
      supabase.from("contacts").select(selectColumns(filters)),
      filters,
    )
      .order("contacted_at", { ascending: false })
      .order("id", { ascending: true })
      .range(offset, offset + size - 1);

    if (error) {
      console.error("[contatos] falha ao exportar", error);
      return {
        contacts: [],
        truncated: false,
        error:
          "Não foi possível montar a exportação. Verifique a conexão e tente novamente.",
      };
    }

    const page = (data ?? []) as unknown as ContactRow[];
    rows.push(...page);

    if (page.length < size) break;
    // Encheu o teto: a próxima volta não acontece, e a tela avisa.
    if (offset + size >= MAX_EXPORT_ROWS) truncated = true;
  }

  const storesByContact = await fetchContactStores(rows.map((row) => row.id));

  return {
    contacts: rows.map((row) => ({
      ...row,
      professional: readProfessional(row.professional),
      stores: storesByContact.get(row.id) ?? [],
    })),
    truncated,
    error: null,
  };
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
