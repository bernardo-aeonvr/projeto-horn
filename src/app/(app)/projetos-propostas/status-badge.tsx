import { STATUS_BADGE_STYLES } from "@/components/opportunities/status-styles";
import {
  STATUS_BADGE_LABELS,
  STATUS_LABELS,
  type OpportunityStatus,
} from "@/lib/opportunities/types";
import { cn } from "@/lib/utils";

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
        STATUS_BADGE_STYLES[status],
        className,
      )}
    >
      {full ? STATUS_LABELS[status] : STATUS_BADGE_LABELS[status]}
    </span>
  );
}
