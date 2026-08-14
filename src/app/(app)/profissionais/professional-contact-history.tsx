"use client";

import { Loader2, PhoneCall, Plus } from "lucide-react";
import { useEffect, useState } from "react";

import { getProfessionalContactsAction } from "@/lib/contacts/actions";
import { formatContactedAt } from "@/lib/contacts/period";
import { CHANNEL_LABELS, type Contact } from "@/lib/contacts/types";

type ProfessionalContactHistoryProps = {
  professionalId: string;
  onRegisterContact: () => void;
};

/**
 * Histórico de contatos do profissional, mais recente primeiro.
 *
 * Carregado sob demanda ao abrir o detalhe: a listagem de profissionais não
 * precisa desse dado e não deve pagar por ele.
 */
export function ProfessionalContactHistory({
  professionalId,
  onRegisterContact,
}: ProfessionalContactHistoryProps) {
  const [contacts, setContacts] = useState<Contact[] | null>(null);

  // Zera a lista ao trocar de profissional ajustando o estado durante a
  // renderização, em vez de num efeito.
  const [loadedFor, setLoadedFor] = useState(professionalId);
  if (professionalId !== loadedFor) {
    setLoadedFor(professionalId);
    setContacts(null);
  }

  useEffect(() => {
    let active = true;

    getProfessionalContactsAction(professionalId).then((result) => {
      if (active) setContacts(result);
    });

    return () => {
      active = false;
    };
  }, [professionalId]);

  return (
    <section>
      <div className="mb-2 flex items-center justify-between gap-3 border-b border-graphite-100 pb-2">
        <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.1em] text-graphite-500">
          <PhoneCall className="size-3.5" aria-hidden />
          Histórico de contatos
          {contacts !== null && contacts.length > 0 ? (
            <span className="rounded-full bg-graphite-100 px-1.5 py-0.5 text-[10px] font-medium normal-case tracking-normal text-graphite-600">
              {contacts.length}
            </span>
          ) : null}
        </h3>

        <button
          type="button"
          onClick={onRegisterContact}
          className="inline-flex shrink-0 items-center gap-1 rounded text-xs font-medium text-gold-700 transition-colors hover:text-gold-800"
        >
          <Plus className="size-3.5" aria-hidden />
          Registrar novo
        </button>
      </div>

      {contacts === null ? (
        <p className="flex items-center gap-2 py-4 text-sm text-graphite-500">
          <Loader2 className="size-4 animate-spin" aria-hidden />
          Carregando histórico...
        </p>
      ) : contacts.length === 0 ? (
        <p className="py-4 text-sm leading-relaxed text-graphite-500">
          Nenhum contato registrado ainda. Estar na carteira não significa que a
          HORN já apresentou as lojas a esta pessoa.
        </p>
      ) : (
        <ol className="divide-y divide-graphite-100">
          {contacts.map((contact) => (
            <li key={contact.id} className="py-3">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <p className="text-sm font-medium text-graphite-800 tabular-nums">
                  {formatContactedAt(contact.contacted_at)}
                </p>
                <span className="text-xs text-graphite-500">
                  {CHANNEL_LABELS[contact.channel]}
                </span>
              </div>

              {contact.stores.length > 0 ? (
                <p className="mt-1 text-xs leading-relaxed text-graphite-500">
                  <span className="text-graphite-400">Lojas apresentadas: </span>
                  {contact.stores.map((store) => store.name).join(", ")}
                </p>
              ) : null}

              {contact.notes ? (
                <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-graphite-700">
                  {contact.notes}
                </p>
              ) : null}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
