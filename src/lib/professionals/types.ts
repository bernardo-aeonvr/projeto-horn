import type { SubmittedValues } from "@/lib/form-values";

/**
 * Domínio Profissionais — espelha public.professionals, public.segments,
 * public.regions e a relação public.professional_regions.
 */

export type Segment = {
  id: string;
  slug: string;
  name: string;
};

export type Region = {
  id: string;
  slug: string;
  name: string;
  sort_order: number;
};

export type Professional = {
  id: string;
  name: string;
  segment_id: string;
  email: string | null;
  instagram: string | null;
  phone: string | null;
  address: string | null;
  postal_code: string | null;
  city: string | null;
  state: string | null;
  /** Dia e mês andam sempre juntos: CHECK `professionals_birthday_pair`. */
  birthday_day: number | null;
  birthday_month: number | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  /** Resolvido pelo embed do segmento. */
  segment: Segment | null;
  /** Carregado em consulta separada, já ordenado por `sort_order`. */
  regions: Region[];
};

/** Colunas de `professionals` + embed do segmento. */
export const PROFESSIONAL_COLUMNS =
  "id, name, segment_id, email, instagram, phone, address, postal_code, city, state, birthday_day, birthday_month, notes, is_active, created_at, updated_at, segment:segments(id, slug, name)";

export const PROFESSIONAL_STATUS_FILTERS = [
  "todos",
  "ativos",
  "inativos",
] as const;
export type ProfessionalStatusFilter =
  (typeof PROFESSIONAL_STATUS_FILTERS)[number];

export type ProfessionalFilters = {
  /** Busca por nome ou e-mail. */
  q: string;
  status: ProfessionalStatusFilter;
  /** Id do segmento, ou string vazia para todos. */
  segmentId: string;
  /** Id da região, ou string vazia para todas. */
  regionId: string;
  /** Página atual, começando em 1. */
  page: number;
};

/** Registros por página. A base real tem ~435 profissionais e vai crescer. */
export const PAGE_SIZE = 25;

export function parseProfessionalStatus(
  value: string | undefined,
): ProfessionalStatusFilter {
  return PROFESSIONAL_STATUS_FILTERS.includes(value as ProfessionalStatusFilter)
    ? (value as ProfessionalStatusFilter)
    : "todos";
}

export function parsePage(value: string | undefined): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
}

export type ProfessionalFormField =
  | "name"
  | "segment_id"
  | "email"
  | "instagram"
  | "phone"
  | "address"
  | "postal_code"
  | "city"
  | "state"
  | "birthday"
  | "regions"
  | "notes";

export type ProfessionalFormState = {
  status: "idle" | "error" | "success";
  message: string | null;
  fieldErrors: Partial<Record<ProfessionalFormField, string>>;
  succeededAt: number | null;
  /** Valores enviados, devolvidos para repovoar o formulário após erro. */
  values: SubmittedValues | null;
  /**
   * Muda a cada tentativa malsucedida. O formulário usa como `key` dos
   * campos para remontá-los com os valores acima.
   */
  attemptedAt: number | null;
};

export const initialProfessionalFormState: ProfessionalFormState = {
  status: "idle",
  message: null,
  fieldErrors: {},
  succeededAt: null,
  values: null,
  attemptedAt: null,
};
