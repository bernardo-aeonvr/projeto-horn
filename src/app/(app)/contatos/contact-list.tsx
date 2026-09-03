"use client";

import { Pencil, Trash2 } from "lucide-react";

import { ChannelBadge } from "@/components/contacts/channel-badge";
import { formatContactedAt } from "@/lib/contacts/period";
import {
  contactCompany,
  type Contact,
  type ContactStore,
} from "@/lib/contacts/types";
import { cn } from "@/lib/utils";

type ContactListProps = {
  contacts: Contact[];
  onEdit: (contact: Contact) => void;
  onDelete: (contact: Contact) => void;
};

/**
 * Lojas apresentadas, resumidas.
 *
 * Com muitas lojas a lista viraria uma parede de texto na tabela, então
 * mostra as duas primeiras e conta o resto — o nome completo fica no title.
 */
export function PresentedStores({
  stores,
  max = 2,
}: {
  stores: ContactStore[];
  max?: number;
}) {
  if (stores.length === 0) {
    return <span className="text-graphite-400">—</span>;
  }

  const allNames = stores.map((store) => store.name).join(", ");
  const visible = stores.slice(0, max);
  const hidden = stores.length - visible.length;

  return (
    <span className="flex flex-wrap items-center gap-1" title={allNames}>
      {visible.map((store) => (
        <span
          key={store.id}
          className={cn(
            "inline-flex rounded-md px-1.5 py-0.5 text-xs",
            store.is_active
              ? "bg-graphite-100 text-graphite-700"
              : "bg-graphite-50 text-graphite-500 line-through",
          )}
        >
          {store.name}
        </span>
      ))}
      {hidden > 0 ? (
        <span className="inline-flex rounded-md bg-graphite-100 px-1.5 py-0.5 text-xs text-graphite-500">
          +{hidden}
        </span>
      ) : null}
    </span>
  );
}

/**
 * A empresa do profissional NO DIA do contato.
 *
 * Vem do snapshot gravado no registro; nos contatos anteriores à migration
 * 0019, que não têm snapshot, cai para a empresa atual do profissional. Quem
 * não tem nenhuma das duas mostra o mesmo traço do resto da tabela — nunca
 * "undefined" nem célula em branco sem explicação. A regra inteira está em
 * `contactCompany`.
 */
function CompanyCell({ contact }: { contact: Contact }) {
  const company = contactCompany(contact);

  if (!company) return <span className="text-graphite-400">—</span>;

  return (
    <span className="line-clamp-2" title={company}>
      {company}
    </span>
  );
}

function RowActions({
  contact,
  onEdit,
  onDelete,
  variant,
}: {
  contact: Contact;
  onEdit: (contact: Contact) => void;
  onDelete: (contact: Contact) => void;
  variant: "table" | "card";
}) {
  const name = contact.professional?.name ?? "contato";

  if (variant === "card") {
    return (
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => onEdit(contact)}
          className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg border border-graphite-200 text-sm font-medium text-graphite-700 transition-colors hover:bg-graphite-50"
        >
          <Pencil className="size-3.5" aria-hidden />
          Editar
        </button>
        <button
          type="button"
          onClick={() => onDelete(contact)}
          className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg border border-graphite-200 text-sm font-medium text-red-600 transition-colors hover:bg-red-50"
        >
          <Trash2 className="size-3.5" aria-hidden />
          Remover
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-end gap-1">
      <button
        type="button"
        onClick={() => onEdit(contact)}
        title="Editar"
        aria-label={`Editar contato com ${name}`}
        className="flex size-9 items-center justify-center rounded-lg text-graphite-500 transition-colors hover:bg-graphite-100 hover:text-graphite-900"
      >
        <Pencil className="size-4" aria-hidden />
      </button>
      <button
        type="button"
        onClick={() => onDelete(contact)}
        title="Remover"
        aria-label={`Remover contato com ${name}`}
        className="flex size-9 items-center justify-center rounded-lg text-graphite-400 transition-colors hover:bg-red-50 hover:text-red-600"
      >
        <Trash2 className="size-4" aria-hidden />
      </button>
    </div>
  );
}

export function ContactList({ contacts, onEdit, onDelete }: ContactListProps) {
  return (
    <>
      {/* Desktop — tabela */}
      <div className="hidden overflow-hidden rounded-card border border-graphite-200 bg-white shadow-card lg:block">
        <table className="w-full border-collapse text-sm">
          <caption className="sr-only">Contatos realizados</caption>
          <thead>
            <tr className="border-b border-graphite-200 bg-graphite-50/70 text-left">
              <Th>Profissional</Th>
              <Th>Data e hora</Th>
              <Th>Canal</Th>
              <Th>Lojas apresentadas</Th>
              <Th>Empresa</Th>
              <Th align="right">
                <span className="sr-only">Ações</span>
              </Th>
            </tr>
          </thead>
          <tbody>
            {contacts.map((contact) => (
              <tr
                key={contact.id}
                className="border-b border-graphite-100 transition-colors last:border-0 hover:bg-graphite-50/50"
              >
                <td className="px-4 py-3.5">
                  <p className="font-medium text-graphite-900">
                    {contact.professional?.name ?? "—"}
                  </p>
                  {contact.professional?.segment_name ? (
                    <p className="mt-0.5 text-xs text-graphite-500">
                      {contact.professional.segment_name}
                    </p>
                  ) : null}
                </td>
                <td className="whitespace-nowrap px-4 py-3.5 text-graphite-600 tabular-nums">
                  {formatContactedAt(contact.contacted_at)}
                </td>
                <td className="px-4 py-3.5">
                  <ChannelBadge channel={contact.channel} />
                </td>
                <td className="px-4 py-3.5">
                  <PresentedStores stores={contact.stores} />
                </td>
                <td className="max-w-[16rem] px-4 py-3.5 text-graphite-600">
                  <CompanyCell contact={contact} />
                </td>
                <td className="px-2 py-2.5">
                  <RowActions
                    contact={contact}
                    onEdit={onEdit}
                    onDelete={onDelete}
                    variant="table"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile e tablet — cards */}
      <ul className="space-y-3 lg:hidden">
        {contacts.map((contact) => (
          <li
            key={contact.id}
            className="rounded-card border border-graphite-200 bg-white p-4 shadow-card"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-medium text-graphite-900">
                  {contact.professional?.name ?? "—"}
                </p>
                <p className="mt-0.5 text-xs text-graphite-500 tabular-nums">
                  {formatContactedAt(contact.contacted_at)}
                </p>
              </div>
              <ChannelBadge channel={contact.channel} />
            </div>

            <div className="mt-4 space-y-3 border-t border-graphite-100 pt-3.5 text-sm">
              <div>
                <p className="text-xs text-graphite-500">Lojas apresentadas</p>
                <div className="mt-1">
                  <PresentedStores stores={contact.stores} max={4} />
                </div>
              </div>
              <div>
                <p className="text-xs text-graphite-500">Empresa</p>
                <div className="mt-0.5 leading-relaxed text-graphite-700">
                  <CompanyCell contact={contact} />
                </div>
              </div>
            </div>

            <div className="mt-4">
              <RowActions
                contact={contact}
                onEdit={onEdit}
                onDelete={onDelete}
                variant="card"
              />
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}

function Th({
  children,
  align = "left",
}: {
  children: React.ReactNode;
  align?: "left" | "right";
}) {
  return (
    <th
      scope="col"
      className={cn(
        "px-4 py-3 text-xs font-semibold uppercase tracking-[0.06em] text-graphite-500",
        align === "right" && "text-right",
      )}
    >
      {children}
    </th>
  );
}
