import type { SubmittedValues } from "@/lib/form-values";

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
  /**
   * Caminho do logotipo no bucket `store-logos`, ou null. Opcional: a loja
   * funciona sem ele, e a maioria não tem. A URL pública sai de
   * `storeLogoUrl` — não é guardada aqui.
   */
  logo_path: string | null;
  created_at: string;
  updated_at: string;
};

/** Colunas selecionadas nas listagens. Mantém a query e o tipo em sincronia. */
export const STORE_COLUMNS =
  "id, name, category, contact_name, phone, is_active, monthly_fixed_fee, default_commission_percent, start_date, notes, logo_path, created_at, updated_at";

export const STORE_STATUS_FILTERS = ["todas", "ativas", "inativas"] as const;
export type StoreStatusFilter = (typeof STORE_STATUS_FILTERS)[number];

export type StoreFilters = {
  /** Busca por nome da loja. */
  q: string;
  status: StoreStatusFilter;
  /** Segmento exato, ou string vazia para todos. */
  category: string;
  page: number;
};

/** Registros por página. Mesmo tamanho dos demais módulos da aplicação. */
export const PAGE_SIZE = 25;

export function parsePage(value: string | undefined): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
}

export function parseStatusFilter(
  value: string | undefined,
): StoreStatusFilter {
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
  /** Valores enviados, devolvidos para repovoar o formulário após erro. */
  values: SubmittedValues | null;
  /**
   * Muda a cada tentativa malsucedida. O formulário usa como `key` dos
   * campos para remontá-los com os valores acima.
   */
  attemptedAt: number | null;
  /**
   * Id da loja recém-cadastrada.
   *
   * Só o cadastro preenche, e existe por causa do logotipo: a imagem só pode
   * ser enviada para a pasta de uma loja que já existe, então o formulário
   * precisa saber qual loja acabou de nascer para subir o arquivo em seguida.
   */
  createdId: string | null;
};

export const initialStoreFormState: StoreFormState = {
  status: "idle",
  message: null,
  fieldErrors: {},
  succeededAt: null,
  values: null,
  attemptedAt: null,
  createdId: null,
};

// --------------------------------------------------------------------------
// Acesso da loja
// --------------------------------------------------------------------------
// Vivem aqui, e não junto das actions, porque um módulo "use server" só pode
// exportar funções assíncronas — um objeto exportado de lá quebra o RSC.

export type StoreAccessFormState = {
  status: "idle" | "success" | "error";
  message: string | null;
  fieldErrors: Record<string, string>;
  /**
   * Senha provisória recém-gerada, para o administrador entregar à loja.
   * Aparece uma única vez: não é guardada em lugar nenhum, e o banco só tem o
   * hash produzido pelo Supabase Auth.
   */
  provisionalPassword: string | null;
  /** E-mail do acesso recém-criado, exibido junto da senha provisória. */
  provisionalEmail: string | null;
  succeededAt: number | null;
};

export const initialStoreAccessFormState: StoreAccessFormState = {
  status: "idle",
  message: null,
  fieldErrors: {},
  provisionalPassword: null,
  provisionalEmail: null,
  succeededAt: null,
};

export type StoreAccessResult = {
  ok: boolean;
  message: string;
  /** Senha provisória, quando a ação gerou uma. Exibida uma única vez. */
  password?: string;
};
