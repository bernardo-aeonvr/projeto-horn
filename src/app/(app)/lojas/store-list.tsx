"use client";

import { Loader2, Pencil, Power, PowerOff } from "lucide-react";
import { useTransition } from "react";

import { formatCurrency, formatPercent } from "@/lib/stores/format";
import type { Store } from "@/lib/stores/types";
import { cn } from "@/lib/utils";

type StoreListProps = {
  stores: Store[];
  onEdit: (store: Store) => void;
  onToggleActive: (store: Store) => void;
  /** Id da loja cujo status está sendo alterado. */
  pendingId: string | null;
};

export function StoreStatusBadge({ active }: { active: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
        active
          ? "bg-emerald-50 text-emerald-700"
          : "bg-graphite-100 text-graphite-600",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "size-1.5 rounded-full",
          active ? "bg-emerald-500" : "bg-graphite-400",
        )}
      />
      {active ? "Ativa" : "Inativa"}
    </span>
  );
}

function RowActions({
  store,
  onEdit,
  onToggleActive,
  pending,
  variant,
}: {
  store: Store;
  onEdit: (store: Store) => void;
  onToggleActive: (store: Store) => void;
  pending: boolean;
  variant: "table" | "card";
}) {
  const toggleLabel = store.is_active ? "Inativar" : "Ativar";
  const ToggleIcon = store.is_active ? PowerOff : Power;

  if (variant === "card") {
    return (
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => onEdit(store)}
          className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg border border-graphite-200 text-sm font-medium text-graphite-700 transition-colors hover:bg-graphite-50"
        >
          <Pencil className="size-3.5" aria-hidden />
          Editar
        </button>
        <button
          type="button"
          onClick={() => onToggleActive(store)}
          disabled={pending}
          className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg border border-graphite-200 text-sm font-medium text-graphite-700 transition-colors hover:bg-graphite-50 disabled:opacity-60"
        >
          {pending ? (
            <Loader2 className="size-3.5 animate-spin" aria-hidden />
          ) : (
            <ToggleIcon className="size-3.5" aria-hidden />
          )}
          {toggleLabel}
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-end gap-1">
      <button
        type="button"
        onClick={() => onEdit(store)}
        title="Editar"
        aria-label={`Editar ${store.name}`}
        className="flex size-9 items-center justify-center rounded-lg text-graphite-500 transition-colors hover:bg-graphite-100 hover:text-graphite-900"
      >
        <Pencil className="size-4" aria-hidden />
      </button>

      <button
        type="button"
        onClick={() => onToggleActive(store)}
        disabled={pending}
        title={toggleLabel}
        aria-label={`${toggleLabel} ${store.name}`}
        className="flex size-9 items-center justify-center rounded-lg text-graphite-500 transition-colors hover:bg-graphite-100 hover:text-graphite-900 disabled:opacity-60"
      >
        {pending ? (
          <Loader2 className="size-4 animate-spin" aria-hidden />
        ) : (
          <ToggleIcon className="size-4" aria-hidden />
        )}
      </button>
    </div>
  );
}

export function StoreList({
  stores,
  onEdit,
  onToggleActive,
  pendingId,
}: StoreListProps) {
  const [, startTransition] = useTransition();

  const handleToggle = (store: Store) => {
    startTransition(() => onToggleActive(store));
  };

  return (
    <>
      {/* Desktop — tabela */}
      <div className="hidden overflow-hidden rounded-card border border-graphite-200 bg-white shadow-card lg:block">
        <table className="w-full border-collapse text-sm">
          <caption className="sr-only">
            Lojas representadas pela HORN
          </caption>
          <thead>
            <tr className="border-b border-graphite-200 bg-graphite-50/70 text-left">
              <Th>Loja</Th>
              <Th>Segmento</Th>
              <Th>Responsável</Th>
              <Th align="right">Valor mensal</Th>
              <Th align="right">Comissão</Th>
              <Th>Status</Th>
              <Th align="right">
                <span className="sr-only">Ações</span>
              </Th>
            </tr>
          </thead>
          <tbody>
            {stores.map((store) => (
              <tr
                key={store.id}
                className={cn(
                  "border-b border-graphite-100 last:border-0 transition-colors hover:bg-graphite-50/50",
                  !store.is_active && "text-graphite-500",
                )}
              >
                <td className="px-4 py-3.5">
                  <p
                    className={cn(
                      "font-medium",
                      store.is_active ? "text-graphite-900" : "text-graphite-600",
                    )}
                  >
                    {store.name}
                  </p>
                  {store.phone ? (
                    <p className="mt-0.5 text-xs text-graphite-500">
                      {store.phone}
                    </p>
                  ) : null}
                </td>
                <td className="px-4 py-3.5 text-graphite-600">
                  {store.category ?? "—"}
                </td>
                <td className="px-4 py-3.5 text-graphite-600">
                  {store.contact_name ?? "—"}
                </td>
                <td className="px-4 py-3.5 text-right tabular-nums text-graphite-700">
                  {formatCurrency(store.monthly_fixed_fee)}
                </td>
                <td className="px-4 py-3.5 text-right tabular-nums text-graphite-700">
                  {formatPercent(store.default_commission_percent)}
                </td>
                <td className="px-4 py-3.5">
                  <StoreStatusBadge active={store.is_active} />
                </td>
                <td className="px-2 py-2.5">
                  <RowActions
                    store={store}
                    onEdit={onEdit}
                    onToggleActive={handleToggle}
                    pending={pendingId === store.id}
                    variant="table"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile e tablet — cards */}
      <ul className="space-y-3 lg:hidden">
        {stores.map((store) => (
          <li
            key={store.id}
            className="rounded-card border border-graphite-200 bg-white p-4 shadow-card"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-medium text-graphite-900">
                  {store.name}
                </p>
                <p className="mt-0.5 truncate text-sm text-graphite-500">
                  {store.category ?? "Sem segmento"}
                </p>
              </div>
              <StoreStatusBadge active={store.is_active} />
            </div>

            <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-graphite-100 pt-3.5 text-sm">
              <Cell label="Responsável" value={store.contact_name ?? "—"} />
              <Cell label="Telefone" value={store.phone ?? "—"} />
              <Cell
                label="Valor mensal"
                value={formatCurrency(store.monthly_fixed_fee)}
              />
              <Cell
                label="Comissão"
                value={formatPercent(store.default_commission_percent)}
              />
            </dl>

            <div className="mt-4">
              <RowActions
                store={store}
                onEdit={onEdit}
                onToggleActive={handleToggle}
                pending={pendingId === store.id}
                variant="card"
              />
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}

function Th({
  children,
  align = "left",
}: {
  children: React.ReactNode;
  align?: "left" | "right";
}) {
  return (
    <th
      scope="col"
      className={cn(
        "px-4 py-3 text-xs font-semibold uppercase tracking-[0.06em] text-graphite-500",
        align === "right" && "text-right",
      )}
    >
      {children}
    </th>
  );
}

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-graphite-500">{label}</dt>
      <dd className="truncate text-graphite-800 tabular-nums">{value}</dd>
    </div>
  );
}
