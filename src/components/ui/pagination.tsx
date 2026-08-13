"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";

type PaginationProps = {
  page: number;
  pageCount: number;
  /** Total de registros que atendem aos filtros. */
  totalItems: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  pending?: boolean;
};

export function Pagination({
  page,
  pageCount,
  totalItems,
  pageSize,
  onPageChange,
  pending,
}: PaginationProps) {
  if (pageCount <= 1) return null;

  const first = (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, totalItems);

  return (
    <nav
      aria-label="Paginação"
      className="mt-4 flex flex-col items-center justify-between gap-3 sm:flex-row"
    >
      <p
        aria-live="polite"
        className={cn(
          "text-sm text-graphite-500 transition-opacity",
          pending && "opacity-50",
        )}
      >
        Mostrando <span className="font-medium text-graphite-800">{first}</span>
        {"–"}
        <span className="font-medium text-graphite-800">{last}</span> de{" "}
        <span className="font-medium text-graphite-800">{totalItems}</span>
      </p>

      <div className="flex items-center gap-1">
        <PageButton
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1 || pending}
          label="Página anterior"
        >
          <ChevronLeft className="size-4" aria-hidden />
          <span className="hidden sm:inline">Anterior</span>
        </PageButton>

        <span className="px-3 text-sm text-graphite-600">
          Página <span className="font-medium text-graphite-900">{page}</span> de{" "}
          <span className="font-medium text-graphite-900">{pageCount}</span>
        </span>

        <PageButton
          onClick={() => onPageChange(page + 1)}
          disabled={page >= pageCount || pending}
          label="Próxima página"
        >
          <span className="hidden sm:inline">Próxima</span>
          <ChevronRight className="size-4" aria-hidden />
        </PageButton>
      </div>
    </nav>
  );
}

function PageButton({
  onClick,
  disabled,
  label,
  children,
}: {
  onClick: () => void;
  disabled: boolean | undefined;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="inline-flex h-9 items-center gap-1 rounded-lg border border-graphite-200 bg-white px-3 text-sm font-medium text-graphite-700 transition-colors hover:bg-graphite-50 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-white"
    >
      {children}
    </button>
  );
}
