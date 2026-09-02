"use client";

import { Loader2, Pencil, Power, PowerOff } from "lucide-react";
import { useTransition } from "react";

import { toWhatsAppUrl } from "@/lib/professionals/format";
import type { Professional } from "@/lib/professionals/types";
import { cn } from "@/lib/utils";

import { WhatsAppButton } from "./whatsapp-button";

type ProfessionalListProps = {
  professionals: Professional[];
  onOpenDetails: (professional: Professional) => void;
  onEdit: (professional: Professional) => void;
  onToggleActive: (professional: Professional) => void;
  pendingId: string | null;
};

export function StatusBadge({ active }: { active: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
        active
          ? "bg-emerald-50 text-emerald-700"
          : "bg-graphite-100 text-graphite-600",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "size-1.5 rounded-full",
          active ? "bg-emerald-500" : "bg-graphite-400",
        )}
      />
      {active ? "Ativo" : "Inativo"}
    </span>
  );
}

/** Regiões em chips. Acima de `max`, o excedente vira "+N". */
export function RegionChips({
  regions,
  max = 2,
}: {
  regions: { id: string; name: string }[];
  max?: number;
}) {
  if (regions.length === 0) {
    return <span className="text-graphite-400">—</span>;
  }

  const visible = regions.slice(0, max);
  const hidden = regions.length - visible.length;

  return (
    <span className="flex flex-wrap items-center gap-1">
      {visible.map((region) => (
        <span
          key={region.id}
          className="inline-flex rounded-md bg-graphite-100 px-1.5 py-0.5 text-xs text-graphite-700"
        >
          {region.name}
        </span>
      ))}
      {hidden > 0 ? (
        <span
          title={regions
            .slice(max)
            .map((region) => region.name)
            .join(", ")}
          className="inline-flex rounded-md bg-graphite-100 px-1.5 py-0.5 text-xs text-graphite-500"
        >
          +{hidden}
        </span>
      ) : null}
    </span>
  );
}

