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
  /** Escritório, estúdio ou empresa. Nulo para autônomos e cadastros antigos. */
  company: string | null;
  /** Cargo dentro da empresa. Nulo para quem não tem, e para cadastros antigos. */
  job_role: string | null;
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
  created_at: string;
  updated_at: string;
  /** Resolvido pelo embed do segmento. */
  segment: Segment | null;
  /** Carregado em consulta separada, já ordenado por `sort_order`. */
  regions: Region[];
};

/** Colunas de `professionals` + embed do segmento. */
export const PROFESSIONAL_COLUMNS =
  "id, name, segment_id, company, job_role, email, instagram, phone, address, postal_code, city, state, birthday_day, birthday_month, notes, created_at, updated_at, segment:segments(id, slug, name)";

export type ProfessionalFilters = {
  /** Busca por nome ou e-mail. */
  q: string;
  /** Id do segmento, ou string vazia para todos. */
  segmentId: string;
  /** Id da região, ou string vazia para todas. */
  regionId: string;
  /**
   * Nome da empresa, ou string vazia para todas.
   *
   * Vai o NOME e não um id: é o que o profissional guarda. O valor vem do
   * mesmo catálogo que o formulário usa, então é sempre uma grafia canônica.
   */
  company: string;
  /** Nome do cargo, ou string vazia para todos. Mesma ideia da empresa. */
  jobRole: string;
  /** Página atual, começando em 1. */
  page: number;
};

/** Registros por página. A base real tem ~435 profissionais e vai crescer. */
export const PAGE_SIZE = 25;

export function parsePage(value: string | undefined): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
}

export type ProfessionalFormField =
  | "name"
  | "segment_id"
  | "company"
  | "job_role"
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

/**
 * As duas listas reutilizáveis do formulário: empresa e cargo.
 *
 * Espelha `public.professional_options`. O profissional guarda o TEXTO
 * escolhido, não uma referência — a lista existe para escolher em vez de
 * digitar, e é o que impede a mesma empresa de virar três.
 */
export const PROFESSIONAL_OPTION_KINDS = ["company", "job_role"] as const;

export type ProfessionalOptionKind =
  (typeof PROFESSIONAL_OPTION_KINDS)[number];

/** Nomes já cadastrados, por lista, em ordem alfabética. */
export type ProfessionalOptions = Record<ProfessionalOptionKind, string[]>;

export const EMPTY_PROFESSIONAL_OPTIONS: ProfessionalOptions = {
  company: [],
  job_role: [],
};

export function parseProfessionalOptionKind(
  value: unknown,
): ProfessionalOptionKind | null {
  return PROFESSIONAL_OPTION_KINDS.includes(value as ProfessionalOptionKind)
    ? (value as ProfessionalOptionKind)
    : null;
}

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
