import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

type EmptyStateProps = {
  icon: LucideIcon;
  title: string;
  description: string;
  /** "gold" para o primeiro uso de um módulo, "neutral" para busca sem resultado. */
  tone?: "gold" | "neutral";
  action?: React.ReactNode;
};

/** Painel tracejado usado quando uma listagem não tem o que mostrar. */
export function EmptyState({
  icon: Icon,
  title,
  description,
  tone = "gold",
  action,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center rounded-card border border-dashed border-graphite-300 bg-white px-6 py-14 text-center sm:py-16">
      <span
        className={cn(
          "mb-5 flex size-12 items-center justify-center rounded-xl",
          tone === "gold" ? "bg-gold-50" : "bg-graphite-100",
        )}
      >
        <Icon
          className={cn(
            "size-6",
            tone === "gold" ? "text-gold-600" : "text-graphite-500",
          )}
          aria-hidden
        />
      </span>

      <h2 className="text-lg font-semibold text-graphite-900">{title}</h2>
      <p className="mt-2 max-w-md text-sm leading-relaxed text-graphite-500">
        {description}
      </p>

      {action ? <div className="mt-6">{action}</div> : null}
    </div>
  );
}

/** Variante de erro, para falha ao carregar dados. */
export function ErrorState({
  icon: Icon,
  title,
  message,
}: {
  icon: LucideIcon;
  title: string;
  message: string;
}) {
  return (
    <div
      role="alert"
      className="flex flex-col items-center rounded-card border border-red-200 bg-red-50/60 px-6 py-12 text-center"
    >
      <span className="mb-4 flex size-12 items-center justify-center rounded-xl bg-red-100">
        <Icon className="size-6 text-red-600" aria-hidden />
      </span>

      <h2 className="text-lg font-semibold text-graphite-900">{title}</h2>
      <p className="mt-2 max-w-md text-sm leading-relaxed text-graphite-600">
        {message}
      </p>
    </div>
  );
}
