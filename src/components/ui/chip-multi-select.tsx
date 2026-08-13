"use client";

import { Check } from "lucide-react";
import { useId, useState } from "react";

import { cn } from "@/lib/utils";

type Option = { id: string; name: string };

type ChipMultiSelectProps = {
  /** Nome do campo; cada item selecionado vira um valor no FormData. */
  name: string;
  label: string;
  options: Option[];
  defaultSelectedIds?: string[];
  hint?: string;
  error?: string;
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

  return (
    <fieldset
      aria-describedby={hint || error ? messageId : undefined}
      aria-invalid={error ? true : undefined}
    >
      <legend className="mb-2 flex items-baseline gap-1.5 text-sm font-medium text-graphite-800">
        {label}
        <span className="text-xs font-normal text-graphite-400">(opcional)</span>
      </legend>

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
    </fieldset>
  );
}
