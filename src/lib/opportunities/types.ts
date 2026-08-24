import type { SubmittedValues } from "@/lib/form-values";

/**
 * Domínio Projetos & Propostas — espelha public.opportunities,
 * public.opportunity_status_history e public.proposal_attachments.
 *
 * Uma oportunidade é a demanda concreta de UM profissional para UMA loja
 * (spec, seção 10.2). Se o profissional pede mármore e marcenaria, são dois
 * registros independentes, cada um com status, valores, PDFs e comissão
 * próprios.
 *
 * A plataforma não executa a negociação: envio, negociação, aceite e recusa
 * acontecem fora dela. Aqui só se registra o que já aconteceu (spec, seção 2).
 */

/** Valores do enum public.opportunity_status, na ordem do funil. */
export const OPPORTUNITY_STATUSES = [
  "project_received",
  "waiting_store_proposal",
  "proposal_received",
  "proposal_sent_to_professional",
  "negotiating",
  "closed",
  "lost",
] as const;

export type OpportunityStatus = (typeof OPPORTUNITY_STATUSES)[number];

/** Status em que o negócio ainda está vivo. */
export const OPEN_STATUSES: OpportunityStatus[] = [
  "project_received",
  "waiting_store_proposal",
  "proposal_received",
  "proposal_sent_to_professional",
  "negotiating",
];

/** Rótulos completos, usados no detalhe e na timeline. */
export const STATUS_LABELS: Record<OpportunityStatus, string> = {
  project_received: "Projeto recebido",
  waiting_store_proposal: "Aguardando proposta da loja",
  proposal_received: "Proposta recebida",
  proposal_sent_to_professional: "Proposta enviada ao profissional",
  negotiating: "Em negociação",
  closed: "Fechada",
  lost: "Perdida",
};

/** Versão curta, para caber nos badges da listagem e nos filtros. */
export const STATUS_BADGE_LABELS: Record<OpportunityStatus, string> = {
  ...STATUS_LABELS,
  waiting_store_proposal: "Aguardando proposta",
  proposal_sent_to_professional: "Proposta enviada",
};

/**
 * O que cada status significa. Aparece como apoio nos diálogos de movimentação
 * para deixar explícito que o fato aconteceu fora da plataforma.
 */
export const STATUS_MEANINGS: Record<OpportunityStatus, string> = {
  project_received:
    "O profissional enviou a demanda para a HORN por fora da plataforma.",
  waiting_store_proposal:
    "A HORN já encaminhou o projeto à loja por fora e aguarda o retorno dela.",
  proposal_received: "A loja devolveu a proposta à HORN por fora da plataforma.",
  proposal_sent_to_professional:
    "A HORN encaminhou a proposta ao profissional por fora da plataforma.",
  negotiating: "O profissional está negociando os termos fora da plataforma.",
  closed: "Houve aceite externo e o negócio foi fechado.",
  lost: "O negócio não foi fechado.",
};

/**
 * Rótulo da ação que leva a cada status.
 *
 * Sempre no formato "Marcar/Registrar": a aplicação não envia projeto nem
 * proposta, apenas registra que isso já foi feito (spec, seção 16.4).
 */
export const STATUS_ACTION_LABELS: Record<OpportunityStatus, string> = {
  project_received: "Voltar para projeto recebido",
  waiting_store_proposal: "Marcar como aguardando proposta",
  proposal_received: "Registrar proposta recebida",
  proposal_sent_to_professional: "Marcar proposta como enviada",
  negotiating: "Marcar como em negociação",
  closed: "Marcar como fechada",
  lost: "Marcar como perdida",
};

/**
 * Próximos passos sugeridos a partir do status atual.
 *
 * Orienta o fluxo principal sem bloquear correções: qualquer status continua
 * alcançável pela ação de correção administrativa.
 */
export const NEXT_STATUSES: Record<OpportunityStatus, OpportunityStatus[]> = {
  project_received: ["waiting_store_proposal", "lost"],
  waiting_store_proposal: ["proposal_received", "lost"],
  proposal_received: ["proposal_sent_to_professional", "lost"],
  proposal_sent_to_professional: ["negotiating", "closed", "lost"],
  negotiating: ["closed", "lost"],
  closed: [],
  lost: [],
};

/**
 * Quantos projetos existem em cada status dentro do recorte atual.
 *
 * Sempre traz os sete status do enum, inclusive os que a listagem não exibe em
 * card. Nenhum status é somado dentro de outro: `proposal_received` continua
 * separado de `proposal_sent_to_professional`.
 */
export type OpportunityStatusCounts = Record<OpportunityStatus, number>;

export const EMPTY_STATUS_COUNTS: OpportunityStatusCounts = {
  project_received: 0,
  waiting_store_proposal: 0,
  proposal_received: 0,
  proposal_sent_to_professional: 0,
  negotiating: 0,
  closed: 0,
  lost: 0,
};

/** Transições que pedem dados adicionais antes de gravar. */
export function statusNeedsDetails(status: OpportunityStatus): boolean {
  return (
    status === "proposal_received" || status === "closed" || status === "lost"
  );
}

