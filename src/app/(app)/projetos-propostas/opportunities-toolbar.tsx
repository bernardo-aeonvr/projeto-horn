"use client";

import { Plus, Search, X } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useState, useTransition } from "react";

import { StatusSummaryCards } from "@/components/opportunities/status-summary-cards";
import { Button } from "@/components/ui/button";
import { inputBaseClass } from "@/components/ui/text-field";
import { PERIOD_LABELS, PERIOD_PRESETS } from "@/lib/contacts/types";
import {
  OPPORTUNITY_STATUSES,
  STATUS_BADGE_LABELS,
  type OpportunityFilters,
  type OpportunityStatusCounts,
  type OpportunityStore,
} from "@/lib/opportunities/types";
import { cn } from "@/lib/utils";

import { ExportOpportunitiesButton } from "./export-opportunities-button";

const SEARCH_DEBOUNCE_MS = 300;

type OpportunitiesToolbarProps = {
  /** `false` para usuário de loja: some o botão de novo projeto. */
  canManage: boolean;
  filters: OpportunityFilters;
  /** Vazio para usuário de loja — não há outra loja para escolher. */
  stores: OpportunityStore[];
  /** Nome do profissional filtrado, quando a tela foi aberta pela ficha dele. */
  professionalName: string | null;
  resultCount: number;
  /** Distribuição por status dentro do mesmo recorte da listagem. */
  statusCounts: OpportunityStatusCounts;
  /** Loja do próprio usuário de loja. `null` para o admin. */
  storeName: string | null;
  onNewOpportunity: () => void;
};

export function OpportunitiesToolbar({
  canManage,
  filters,
  stores,
  professionalName,
  resultCount,
  statusCounts,
  storeName,
  onNewOpportunity,
}: OpportunitiesToolbarProps) {
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
    (next: Partial<OpportunityFilters>) => {
      const merged = { ...filters, ...next };
      const params = new URLSearchParams();

      if (merged.q.trim()) params.set("q", merged.q.trim());
      if (merged.status) params.set("status", merged.status);
      if (merged.storeId) params.set("loja", merged.storeId);
      if (merged.professionalId) params.set("profissional", merged.professionalId);
      if (merged.period !== "todos") params.set("periodo", merged.period);
      if (merged.period === "personalizado") {
        if (merged.from) params.set("de", merged.from);
        if (merged.to) params.set("ate", merged.to);
      }
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
    filters.status !== "" ||
    filters.storeId !== "" ||
    filters.professionalId !== "" ||
    filters.period !== "todos";

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
            placeholder={
              canManage
                ? "Buscar por profissional, loja ou demanda"
                : "Buscar por profissional ou demanda"
            }
            aria-label={
              canManage
                ? "Buscar por profissional, loja ou demanda"
                : "Buscar por profissional ou demanda"
            }
            className={cn(inputBaseClass, "pl-10")}
          />
        </div>

        {/*
          A exportação fica ao lado da ação principal e recebe os mesmos
          filtros da listagem: o que está na tela é o que vai para a planilha.
          Ela também aparece para o usuário de loja, que consulta mas não
          registra — o recorte dele é a própria loja.
        */}
        <div className="flex flex-col gap-3 sm:ml-auto sm:flex-row sm:items-center">
          <ExportOpportunitiesButton
            filters={filters}
            stores={stores}
            professionalName={professionalName}
            storeName={storeName}
          />

          {canManage ? (
            <Button onClick={onNewOpportunity}>
              <Plus className="size-4" aria-hidden />
              Novo projeto
            </Button>
          ) : null}
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <select
          value={filters.status}
          onChange={(event) =>
            applyFilters({
              status: event.target.value as OpportunityFilters["status"],
              page: 1,
            })
          }
          aria-label="Filtrar por status"
          className={cn(
            inputBaseClass,
            "cursor-pointer sm:w-52",
            filters.status && "border-gold-300 bg-gold-50/60",
          )}
        >
          <option value="">Todos os status</option>
          <option value="abertas">Em aberto</option>
          {OPPORTUNITY_STATUSES.map((status) => (
            <option key={status} value={status}>
              {STATUS_BADGE_LABELS[status]}
            </option>
          ))}
        </select>

        {stores.length > 0 ? (
          <select
            value={filters.storeId}
            onChange={(event) =>
              applyFilters({ storeId: event.target.value, page: 1 })
            }
            aria-label="Filtrar por loja"
            className={cn(
              inputBaseClass,
              "cursor-pointer sm:w-56",
              filters.storeId && "border-gold-300 bg-gold-50/60",
            )}
          >
            <option value="">Todas as lojas</option>
            {stores.map((store) => (
              <option key={store.id} value={store.id}>
                {store.name}
                {store.is_active ? "" : " (inativa)"}
              </option>
            ))}
          </select>
        ) : null}

        <select
          value={filters.period}
          onChange={(event) =>
            applyFilters({ period: event.target.value, page: 1 })
          }
          aria-label="Filtrar por período de entrada do projeto"
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
              onChange={(event) =>
                applyFilters({ from: event.target.value, page: 1 })
              }
              aria-label="Data inicial"
              className={cn(inputBaseClass, "w-auto")}
            />
            <span aria-hidden className="text-sm text-graphite-400">
              até
            </span>
            <input
              type="date"
              value={filters.to}
              onChange={(event) =>
                applyFilters({ to: event.target.value, page: 1 })
              }
              aria-label="Data final"
              className={cn(inputBaseClass, "w-auto")}
            />
          </div>
        ) : null}

        {/*
          O filtro por profissional não vira um select: a carteira tem centenas
          de nomes. Ele chega pela URL quando a tela é aberta pela ficha do
          profissional, e a busca por nome cobre o resto.
        */}
        {filters.professionalId ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-gold-50 py-1 pl-3 pr-1 text-sm text-gold-800">
            {professionalName ?? "Profissional selecionado"}
            <button
              type="button"
              onClick={() => applyFilters({ professionalId: "", page: 1 })}
              aria-label="Remover filtro de profissional"
              className="flex size-6 items-center justify-center rounded-full text-gold-700 transition-colors hover:bg-gold-100"
            >
              <X className="size-3.5" aria-hidden />
            </button>
          </span>
        ) : null}

        <p
          aria-live="polite"
          className={cn(
            "text-sm text-graphite-500 transition-opacity",
            pending && "opacity-50",
          )}
        >
          {resultCount} {resultCount === 1 ? "projeto" : "projetos"}
        </p>

        {hasFilters ? (
          <button
            type="button"
            onClick={() =>
              applyFilters({
                q: "",
                status: "",
                storeId: "",
                professionalId: "",
                period: "todos",
                from: "",
                to: "",
                page: 1,
              })
            }
            className="inline-flex items-center gap-1 self-start sm:self-auto rounded text-sm font-medium text-graphite-500 transition-colors hover:text-graphite-900"
          >
            <X className="size-3.5" aria-hidden />
            Limpar filtros
          </button>
        ) : null}
      </div>

      {/*
        O resumo fica entre os filtros e a listagem: ele descreve o mesmo
        recorte que os controles acima produziram, e clicar num card é só
        outro jeito de mexer no seletor de status ao lado.
      */}
      <StatusSummaryCards
        counts={statusCounts}
        selected={filters.status}
        onSelect={(status) => applyFilters({ status, page: 1 })}
        pending={pending}
      />
    </div>
  );
}
