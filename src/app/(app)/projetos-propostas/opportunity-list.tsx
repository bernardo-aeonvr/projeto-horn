"use client";

import { Pencil } from "lucide-react";

import { formatContactedDate } from "@/lib/contacts/period";
import { opportunityTitle } from "@/lib/opportunities/format";
import type { Opportunity } from "@/lib/opportunities/types";
import { formatCurrency, formatPercent } from "@/lib/stores/format";
import { cn } from "@/lib/utils";

import { StatusBadge } from "./status-badge";

type OpportunityListProps = {
  /** `false` para usuário de loja: a listagem não oferece edição. */
  canManage: boolean;
  opportunities: Opportunity[];
  onOpenDetails: (opportunity: Opportunity) => void;
  onEdit: (opportunity: Opportunity) => void;
};

/**
 * Valor fechado exibido na listagem.
 *
 * Só aparece quando o negócio está fechado. Um projeto que voltou para
 * negociação por correção mantém o valor guardado no banco — ele continua
 * visível no detalhe —, mas mostrá-lo aqui faria a coluna somar como venda
 * algo que ainda não foi fechado.
 */
function closedValue(opportunity: Opportunity): string {
  return opportunity.status === "closed"
    ? formatCurrency(opportunity.final_closed_value)
    : "—";
}