export type OpportunityProfessional = {
  id: string;
  name: string;
  segment_name: string | null;
};

export type OpportunityStore = {
  id: string;
  name: string;
  is_active: boolean;
  /** Percentual vigente hoje. Não recalcula negócios antigos. */
  default_commission_percent: number | null;
};

export type Opportunity = {
  id: string;
  professional_id: string;
  store_id: string;
  title: string | null;
  notes: string | null;
  status: OpportunityStatus;
  /** Valor devolvido inicialmente pela loja. Nunca sobrescrito pelo final. */
  proposal_initial_value: number | null;
  /** Valor efetivamente negociado e aceito por fora. Base da comissão. */
  final_closed_value: number | null;
  /**
   * Percentual preservado no negócio. Gravado a partir da loja no momento da
   * criação pelo trigger `prepare_opportunity`, para que uma mudança futura no
   * cadastro da loja não altere resultados antigos (spec, seção 10.4).
   */
  commission_percent: number | null;
  /**
   * Coluna gerada pelo banco: `final_closed_value * commission_percent / 100`,
   * e somente quando o status é `closed`. Não é enviada pela aplicação.
   */
  commission_value: number | null;
  loss_reason: string | null;
  created_at: string;
  updated_at: string;
  professional: OpportunityProfessional | null;
  store: OpportunityStore | null;
};

/** Colunas de `opportunities` + embeds do profissional e da loja. */
export const OPPORTUNITY_COLUMNS =
  "id, professional_id, store_id, title, notes, status, proposal_initial_value, " +
  "final_closed_value, commission_percent, commission_value, loss_reason, " +
  "created_at, updated_at, " +
  "professional:professionals!inner(id, name, segment:segments(name)), " +
  "store:stores!inner(id, name, is_active, default_commission_percent)";

/** Um evento de `opportunity_status_history`, escrito por trigger. */
export type OpportunityStatusEvent = {
  id: string;
  from_status: OpportunityStatus | null;
  to_status: OpportunityStatus;
  changed_at: string;
  changed_by: string | null;
  /** Resolvido em consulta separada: não há FK direta para user_profiles. */
  changed_by_name: string | null;
};

export type ProposalAttachment = {
  id: string;
  opportunity_id: string;
  storage_path: string;
  file_name: string;
  size_bytes: number | null;
  created_at: string;
};

/** Tudo que o painel de detalhe carrega sob demanda. */
export type OpportunityDetails = {
  history: OpportunityStatusEvent[];
  attachments: ProposalAttachment[];
  error: string | null;
};

/**
 * "abertas" agrupa tudo que não é fechada nem perdida (spec, seção 16.2).
 * Os demais valores são os próprios status do enum.
 */
export type StatusFilter = "" | "abertas" | OpportunityStatus;

export function parseStatusFilter(value: string | undefined): StatusFilter {
  if (value === "abertas") return "abertas";
  return OPPORTUNITY_STATUSES.includes(value as OpportunityStatus)
    ? (value as OpportunityStatus)
    : "";
}

export function parsePage(value: string | undefined): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
}

export type OpportunityFilters = {
  /** Busca por profissional, loja ou título da demanda. */
  q: string;
  status: StatusFilter;
  storeId: string;
  professionalId: string;
  /** Presets compartilhados com Contatos (@/lib/contacts/types). */
  period: string;
  /** Datas ISO `AAAA-MM-DD`, usadas quando period = personalizado. */
  from: string;
  to: string;
  page: number;
};

export const PAGE_SIZE = 25;

export type OpportunityFormField =
  | "professional_id"
  | "store_id"
  | "title"
  | "notes"
  | "proposal_initial_value"
  | "commission_percent";

export type OpportunityFormState = {
  status: "idle" | "error" | "success";
  message: string | null;
  fieldErrors: Partial<Record<OpportunityFormField, string>>;
  succeededAt: number | null;
  /** Valores enviados, devolvidos para repovoar o formulário após erro. */
  values: SubmittedValues | null;
  /**
   * Muda a cada tentativa malsucedida. O formulário usa como `key` dos
   * campos para remontá-los com os valores acima.
   */
  attemptedAt: number | null;
};

export const initialOpportunityFormState: OpportunityFormState = {
  status: "idle",
  message: null,
  fieldErrors: {},
  succeededAt: null,
  values: null,
  attemptedAt: null,
};

export type StatusFormField =
  | "status"
  | "proposal_initial_value"
  | "final_closed_value"
  | "commission_percent"
  | "loss_reason";

export type StatusFormState = {
  status: "idle" | "error" | "success";
  message: string | null;
  fieldErrors: Partial<Record<StatusFormField, string>>;
  succeededAt: number | null;
  values: SubmittedValues | null;
  attemptedAt: number | null;
};

export const initialStatusFormState: StatusFormState = {
  status: "idle",
  message: null,
  fieldErrors: {},
  succeededAt: null,
  values: null,
  attemptedAt: null,
};

/** Resultado das ações sem formulário (movimentação direta, remoção). */
export type ActionResult = { ok: boolean; message: string };
