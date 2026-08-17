"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback, useTransition } from "react";

import { inputBaseClass } from "@/components/ui/text-field";
import {
  PERIOD_LABELS,
  PERIOD_PRESETS,
  type DashboardPeriod,
} from "@/lib/dashboard/period";
import type { StoreOption } from "@/lib/dashboard/types";
import { cn } from "@/lib/utils";

type DashboardFiltersProps = {
  period: DashboardPeriod;
  from: string;
  to: string;
  /** Rótulo do recorte já resolvido, ex.: "agosto de 2026". */
  rangeLabel: string;
  /** Ausente na visão da loja: ela só tem a si mesma. */
  stores?: StoreOption[];
  storeId?: string;
};

export function DashboardFilters({
  period,
  from,
  to,
  rangeLabel,
  stores,
  storeId = "",
}: DashboardFiltersProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();

  const apply = useCallback(
    (next: {
      period?: DashboardPeriod;
      from?: string;
      to?: string;
      storeId?: string;
    }) => {
      const merged = { period, from, to, storeId, ...next };
      const params = new URLSearchParams();

      if (merged.period !== "mes") params.set("periodo", merged.period);
      if (merged.period === "personalizado") {
        if (merged.from) params.set("de", merged.from);
        if (merged.to) params.set("ate", merged.to);
      }
      if (merged.storeId) params.set("loja", merged.storeId);

      const query = params.toString();
      startTransition(() => {
        router.replace(query ? `${pathname}?${query}` : pathname, {
          scroll: false,
        });
      });
    },
    [period, from, to, storeId, pathname, router],
  );

  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
      <select
        value={period}
        onChange={(event) =>
          apply({ period: event.target.value as DashboardPeriod })
        }
        aria-label="Filtrar por período"
        className={cn(
          inputBaseClass,
          "cursor-pointer sm:w-52",
          period !== "mes" && "border-gold-300 bg-gold-50/60",
        )}
      >
        {PERIOD_PRESETS.map((preset) => (
          <option key={preset} value={preset}>
            {PERIOD_LABELS[preset]}
          </option>
        ))}
      </select>

      {period === "personalizado" ? (
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={from}
            onChange={(event) => apply({ from: event.target.value })}
            aria-label="Data inicial"
            className={cn(inputBaseClass, "w-auto")}
          />
          <span aria-hidden className="text-sm text-graphite-400">
            até
          </span>
          <input
            type="date"
            value={to}
            onChange={(event) => apply({ to: event.target.value })}
            aria-label="Data final"
            className={cn(inputBaseClass, "w-auto")}
          />
        </div>
      ) : null}

      {stores ? (
        <select
          value={storeId}
          onChange={(event) => apply({ storeId: event.target.value })}
          aria-label="Filtrar por loja"
          className={cn(
            inputBaseClass,
            "cursor-pointer sm:w-56",
            storeId && "border-gold-300 bg-gold-50/60",
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

      <p
        aria-live="polite"
        className={cn(
          "text-sm text-graphite-500 transition-opacity",
          pending && "opacity-50",
        )}
      >
        {rangeLabel}
      </p>
    </div>
  );
}
