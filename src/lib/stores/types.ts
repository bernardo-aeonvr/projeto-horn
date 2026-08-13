/**
 * Domínio Lojas — espelha public.stores (supabase/schema.sql, seção 2).
 *
 * Os nomes dos campos são exatamente os do banco para evitar uma camada de
 * tradução desnecessária entre a query e a UI.
 */
export type Store = {
  id: string;
  name: string;
  category: string | null;
  contact_name: string | null;
  phone: string | null;
  is_active: boolean;
  /** Informação contratual. Não entra no cálculo de comissão das propostas. */
  monthly_fixed_fee: number | null;
  /** Percentual inteiro: 3 significa 3%. O CHECK do banco limita a 0..100. */
  default_commission_percent: number | null;
  /** Formato ISO `AAAA-MM-DD` (coluna `date`). */
  start_date: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

/** Colunas selecionadas nas listagens. Mantém a query e o tipo em sincronia. */
export const STORE_COLUMNS =
  "id, name, category, contact_name, phone, is_active, monthly_fixed_fee, default_commission_percent, start_date, notes, created_at, updated_at";

export const STORE_STATUS_FILTERS = ["todas", "ativas", "inativas"] as const;
export type StoreStatusFilter = (typeof STORE_STATUS_FILTERS)[number];

export type StoreFilters = {
  /** Busca por nome da loja. */
  q: string;
  status: StoreStatusFilter;
  /** Segmento exato, ou string vazia para todos. */
  category: string;
};

export function parseStatusFilter(value: string | undefined): StoreStatusFilter {
  return STORE_STATUS_FILTERS.includes(value as StoreStatusFilter)
    ? (value as StoreStatusFilter)
    : "todas";
}

/** Campos do formulário que podem receber erro de validação. */
export type StoreFormField =
  | "name"
  | "category"
  | "contact_name"
  | "phone"
  | "monthly_fixed_fee"
  | "default_commission_percent"
  | "start_date"
  | "notes";

export type StoreFormState = {
  status: "idle" | "error" | "success";
  message: string | null;
  fieldErrors: Partial<Record<StoreFormField, string>>;
  /**
   * Timestamp do último envio bem-sucedido. O formulário observa a mudança
   * para fechar o painel e disparar o toast.
   */
  succeededAt: number | null;
};

export const initialStoreFormState: StoreFormState = {
  status: "idle",
  message: null,
  fieldErrors: {},
  succeededAt: null,
};
