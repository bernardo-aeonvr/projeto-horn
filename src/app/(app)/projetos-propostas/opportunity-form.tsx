"use client";

import { Loader2 } from "lucide-react";
import { useActionState, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { FormAlert } from "@/components/ui/form-alert";
import {
  CurrencyField,
  PercentField,
  TextareaField,
} from "@/components/ui/form-fields";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { TextField } from "@/components/ui/text-field";
import { submittedNumber, submittedText } from "@/lib/form-values";
import {
  createOpportunityAction,
  updateOpportunityAction,
} from "@/lib/opportunities/actions";
import {
  initialOpportunityFormState,
  type Opportunity,
  type OpportunityStore,
} from "@/lib/opportunities/types";
import type { ProfessionalOption } from "@/lib/contacts/queries";
import { formatPercent } from "@/lib/stores/format";

type OpportunityFormProps = {
  /** Projeto em edição, ou null para um registro novo. */
  opportunity: Opportunity | null;
  professionals: ProfessionalOption[];
  /** Lojas ativas + a loja já vinculada, quando estiver inativa. */
  stores: OpportunityStore[];
  /** Quando o formulário abre pela ficha de um profissional, ele vem travado. */
  lockedProfessionalId?: string | null;
  onSaved: (message: string) => void;
  onCancel: () => void;
};

export function OpportunityForm({
  opportunity,
  professionals,
  stores,
  lockedProfessionalId = null,
  onSaved,
  onCancel,
}: OpportunityFormProps) {
  const isEditing = opportunity !== null;
  const [state, formAction, pending] = useActionState(
    isEditing ? updateOpportunityAction : createOpportunityAction,
    initialOpportunityFormState,
  );

  const errorRef = useRef<HTMLDivElement>(null);
  const lastHandledRef = useRef<number | null>(null);

  useEffect(() => {
    if (
      state.status === "success" &&
      state.succeededAt !== null &&
      state.succeededAt !== lastHandledRef.current
    ) {
      lastHandledRef.current = state.succeededAt;
      onSaved(state.message ?? "Projeto salvo.");
    }
  }, [state, onSaved]);

  useEffect(() => {
    if (state.status === "error") {
      errorRef.current?.scrollIntoView({ block: "nearest" });
    }
  }, [state]);

  const errors = state.fieldErrors;
  // O React 19 reseta os campos não controlados após a action; estes
  // valores repovoam o formulário quando a validação falha.
  const sent = state.values;

  const professionalId =
    submittedText(sent, "professional_id") ||
    opportunity?.professional_id ||
    lockedProfessionalId ||
    null;

  /*
    A carteira viva mais, na edição, o profissional que ESTE projeto já aponta
    — que pode ter sido excluído depois. Sem ele o seletor abriria em branco, e
    salvar sem tocar no campo trocaria o dono do projeto. Mesma regra do
    formulário de contato: aparece porque já está vinculado, não como opção
    nova. A empresa não entra: aqui a linha de apoio é o segmento.
  */
  const professionalOptions = [...professionals];
  const linked = opportunity?.professional;
  if (linked && !professionalOptions.some((option) => option.id === linked.id)) {
    professionalOptions.unshift({
      id: linked.id,
      name: linked.name,
      segment_name: linked.segment_name,
      company: null,
    });
  }

  const initialStoreId =
    submittedText(sent, "store_id") || opportunity?.store_id || null;

  // Acompanha a loja escolhida só para explicar qual percentual será gravado.
  const [storeId, setStoreId] = useState<string | null>(initialStoreId);
  const selectedStore = stores.find((store) => store.id === storeId) ?? null;

  return (
    <form
      action={formAction}
      /*
        O React 19 chama form.reset() depois que a action roda, e isso
        acontece após o render — os campos voltariam ao estado inicial mesmo
        recebendo os valores de volta. O evento reset é cancelável, então
        barrá-lo preserva o que o usuário digitou quando a validação falha.
      */
      onReset={(event) => event.preventDefault()}
      className="flex min-h-0 flex-1 flex-col"
    >
      {/*
        Remontar os campos a cada tentativa malsucedida devolve tudo a partir
        de state.values, sem o usuário perder o que digitou.
      */}
      <div
        key={`${opportunity ? opportunity.id : "novo"}-${state.attemptedAt ?? 0}`}
        className="min-h-0 flex-1 overflow-y-auto scrollbar-slim px-5 py-5 sm:px-6"
      >
        {isEditing ? (
          <input type="hidden" name="id" value={opportunity.id} />
        ) : null}

        {state.status === "error" && state.message ? (
          <div ref={errorRef} className="mb-5">
            <FormAlert tone="error">{state.message}</FormAlert>
          </div>
        ) : null}

        <div className="space-y-5">
          <SearchableSelect
            name="professional_id"
            label="Profissional"
            required
            options={professionalOptions.map((professional) => ({
              id: professional.id,
              name: professional.name,
              description: professional.segment_name,
            }))}
            defaultValue={professionalId}
            placeholder="Buscar profissional"
            emptyMessage="Nenhum profissional encontrado."
            error={errors.professional_id}
            locked={lockedProfessionalId !== null}
            hint={
              lockedProfessionalId !== null
                ? "Projeto iniciado a partir da ficha deste profissional."
                : undefined
            }
          />

          <SearchableSelect
            name="store_id"
            label="Loja"
            required
            options={stores.map((store) => ({
              id: store.id,
              name: store.name,
              description: store.is_active
                ? store.default_commission_percent !== null
                  ? `Comissão de ${formatPercent(store.default_commission_percent)}`
                  : "Sem percentual padrão"
                : "Loja inativa",
            }))}
            defaultValue={initialStoreId}
            onValueChange={setStoreId}
            placeholder="Buscar loja"
            emptyMessage="Nenhuma loja encontrada."
            error={errors.store_id}
            hint={storeHint(selectedStore, isEditing)}
          />

          <TextField
            label="Demanda"
            name="title"
            defaultValue={submittedText(sent, "title", opportunity?.title ?? "")}
            placeholder="Ex.: Marcenaria apartamento Jardins"
            error={errors.title}
            maxLength={160}
            hint="Descrição curta do que o profissional solicitou."
          />

          {/*
            Valor inicial e percentual só aparecem na edição.

            No cadastro o percentual é copiado da loja pelo trigger do banco, e
            o valor da proposta ainda não existe: ele é registrado quando a
            loja devolver a proposta. Aqui eles servem para corrigir um
            registro já existente.
          */}
          {isEditing ? (
            <div className="grid gap-5 sm:grid-cols-2">
              <CurrencyField
                name="proposal_initial_value"
                label="Valor inicial da proposta"
                defaultValue={submittedNumber(
                  sent,
                  "proposal_initial_value",
                  opportunity.proposal_initial_value,
                )}
                error={errors.proposal_initial_value}
                hint="Valor devolvido pela loja."
              />

              <PercentField
                name="commission_percent"
                label="Comissão do negócio"
                defaultValue={submittedNumber(
                  sent,
                  "commission_percent",
                  opportunity.commission_percent,
                )}
                error={errors.commission_percent}
                hint="Percentual preservado neste projeto."
              />
            </div>
          ) : null}

          <TextareaField
            label="Observações"
            name="notes"
            optional
            rows={3}
            defaultValue={submittedText(sent, "notes", opportunity?.notes ?? "")}
            placeholder="Ex.: cliente quer entrega até dezembro."
            error={errors.notes}
            maxLength={2000}
          />

          {!isEditing ? (
            <p className="rounded-lg bg-graphite-50 px-3.5 py-3 text-xs leading-relaxed text-graphite-600">
              O projeto entra como <strong>Projeto recebido</strong>. As
              movimentações seguintes registram o que já aconteceu por fora —
              a plataforma não envia projeto nem proposta.
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
              Salvando...
            </>
          ) : isEditing ? (
            "Salvar alterações"
          ) : (
            "Registrar projeto"
          )}
        </Button>
      </footer>
    </form>
  );
}

/**
 * Explica o que acontece com o percentual de comissão.
 *
 * O percentual atual da loja é copiado para o projeto na criação e fica
 * congelado ali: mudar o contrato da loja depois não mexe em negócios antigos
 * (spec, seção 10.4).
 */
function storeHint(
  store: OpportunityStore | null,
  isEditing: boolean,
): string | undefined {
  if (!store) return "Cada projeto pertence a uma única loja.";

  if (!store.is_active) {
    return "Esta loja está inativa. Use apenas para corrigir um registro histórico.";
  }

  if (isEditing) return undefined;

  if (store.default_commission_percent === null) {
    return "Esta loja não tem percentual padrão. Você poderá informá-lo no fechamento.";
  }

  return `Comissão de ${formatPercent(store.default_commission_percent)} fica gravada neste projeto, mesmo que o contrato da loja mude depois.`;
}
