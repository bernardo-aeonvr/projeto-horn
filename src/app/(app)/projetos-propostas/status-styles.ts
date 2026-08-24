import type { OpportunityStatus } from "@/lib/opportunities/types";

/**
 * Cores do funil, em um lugar só.
 *
 * Segue o mesmo formato discreto dos badges de canal em Contatos: fundo na
 * escala 50 e texto na 700/800. A progressão vai do neutro (entrou agora) ao
 * âmbar (esperando terceiro), passa pelo dourado da marca quando existe
 * proposta e termina em verde ou vermelho. Nada aqui é chapado nem saturado.
 *
 * O badge da listagem e o card de resumo leem daqui, para que um status nunca
 * apareça com duas cores diferentes na mesma tela.
 */
export const STATUS_BADGE_STYLES: Record<OpportunityStatus, string> = {
  project_received: "bg-graphite-100 text-graphite-700",
  waiting_store_proposal: "bg-amber-50 text-amber-700",
  proposal_received: "bg-gold-50 text-gold-800",
  proposal_sent_to_professional: "bg-sky-50 text-sky-700",
  negotiating: "bg-indigo-50 text-indigo-700",
  closed: "bg-emerald-50 text-emerald-700",
  lost: "bg-red-50 text-red-700",
};

export type StatusCardStyle = {
  /** Repouso: mesma família de cor do badge, em superfície de card. */
  base: string;
  /** Selecionado: a mesma cor, um passo mais firme na borda. */
  active: string;
};

/**
 * Variação dos cards de resumo.
 *
 * As classes são escritas por extenso porque o Tailwind varre o código-fonte:
 * um nome montado em tempo de execução não geraria CSS nenhum.
 */
export const STATUS_CARD_STYLES: Record<OpportunityStatus, StatusCardStyle> = {
  project_received: {
    base: "border-graphite-200 bg-graphite-50 text-graphite-700 hover:bg-graphite-100",
    active: "border-graphite-400 ring-graphite-300",
  },
  waiting_store_proposal: {
    base: "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100/70",
    active: "border-amber-400 ring-amber-300",
  },
  proposal_received: {
    base: "border-gold-200 bg-gold-50 text-gold-800 hover:bg-gold-100/70",
    active: "border-gold-400 ring-gold-300",
  },
  proposal_sent_to_professional: {
    base: "border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100/70",
    active: "border-sky-400 ring-sky-300",
  },
  negotiating: {
    base: "border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100/70",
    active: "border-indigo-400 ring-indigo-300",
  },
  closed: {
    base: "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100/70",
    active: "border-emerald-400 ring-emerald-300",
  },
  lost: {
    base: "border-red-200 bg-red-50 text-red-700 hover:bg-red-100/70",
    active: "border-red-400 ring-red-300",
  },
};
