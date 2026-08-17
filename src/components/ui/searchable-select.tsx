"use client";

import { Check, ChevronDown, Search, X } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";

import { inputBaseClass, inputErrorClass } from "@/components/ui/text-field";
import { cn } from "@/lib/utils";

export type SelectOption = {
  id: string;
  name: string;
  /** Linha secundária, ex.: o segmento do profissional. */
  description?: string | null;
};

type SearchableSelectProps = {
  name: string;
  label: string;
  options: SelectOption[];
  defaultValue?: string | null;
  placeholder?: string;
  emptyMessage?: string;
  error?: string;
  hint?: string;
  required?: boolean;
  /** Trava a seleção — usado quando o formulário abre a partir de um registro. */
  locked?: boolean;
  /** Avisa a mudança de seleção, para campos que dependem do item escolhido. */
  onValueChange?: (id: string | null) => void;
};

/**
 * Select com busca embutida.
 *
 * Um `<select>` nativo fica inviável com centenas de profissionais, então a
 * lista é filtrada por texto. O valor vai para o FormData num input oculto.
 */
export function SearchableSelect({
  name,
  label,
  options,
  defaultValue = null,
  placeholder = "Selecione",
  emptyMessage = "Nada encontrado.",
  error,
  hint,
  required,
  locked = false,
  onValueChange,
}: SearchableSelectProps) {
  const id = useId();
  const [selectedId, setSelectedId] = useState<string | null>(defaultValue);
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState("");

  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const selected = options.find((option) => option.id === selectedId) ?? null;

  const filtered = useMemo(() => {
    const needle = term.trim().toLowerCase();
    if (!needle) return options;

    return options.filter(
      (option) =>
        option.name.toLowerCase().includes(needle) ||
        option.description?.toLowerCase().includes(needle),
    );
  }, [options, term]);

  useEffect(() => {
    if (!open) return;

    searchRef.current?.focus();

    function handlePointerDown(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const messageId = `${id}-message`;

  return (
    <div className="space-y-1.5">
      <label
        htmlFor={id}
        className="flex items-baseline gap-1.5 text-sm font-medium text-graphite-800"
      >
        {label}
        {!required ? (
          <span className="text-xs font-normal text-graphite-400">(opcional)</span>
        ) : null}
      </label>

      <input type="hidden" name={name} value={selectedId ?? ""} />

      <div ref={containerRef} className="relative">
        <button
          id={id}
          type="button"
          disabled={locked}
          onClick={() => setOpen((current) => !current)}
          aria-haspopup="listbox"
          aria-expanded={open}
          // aria-invalid não vale para role=button; o erro é anunciado
          // pelo texto referenciado em aria-describedby.
          aria-describedby={hint || error ? messageId : undefined}
          className={cn(
            inputBaseClass,
            "flex items-center justify-between gap-2 text-left",
            !selected && "text-graphite-400",
            error && inputErrorClass,
            locked && "cursor-not-allowed bg-graphite-50",
          )}
        >
          <span className="min-w-0 flex-1 truncate">
            {selected ? selected.name : placeholder}
          </span>
          {!locked ? (
            <ChevronDown
              className={cn(
                "size-4 shrink-0 text-graphite-400 transition-transform",
                open && "rotate-180",
              )}
              aria-hidden
            />
          ) : null}
        </button>

        {open ? (
          <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-xl border border-graphite-200 bg-white shadow-popover animate-pop-in">
            <div className="relative border-b border-graphite-100">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-graphite-400"
                aria-hidden
              />
              <input
                ref={searchRef}
                type="text"
                value={term}
                onChange={(event) => setTerm(event.target.value)}
                placeholder="Buscar..."
                aria-label="Buscar na lista"
                className="h-11 w-full border-0 bg-transparent pl-9 pr-9 text-sm text-graphite-900 outline-none placeholder:text-graphite-400"
              />
              {term ? (
                <button
                  type="button"
                  onClick={() => setTerm("")}
                  aria-label="Limpar busca"
                  className="absolute right-2 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded-md text-graphite-400 hover:bg-graphite-100"
                >
                  <X className="size-3.5" aria-hidden />
                </button>
              ) : null}
            </div>

            <ul role="listbox" className="max-h-64 overflow-y-auto scrollbar-slim p-1">
              {filtered.length === 0 ? (
                <li className="px-3 py-6 text-center text-sm text-graphite-500">
                  {emptyMessage}
                </li>
              ) : (
                filtered.map((option) => {
                  const isSelected = option.id === selectedId;

                  return (
                    <li key={option.id}>
                      <button
                        type="button"
                        role="option"
                        aria-selected={isSelected}
                        onClick={() => {
                          setSelectedId(option.id);
                          setOpen(false);
                          setTerm("");
                          onValueChange?.(option.id);
                        }}
                        className={cn(
                          "flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition-colors",
                          isSelected
                            ? "bg-gold-50 text-gold-800"
                            : "text-graphite-700 hover:bg-graphite-50",
                        )}
                      >
                        <Check
                          aria-hidden
                          className={cn(
                            "size-3.5 shrink-0",
                            isSelected ? "opacity-100" : "opacity-0",
                          )}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate">{option.name}</span>
                          {option.description ? (
                            <span className="block truncate text-xs text-graphite-500">
                              {option.description}
                            </span>
                          ) : null}
                        </span>
                      </button>
                    </li>
                  );
                })
              )}
            </ul>
          </div>
        ) : null}
      </div>

      {error ? (
        <p id={messageId} className="text-xs font-medium text-red-600">
          {error}
        </p>
      ) : hint ? (
        <p id={messageId} className="text-xs text-graphite-500">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