function RowActions({
  professional,
  onEdit,
  onToggleActive,
  pending,
  variant,
}: {
  professional: Professional;
  onEdit: (professional: Professional) => void;
  onToggleActive: (professional: Professional) => void;
  pending: boolean;
  variant: "table" | "card";
}) {
  const toggleLabel = professional.is_active ? "Inativar" : "Ativar";
  const ToggleIcon = professional.is_active ? PowerOff : Power;
  const whatsAppUrl = toWhatsAppUrl(professional.phone);

  if (variant === "card") {
    return (
      <div className="flex flex-wrap gap-2">
        {whatsAppUrl ? (
          <WhatsAppButton
            url={whatsAppUrl}
            name={professional.name}
            variant="card"
          />
        ) : null}

        <button
          type="button"
          onClick={() => onEdit(professional)}
          className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg border border-graphite-200 text-sm font-medium text-graphite-700 transition-colors hover:bg-graphite-50"
        >
          <Pencil className="size-3.5" aria-hidden />
          Editar
        </button>

        <button
          type="button"
          onClick={() => onToggleActive(professional)}
          disabled={pending}
          className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg border border-graphite-200 text-sm font-medium text-graphite-700 transition-colors hover:bg-graphite-50 disabled:opacity-60"
        >
          {pending ? (
            <Loader2 className="size-3.5 animate-spin" aria-hidden />
          ) : (
            <ToggleIcon className="size-3.5" aria-hidden />
          )}
          {toggleLabel}
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-end gap-1">
      {whatsAppUrl ? (
        <WhatsAppButton
          url={whatsAppUrl}
          name={professional.name}
          variant="icon"
        />
      ) : null}

      <button
        type="button"
        onClick={() => onEdit(professional)}
        title="Editar"
        aria-label={`Editar ${professional.name}`}
        className="flex size-9 items-center justify-center rounded-lg text-graphite-500 transition-colors hover:bg-graphite-100 hover:text-graphite-900"
      >
        <Pencil className="size-4" aria-hidden />
      </button>

      <button
        type="button"
        onClick={() => onToggleActive(professional)}
        disabled={pending}
        title={toggleLabel}
        aria-label={`${toggleLabel} ${professional.name}`}
        className="flex size-9 items-center justify-center rounded-lg text-graphite-500 transition-colors hover:bg-graphite-100 hover:text-graphite-900 disabled:opacity-60"
      >
        {pending ? (
          <Loader2 className="size-4 animate-spin" aria-hidden />
        ) : (
          <ToggleIcon className="size-4" aria-hidden />
        )}
      </button>
    </div>
  );
}

export function ProfessionalList({
  professionals,
  onOpenDetails,
  onEdit,
  onToggleActive,
  pendingId,
}: ProfessionalListProps) {
  const [, startTransition] = useTransition();

  const handleToggle = (professional: Professional) => {
    startTransition(() => onToggleActive(professional));
  };

  return (
    <>
      {/*
        Desktop — tabela

        `overflow-x-auto` e não `overflow-hidden`: com sete colunas a tabela
        pede ~850px e o cartão tem 679px num monitor de 1024 com o menu aberto.
        Sem isto quem rola de lado é a PÁGINA inteira, e as ações da linha ficam
        cortadas fora da tela. Rolando dentro do próprio cartão, o cabeçalho, os
        filtros e a paginação continuam no lugar.
      */}
      <div className="hidden overflow-x-auto rounded-card border border-graphite-200 bg-white shadow-card lg:block">
        <table className="w-full border-collapse text-sm">
          <caption className="sr-only">
            Profissionais da carteira da HORN
          </caption>
          <thead>
            <tr className="border-b border-graphite-200 bg-graphite-50/70 text-left">
              <Th>Profissional</Th>
              <Th>Empresa e cargo</Th>
              <Th>Segmento</Th>
              <Th>Regiões</Th>
              <Th>Telefone</Th>
              <Th>Status</Th>
              <Th align="right">
                <span className="sr-only">Ações</span>
              </Th>
            </tr>
          </thead>
          <tbody>
            {professionals.map((professional) => (
              <tr
                key={professional.id}
                className="border-b border-graphite-100 transition-colors last:border-0 hover:bg-graphite-50/50"
              >
                <td className="px-4 py-3.5">
                  <button
                    type="button"
                    onClick={() => onOpenDetails(professional)}
                    className={cn(
                      "rounded text-left font-medium transition-colors hover:text-gold-700 hover:underline",
                      professional.is_active
                        ? "text-graphite-900"
                        : "text-graphite-500",
                    )}
                  >
                    {professional.name}
                  </button>
                  {professional.email ? (
                    <p className="mt-0.5 truncate text-xs text-graphite-500">
                      {professional.email}
                    </p>
                  ) : null}
                </td>
                <td className="px-4 py-3.5 text-graphite-600">
                  {professional.company ?? "—"}
                  {professional.job_role ? (
                    <p className="mt-0.5 text-xs text-graphite-500">
                      {professional.job_role}
                    </p>
                  ) : null}
                </td>
                <td className="px-4 py-3.5 text-graphite-600">
                  {professional.segment?.name ?? "—"}
                </td>
                <td className="px-4 py-3.5">
                  <RegionChips regions={professional.regions} />
                </td>
                <td className="px-4 py-3.5 text-graphite-600 tabular-nums">
                  {professional.phone ?? "—"}
                </td>
                <td className="px-4 py-3.5">
                  <StatusBadge active={professional.is_active} />
                </td>
                <td className="px-2 py-2.5">
                  <RowActions
                    professional={professional}
                    onEdit={onEdit}
                    onToggleActive={handleToggle}
                    pending={pendingId === professional.id}
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
        {professionals.map((professional) => (
          <li
            key={professional.id}
            className="rounded-card border border-graphite-200 bg-white p-4 shadow-card"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <button
                  type="button"
                  onClick={() => onOpenDetails(professional)}
                  className="rounded text-left font-medium text-graphite-900 transition-colors hover:text-gold-700"
                >
                  {professional.name}
                </button>
                <p className="mt-0.5 truncate text-sm text-graphite-500">
                  {professional.segment?.name ?? "Sem segmento"}
                </p>
              </div>
              <StatusBadge active={professional.is_active} />
            </div>

            <dl className="mt-4 space-y-3 border-t border-graphite-100 pt-3.5 text-sm">
              <div>
                <dt className="text-xs text-graphite-500">Empresa</dt>
                <dd className="text-graphite-800">
                  {professional.company ?? "—"}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-graphite-500">Cargo</dt>
                <dd className="text-graphite-800">
                  {professional.job_role ?? "—"}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-graphite-500">Regiões</dt>
                <dd className="mt-1">
                  <RegionChips regions={professional.regions} max={4} />
                </dd>
              </div>
              <div>
                <dt className="text-xs text-graphite-500">Telefone</dt>
                <dd className="text-graphite-800 tabular-nums">
                  {professional.phone ?? "—"}
                </dd>
              </div>
            </dl>

            <div className="mt-4">
              <RowActions
                professional={professional}
                onEdit={onEdit}
                onToggleActive={handleToggle}
                pending={pendingId === professional.id}
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
