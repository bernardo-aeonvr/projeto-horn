import { CHANNEL_LABELS, type ContactChannel } from "@/lib/contacts/types";
import { cn } from "@/lib/utils";

/**
 * Canal do contato, em pílula.
 *
 * Morava dentro da listagem de Contatos. Saiu de lá quando o dashboard passou
 * a mostrar o canal do último contato de cada profissional: as duas telas
 * precisam da mesma cor para o mesmo canal, e duas cópias divergem — foi o que
 * já aconteceu com as cores de status antes de virarem um módulo só.
 *
 * Mesma família discreta dos badges de status: fundo na escala 50, texto na
 * 600/700.
 */
const CHANNEL_STYLES: Record<ContactChannel, string> = {
  whatsapp: "bg-emerald-50 text-emerald-700",
  phone: "bg-sky-50 text-sky-700",
  instagram: "bg-fuchsia-50 text-fuchsia-700",
  email: "bg-amber-50 text-amber-700",
  other: "bg-graphite-100 text-graphite-600",
  event: "bg-violet-50 text-violet-700",
};

export function ChannelBadge({ channel }: { channel: ContactChannel }) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2.5 py-1 text-xs font-medium",
        CHANNEL_STYLES[channel] ?? CHANNEL_STYLES.other,
      )}
    >
      {CHANNEL_LABELS[channel]}
    </span>
  );
}
