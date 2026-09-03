"use client";

import { Loader2 } from "lucide-react";
import { useActionState, useEffect, useRef } from "react";

import { Button } from "@/components/ui/button";
import { ChipMultiSelect } from "@/components/ui/chip-multi-select";
import { FormAlert } from "@/components/ui/form-alert";
import { SelectField, TextareaField } from "@/components/ui/form-fields";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { submittedList, submittedText } from "@/lib/form-values";
import { TextField } from "@/components/ui/text-field";
import {
  createContactAction,
  updateContactAction,
} from "@/lib/contacts/actions";
import {
  nowForDateTimeInput,
  timestampToDateTimeInput,
} from "@/lib/contacts/period";
import type { ProfessionalOption, StoreOption } from "@/lib/contacts/queries";
import {
  CHANNEL_LABELS,
  CONTACT_CHANNELS,
  initialContactFormState,
  type Contact,
} from "@/lib/contacts/types";

type ContactFormProps = {
  /** Contato em edição, ou null para registro novo. */
  contact: Contact | null;
  professionals: ProfessionalOption[];
  /** Lojas ativas hoje — a pré-seleção padrão. */
  activeStores: StoreOption[];
  /** Quando o formulário abre a partir de um profissional, ele já vem travado. */
  lockedProfessionalId?: string | null;
  onSaved: (message: string) => void;
  onCancel: () => void;
};

export function ContactForm({
  contact,
  professionals,
  activeStores,
  lockedProfessionalId = null,
  onSaved,
  onCancel,
}: ContactFormProps) {
  const isEditing = contact !== null;
  const [state, formAction, pending] = useActionState(
    isEditing ? updateContactAction : createContactAction,
    initialContactFormState,
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
      onSaved(state.message ?? "Contato salvo.");
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

  /**
   * Opções de loja: as ativas de hoje mais, na edição, as que foram
   * apresentadas naquele contato — inclusive lojas já inativadas, para o
   * snapshot histórico continuar editável sem se perder.
   */
  const storeOptions = [...activeStores.map((store) => ({ ...store }))];
  if (contact) {
    for (const store of contact.stores) {
      if (!storeOptions.some((option) => option.id === store.id)) {
        storeOptions.push(store);
      }
    }
    storeOptions.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  }

  /**
   * Contato novo começa SEM nenhuma loja marcada — decisão de produto que
   * diverge da seção 8.5 da especificação, que pedia todas pré-selecionadas.
   *
   * Motivo: com dezenas de lojas ativas, marcar todas por padrão faz o
   * registro passar sem revisão e dá a cada loja crédito por todo contato,
   * inflando o alcance nos dashboards delas. "Selecionar todas" resolve o
   * caso comum em um clique, sem virar o padrão silencioso.
   *
   * Na edição, o snapshot gravado é sempre respeitado.
   */
  const selectedStoreIds = submittedList(
    sent,
    "store_ids",
    contact ? contact.stores.map((store) => store.id) : [],
  );

  const professionalId =
    submittedText(sent, "professional_id") ||
    contact?.professional_id ||
    lockedProfessionalId ||
    null;

  /*
    Opções do seletor: a carteira viva mais, na edição, o profissional que ESTE
    contato já aponta.

    O segundo caso é o profissional excluído. Ele saiu da lista de propósito —
    ninguém deve poder escolhê-lo para um contato novo —, mas o contato de
    agosto continua sendo dele, e sem esta linha o seletor abriria em branco e
    salvar sem tocar no campo trocaria o dono do registro. Trocar para outra
    pessoa continua possível; o que não dá é escolhê-lo de novo depois de sair.
  */
  const professionalOptions = [...professionals];
  const linked = contact?.professional;
  if (linked && !professionalOptions.some((option) => option.id === linked.id)) {
    professionalOptions.unshift({
      id: linked.id,
      name: linked.name,
      segment_name: linked.segment_name,
      company: linked.company,
    });
  }

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
        key={`${contact ? contact.id : "novo"}-${state.attemptedAt ?? 0}`}
        className="min-h-0 flex-1 overflow-y-auto scrollbar-slim px-5 py-5 sm:px-6"
      >
        {isEditing ? (
          <input type="hidden" name="id" value={contact.id} />
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
            /*
              A empresa entra na identificação, não no valor: o formulário
              continua enviando o id do profissional. Existem três Larissas na
              carteira, e "Larissa" sozinha não diz qual delas é — "Ziggy ·
              Arquiteto" diz. Quem não tem empresa mostra só o segmento, como
              antes, e a busca do seletor passa a achar pela empresa também.
            */
            options={professionalOptions.map((professional) => ({
              id: professional.id,
              name: professional.name,
              description:
                [professional.company, professional.segment_name]
                  .filter((value) => value?.trim())
                  .join(" · ") || null,
            }))}
            defaultValue={professionalId}
            placeholder="Buscar profissional"
            emptyMessage="Nenhum profissional encontrado."
            error={errors.professional_id}
            locked={lockedProfessionalId !== null}
            hint={
              lockedProfessionalId !== null
                ? "Contato iniciado a partir da ficha deste profissional."
                : undefined
            }
          />

          <div className="grid gap-5 sm:grid-cols-2">
            <TextField
              label="Data e hora"
              name="contacted_at"
              type="datetime-local"
              defaultValue={submittedText(
                sent,
                "contacted_at",
                contact
                  ? timestampToDateTimeInput(contact.contacted_at)
                  : nowForDateTimeInput(),
              )}
              error={errors.contacted_at}
              required
              hint="Ajuste se o contato aconteceu antes."
            />

            <SelectField
              label="Canal"
              name="channel"
              defaultValue={submittedText(
                sent,
                "channel",
                contact?.channel ?? "",
              )}
              error={errors.channel}
              required
            >
              <option value="" disabled>
                Selecione
              </option>
              {CONTACT_CHANNELS.map((channel) => (
                <option key={channel} value={channel}>
                  {CHANNEL_LABELS[channel]}
                </option>
              ))}
            </SelectField>
          </div>

          <ChipMultiSelect
            name="store_ids"
            label="Lojas apresentadas"
            labelSuffix=""
            bulkActions
            options={storeOptions.map((store) => ({
              id: store.id,
              name: store.name,
              badge: store.is_active ? undefined : "inativa",
            }))}
            defaultSelectedIds={selectedStoreIds}
            error={errors.store_ids}
            hint="Marque as lojas cuja marca você apresentou neste contato. Use “Selecionar todas” se apresentou o portfólio inteiro."
          />

          <TextareaField
            label="Observação"
            name="notes"
            optional
            rows={3}
            defaultValue={submittedText(sent, "notes", contact?.notes ?? "")}
            placeholder="Ex.: enviei a apresentação das empresas pelo WhatsApp."
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
            "Registrar contato"
          )}
        </Button>
      </footer>
    </form>
  );
}
