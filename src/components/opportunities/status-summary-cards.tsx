"use client";

import {
  STATUS_BADGE_LABELS,
  STATUS_LABELS,
  type OpportunityStatus,
  type OpportunityStatusCounts,
  type StatusFilter,
} from "@/lib/opportunities/types";
import { cn } from "@/lib/utils";

import { STATUS_CARD_STYLES } from "./status-styles";

/**
 * Os status que ganham card, na ordem do funil.
 *
 * São seis, não os sete do enum: `proposal_received` fica de fora do resumo a
 * pedido do cliente. Ficar de fora do resumo não é sair do produto — o status
 * continua no fluxo, na movimentação, no badge da listagem e no filtro
 * detalhado do seletor de Projetos & Propostas. Nada é somado dentro de outro
 * card: um projeto em "Proposta recebida" não aparece em "Proposta enviada",
 * ele simplesmente não é representado aqui.
 */
const SUMMARY_STATUSES: OpportunityStatus[] = [
  "project_received",
  "waiting_store_proposal",
  "proposal_sent_to_professional",
  "negotiating",
  "closed",
  "lost",
];

type StatusSummaryCardsProps = {
  counts: OpportunityStatusCounts;
  /**
   * Presente = cards clicáveis, como em Projetos & Propostas, onde eles são um
   * atalho para o filtro de status. Ausente = cards informativos, como no
   * dashboard, que não tem listagem para filtrar.
   */
  onSelect?: (status: StatusFilter) => void;
  /** O mesmo valor do seletor de status: existe um estado só, o da URL. */
  selected?: StatusFilter;
  /** Esmaece os números enquanto a navegação com o novo filtro não volta. */
  pending?: boolean;
};

/**
 * Faixa de resumo do funil.
 *
 * Em Projetos & Propostas cada card é um atalho para o filtro de status:
 * clicar aplica, clicar de novo no que já está ativo volta para "Todos os
 * status". Quem manda é sempre o parâmetro `status` da URL — o card só desenha
 * o que já está lá.
 *
 * No dashboard não há listagem para filtrar, então os mesmos cards entram sem
 * `onSelect` e viram números: mesma cor, mesmo rótulo, mesma tipografia, mas
 * sem botão, sem estado ativo e sem foco de teclado.
 *
 * Um status com zero registros continua na tela. O funil só é legível inteiro:
 * esconder a etapa vazia é esconder justamente a informação mais útil.
 */
export function StatusSummaryCards({
  counts,
  onSelect,
  selected,
  pending,
}: StatusSummaryCardsProps) {
  return (
    <div
      className={cn(
        "grid grid-cols-2 gap-x-2 gap-y-2 transition-opacity sm:grid-cols-3 sm:gap-x-3 lg:grid-cols-6",
        pending && "opacity-60",
      )}
    >
      {SUMMARY_STATUSES.map((status) => {
        const style = STATUS_CARD_STYLES[status];
        const isSelected = onSelect !== undefined && selected === status;

        /*
          `row-span-2` + `grid-rows-subgrid` fazem os cards da mesma linha
          dividirem as faixas do grid pai: um rótulo que quebra em duas linhas
          não empurra só o número dele para baixo. É o mesmo alinhamento dos
          KPIs do dashboard.
        */
        const className = cn(
          "row-span-2 grid grid-rows-subgrid rounded-card border px-3 py-3 text-left shadow-card",
          style.base,
          onSelect &&
            cn(
              "transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400 focus-visible:ring-offset-1",
              style.hover,
            ),
          isSelected && `ring-2 ${style.active}`,
        );

        const content = (
          <>
            <span className="text-xs font-medium leading-snug">
              {STATUS_BADGE_LABELS[status]}
            </span>
            <span className="self-end text-2xl font-semibold tabular-nums text-graphite-900">
              {counts[status].toLocaleString("pt-BR")}
            </span>
          </>
        );

        if (!onSelect) {
          return (
            <div key={status} title={STATUS_LABELS[status]} className={className}>
              {content}
            </div>
          );
        }

        return (
          <button
            key={status}
            type="button"
            onClick={() => onSelect(isSelected ? "" : status)}
            aria-pressed={isSelected}
            title={STATUS_LABELS[status]}
            className={className}
          >
            {content}
          </button>
        );
      })}
    </div>
  );
}
