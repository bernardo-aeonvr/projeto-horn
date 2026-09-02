import { RANGE_NOT_SATISFIABLE } from "@/lib/pagination";
import { createClient } from "@/lib/supabase/server";

import { DEFAULT_JOB_ROLES, mergeOptionNames } from "./format";
import {
  EMPTY_PROFESSIONAL_OPTIONS,
  PAGE_SIZE,
  PROFESSIONAL_COLUMNS,
  type Professional,
  type ProfessionalFilters,
  type ProfessionalOptions,
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
 * Os filtros da tela, aplicados no banco — em um lugar só.
 *
 * A listagem e a exportação leem exatamente esta consulta; o que muda entre as
 * duas é apenas o recorte de linhas. É o que garante que a planilha traga o
 * mesmo conjunto que a tela mostra, inclusive a semântica da busca (nome OU
 * e-mail, sem diferenciar acento de caixa).
 */
function filteredQuery(
  supabase: Awaited<ReturnType<typeof createClient>>,
  filters: ProfessionalFilters,
) {
  const selectColumns = filters.regionId
    ? `${PROFESSIONAL_COLUMNS}, professional_regions!inner(region_id)`
    : PROFESSIONAL_COLUMNS;

  let query = supabase
    .from("professionals")
    .select(selectColumns, { count: "exact" });

  if (filters.status === "ativos") query = query.eq("is_active", true);
  if (filters.status === "inativos") query = query.eq("is_active", false);

  if (filters.segmentId) query = query.eq("segment_id", filters.segmentId);

  /*
    Empresa e cargo são texto na linha do profissional, não referência.

    `ilike` sem curinga compara o valor inteiro sem diferenciar caixa — a mesma
    equivalência do índice único das opções (`lower(btrim(name))`) e do
    `optionKey` da tela. É o que garante que um cadastro gravado como "ALIÁS
    ARQUITETURA" continue aparecendo ao filtrar por "Aliás Arquitetura", em vez
    de sumir da lista sem explicação.

    O escape é o mesmo da busca por nome: sem ele, um "%" no nome da empresa
    viraria curinga e o filtro traria gente demais.
  */
  if (filters.company) {
    query = query.ilike("company", escapeLikePattern(filters.company));
  }

  if (filters.jobRole) {
    query = query.ilike("job_role", escapeLikePattern(filters.jobRole));
  }

  // Basta o profissional ter a região entre as dele.
  if (filters.regionId) {
    query = query.eq("professional_regions.region_id", filters.regionId);
  }

  const term = filters.q.trim();
  if (term) {
    const pattern = quoteOrValue(`%${escapeLikePattern(term)}%`);
    query = query.or(`name.ilike.${pattern},email.ilike.${pattern}`);
  }

  return query;
}

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

  const pageQuery = (page: number) => {
    const from = (page - 1) * PAGE_SIZE;
    return filteredQuery(supabase, filters)
      .order("name", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
  };

  let page = filters.page;

  const [firstAttempt, totalResponse] = await Promise.all([
    pageQuery(page),
    supabase.from("professionals").select("id", { count: "exact", head: true }),
  ]);
  let listResponse = firstAttempt;

  /*
    Página além do fim do resultado.

    Acontece com URL guardada e ao encolher o filtro sem voltar para a
    primeira página; o PostgREST responde 416/PGRST103. Não é falha de
    carregamento — é pedir a página 3 de algo que hoje tem uma —, então
    tratá-la como erro mostraria "verifique a conexão" e deixaria a tela sem
    saída, já que a paginação some junto com a lista.
  */
  if (listResponse.error?.code === RANGE_NOT_SATISFIABLE && page !== 1) {
    page = 1;
    listResponse = await pageQuery(page);
  }

  if (listResponse.error) {
    console.error("[profissionais] falha ao listar", listResponse.error);
    return EMPTY_RESULT(
      page,
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
    page,
    pageCount: Math.max(1, Math.ceil(filteredCount / PAGE_SIZE)),
    error: null,
  };
}

type RegionRow = { professional_id: string; regions: Region | Region[] | null };

/** Ids por consulta: um `in(...)` com milhares deles estoura a URL. */
const REGION_ID_CHUNK = 200;

/**
 * Regiões dos profissionais informados, agrupadas e ordenadas.
 *
 * Em lotes porque a exportação chama isto com a lista inteira: na página são
 * 25 ids, na planilha podem ser centenas, e o filtro do PostgREST viaja na
 * query string.
 */
async function fetchRegions(
  professionalIds: string[],
): Promise<Map<string, Region[]>> {
  const grouped = new Map<string, Region[]>();
  if (professionalIds.length === 0) return grouped;

  const supabase = await createClient();

  for (let start = 0; start < professionalIds.length; start += REGION_ID_CHUNK) {
    const chunk = professionalIds.slice(start, start + REGION_ID_CHUNK);
    const { data, error } = await supabase
      .from("professional_regions")
      .select("professional_id, regions(id, slug, name, sort_order)")
      .in("professional_id", chunk);

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
  }

  for (const regions of grouped.values()) {
    regions.sort((a, b) => a.sort_order - b.sort_order);
  }

  return grouped;
}

/** Linhas por ida ao banco na exportação. É o teto do PostgREST. */
const EXPORT_PAGE = 1000;

/** Teto de segurança da exportação. Documentado no aviso da tela. */
export const MAX_EXPORT_ROWS = 5000;

export type ProfessionalExportResult = {
  professionals: Professional[];
  /** True quando o teto foi atingido e a planilha não traz tudo. */
  truncated: boolean;
  error: string | null;
};

/**
 * TODOS os profissionais que atendem aos filtros, sem paginação de tela.
 *
 * Mesma consulta da listagem — `filteredQuery` —, só que percorrida até o fim.
 * A página continua sendo página: esta função é chamada só pela exportação, e
 * não muda nada do que o usuário está vendo.
 *
 * A RLS é a mesma de sempre: `professionals_admin_read` devolve a carteira do
 * próprio admin e nada além. Exportar não amplia o alcance de ninguém.
 */
export async function listProfessionalsForExport(
  filters: ProfessionalFilters,
): Promise<ProfessionalExportResult> {
  const supabase = await createClient();

  const rows: ProfessionalRow[] = [];
  let truncated = false;

  for (let offset = 0; offset < MAX_EXPORT_ROWS; offset += EXPORT_PAGE) {
    const size = Math.min(EXPORT_PAGE, MAX_EXPORT_ROWS - offset);

    const { data, error } = await filteredQuery(supabase, filters)
      .order("name", { ascending: true })
      .range(offset, offset + size - 1);

    if (error) {
      console.error("[profissionais] falha ao exportar", error);
      return {
        professionals: [],
        truncated: false,
        error:
          "Não foi possível montar a exportação. Verifique a conexão e tente novamente.",
      };
    }

    const page = (data ?? []) as unknown as ProfessionalRow[];
    rows.push(...page);

    if (page.length < size) break;
    // Encheu o teto: a próxima volta não acontece, e a tela avisa.
    if (offset + size >= MAX_EXPORT_ROWS) truncated = true;
  }

  const regionsByProfessional = await fetchRegions(rows.map((row) => row.id));

  return {
    professionals: rows.map((row) => ({
      ...row,
      segment: readSegment(row.segment),
      regions: regionsByProfessional.get(row.id) ?? [],
    })),
    truncated,
    error: null,
  };
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

/**
 * Nomes de um punhado de profissionais, por id.
 *
 * Existe para o ranking do dashboard: a agregação sai só com ids, e no fim são
 * cinco nomes (mais os empatados no quinto lugar) a resolver. Uma consulta
 * para todos, nunca uma por posição.
 *
 * Sem filtro de `is_active`, de propósito: o projeto de um profissional que
 * saiu da carteira ativa continua sendo história do período, e some do
 * relatório se o nome não vier. É a diferença para `listProfessionalOptions`,
 * que monta um seletor e por isso só oferece quem ainda está ativo.
 *
 * A RLS continua mandando: `professionals_admin_read` só devolve a carteira do
 * próprio admin. Para o usuário de loja esta função não responde nada — o
 * caminho dele é `listStoreProfessionalOptions`.
 */
export async function listProfessionalNames(
  ids: string[],
): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("professionals")
    .select("id, name")
    .in("id", ids);

  if (error || !data) {
    console.error("[profissionais] falha ao resolver nomes por id", error);
    return new Map();
  }

  return new Map(
    (data as { id: string; name: string }[]).map((row) => [row.id, row.name]),
  );
}

/**
 * Empresas e cargos já cadastrados, para os seletores do formulário.
 *
 * Uma consulta só, das duas listas: `professional_options` é pequena por
 * natureza (é a lista que cabe num seletor) e a RLS já a recorta no dono da
 * sessão — o que um admin cadastrou não aparece para o outro.
 *
 * Os cargos padrão entram aqui, e não no banco: uma conta nova precisa oferecer
 * "Sócio" e "Equipe" sem depender de seed nenhum. `mergeOptionNames` cuida de
 * não repetir quando eles também já existirem no catálogo.
 *
 * Falha de leitura devolve listas vazias em vez de derrubar a página: sem
 * opções o formulário ainda cadastra profissional — só não sugere nada.
 */
export async function listProfessionalOptions(): Promise<ProfessionalOptions> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("professional_options")
    .select("kind, name");

  if (error || !data) {
    console.error("[profissionais] falha ao carregar empresas e cargos", error);
    return {
      ...EMPTY_PROFESSIONAL_OPTIONS,
      job_role: mergeOptionNames([...DEFAULT_JOB_ROLES]),
    };
  }

  const rows = data as { kind: string; name: string }[];
  const namesOf = (kind: string) =>
    rows.filter((row) => row.kind === kind).map((row) => row.name);

  return {
    company: mergeOptionNames(namesOf("company")),
    job_role: mergeOptionNames(namesOf("job_role"), [...DEFAULT_JOB_ROLES]),
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
