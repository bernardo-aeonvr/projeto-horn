"use client";

import { Loader2 } from "lucide-react";
import { useActionState, useEffect, useRef } from "react";

import {
  CurrencyField,
  DateField,
  PercentField,
  SelectField,
  TextareaField,
} from "@/components/ui/form-fields";
import { Button } from "@/components/ui/button";
import { FormAlert } from "@/components/ui/form-alert";
import { TextField } from "@/components/ui/text-field";
import { submittedNumber, submittedText } from "@/lib/form-values";
import { createStoreAction, updateStoreAction } from "@/lib/stores/actions";
import { initialStoreFormState, type Store } from "@/lib/stores/types";

type StoreFormProps = {
  /** Loja em edição, ou null para cadastro. */
  store: Store | null;
  /** Segmentos já usados, oferecidos como sugestão no autocomplete. */
  categories: string[];
  onSaved: (message: string) => void;
  onCancel: () => void;
};

export function StoreForm({
  store,
  categories,
  onSaved,
  onCancel,
}: StoreFormProps) {
  const isEditing = store !== null;
  const [state, formAction, pending] = useActionState(
    isEditing ? updateStoreAction : createStoreAction,
    initialStoreFormState,
  );

  const errorRef = useRef<HTMLDivElement>(null);
  const lastHandledRef = useRef<number | null>(null);

  // Fecha o painel apenas uma vez por gravação bem-sucedida.
  useEffect(() => {
    if (
      state.status === "success" &&
      state.succeededAt !== null &&
      state.succeededAt !== lastHandledRef.current
    ) {
      lastHandledRef.current = state.succeededAt;
      onSaved(state.message ?? "Loja salva.");
    }
  }, [state, onSaved]);

  useEffect(() => {
    if (state.status === "error") {
      errorRef.current?.scrollIntoView({ block: "nearest" });
    }
  }, [state]);

  const errors = state.fieldErrors;
  // Repovoa os campos: o React 19 reseta o formulário após a action.
  const sent = state.values;

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
        O React 19 reseta os campos não controlados depois que a action roda,
        e um <select> volta para a opção marcada na montagem. Remontar os
        campos a cada tentativa malsucedida devolve tudo a partir de
        state.values, sem o usuário perder o que digitou.
      */}
      <div
        key={`${store ? store.id : "nova"}-${state.attemptedAt ?? 0}`}
        className="min-h-0 flex-1 overflow-y-auto scrollbar-slim px-5 py-5 sm:px-6"
      >
        {isEditing ? <input type="hidden" name="id" value={store.id} /> : null}

        {state.status === "error" && state.message ? (
          <div ref={errorRef} className="mb-5">
            <FormAlert tone="error">{state.message}</FormAlert>
          </div>
        ) : null}

        <div className="space-y-5">
          <TextField
            label="Nome da loja"
            name="name"
            defaultValue={submittedText(sent, "name", store?.name ?? "")}
            placeholder="Ex.: Navona Mármores"
            error={errors.name}
            maxLength={120}
            required
            autoFocus
          />

          <div className="grid gap-5 sm:grid-cols-2">
            <TextField
              label="Segmento"
              name="category"
              defaultValue={submittedText(
                sent,
                "category",
                store?.category ?? "",
              )}
              placeholder="Ex.: Mármores e granitos"
              error={errors.category}
              maxLength={120}
              list="store-categories"
              hint="Digite um novo ou escolha um já usado."
            />
            <datalist id="store-categories">
              {categories.map((category) => (
                <option key={category} value={category} />
              ))}
            </datalist>

            <SelectField
              label="Status"
              name="is_active"
              defaultValue={submittedText(
                sent,
                "is_active",
                store === null || store.is_active ? "true" : "false",
              )}
            >
              <option value="true">Ativa</option>
              <option value="false">Inativa</option>
            </SelectField>
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <TextField
              label="Responsável"
              name="contact_name"
              defaultValue={submittedText(
                sent,
                "contact_name",
                store?.contact_name ?? "",
              )}
              placeholder="Nome do contato na loja"
              error={errors.contact_name}
              maxLength={120}
            />

            <TextField
              label="Telefone"
              name="phone"
              type="tel"
              defaultValue={submittedText(sent, "phone", store?.phone ?? "")}
              placeholder="(11) 99999-9999"
              error={errors.phone}
              maxLength={120}
            />
          </div>

          <fieldset className="rounded-xl border border-graphite-200 bg-graphite-50/60 p-4">
            <legend className="px-1.5 text-xs font-semibold uppercase tracking-[0.1em] text-graphite-500">
              Condições comerciais
            </legend>

            <div className="grid gap-5 sm:grid-cols-2">
              <CurrencyField
                name="monthly_fixed_fee"
                label="Valor fixo mensal"
                defaultValue={submittedNumber(sent, "monthly_fixed_fee", store?.monthly_fixed_fee ?? null)}
                error={errors.monthly_fixed_fee}
                hint="Informação contratual. Não entra no cálculo da comissão."
              />

              <PercentField
                name="default_commission_percent"
                label="Comissão"
                defaultValue={submittedNumber(
                  sent,
                  "default_commission_percent",
                  store?.default_commission_percent ?? null,
                )}
                error={errors.default_commission_percent}
                hint="Aplicada às propostas fechadas desta loja."
              />
            </div>

            <p className="mt-4 text-xs leading-relaxed text-graphite-500">
              Loja que trabalha só por comissão: deixe o valor fixo em branco e
              preencha apenas o percentual.
            </p>
          </fieldset>

          <div className="grid gap-5 sm:grid-cols-2">
            <DateField
              label="Início da representação"
              name="start_date"
              defaultValue={submittedText(
                sent,
                "start_date",
                store?.start_date ?? "",
              )}
              error={errors.start_date}
            />
          </div>

          <TextareaField
            label="Observações"
            name="notes"
            optional
            rows={3}
            defaultValue={submittedText(sent, "notes", store?.notes ?? "")}
            placeholder="Detalhes do contrato, particularidades do atendimento..."
            error={errors.notes}
            maxLength={2000}
          />
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
            "Cadastrar loja"
          )}
        </Button>
      </footer>
    </form>
  );
}
