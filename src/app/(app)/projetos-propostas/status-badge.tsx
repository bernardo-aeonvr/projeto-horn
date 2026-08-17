import {
  STATUS_BADGE_LABELS,
  STATUS_LABELS,
  type OpportunityStatus,
} from "@/lib/opportunities/types";
import { cn } from "@/lib/utils";

/**
 * Cores do funil.
 *
 * Segue o mesmo formato discreto dos badges de canal em Contatos: fundo na
 * escala 50 e texto na 700/800. A progressão vai do neutro (entrou agora) ao
 * âmbar (esperando terceiro), passa pelo dourado da marca quando existe
 * proposta e termina em verde ou vermelho. Nada aqui é chapado nem saturado.
 */
const STATUS_STYLES: Record<OpportunityStatus, string> = {
  project_received: "bg-graphite-100 text-graphite-700",
  waiting_store_proposal: "bg-amber-50 text-amber-700",
  proposal_received: "bg-gold-50 text-gold-800",
  proposal_sent_to_professional: "bg-sky-50 text-sky-700",
  negotiating: "bg-indigo-50 text-indigo-700",
  closed: "bg-emerald-50 text-emerald-700",
  lost: "bg-red-50 text-red-700",
};

export function StatusBadge({
  status,
  full = false,
  className,
}: {
  status: OpportunityStatus;
  /** Usa o rótulo completo, para o detalhe e a timeline. */
  full?: boolean;
  className?: string;
}) {
  return (
    <span
      title={STATUS_LABELS[status]}
      className={cn(
        "inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium",
        STATUS_STYLES[status],
        className,
      )}
    >
      {full ? STATUS_LABELS[status] : STATUS_BADGE_LABELS[status]}
    </span>
  );
}
