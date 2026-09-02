"use client";

import { Loader2 } from "lucide-react";
import { useActionState, useEffect, useRef, useState } from "react";

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
import {
  submittedList,
  submittedNumber,
  submittedText,
  type SubmittedValues,
} from "@/lib/form-values";
import {
  createStoreAction,
  setStoreLogoAction,
  updateStoreAction,
} from "@/lib/stores/actions";
import { storeResponsibles } from "@/lib/stores/format";
import { buildStoreLogoPath, STORE_LOGO_BUCKET } from "@/lib/stores/logo";
import { createClient } from "@/lib/supabase/client";
import {
  initialStoreFormState,
  type Store,
  type StoreResponsible,
} from "@/lib/stores/types";

import { StoreLogoField } from "./store-logo-field";
import { StoreResponsiblesField } from "./store-responsibles-field";

/**
 * Responsáveis para preencher o formulário: o que foi enviado na tentativa
 * anterior, ou o que está gravado na loja.
 *
 * As duas listas do FormData voltam separadas, e é aqui que elas se juntam de
 * novo — pela mesma posição em que foram enviadas, com o telefone faltante
 * virando vazio em vez de herdar o do vizinho.
 */
function submittedResponsibles(
  sent: SubmittedValues | null,
  store: Store | null,
): StoreResponsible[] {
  if (!sent) return storeResponsibles(store ?? {});

  const names = submittedList(sent, "responsible_names", []);
  if (names.length === 0) return storeResponsibles(store ?? {});

  const phones = submittedList(sent, "responsible_phones", []);

  return names.map((name, index) => ({
    name,
    phone: phones[index] ?? "",
  }));
}

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

  /*
    Logotipo escolhido antes de a loja existir. Editando ele é null: ali o
    campo envia sozinho, porque já existe pasta para onde subir.
  */
  const [pendingLogo, setPendingLogo] = useState<File | null>(null);

  // Fecha o painel apenas uma vez por gravação bem-sucedida.
  useEffect(() => {
    if (
      state.status !== "success" ||
      state.succeededAt === null ||
      state.succeededAt === lastHandledRef.current
    ) {
      return;
    }

    lastHandledRef.current = state.succeededAt;
    const saved = state.message ?? "Loja salva.";

    // Cadastro sem imagem, ou edição: nada a subir.
    if (!pendingLogo || !state.createdId) {
      onSaved(saved);
      return;
    }

    /*
      A loja acabou de nascer e só agora tem pasta no bucket. O envio acontece
      aqui, depois do insert, e uma falha dele NÃO desfaz o cadastro: a loja
      está salva e o admin adiciona o logotipo editando.
    */
    const storeId = state.createdId;
    const file = pendingLogo;

    void (async () => {
      const path = buildStoreLogoPath(storeId, file);
      const supabase = createClient();
      const { error } = await supabase.storage
        .from(STORE_LOGO_BUCKET)
        .upload(path, file, { contentType: file.type, upsert: false });

      if (error) {
        console.error("[lojas] falha ao enviar o logotipo do cadastro", error);
        onSaved(`${saved} Não foi possível enviar o logotipo — edite a loja para tentar de novo.`);
        return;
      }

      const result = await setStoreLogoAction(storeId, path);
      onSaved(
        result.ok
          ? saved
          : `${saved} Não foi possível salvar o logotipo — edite a loja para tentar de novo.`,
      );
    })();
  }, [state, onSaved, pendingLogo]);

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

          {/*
            O telefone DA LOJA passou a ocupar a linha inteira: agora cada
            responsável tem o seu, e o bloco abaixo precisa da largura toda
            para caber nome e telefone na mesma linha.
          */}
          <TextField
            label="Telefone"
            name="phone"
            type="tel"
            defaultValue={submittedText(sent, "phone", store?.phone ?? "")}
            placeholder="(11) 99999-9999"
            error={errors.phone}
            maxLength={120}
          />

          <StoreResponsiblesField
            defaultValues={submittedResponsibles(sent, store)}
            error={errors.responsibles}
          />

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

          {/*
            Fora do fluxo do formulário: a imagem não viaja no FormData, sobe
            direto para o bucket. Por isso fica no fim, depois dos campos que
            de fato são gravados pelo submit.
          */}
          <StoreLogoField
            storeId={store?.id ?? null}
            storeName={store?.name ?? ""}
            logoPath={store?.logo_path ?? null}
            pendingFile={pendingLogo}
            onPendingFileChange={setPendingLogo}
            disabled={pending}
          />

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
