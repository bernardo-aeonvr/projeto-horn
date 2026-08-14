"use client";

import { Check } from "lucide-react";
import { useId, useState } from "react";

import { cn } from "@/lib/utils";

type Option = {
  id: string;
  name: string;
  /** Texto curto após o nome, ex.: "inativa". */
  badge?: string;
};

type ChipMultiSelectProps = {
  /** Nome do campo; cada item selecionado vira um valor no FormData. */
  name: string;
  label: string;
  options: Option[];
  defaultSelectedIds?: string[];
  hint?: string;
  error?: string;
  /** Mostra "Selecionar todas" e "Limpar seleção". */
  bulkActions?: boolean;
  /** Sufixo do rótulo. Padrão: "(opcional)". */
  labelSuffix?: string;
};

/**
 * Seleção múltipla em chips.
 *
 * São checkboxes de verdade por baixo: o FormData recebe um valor por item
 * marcado, o teclado funciona sem código extra e a área de toque é grande o
 * bastante para o celular.
 */
export function ChipMultiSelect({
  name,
  label,
  options,
  defaultSelectedIds = [],
  hint,
  error,
  bulkActions = false,
  labelSuffix = "(opcional)",
}: ChipMultiSelectProps) {
  const groupId = useId();
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(defaultSelectedIds),
  );

  const toggle = (id: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const messageId = `${groupId}-message`;
  const allSelected = selected.size === options.length && options.length > 0;

  return (
    <fieldset
      aria-describedby={hint || error ? messageId : undefined}
      aria-invalid={error ? true : undefined}
    >
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <legend className="flex items-baseline gap-1.5 text-sm font-medium text-graphite-800">
          {label}
          {labelSuffix ? (
            <span className="text-xs font-normal text-graphite-400">
              {labelSuffix}
            </span>
          ) : null}
        </legend>

        {bulkActions && options.length > 1 ? (
          <div className="flex items-center gap-3 text-xs">
            <button
              type="button"
              onClick={() => setSelected(new Set(options.map((o) => o.id)))}
              disabled={allSelected}
              className="rounded font-medium text-gold-700 transition-colors hover:text-gold-800 disabled:cursor-not-allowed disabled:text-graphite-300"
            >
              Selecionar todas
            </button>
            <span aria-hidden className="text-graphite-300">
              ·
            </span>
            <button
              type="button"
              onClick={() => setSelected(new Set())}
              disabled={selected.size === 0}
              className="rounded font-medium text-graphite-500 transition-colors hover:text-graphite-800 disabled:cursor-not-allowed disabled:text-graphite-300"
            >
              Limpar seleção
            </button>
          </div>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2">
        {options.map((option) => {
          const checked = selected.has(option.id);

          return (
            <label
              key={option.id}
              className={cn(
                "inline-flex cursor-pointer select-none items-center gap-1.5 rounded-full border px-3 py-2 text-sm transition-colors",
                "has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-gold-500",
                checked
                  ? "border-gold-300 bg-gold-50 font-medium text-gold-800"
                  : "border-graphite-200 bg-white text-graphite-600 hover:border-graphite-300 hover:bg-graphite-50",
              )}
            >
              <input
                type="checkbox"
                name={name}
                value={option.id}
                checked={checked}
                onChange={() => toggle(option.id)}
                className="sr-only"
              />

              <Check
                aria-hidden
                className={cn(
                  "size-3.5 shrink-0 transition-opacity",
                  checked ? "opacity-100" : "opacity-0",
                )}
              />
              {option.name}
              {option.badge ? (
                <span className="rounded bg-graphite-100 px-1 py-0.5 text-[10px] font-medium uppercase tracking-wide text-graphite-500">
                  {option.badge}
                </span>
              ) : null}
            </label>
          );
        })}
      </div>

      {error ? (
        <p id={messageId} className="mt-1.5 text-xs font-medium text-red-600">
          {error}
        </p>
      ) : hint ? (
        <p id={messageId} className="mt-1.5 text-xs text-graphite-500">
          {hint}
        </p>
      ) : null}

      {bulkActions ? (
        <p className="mt-1.5 text-xs text-graphite-500">
          {selected.size} de {options.length} selecionadas
        </p>
      ) : null}
    </fieldset>
  );
}
