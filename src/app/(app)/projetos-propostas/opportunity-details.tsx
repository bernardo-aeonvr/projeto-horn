"use client";

import { History, Loader2, Pencil, Settings2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { formatContactedAt } from "@/lib/contacts/period";
import { opportunityTitle } from "@/lib/opportunities/format";
import {
  NEXT_STATUSES,
  STATUS_ACTION_LABELS,
  STATUS_LABELS,
  STATUS_MEANINGS,
  statusNeedsDetails,
  type Opportunity,
  type OpportunityDetails as OpportunityDetailsData,
  type OpportunityStatus,
} from "@/lib/opportunities/types";
import { formatCurrency, formatPercent } from "@/lib/stores/format";
import { cn } from "@/lib/utils";

import { OpportunityAttachments } from "./opportunity-attachments";
import { StatusBadge } from "./status-badge";

type OpportunityDetailsProps = {
  /** `false` para usuário de loja: a ficha vira somente leitura. */
  canManage: boolean;
  opportunity: Opportunity;
  /** Histórico e anexos, carregados sob demanda. */
  details: OpportunityDetailsData | null;
  onEdit: () => void;
  /** Transições sem dados extras, aplicadas em um clique. */
  onMove: (target: OpportunityStatus) => void;
  /** Transições que abrem diálogo (proposta recebida, fechamento, perda). */
  onOpenStatusDialog: (target: OpportunityStatus) => void;
  onCorrectStatus: () => void;
  onDetailsChanged: () => void;
  pendingStatus: OpportunityStatus | null;
};

export function OpportunityDetails({
  canManage,
  opportunity,
  details,
  onEdit,
  onMove,
  onOpenStatusDialog,
  onCorrectStatus,
  onDetailsChanged,
  pendingStatus,
}: OpportunityDetailsProps) {
  const nextStatuses = NEXT_STATUSES[opportunity.status];
  const isFinished =
    opportunity.status === "closed" || opportunity.status === "lost";

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto scrollbar-slim px-5 py-5 sm:px-6">
        <div className="flex flex-wrap items-center gap-3">
          <StatusBadge status={opportunity.status} full />
          {opportunity.store && !opportunity.store.is_active ? (
            <span className="inline-flex rounded-md bg-graphite-100 px-2 py-1 text-xs text-graphite-600">
              Loja inativa
            </span>
          ) : null}
        </div>

        {/* Próximo passo do funil — quem movimenta é sempre a HORN */}
        <section className="mt-5 rounded-xl border border-graphite-200 bg-graphite-50/60 px-4 py-4">
          <h3 className="text-xs font-semibold uppercase tracking-[0.1em] text-graphite-500">
            {!canManage
              ? "Situação atual"
              : isFinished
                ? "Negócio encerrado"
                : "Registrar movimentação"}
          </h3>

          {!canManage ? (
            <p className="mt-2 text-sm leading-relaxed text-graphite-600">
              {STATUS_MEANINGS[opportunity.status]} O acompanhamento é feito
              pela HORN — fale com a equipe para atualizar qualquer informação
              deste projeto.
            </p>
          ) : isFinished ? (
            <p className="mt-2 text-sm leading-relaxed text-graphite-600">
              {opportunity.status === "closed"
                ? "O negócio está marcado como fechado. Se isso foi um engano, corrija o status — a correção também entra no histórico."
                : "O negócio está marcado como perdido. Se ele voltar, corrija o status para reabri-lo."}
            </p>
          ) : (
            <>
              <p className="mt-1.5 text-xs leading-relaxed text-graphite-500">
                Registre aqui o que já aconteceu por fora. A plataforma não
                envia projeto nem proposta.
              </p>

              <div className="mt-3 flex flex-col gap-2">
                {nextStatuses.map((target, index) => (
                  <Button
                    key={target}
                    variant={index === 0 ? "primary" : "secondary"}
                    disabled={pendingStatus !== null}
                    onClick={() =>
                      statusNeedsDetails(target)
                        ? onOpenStatusDialog(target)
                        : onMove(target)
                    }
                    className="w-full justify-center"
                  >
                    {pendingStatus === target ? (
                      <>
                        <Loader2 className="size-4 animate-spin" aria-hidden />
                        Registrando...
                      </>
                    ) : (
                      STATUS_ACTION_LABELS[target]
                    )}
                  </Button>
                ))}
              </div>
            </>
          )}
        </section>

        <div className="mt-6 space-y-6">
          <DetailSection title="Projeto">
            <DetailRow label="Demanda" value={opportunityTitle(opportunity)} />
            <DetailRow
              label="Profissional"
              value={opportunity.professional?.name ?? null}
            />
            <DetailRow
              label="Segmento"
              value={opportunity.professional?.segment_name ?? null}
            />
            <DetailRow label="Loja" value={opportunity.store?.name ?? null} />
          </DetailSection>

          <DetailSection title="Valores e comissão">
            <DetailRow
              label="Valor inicial da proposta"
              value={
                opportunity.proposal_initial_value === null
                  ? null
                  : formatCurrency(opportunity.proposal_initial_value)
              }
            />
            <DetailRow
              label="Valor final fechado"
              value={
                opportunity.final_closed_value === null
                  ? null
                  : formatCurrency(opportunity.final_closed_value)
              }
              /*
                O valor continua guardado se o negócio for reaberto por
                correção. Marcar isso evita ler um número de venda como se o
                negócio ainda estivesse fechado.
              */
              note={
                opportunity.final_closed_value !== null &&
                opportunity.status !== "closed"
                  ? "registrado em um fechamento anterior"
                  : undefined
              }
            />
            <DetailRow
              label="Percentual do negócio"
              value={
                opportunity.commission_percent === null
                  ? null
                  : formatPercent(opportunity.commission_percent)
              }
            />
            <DetailRow
              label="Comissão gerada"
              value={
                opportunity.commission_value === null
                  ? null
                  : formatCurrency(opportunity.commission_value)
              }
              strong
            />
          </DetailSection>

          {opportunity.status === "closed" &&
          opportunity.commission_percent !== null ? (
            <p className="-mt-3 text-xs leading-relaxed text-graphite-500">
              A comissão é calculada pelo banco sobre o valor final fechado, com
              o percentual preservado neste projeto — mudar o percentual da loja
              hoje não altera este número.
            </p>
          ) : null}

          {opportunity.loss_reason ? (
            <DetailSection title="Motivo da perda">
              <p className="whitespace-pre-wrap py-2 text-sm leading-relaxed text-graphite-800">
                {opportunity.loss_reason}
              </p>
            </DetailSection>
          ) : null}

          {opportunity.notes ? (
            <DetailSection title="Observações">
              <p className="whitespace-pre-wrap py-2 text-sm leading-relaxed text-graphite-800">
                {opportunity.notes}
              </p>
            </DetailSection>
          ) : null}

          <OpportunityAttachments
            canManage={canManage}
            opportunity={opportunity}
            attachments={details?.attachments ?? null}
            onChanged={onDetailsChanged}
          />

          <StatusTimeline details={details} />

          <DetailSection title="Registro">
            <DetailRow
              label="Criado em"
              value={formatContactedAt(opportunity.created_at)}
            />
            <DetailRow
              label="Última atualização"
              value={formatContactedAt(opportunity.updated_at)}
            />
          </DetailSection>
        </div>
      </div>

      {canManage ? (
        <footer className="flex shrink-0 flex-wrap items-center justify-end gap-3 border-t border-graphite-200/70 bg-white px-5 py-4 sm:px-6">
          <Button
            variant="secondary"
            onClick={onCorrectStatus}
            className="mr-auto"
          >
            <Settings2 className="size-4" aria-hidden />
            Corrigir status
          </Button>

          <Button onClick={onEdit}>
            <Pencil className="size-4" aria-hidden />
            Editar
          </Button>
        </footer>
      ) : null}
    </div>
  );
}

