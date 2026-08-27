"use client";

import { Plus, Search, X } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { inputBaseClass } from "@/components/ui/text-field";
import {
  PROFESSIONAL_STATUS_FILTERS,
  type ProfessionalFilters,
  type ProfessionalStatusFilter,
  type Region,
  type Segment,
} from "@/lib/professionals/types";
import { cn } from "@/lib/utils";

import { ExportProfessionalsButton } from "./export-professionals-button";

const STATUS_LABELS: Record<ProfessionalStatusFilter, string> = {
  todos: "Todos",
  ativos: "Ativos",
  inativos: "Inativos",
};

const SEARCH_DEBOUNCE_MS = 300;

type ProfessionalsToolbarProps = {
  filters: ProfessionalFilters;
  segments: Segment[];
  regions: Region[];
  resultCount: number;
  onNewProfessional: () => void;
};

/**
 * Busca e filtros da listagem.
 *
 * Assim como em Lojas, o estado vive na URL e a consulta acontece no banco —
 * necessário aqui porque a base passa de 400 registros e é paginada.
 */
export function ProfessionalsToolbar({
  filters,
  segments,
  regions,
  resultCount,
  onNewProfessional,
}: ProfessionalsToolbarProps) {
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
    (next: Partial<ProfessionalFilters>) => {
      const merged = { ...filters, ...next };
      const params = new URLSearchParams();

      if (merged.q.trim()) params.set("q", merged.q.trim());
      if (merged.status !== "todos") params.set("status", merged.status);
      if (merged.segmentId) params.set("segmento", merged.segmentId);
      if (merged.regionId) params.set("regiao", merged.regionId);
      // Mudar qualquer filtro volta para a primeira página.
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
    filters.status !== "todos" ||
    filters.segmentId !== "" ||
    filters.regionId !== "";

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
            placeholder="Buscar por nome ou e-mail"
            aria-label="Buscar por nome ou e-mail"
            className={cn(inputBaseClass, "pl-10")}
          />
        </div>

        {/*
          A exportação fica ao lado da ação principal e recebe os mesmos
          filtros da listagem: o que está na tela é o que vai para a planilha.
        */}
        <div className="flex flex-col gap-3 sm:ml-auto sm:flex-row sm:items-center">
          <ExportProfessionalsButton
            filters={filters}
            segments={segments}
            regions={regions}
          />

          <Button onClick={onNewProfessional}>
            <Plus className="size-4" aria-hidden />
            Novo Profissional
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <select
          value={filters.segmentId}
          onChange={(event) => applyFilters({ segmentId: event.target.value })}
          aria-label="Filtrar por segmento"
          className={cn(
            inputBaseClass,
            "cursor-pointer sm:w-56",
            filters.segmentId && "border-gold-300 bg-gold-50/60",
          )}
        >
          <option value="">Todos os segmentos</option>
          {segments.map((segment) => (
            <option key={segment.id} value={segment.id}>
              {segment.name}
            </option>
          ))}
        </select>

        <select
          value={filters.regionId}
          onChange={(event) => applyFilters({ regionId: event.target.value })}
          aria-label="Filtrar por região"
          className={cn(
            inputBaseClass,
            "cursor-pointer sm:w-52",
            filters.regionId && "border-gold-300 bg-gold-50/60",
          )}
        >
          <option value="">Todas as regiões</option>
          {regions.map((region) => (
            <option key={region.id} value={region.id}>
              {region.name}
            </option>
          ))}
        </select>

        <div
          role="group"
          aria-label="Filtrar por status"
          className="inline-flex self-start rounded-lg border border-graphite-200 bg-white p-0.5"
        >
          {PROFESSIONAL_STATUS_FILTERS.map((status) => {
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
          {resultCount}{" "}
          {resultCount === 1 ? "profissional" : "profissionais"}
        </p>

        {hasFilters ? (
          <button
            type="button"
            onClick={() =>
              applyFilters({
                q: "",
                status: "todos",
                segmentId: "",
                regionId: "",
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
