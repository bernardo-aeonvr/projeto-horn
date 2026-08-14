"use client";

import { Loader2 } from "lucide-react";
import { useActionState, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { ChipMultiSelect } from "@/components/ui/chip-multi-select";
import { FormAlert } from "@/components/ui/form-alert";
import { SelectField, TextareaField } from "@/components/ui/form-fields";
import { TextField } from "@/components/ui/text-field";
import { submittedList, submittedText } from "@/lib/form-values";
import {
  createProfessionalAction,
  updateProfessionalAction,
} from "@/lib/professionals/actions";
import {
  BRAZILIAN_STATES,
  MONTHS,
  maskPhoneInput,
  maskPostalCodeInput,
} from "@/lib/professionals/format";
import {
  initialProfessionalFormState,
  type Professional,
  type Region,
  type Segment,
} from "@/lib/professionals/types";

type ProfessionalFormProps = {
  professional: Professional | null;
  segments: Segment[];
  regions: Region[];
  onSaved: (message: string) => void;
  onCancel: () => void;
};

const DAYS = Array.from({ length: 31 }, (_, index) => index + 1);

export function ProfessionalForm({
  professional,
  segments,
  regions,
  onSaved,
  onCancel,
}: ProfessionalFormProps) {
  const isEditing = professional !== null;
  const [state, formAction, pending] = useActionState(
    isEditing ? updateProfessionalAction : createProfessionalAction,
    initialProfessionalFormState,
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
      onSaved(state.message ?? "Profissional salvo.");
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
        O React 19 chama form.reset() depois que a action roda. O evento é
        cancelável, então barrá-lo preserva os campos de texto quando a
        validação falha. Os `<select>` precisam do reparo extra que está em
        SelectField, porque o reset deles não passa por aqui.
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
        key={`${professional ? professional.id : "novo"}-${state.attemptedAt ?? 0}`}
        className="min-h-0 flex-1 overflow-y-auto scrollbar-slim px-5 py-5 sm:px-6"
      >
        {isEditing ? (
          <input type="hidden" name="id" value={professional.id} />
        ) : null}

        {state.status === "error" && state.message ? (
          <div ref={errorRef} className="mb-5">
            <FormAlert tone="error">{state.message}</FormAlert>
          </div>
        ) : null}

        <div className="space-y-7">
          <Section title="Dados principais">
            <TextField
              label="Nome"
              name="name"
              defaultValue={submittedText(
                sent,
                "name",
                professional?.name ?? "",
              )}
              placeholder="Nome completo"
              error={errors.name}
              maxLength={160}
              required
              autoFocus
            />

            <div className="grid gap-5 sm:grid-cols-2">
              <SelectField
                label="Segmento"
                name="segment_id"
                defaultValue={submittedText(
                  sent,
                  "segment_id",
                  professional?.segment_id ?? "",
                )}
                error={errors.segment_id}
                required
              >
                <option value="" disabled>
                  Selecione
                </option>
                {segments.map((segment) => (
                  <option key={segment.id} value={segment.id}>
                    {segment.name}
                  </option>
                ))}
              </SelectField>

              <SelectField
                label="Status"
                name="is_active"
                defaultValue={submittedText(
                  sent,
                  "is_active",
                  professional === null || professional.is_active
                    ? "true"
                    : "false",
                )}
              >
                <option value="true">Ativo</option>
                <option value="false">Inativo</option>
              </SelectField>
            </div>
          </Section>

          <Section
            title="Contato"
            description="Todos opcionais. A base tem muitos cadastros incompletos."
          >
            <div className="grid gap-5 sm:grid-cols-2">
              <MaskedField
                label="Telefone"
                name="phone"
                defaultValue={submittedText(sent, "phone", professional?.phone ?? "")}
                placeholder="(11) 99999-9999"
                mask={maskPhoneInput}
                error={errors.phone}
                inputMode="tel"
              />

              <TextField
                label="E-mail"
                name="email"
                type="email"
                defaultValue={submittedText(
                  sent,
                  "email",
                  professional?.email ?? "",
                )}
                placeholder="nome@email.com"
                error={errors.email}
                maxLength={160}
              />
            </div>

            <TextField
              label="Instagram"
              name="instagram"
              defaultValue={submittedText(
                sent,
                "instagram",
                professional?.instagram ?? "",
              )}
              placeholder="@usuario"
              error={errors.instagram}
              maxLength={160}
              hint="Aceita @usuario ou o link completo do perfil."
            />
          </Section>

          <Section title="Localização">
            <TextField
              label="Endereço"
              name="address"
              defaultValue={submittedText(
                sent,
                "address",
                professional?.address ?? "",
              )}
              placeholder="Rua, número, complemento"
              error={errors.address}
              maxLength={320}
            />

            <div className="grid gap-5 sm:grid-cols-[10rem_1fr_7rem]">
              <MaskedField
                label="CEP"
                name="postal_code"
                defaultValue={submittedText(sent, "postal_code", professional?.postal_code ?? "")}
                placeholder="00000-000"
                mask={maskPostalCodeInput}
                error={errors.postal_code}
                inputMode="numeric"
              />

              <TextField
                label="Cidade"
                name="city"
                defaultValue={submittedText(
                  sent,
                  "city",
                  professional?.city ?? "",
                )}
                placeholder="São Paulo"
                error={errors.city}
                maxLength={160}
              />

              <SelectField
                label="Estado"
                name="state"
                defaultValue={submittedText(
                  sent,
                  "state",
                  professional?.state ?? "",
                )}
                error={errors.state}
              >
                <option value="">—</option>
                {BRAZILIAN_STATES.map((uf) => (
                  <option key={uf} value={uf}>
                    {uf}
                  </option>
                ))}
              </SelectField>
            </div>

            <ChipMultiSelect
              name="region_ids"
              label="Regiões de atuação"
              options={regions}
              defaultSelectedIds={submittedList(
                sent,
                "region_ids",
                professional?.regions.map((r) => r.id) ?? [],
              )}
              error={errors.regions}
              hint="Um profissional pode atuar em mais de uma região."
            />
          </Section>

          <Section title="Informações adicionais">
            <fieldset>
              <legend className="mb-2 flex items-baseline gap-1.5 text-sm font-medium text-graphite-800">
                Aniversário
                <span className="text-xs font-normal text-graphite-400">
                  (opcional)
                </span>
              </legend>

              <div className="grid gap-3 sm:grid-cols-[7rem_1fr]">
                <SelectField
                  label="Dia"
                  name="birthday_day"
                  defaultValue={submittedText(
                    sent,
                    "birthday_day",
                    professional?.birthday_day?.toString() ?? "",
                  )}
                  aria-label="Dia do aniversário"
                >
                  <option value="">—</option>
                  {DAYS.map((day) => (
                    <option key={day} value={day}>
                      {day}
                    </option>
                  ))}
                </SelectField>

                <SelectField
                  label="Mês"
                  name="birthday_month"
                  defaultValue={submittedText(
                    sent,
                    "birthday_month",
                    professional?.birthday_month?.toString() ?? "",
                  )}
                >
                  <option value="">—</option>
                  {MONTHS.map((month, index) => (
                    <option key={month} value={index + 1}>
                      {month}
                    </option>
                  ))}
                </SelectField>
              </div>

              {errors.birthday ? (
                <p className="mt-1.5 text-xs font-medium text-red-600">
                  {errors.birthday}
                </p>
              ) : (
                <p className="mt-1.5 text-xs text-graphite-500">
                  Sem ano: guardamos apenas o dia e o mês.
                </p>
              )}
            </fieldset>

            <TextareaField
              label="Observações"
              name="notes"
              optional
              rows={3}
              defaultValue={submittedText(
                sent,
                "notes",
                professional?.notes ?? "",
              )}
              placeholder="Anotações internas sobre o profissional..."
              error={errors.notes}
              maxLength={2000}
            />
          </Section>
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
            "Cadastrar profissional"
          )}
        </Button>
      </footer>
    </form>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-5">
      <div className="border-b border-graphite-100 pb-2">
        <h3 className="text-xs font-semibold uppercase tracking-[0.1em] text-graphite-500">
          {title}
        </h3>
        {description ? (
          <p className="mt-1 text-xs text-graphite-500">{description}</p>
        ) : null}
      </div>
      {children}
    </section>
  );
}

/**
 * Campo de texto com máscara aplicada durante a digitação.
 *
 * Controlado de propósito: escrever direto no `value` do input em um campo
 * não controlado funciona, mas o cursor pula para o fim a cada tecla.
 */
function MaskedField({
  mask,
  defaultValue,
  ...props
}: Omit<React.ComponentProps<typeof TextField>, "value" | "defaultValue"> & {
  mask: (raw: string) => string;
  defaultValue: string;
}) {
  const [value, setValue] = useState(() => mask(defaultValue));

  return (
    <TextField
      {...props}
      value={value}
      onChange={(event) => setValue(mask(event.target.value))}
    />
  );
}
