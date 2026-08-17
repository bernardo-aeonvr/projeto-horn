"use client";

// Esta versão do lucide não traz mais ícones de marca, então o Instagram é
// representado pelo arroba, que é como o perfil é escrito na interface.
import { AtSign, FolderPlus, Mail, Pencil, PhoneCall } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  formatBirthdayLong,
  formatTimestamp,
  formatTimestampWithTime,
  toInstagramHandle,
  toInstagramUrl,
  toWhatsAppUrl,
} from "@/lib/professionals/format";
import type { Professional } from "@/lib/professionals/types";

import { ProfessionalContactHistory } from "./professional-contact-history";
import { StatusBadge } from "./professional-list";
import { ProfessionalOpportunities } from "./professional-opportunities";
import { WhatsAppButton } from "./whatsapp-button";

type ProfessionalDetailsProps = {
  professional: Professional;
  onEdit: () => void;
  onRegisterContact: () => void;
  onNewOpportunity: () => void;
};

export function ProfessionalDetails({
  professional,
  onEdit,
  onRegisterContact,
  onNewOpportunity,
}: ProfessionalDetailsProps) {
  const whatsAppUrl = toWhatsAppUrl(professional.phone);
  const instagramUrl = toInstagramUrl(professional.instagram);
  const instagramHandle = toInstagramHandle(professional.instagram);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto scrollbar-slim px-5 py-5 sm:px-6">
        <div className="flex flex-wrap items-center gap-3">
          <StatusBadge active={professional.is_active} />
          {professional.segment ? (
            <span className="inline-flex rounded-md bg-gold-50 px-2 py-1 text-xs font-medium text-gold-800">
              {professional.segment.name}
            </span>
          ) : null}
        </div>

        {whatsAppUrl || instagramUrl || professional.email ? (
          <div className="mt-5 flex flex-wrap gap-2">
            {whatsAppUrl ? (
              <WhatsAppButton
                url={whatsAppUrl}
                name={professional.name}
                variant="card"
              />
            ) : null}

            {instagramUrl ? (
              <a
                href={instagramUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg border border-graphite-200 text-sm font-medium text-graphite-700 transition-colors hover:bg-graphite-50"
              >
                <AtSign className="size-3.5" aria-hidden />
                Instagram
              </a>
            ) : null}

            {professional.email ? (
              <a
                href={`mailto:${professional.email}`}
                className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg border border-graphite-200 text-sm font-medium text-graphite-700 transition-colors hover:bg-graphite-50"
              >
                <Mail className="size-3.5" aria-hidden />
                E-mail
              </a>
            ) : null}
          </div>
        ) : null}

        <div className="mt-6 space-y-6">
          <DetailSection title="Contato">
            <DetailRow label="Telefone" value={professional.phone} />
            <DetailRow label="E-mail" value={professional.email} />
            <DetailRow
              label="Instagram"
              value={instagramHandle ? `@${instagramHandle}` : null}
            />
          </DetailSection>

          <DetailSection title="Localização">
            <DetailRow label="Endereço" value={professional.address} />
            <DetailRow label="CEP" value={professional.postal_code} />
            <DetailRow label="Cidade" value={professional.city} />
            <DetailRow label="Estado" value={professional.state} />

            <div className="py-2">
              <p className="text-xs text-graphite-500">Regiões de atuação</p>
              {professional.regions.length > 0 ? (
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {professional.regions.map((region) => (
                    <span
                      key={region.id}
                      className="inline-flex rounded-md bg-graphite-100 px-2 py-1 text-xs text-graphite-700"
                    >
                      {region.name}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="mt-0.5 text-sm text-graphite-400">—</p>
              )}
            </div>
          </DetailSection>

          <DetailSection title="Informações adicionais">
            <DetailRow
              label="Aniversário"
              value={formatBirthdayLong(
                professional.birthday_day,
                professional.birthday_month,
              )}
            />
            <DetailRow label="Observações" value={professional.notes} multiline />
          </DetailSection>

          <DetailSection title="Registro">
            <DetailRow
              label="Cadastrado em"
              value={formatTimestamp(professional.created_at)}
            />
            <DetailRow
              label="Última atualização"
              value={formatTimestampWithTime(professional.updated_at)}
            />
          </DetailSection>

          <ProfessionalContactHistory
            professionalId={professional.id}
            onRegisterContact={onRegisterContact}
          />

          {/*
            Contato e projeto são coisas diferentes: registrar um contato não
            cria projeto nenhum, e um projeto só existe quando há demanda
            concreta (spec, seção 27).
          */}
          <ProfessionalOpportunities
            professionalId={professional.id}
            onNewOpportunity={onNewOpportunity}
          />
        </div>
      </div>

      <footer className="flex shrink-0 flex-wrap items-center justify-end gap-3 border-t border-graphite-200/70 bg-white px-5 py-4 sm:px-6">
        <Button
          variant="secondary"
          onClick={onRegisterContact}
          className="mr-auto"
        >
          <PhoneCall className="size-4" aria-hidden />
          Registrar contato
        </Button>

        <Button variant="secondary" onClick={onNewOpportunity}>
          <FolderPlus className="size-4" aria-hidden />
          Novo projeto
        </Button>

        <Button onClick={onEdit}>
          <Pencil className="size-4" aria-hidden />
          Editar
        </Button>
      </footer>
    </div>
  );
}

function DetailSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h3 className="mb-1 border-b border-graphite-100 pb-2 text-xs font-semibold uppercase tracking-[0.1em] text-graphite-500">
        {title}
      </h3>
      <dl className="divide-y divide-graphite-100">{children}</dl>
    </section>
  );
}

function DetailRow({
  label,
  value,
  multiline,
}: {
  label: string;
  value: string | null;
  multiline?: boolean;
}) {
  return (
    <div
      className={
        multiline
          ? "py-2"
          : "flex items-baseline justify-between gap-4 py-2 text-sm"
      }
    >
      <dt className="shrink-0 text-xs text-graphite-500">{label}</dt>
      <dd
        className={
          multiline
            ? "mt-1 whitespace-pre-wrap text-sm leading-relaxed text-graphite-800"
            : "min-w-0 truncate text-right text-graphite-800"
        }
      >
        {value?.trim() ? value : <span className="text-graphite-400">—</span>}
      </dd>
    </div>
  );
}
