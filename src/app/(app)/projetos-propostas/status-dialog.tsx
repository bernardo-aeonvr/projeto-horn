"use client";

import { Loader2 } from "lucide-react";
import { useActionState, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { FormAlert } from "@/components/ui/form-alert";
import {
  CurrencyField,
  PercentField,
  SelectField,
  TextareaField,
} from "@/components/ui/form-fields";
import { submittedText } from "@/lib/form-values";
import { changeOpportunityStatusAction } from "@/lib/opportunities/actions";
import { previewCommission } from "@/lib/opportunities/format";
import {
  initialStatusFormState,
  OPPORTUNITY_STATUSES,
  STATUS_ACTION_LABELS,
  STATUS_LABELS,
  STATUS_MEANINGS,
  type Opportunity,
  type OpportunityStatus,
} from "@/lib/opportunities/types";
import { formatCurrency, formatPercent } from "@/lib/stores/format";

/**
 * `move` leva a um status específico do funil; `correct` deixa o admin
 * escolher qualquer status para acertar um registro lançado errado.
 */
export type StatusIntent =
  | { kind: "move"; target: OpportunityStatus }
  | { kind: "correct" };

type StatusDialogProps = {
  open: boolean;
  opportunity: Opportunity;
  intent: StatusIntent;
  onDone: (message: string) => void;
  onCancel: () => void;
};

/**
 * Diálogo de movimentação do funil.
 *
 * Registra um fato externo — nada é enviado ao profissional ou à loja daqui.
 * A gravação do histórico e o cálculo da comissão ficam no banco: a tela só
 * mostra a prévia enquanto o usuário digita.
 */
export function StatusDialog({
  open,
  opportunity,
  intent,
  onDone,
  onCancel,
}: StatusDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const lastHandledRef = useRef<number | null>(null);

  const [state, formAction, pending] = useActionState(
    changeOpportunityStatusAction,
    initialStatusFormState,
  );

  const initialTarget =
    intent.kind === "move" ? intent.target : opportunity.status;
  const [target, setTarget] = useState<OpportunityStatus>(initialTarget);

  // O diálogo é remontado a cada abertura pela `key` do pai, então basta
  // sincronizar quando a intenção muda dentro da mesma montagem.
  const [syncedIntent, setSyncedIntent] = useState(initialTarget);
  if (initialTarget !== syncedIntent) {
    setSyncedIntent(initialTarget);
    setTarget(initialTarget);
  }

  const [finalValue, setFinalValue] = useState<number | null>(
    opportunity.final_closed_value,
  );
  const [percent, setPercent] = useState<number | null>(
    opportunity.commission_percent ??
      opportunity.store?.default_commission_percent ??
      null,
  );

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    if (
      state.status === "success" &&
      state.succeededAt !== null &&
      state.succeededAt !== lastHandledRef.current
    ) {
      lastHandledRef.current = state.succeededAt;
      onDone(state.message ?? "Status atualizado.");
    }
  }, [state, onDone]);

  const errors = state.fieldErrors;
  const sent = state.values;
  const commission = previewCommission(finalValue, percent);

  const isCorrection = intent.kind === "correct";
  const title = isCorrection
    ? "Corrigir status do projeto"
    : STATUS_ACTION_LABELS[target];

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="status-dialog-title"
      onCancel={(event) => {
        event.preventDefault();
        if (!pending) onCancel();
      }}
      onClick={(event) => {
        if (event.target === dialogRef.current && !pending) onCancel();
      }}
      className="m-auto max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-lg overflow-visible rounded-xl bg-white p-0 text-graphite-900 shadow-popover backdrop:bg-graphite-950/40"
    >
      {open ? (
        <form
          action={formAction}
          onReset={(event) => event.preventDefault()}
          className="flex max-h-[calc(100dvh-2rem)] flex-col"
        >
          <input type="hidden" name="id" value={opportunity.id} />
          {!isCorrection ? (
            <input type="hidden" name="status" value={target} />
          ) : null}

          <header className="shrink-0 border-b border-graphite-200/70 px-5 py-4 sm:px-6">
            <h2
              id="status-dialog-title"
              className="text-base font-semibold text-graphite-900"
            >
              {title}
            </h2>
            <p className="mt-1 text-sm leading-relaxed text-graphite-500">
              {isCorrection
                ? "Use para acertar um registro lançado errado. A correção também entra no histórico."
                : STATUS_MEANINGS[target]}
            </p>
          </header>

          <div
            key={state.attemptedAt ?? 0}
            className="min-h-0 flex-1 overflow-y-auto scrollbar-slim px-5 py-5 sm:px-6"
          >
            {state.status === "error" && state.message ? (
              <div className="mb-5">
                <FormAlert tone="error">{state.message}</FormAlert>
              </div>
            ) : null}

            <div className="space-y-5">
              {isCorrection ? (
                <SelectField
                  label="Novo status"
                  name="status"
                  value={target}
                  onChange={(event) =>
                    setTarget(event.target.value as OpportunityStatus)
                  }
                  error={errors.status}
                  required
                  hint={`Status atual: ${STATUS_LABELS[opportunity.status]}.`}
                >
                  {OPPORTUNITY_STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {STATUS_LABELS[status]}
                    </option>
                  ))}
                </SelectField>
              ) : null}

              {target === "proposal_received" ? (
                <CurrencyField
                  name="proposal_initial_value"
                  label="Valor inicial da proposta"
                  defaultValue={opportunity.proposal_initial_value}
                  error={errors.proposal_initial_value}
                  hint="Valor que a loja devolveu. Pode ficar em branco se ainda não veio — dá para registrar depois."
                />
              ) : null}

              {target === "closed" ? (
                <>
                  <CurrencyField
                    name="final_closed_value"
                    label="Valor final fechado"
                    required
                    defaultValue={opportunity.final_closed_value}
                    onValueChange={setFinalValue}
                    error={errors.final_closed_value}
                    hint="Valor efetivamente negociado e aceito por fora."
                  />

                  <PercentField
                    name="commission_percent"
                    label="Percentual de comissão"
                    required
                    defaultValue={
                      opportunity.commission_percent ??
                      opportunity.store?.default_commission_percent ??
                      null
                    }
                    onValueChange={setPercent}
                    error={errors.commission_percent}
                    hint={
                      opportunity.commission_percent !== null
                        ? "Percentual preservado no momento em que o projeto foi criado."
                        : "A loja não tinha percentual padrão quando o projeto entrou. Informe o do contrato."
                    }
                  />

                  <div className="rounded-lg border border-gold-200 bg-gold-50/60 px-4 py-3">
                    <p className="text-xs font-medium uppercase tracking-[0.08em] text-gold-800">
                      Comissão da HORN
                    </p>
                    <p className="mt-1 text-xl font-semibold tabular-nums text-graphite-900">
                      {formatCurrency(commission)}
                    </p>
                    <p className="mt-1 text-xs leading-relaxed text-graphite-600">
                      {formatCurrency(finalValue)} ×{" "}
                      {formatPercent(percent)}. O valor definitivo é calculado
                      pelo banco ao gravar.
                    </p>
                  </div>

                  {opportunity.proposal_initial_value !== null ? (
                    <p className="text-xs leading-relaxed text-graphite-500">
                      A proposta inicial de{" "}
                      {formatCurrency(opportunity.proposal_initial_value)}{" "}
                      continua registrada — ela não é substituída pelo valor
                      fechado.
                    </p>
                  ) : null}
                </>
              ) : null}

              {target === "lost" ? (
                <TextareaField
                  label="Motivo ou observação"
                  name="loss_reason"
                  optional
                  rows={3}
                  defaultValue={submittedText(
                    sent,
                    "loss_reason",
                    opportunity.loss_reason ?? "",
                  )}
                  placeholder="Ex.: cliente optou por outro fornecedor."
                  error={errors.loss_reason}
                  maxLength={1000}
                />
              ) : null}

              {target !== "closed" && target !== "lost" && !isCorrection ? (
                <p className="rounded-lg bg-graphite-50 px-3.5 py-3 text-xs leading-relaxed text-graphite-600">
                  Nada é enviado por aqui. Este registro apenas marca a data e a
                  hora em que a movimentação aconteceu por fora.
                </p>
              ) : null}
            </div>
          </div>

          <footer className="flex shrink-0 items-center justify-end gap-3 border-t border-graphite-200/70 bg-white px-5 py-4 sm:px-6">
            <Button
              type="button"
              variant="secondary"
              onClick={onCancel}
              disabled={pending}
            >
              Cancelar
            </Button>

            <Button type="submit" disabled={pending}>
              {pending ? (
                <>
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                  Registrando...
                </>
              ) : isCorrection ? (
                "Corrigir status"
              ) : (
                STATUS_ACTION_LABELS[target]
              )}
            </Button>
          </footer>
        </form>
      ) : null}
    </dialog>
  );
}
