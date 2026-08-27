import type { SubmittedValues } from "@/lib/form-values";

/**
 * Domínio Contatos — espelha public.contacts e public.contact_stores.
 *
 * Contato é um evento histórico, nunca um booleano no profissional: o mesmo
 * profissional pode ter vários contatos, em datas diferentes
 * (spec, seções 8.1 e 27, regra 4).
 */

/**
 * Valores do enum public.contact_channel, na ordem do banco.
 *
 * Esta é a definição canônica de canal no produto: formulário, filtro da
 * listagem, filtro do dashboard e validação leem daqui. Adicionar um canal é
 * acrescentar o valor aqui e no enum do banco — nenhuma tela mantém a própria
 * lista.
 *
 * `event` é o canal de contatos feitos em evento — visita, tour ou palestra na
 * loja. Não existe entidade de evento: o contato continua sendo um contato, com
 * profissional, data, lojas apresentadas e observação, e o que aconteceu no
 * evento é descrito na observação.
 */
export const CONTACT_CHANNELS = [
  "whatsapp",
  "phone",
  "instagram",
  "email",
  "other",
  "event",
] as const;

export type ContactChannel = (typeof CONTACT_CHANNELS)[number];

export const CHANNEL_LABELS: Record<ContactChannel, string> = {
  whatsapp: "WhatsApp",
  phone: "Ligação",
  instagram: "Instagram",
  email: "E-mail",
  other: "Outro",
  event: "Evento",
};

/** Loja apresentada em um contato — snapshot histórico. */
export type ContactStore = {
  id: string;
  name: string;
  /** Status atual da loja, só para sinalizar na interface. */
  is_active: boolean;
};

export type ContactProfessional = {
  id: string;
  name: string;
  segment_name: string | null;
};

export type Contact = {
  id: string;
  professional_id: string;
  contacted_at: string;
  channel: ContactChannel;
  notes: string | null;
  created_at: string;
  professional: ContactProfessional | null;
  /**
   * Lojas apresentadas naquele contato. Vem de contact_stores, nunca
   * recalculado a partir das lojas ativas hoje (spec, seção 8.5).
   */
  stores: ContactStore[];
};

/** Colunas de `contacts` + embed do profissional e do segmento dele. */
export const CONTACT_COLUMNS =
  "id, professional_id, contacted_at, channel, notes, created_at, professional:professionals!inner(id, name, segment:segments(name))";

export const PERIOD_PRESETS = [
  "todos",
  "hoje",
  "semana",
  "mes",
  "personalizado",
] as const;
export type PeriodPreset = (typeof PERIOD_PRESETS)[number];

export const PERIOD_LABELS: Record<PeriodPreset, string> = {
  todos: "Todo o período",
  hoje: "Hoje",
  semana: "Esta semana",
  mes: "Este mês",
  personalizado: "Personalizado",
};

export type ContactFilters = {
  /** Busca pelo nome do profissional. */
  q: string;
  channel: ContactChannel | "";
  period: PeriodPreset;
  /** Datas ISO `AAAA-MM-DD`, usadas quando period = personalizado. */
  from: string;
  to: string;
  /** Id da loja apresentada, ou string vazia para todas. */
  storeId: string;
  page: number;
};

export const PAGE_SIZE = 25;

export function parseChannel(value: string | undefined): ContactChannel | "" {
  return CONTACT_CHANNELS.includes(value as ContactChannel)
    ? (value as ContactChannel)
    : "";
}

export function parsePeriod(value: string | undefined): PeriodPreset {
  return PERIOD_PRESETS.includes(value as PeriodPreset)
    ? (value as PeriodPreset)
    : "todos";
}

export function parsePage(value: string | undefined): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
}

export type ContactFormField =
  "professional_id" | "contacted_at" | "channel" | "store_ids" | "notes";

export type ContactFormState = {
  status: "idle" | "error" | "success";
  message: string | null;
  fieldErrors: Partial<Record<ContactFormField, string>>;
  succeededAt: number | null;
  /** Valores enviados, devolvidos para repovoar o formulário após erro. */
  values: SubmittedValues | null;
  /**
   * Muda a cada tentativa malsucedida. O formulário usa como `key` dos
   * campos para remontá-los com os valores acima.
   */
  attemptedAt: number | null;
};

export const initialContactFormState: ContactFormState = {
  status: "idle",
  message: null,
  fieldErrors: {},
  succeededAt: null,
  values: null,
  attemptedAt: null,
};
