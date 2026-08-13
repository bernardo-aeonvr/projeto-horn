"use client";

import { Plus, Search, X } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { inputBaseClass } from "@/components/ui/text-field";
import {
  STORE_STATUS_FILTERS,
  type StoreFilters,
  type StoreStatusFilter,
} from "@/lib/stores/types";
import { cn } from "@/lib/utils";

const STATUS_LABELS: Record<StoreStatusFilter, string> = {
  todas: "Todas",
  ativas: "Ativas",
  inativas: "Inativas",
};

const SEARCH_DEBOUNCE_MS = 300;

type StoresToolbarProps = {
  filters: StoreFilters;
  categories: string[];
  resultCount: number;
  onNewStore: () => void;
};

/**
 * Busca e filtros da listagem.
 *
 * O estado vive na URL: a página é um Server Component e refaz a query a
 * cada mudança, o que mantém o resultado compartilhável e o botão voltar
 * funcionando.
 */
export function StoresToolbar({
  filters,
  categories,
  resultCount,
  onNewStore,
}: StoresToolbarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  const [term, setTerm] = useState(filters.q);

  // Mantém o input em sincronia quando a URL muda por fora (voltar, limpar).
  const [syncedTerm, setSyncedTerm] = useState(filters.q);
  if (filters.q !== syncedTerm) {
    setSyncedTerm(filters.q);
    setTerm(filters.q);
  }

  const applyFilters = useCallback(
    (next: Partial<StoreFilters>) => {
      const merged = { ...filters, ...next };
      const params = new URLSearchParams();

      if (merged.q.trim()) params.set("q", merged.q.trim());
      if (merged.status !== "todas") params.set("status", merged.status);
      if (merged.category) params.set("segmento", merged.category);

      const query = params.toString();
      startTransition(() => {
        router.replace(query ? `${pathname}?${query}` : pathname, {
          scroll: false,
        });
      });
    },
    [filters, pathname, router],
  );

  // Debounce da busca. Quando o termo já bate com a URL não há o que enviar,
  // então a navegação de volta não dispara um novo replace.
  useEffect(() => {
    if (term.trim() === filters.q) return;

    const timer = setTimeout(() => applyFilters({ q: term }), SEARCH_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [term, filters.q, applyFilters]);

  const hasFilters =
    filters.q !== "" || filters.status !== "todas" || filters.category !== "";

  return (
    <div className="mb-5 space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1 sm:max-w-xs">
          <Search
            className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-graphite-400"
            aria-hidden
          />
          <input
            type="search"
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            placeholder="Buscar por nome da loja"
            aria-label="Buscar por nome da loja"
            className={cn(inputBaseClass, "pl-10")}
          />
        </div>

        {categories.length > 0 ? (
          <select
            value={filters.category}
            onChange={(event) =>
              applyFilters({ category: event.target.value })
            }
            aria-label="Filtrar por segmento"
            className={cn(
              inputBaseClass,
              "cursor-pointer sm:w-52",
              filters.category && "border-gold-300 bg-gold-50/60",
            )}
          >
            <option value="">Todos os segmentos</option>
            {categories.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
        ) : null}

        <Button onClick={onNewStore} className="sm:ml-auto">
          <Plus className="size-4" aria-hidden />
          Nova Loja
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div
          role="group"
          aria-label="Filtrar por status"
          className="inline-flex rounded-lg border border-graphite-200 bg-white p-0.5"
        >
          {STORE_STATUS_FILTERS.map((status) => {
            const active = filters.status === status;

            return (
              <button
                key={status}
                type="button"
                aria-pressed={active}
                onClick={() => applyFilters({ status })}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                  active
                    ? "bg-graphite-900 text-white"
                    : "text-graphite-600 hover:bg-graphite-50 hover:text-graphite-900",
                )}
              >
                {STATUS_LABELS[status]}
              </button>
            );
          })}
        </div>

        <p
          aria-live="polite"
          className={cn(
            "text-sm text-graphite-500 transition-opacity",
            pending && "opacity-50",
          )}
        >
          {resultCount} {resultCount === 1 ? "loja" : "lojas"}
        </p>

        {hasFilters ? (
          <button
            type="button"
            onClick={() =>
              applyFilters({ q: "", status: "todas", category: "" })
            }
            className="inline-flex items-center gap-1 rounded text-sm font-medium text-graphite-500 transition-colors hover:text-graphite-900"
          >
            <X className="size-3.5" aria-hidden />
            Limpar filtros
          </button>
        ) : null}
      </div>
    </div>
  );
}
