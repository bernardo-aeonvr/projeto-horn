"use client";

import { Plus, Search, X } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { inputBaseClass } from "@/components/ui/text-field";
import type { StoreOption } from "@/lib/contacts/queries";
import {
  CHANNEL_LABELS,
  CONTACT_CHANNELS,
  PERIOD_LABELS,
  PERIOD_PRESETS,
  type ContactFilters,
} from "@/lib/contacts/types";
import { cn } from "@/lib/utils";

const SEARCH_DEBOUNCE_MS = 300;

type ContactsToolbarProps = {
  filters: ContactFilters;
  stores: StoreOption[];
  resultCount: number;
  onNewContact: () => void;
};

export function ContactsToolbar({
  filters,
  stores,
  resultCount,
  onNewContact,
}: ContactsToolbarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  const [term, setTerm] = useState(filters.q);

  const [syncedTerm, setSyncedTerm] = useState(filters.q);
  if (filters.q !== syncedTerm) {
    setSyncedTerm(filters.q);
    setTerm(filters.q);
  }

  const applyFilters = useCallback(
    (next: Partial<ContactFilters>) => {
      const merged = { ...filters, ...next };
      const params = new URLSearchParams();

      if (merged.q.trim()) params.set("q", merged.q.trim());
      if (merged.channel) params.set("canal", merged.channel);
      if (merged.period !== "todos") params.set("periodo", merged.period);
      if (merged.period === "personalizado") {
        if (merged.from) params.set("de", merged.from);
        if (merged.to) params.set("ate", merged.to);
      }
      if (merged.storeId) params.set("loja", merged.storeId);
      if (next.page !== undefined && next.page > 1) {
        params.set("pagina", String(next.page));
      }

      const query = params.toString();
      startTransition(() => {
        router.replace(query ? `${pathname}?${query}` : pathname, {
          scroll: false,
        });
      });
    },
    [filters, pathname, router],
  );

  useEffect(() => {
    if (term.trim() === filters.q) return;

    const timer = setTimeout(() => applyFilters({ q: term }), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [term, filters.q, applyFilters]);

  const hasFilters =
    filters.q !== "" ||
    filters.channel !== "" ||
    filters.period !== "todos" ||
    filters.storeId !== "";

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
            placeholder="Buscar por profissional"
            aria-label="Buscar por profissional"
            className={cn(inputBaseClass, "pl-10")}
          />
        </div>

        <Button onClick={onNewContact} className="sm:ml-auto">
          <Plus className="size-4" aria-hidden />
          Registrar contato
        </Button>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <select
          value={filters.channel}
          onChange={(event) =>
            applyFilters({
              channel: event.target.value as ContactFilters["channel"],
            })
          }
          aria-label="Filtrar por canal"
          className={cn(
            inputBaseClass,
            "cursor-pointer sm:w-44",
            filters.channel && "border-gold-300 bg-gold-50/60",
          )}
        >
          <option value="">Todos os canais</option>
          {CONTACT_CHANNELS.map((channel) => (
            <option key={channel} value={channel}>
              {CHANNEL_LABELS[channel]}
            </option>
          ))}
        </select>

        <select
          value={filters.period}
          onChange={(event) =>
            applyFilters({
              period: event.target.value as ContactFilters["period"],
            })
          }
          aria-label="Filtrar por período"
          className={cn(
            inputBaseClass,
            "cursor-pointer sm:w-44",
            filters.period !== "todos" && "border-gold-300 bg-gold-50/60",
          )}
        >
          {PERIOD_PRESETS.map((preset) => (
            <option key={preset} value={preset}>
              {PERIOD_LABELS[preset]}
            </option>
          ))}
        </select>

        {filters.period === "personalizado" ? (
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={filters.from}
              onChange={(event) => applyFilters({ from: event.target.value })}
              aria-label="Data inicial"
              className={cn(inputBaseClass, "w-auto")}
            />
            <span aria-hidden className="text-sm text-graphite-400">
              até
            </span>
            <input
              type="date"
              value={filters.to}
              onChange={(event) => applyFilters({ to: event.target.value })}
              aria-label="Data final"
              className={cn(inputBaseClass, "w-auto")}
            />
          </div>
        ) : null}

        {stores.length > 0 ? (
          <select
            value={filters.storeId}
            onChange={(event) => applyFilters({ storeId: event.target.value })}
            aria-label="Filtrar por loja apresentada"
            className={cn(
              inputBaseClass,
              "cursor-pointer sm:w-56",
              filters.storeId && "border-gold-300 bg-gold-50/60",
            )}
          >
            <option value="">Todas as lojas apresentadas</option>
            {stores.map((store) => (
              <option key={store.id} value={store.id}>
                {store.name}
                {store.is_active ? "" : " (inativa)"}
              </option>
            ))}
          </select>
        ) : null}

        <p
          aria-live="polite"
          className={cn(
            "text-sm text-graphite-500 transition-opacity",
            pending && "opacity-50",
          )}
        >
          {resultCount} {resultCount === 1 ? "contato" : "contatos"}
        </p>

        {hasFilters ? (
          <button
            type="button"
            onClick={() =>
              applyFilters({
                q: "",
                channel: "",
                period: "todos",
                from: "",
                to: "",
                storeId: "",
                page: 1,
              })
            }
            className="inline-flex items-center gap-1 self-start rounded text-sm font-medium text-graphite-500 transition-colors hover:text-graphite-900"
          >
            <X className="size-3.5" aria-hidden />
            Limpar filtros
          </button>
        ) : null}
      </div>
    </div>
  );
}
