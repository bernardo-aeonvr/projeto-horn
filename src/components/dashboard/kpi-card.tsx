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
 *
 * ALINHAMENTO ENTRE CARDS
 *
 * O card ocupa três faixas do grid pai (`row-span-3` + `grid-rows-subgrid`),
 * uma para cada linha: rótulo, número e apoio. Como as faixas são do pai,
 * todos os cards da mesma linha visual compartilham a mesma altura em cada
 * uma delas.
 *
 * Sem isso, um rótulo que quebra em duas linhas empurra o número para baixo só
 * naquele card, e os números da faixa ficam em alturas diferentes — foi o que
 * acontecia ao estreitar a tela.
 *
 * Reservar altura fixa no rótulo resolveria o caso de duas linhas e quebraria
 * de novo na primeira que precisasse de três. O subgrid não depende de adivinhar
 * quantas linhas o texto vai ocupar.
 *
 * O espaçamento interno passa a vir do `gap-y` do grid pai: em subgrid o
 * espaçamento do próprio elemento é ignorado no eixo herdado.
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
        "row-span-3 grid grid-rows-subgrid rounded-card border bg-white px-4 py-4 shadow-card sm:px-5",
        emphasis ? "border-gold-200 bg-gold-50/40" : "border-graphite-200",
      )}
    >
      <p className="text-xs font-medium uppercase tracking-[0.08em] text-graphite-500">
        {label}
      </p>

      {/*
        O corpo do número encolhe quando o texto é longo. "R$ 112.500,00" tem
        o dobro da largura de "10" e, com cinco cards na mesma linha, o valor
        vazava para fora do card no desktop.
      */}
      <p
        className={cn(
          "self-start font-semibold tabular-nums text-graphite-900",
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
        <p className="text-xs leading-relaxed text-graphite-500">{hint}</p>
      ) : null}
    </div>
  );
}