/**
 * Timeline das mudanças de status, do começo para o fim.
 *
 * As linhas vêm de `opportunity_status_history`, escritas por trigger no
 * mesmo instante da mudança — o usuário nunca digita essas datas.
 */
function StatusTimeline({ details }: { details: OpportunityDetailsData | null }) {
  return (
    <section>
      <h3 className="mb-3 flex items-center gap-2 border-b border-graphite-100 pb-2 text-xs font-semibold uppercase tracking-[0.1em] text-graphite-500">
        <History className="size-3.5" aria-hidden />
        Histórico de status
        {details && details.history.length > 0 ? (
          <span className="rounded-full bg-graphite-100 px-1.5 py-0.5 text-[10px] font-medium normal-case tracking-normal text-graphite-600">
            {details.history.length}
          </span>
        ) : null}
      </h3>

      {details === null ? (
        <p className="flex items-center gap-2 py-2 text-sm text-graphite-500">
          <Loader2 className="size-4 animate-spin" aria-hidden />
          Carregando histórico...
        </p>
      ) : details.history.length === 0 ? (
        <p className="py-2 text-sm text-graphite-500">
          Nenhuma movimentação registrada.
        </p>
      ) : (
        <ol className="relative space-y-4 pl-5">
          {/* Fio contínuo ligando os pontos da timeline. */}
          <span
            aria-hidden
            className="absolute left-[3px] top-1.5 bottom-1.5 w-px bg-graphite-200"
          />

          {[...details.history]
            .reverse()
            .map((event, index, ordered) => {
              const isLast = index === ordered.length - 1;

              return (
                <li key={event.id} className="relative">
                  <span
                    aria-hidden
                    className={cn(
                      "absolute -left-5 top-1.5 size-[7px] rounded-full ring-2 ring-white",
                      isLast ? "bg-gold-500" : "bg-graphite-300",
                    )}
                  />

                  <p className="text-xs text-graphite-500 tabular-nums">
                    {formatContactedAt(event.changed_at)}
                  </p>
                  <p className="mt-0.5 text-sm font-medium text-graphite-800">
                    {STATUS_LABELS[event.to_status]}
                  </p>
                  {event.changed_by_name ? (
                    <p className="mt-0.5 text-xs text-graphite-500">
                      por {event.changed_by_name}
                    </p>
                  ) : null}
                </li>
              );
            })}
        </ol>
      )}
    </section>
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
  note,
  strong,
}: {
  label: string;
  value: string | null;
  /** Aviso curto ao lado do valor. */
  note?: string;
  strong?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2 text-sm">
      <dt className="shrink-0 text-xs text-graphite-500">{label}</dt>
      <dd
        className={cn(
          "min-w-0 truncate text-right tabular-nums",
          strong ? "font-medium text-graphite-900" : "text-graphite-800",
        )}
      >
        {value ? value : <span className="text-graphite-400">—</span>}
        {value && note ? (
          <span className="ml-1.5 text-xs font-normal text-graphite-400">
            ({note})
          </span>
        ) : null}
      </dd>
    </div>
  );
}
