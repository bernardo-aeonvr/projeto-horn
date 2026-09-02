"use client";

import { Plus, X } from "lucide-react";
import { useState } from "react";

import { inputBaseClass, inputErrorClass } from "@/components/ui/text-field";
import { MAX_RESPONSIBLES } from "@/lib/stores/format";
import type { StoreResponsible } from "@/lib/stores/types";
import { cn } from "@/lib/utils";

type StoreResponsiblesFieldProps = {
  defaultValues: StoreResponsible[];
  error?: string;
};

type Row = { key: number; name: string; phone: string };

/** Nomes dos campos no FormData. Repetidos, lidos com `getAll`. */
const NAME_FIELD = "responsible_names";
const PHONE_FIELD = "responsible_phones";

/**
 * Responsáveis da loja: nome e telefone, quantos forem.
 *
 * Uma marmoraria costuma ter dois donos, e quem cuida do relacionamento
 * precisa falar com cada um. Cada linha é um responsável, e os dois inputs
 * dela andam juntos — inclusive na hora de remover.
 *
 * O FormData não aninha, então as linhas viajam como duas listas paralelas e o
 * servidor as casa pela posição. A invariante que torna isso seguro está aqui:
 * TODA linha renderiza os dois inputs, sempre, mesmo vazios — nunca existe um
 * nome sem o telefone correspondente na mesma posição. Linha em branco é
 * descartada no servidor, não some daqui.
 *
 * O telefone é texto livre com `type="tel"`, igual ao telefone da própria loja
 * logo acima: os dois campos ficam na mesma tela, e mascarar só um deles daria
 * a impressão de que são coisas diferentes.
 *
 * ISTO NÃO É ACESSO À PLATAFORMA. Cadastrar um responsável não cria login, não
 * envia convite, não cria contato e não toca em permissão nenhuma.
 */
export function StoreResponsiblesField({
  defaultValues,
  error,
}: StoreResponsiblesFieldProps) {
  /*
    Chave estável por linha, e não o índice.

    Pelo índice o React reaproveitaria os inputs pela posição: remover a
    primeira de três linhas deixaria o telefone da segunda aparecendo na
    primeira — exatamente o erro que este componente existe para não cometer. A
    próxima chave sai do maior valor em uso, dentro do próprio setState, para
    nada ser lido durante a renderização.
  */
  const [rows, setRows] = useState<Row[]>(() =>
    (defaultValues.length > 0
      ? defaultValues
      : [{ name: "", phone: null }]
    ).map((item, index) => ({
      key: index,
      name: item.name,
      phone: item.phone ?? "",
    })),
  );

  const canRemove = rows.length > 1;
  const canAdd = rows.length < MAX_RESPONSIBLES;

  const update = (key: number, patch: Partial<Row>) =>
    setRows((current) =>
      current.map((row) => (row.key === key ? { ...row, ...patch } : row)),
    );

  return (
    <fieldset>
      <legend className="mb-2 flex items-baseline gap-1.5 text-sm font-medium text-graphite-800">
        Responsáveis
        <span className="text-xs font-normal text-graphite-400">(opcional)</span>
      </legend>

      <div className="space-y-3">
        {rows.map((row, index) => (
          <div key={row.key} className="flex flex-wrap items-center gap-2">
            <input
              name={NAME_FIELD}
              value={row.name}
              onChange={(event) => update(row.key, { name: event.target.value })}
              placeholder="Nome"
              aria-label={`Nome do responsável ${index + 1}`}
              aria-invalid={error ? true : undefined}
              maxLength={120}
              className={cn(
                inputBaseClass,
                "min-w-[9rem] flex-1",
                error && inputErrorClass,
              )}
            />

            <input
              name={PHONE_FIELD}
              value={row.phone}
              type="tel"
              onChange={(event) => update(row.key, { phone: event.target.value })}
              placeholder="(11) 99999-9999"
              aria-label={`Telefone do responsável ${index + 1}`}
              maxLength={120}
              className={cn(
                inputBaseClass,
                "min-w-[9rem] flex-1 sm:max-w-[11rem]",
              )}
            />

            {canRemove ? (
              <button
                type="button"
                onClick={() =>
                  setRows((current) =>
                    current.filter((item) => item.key !== row.key),
                  )
                }
                title="Remover responsável"
                aria-label={`Remover responsável ${index + 1}`}
                className="flex size-11 shrink-0 items-center justify-center rounded-lg text-graphite-500 transition-colors hover:bg-graphite-100 hover:text-graphite-900"
              >
                <X className="size-4" aria-hidden />
              </button>
            ) : null}
          </div>
        ))}
      </div>

      {canAdd ? (
        <button
          type="button"
          onClick={() =>
            setRows((current) => [
              ...current,
              {
                key: current.reduce((max, row) => Math.max(max, row.key), -1) + 1,
                name: "",
                phone: "",
              },
            ])
          }
          className="mt-2.5 inline-flex items-center gap-1.5 rounded text-sm font-medium text-graphite-600 transition-colors hover:text-graphite-900"
        >
          <Plus className="size-3.5" aria-hidden />
          Adicionar responsável
        </button>
      ) : null}

      {error ? (
        <p className="mt-1.5 text-xs font-medium text-red-600">{error}</p>
      ) : (
        <p className="mt-1.5 text-xs text-graphite-500">
          Sócios, gerentes — quem responde pela loja. O telefone é opcional, e
          nada aqui cria acesso ao sistema.
        </p>
      )}
    </fieldset>
  );
}
