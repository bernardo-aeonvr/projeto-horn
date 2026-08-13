import { MessageCircle } from "lucide-react";

/**
 * Atalho para abrir a conversa no WhatsApp.
 *
 * É apenas um link wa.me. Abrir a conversa NÃO registra contato: o sistema
 * não tem como saber se a mensagem foi enviada nem se as lojas foram
 * apresentadas. O contato só passa a existir quando a HORN registra
 * explicitamente, no módulo de Contatos (spec, seções 7.6 e 8.2).
 */
export function WhatsAppButton({
  url,
  name,
  variant,
}: {
  url: string;
  name: string;
  variant: "icon" | "card";
}) {
  const label = `Abrir conversa no WhatsApp com ${name}`;

  if (variant === "card") {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={label}
        className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg border border-graphite-200 text-sm font-medium text-graphite-700 transition-colors hover:bg-graphite-50"
      >
        <MessageCircle className="size-3.5" aria-hidden />
        WhatsApp
      </a>
    );
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      title="Abrir no WhatsApp (não registra contato)"
      aria-label={label}
      className="flex size-9 items-center justify-center rounded-lg text-graphite-500 transition-colors hover:bg-graphite-100 hover:text-graphite-900"
    >
      <MessageCircle className="size-4" aria-hidden />
    </a>
  );
}
