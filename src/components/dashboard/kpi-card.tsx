import { cn } from "@/lib/utils";

type KpiCardProps = {
  label: string;
  value: string;
  /** Linha de apoio: o que aquele número significa. */
  hint?: string;
  /** Destaca o card principal do bloco, sem encher a tela de dourado. */
  emphasis?: boolean;
  /** Números menores, para as faixas secundárias de KPI. */
  size?: "md" | "sm";
};

/**
 * Card de indicador.
 *
 * O número manda: fica grande, tabular e sozinho. Sem ícone decorativo — o
 * rótulo já diz o que é, e um ícone por card viraria ruído numa tela com
 * mais de dez indicadores.
 */
export function KpiCard({
  label,
  value,
  hint,
  emphasis,
  size = "md",
}: KpiCardProps) {
  return (
    <div
      className={cn(
        "rounded-card border bg-white px-4 py-4 shadow-card sm:px-5",
        emphasis ? "border-gold-200 bg-gold-50/40" : "border-graphite-200",
      )}
    >
      <p className="text-xs font-medium uppercase tracking-[0.08em] text-graphite-500">
        {label}
      </p>

      {/*
        O corpo do número encolhe quando o texto é longo. "R$ 112.500,00" tem
        o dobro da largura de "10" e, com seis cards na mesma linha, o valor
        vazava para fora do card no desktop.
      */}
      <p
        className={cn(
          "mt-2 font-semibold tabular-nums text-graphite-900",
          value.length > 11
            ? "text-xl"
            : value.length > 7
              ? "text-2xl"
              : size === "md"
                ? "text-3xl"
                : "text-2xl",
        )}
      >
        {value}
      </p>

      {hint ? (
        <p className="mt-1 text-xs leading-relaxed text-graphite-500">{hint}</p>
      ) : null}
    </div>
  );
}