export function OpportunityList({
  canManage,
  opportunities,
  onOpenDetails,
  onEdit,
}: OpportunityListProps) {
  return (
    <>
      {/* Desktop — tabela */}
      <div className="hidden overflow-hidden rounded-card border border-graphite-200 bg-white shadow-card lg:block">
        <table className="w-full border-collapse text-sm">
          <caption className="sr-only">
            Projetos e propostas acompanhados pela HORN
          </caption>
          <thead>
            <tr className="border-b border-graphite-200 bg-graphite-50/70 text-left">
              <Th>Profissional</Th>
              <Th>Loja</Th>
              <Th>Demanda</Th>
              <Th>Status</Th>
              <Th align="right" wide>
                Proposta
              </Th>
              <Th align="right">Fechado</Th>
              <Th align="right" wide>
                Comissão
              </Th>
              <Th>Atualizado</Th>
              {canManage ? (
                <Th align="right">
                  <span className="sr-only">Ações</span>
                </Th>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {opportunities.map((opportunity) => (
              <tr
                key={opportunity.id}
                onClick={() => onOpenDetails(opportunity)}
                className="cursor-pointer border-b border-graphite-100 transition-colors last:border-0 hover:bg-graphite-50/50"
              >
                <td className="px-4 py-3.5">
                  <p className="font-medium text-graphite-900">
                    {opportunity.professional?.name ?? "—"}
                  </p>
                  {opportunity.professional?.segment_name ? (
                    <p className="mt-0.5 text-xs text-graphite-500">
                      {opportunity.professional.segment_name}
                    </p>
                  ) : null}
                </td>

                <td className="px-4 py-3.5 text-graphite-600">
                  <span className="line-clamp-2">
                    {opportunity.store?.name ?? "—"}
                  </span>
                  {opportunity.store && !opportunity.store.is_active ? (
                    <span className="mt-0.5 block text-xs text-graphite-400">
                      inativa
                    </span>
                  ) : null}
                </td>

                <td className="max-w-[14rem] px-4 py-3.5 text-graphite-700">
                  {/*
                    A linha inteira abre o detalhe no clique, mas isso não
                    alcança o teclado. Este botão é o caminho acessível — e
                    para de propagar para a linha para não abrir duas vezes.
                  */}
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      onOpenDetails(opportunity);
                    }}
                    className="rounded text-left transition-colors hover:text-gold-700 hover:underline"
                  >
                    <span
                      className="line-clamp-2"
                      title={opportunityTitle(opportunity)}
                    >
                      {opportunityTitle(opportunity)}
                    </span>
                  </button>
                </td>

                <td className="px-4 py-3.5">
                  <StatusBadge status={opportunity.status} />
                </td>

                <td className="hidden px-4 py-3.5 text-right tabular-nums text-graphite-700 xl:table-cell">
                  {formatCurrency(opportunity.proposal_initial_value)}
                </td>

                <td className="px-4 py-3.5 text-right tabular-nums text-graphite-700">
                  {closedValue(opportunity)}
                </td>

                <td className="hidden px-4 py-3.5 text-right tabular-nums xl:table-cell">
                  {opportunity.commission_value === null ? (
                    <span className="text-graphite-400">—</span>
                  ) : (
                    <span className="font-medium text-graphite-900">
                      {formatCurrency(opportunity.commission_value)}
                    </span>
                  )}
                </td>

                <td className="whitespace-nowrap px-4 py-3.5 text-graphite-600 tabular-nums">
                  {formatContactedDate(opportunity.updated_at)}
                </td>

                {canManage ? (
                  <td className="px-2 py-2.5">
                    <div className="flex items-center justify-end">
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          onEdit(opportunity);
                        }}
                        title="Editar"
                        aria-label={`Editar ${opportunityTitle(opportunity)}`}
                        className="flex size-9 items-center justify-center rounded-lg text-graphite-500 transition-colors hover:bg-graphite-100 hover:text-graphite-900"
                      >
                        <Pencil className="size-4" aria-hidden />
                      </button>
                    </div>
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile e tablet — cards */}
      <ul className="space-y-3 lg:hidden">
        {opportunities.map((opportunity) => (
          <li key={opportunity.id}>
            <button
              type="button"
              onClick={() => onOpenDetails(opportunity)}
              className="w-full rounded-card border border-graphite-200 bg-white p-4 text-left shadow-card transition-colors hover:bg-graphite-50/50"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-medium text-graphite-900">
                    {opportunityTitle(opportunity)}
                  </p>
                  <p className="mt-0.5 truncate text-sm text-graphite-500">
                    {opportunity.professional?.name ?? "—"}
                  </p>
                </div>
                <StatusBadge status={opportunity.status} />
              </div>

              <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-graphite-100 pt-3.5 text-sm">
                <Cell label="Loja" value={opportunity.store?.name ?? "—"} />
                <Cell
                  label="Atualizado"
                  value={formatContactedDate(opportunity.updated_at)}
                />
                <Cell
                  label="Valor da proposta"
                  value={formatCurrency(opportunity.proposal_initial_value)}
                />
                <Cell
                  label={
                    opportunity.status === "closed"
                      ? "Comissão"
                      : "Valor fechado"
                  }
                  value={
                    opportunity.status === "closed"
                      ? formatCurrency(opportunity.commission_value)
                      : closedValue(opportunity)
                  }
                  strong={opportunity.status === "closed"}
                />
              </dl>

              {opportunity.status === "closed" ? (
                <p className="mt-3 text-xs text-graphite-500">
                  Fechado em {formatCurrency(opportunity.final_closed_value)} ·
                  comissão de {formatPercent(opportunity.commission_percent)}
                </p>
              ) : null}
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}

function Th({
  children,
  align = "left",
  wide,
}: {
  children: React.ReactNode;
  align?: "left" | "right";
  /** Coluna que só cabe nas telas maiores. */
  wide?: boolean;
}) {
  return (
    <th
      scope="col"
      className={cn(
        "px-4 py-3 text-xs font-semibold uppercase tracking-[0.06em] text-graphite-500",
        align === "right" && "text-right",
        wide && "hidden xl:table-cell",
      )}
    >
      {children}
    </th>
  );
}

function Cell({
  label,
  value,
  strong,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-graphite-500">{label}</dt>
      <dd
        className={cn(
          "truncate tabular-nums",
          strong ? "font-medium text-graphite-900" : "text-graphite-800",
        )}
      >
        {value}
      </dd>
    </div>
  );
}
