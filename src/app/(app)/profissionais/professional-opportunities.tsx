"use client";

import { FolderKanban, Loader2, Plus } from "lucide-react";
import { useEffect, useState } from "react";

import { getProfessionalOpportunitiesAction } from "@/lib/opportunities/actions";
import { opportunityTitle } from "@/lib/opportunities/format";
import type { Opportunity } from "@/lib/opportunities/types";
import { formatCurrency } from "@/lib/stores/format";

import { StatusBadge } from "../projetos-propostas/status-badge";

type ProfessionalOpportunitiesProps = {
  professionalId: string;
  onNewOpportunity: () => void;
};

/**
 * Projetos & propostas geradas por este profissional.
 *
 * Um mesmo profissional pode ter vários projetos, cada um ligado a uma única
 * loja: mármore com uma, marcenaria com outra (spec, seção 10.2). Por isso a
 * loja aparece em cada linha.
 *
 * Carregado sob demanda ao abrir a ficha, como o histórico de contatos.
 */
export function ProfessionalOpportunities({
  professionalId,
  onNewOpportunity,
}: ProfessionalOpportunitiesProps) {
  const [opportunities, setOpportunities] = useState<Opportunity[] | null>(null);

  // Zera a lista ao trocar de profissional ajustando o estado durante a
  // renderização, em vez de num efeito.
  const [loadedFor, setLoadedFor] = useState(professionalId);
  if (professionalId !== loadedFor) {
    setLoadedFor(professionalId);
    setOpportunities(null);
  }

  useEffect(() => {
    let active = true;

    getProfessionalOpportunitiesAction(professionalId).then((result) => {
      if (active) setOpportunities(result);
    });

    return () => {
      active = false;
    };
  }, [professionalId]);

  return (
    <section>
      <div className="mb-2 flex items-center justify-between gap-3 border-b border-graphite-100 pb-2">
        <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.1em] text-graphite-500">
          <FolderKanban className="size-3.5" aria-hidden />
          Projetos &amp; Propostas
          {opportunities !== null && opportunities.length > 0 ? (
            <span className="rounded-full bg-graphite-100 px-1.5 py-0.5 text-[10px] font-medium normal-case tracking-normal text-graphite-600">
              {opportunities.length}
            </span>
          ) : null}
        </h3>

        <button
          type="button"
          onClick={onNewOpportunity}
          className="inline-flex shrink-0 items-center gap-1 rounded text-xs font-medium text-gold-700 transition-colors hover:text-gold-800"
        >
          <Plus className="size-3.5" aria-hidden />
          Novo projeto
        </button>
      </div>

      {opportunities === null ? (
        <p className="flex items-center gap-2 py-4 text-sm text-graphite-500">
          <Loader2 className="size-4 animate-spin" aria-hidden />
          Carregando projetos...
        </p>
      ) : opportunities.length === 0 ? (
        <p className="py-4 text-sm leading-relaxed text-graphite-500">
          Nenhum projeto registrado. Quando este profissional enviar uma demanda
          concreta para uma das lojas, registre-a aqui.
        </p>
      ) : (
        <ol className="divide-y divide-graphite-100">
          {opportunities.map((opportunity) => (
            <li key={opportunity.id} className="py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-graphite-800">
                    {opportunityTitle(opportunity)}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-graphite-500">
                    {opportunity.store?.name ?? "—"}
                  </p>
                </div>
                <StatusBadge status={opportunity.status} />
              </div>

              <p className="mt-1.5 text-xs text-graphite-500 tabular-nums">
                {opportunity.status === "closed" ? (
                  <>
                    Fechado em{" "}
                    <span className="font-medium text-graphite-700">
                      {formatCurrency(opportunity.final_closed_value)}
                    </span>
                    {opportunity.commission_value !== null ? (
                      <>
                        {" · comissão de "}
                        <span className="font-medium text-graphite-700">
                          {formatCurrency(opportunity.commission_value)}
                        </span>
                      </>
                    ) : null}
                  </>
                ) : opportunity.proposal_initial_value !== null ? (
                  <>
                    Proposta de{" "}
                    <span className="font-medium text-graphite-700">
                      {formatCurrency(opportunity.proposal_initial_value)}
                    </span>
                  </>
                ) : (
                  "Sem valor de proposta registrado"
                )}
              </p>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
