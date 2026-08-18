import { cn } from "@/lib/utils";

export type BarItem = { label: string; value: number };

type BarListProps = {
  items: BarItem[];
  /** Frase exibida quando não há nenhum valor. */
  emptyMessage: string;
  /** Nota de rodapé, ex.: o aviso de múltiplas regiões por profissional. */
  note?: string;
};

/**
 * Distribuição em barras horizontais.
 *
 * É a visão alternativa do DistributionChart, que abre em pizza. Continua
 * valendo a pena: a barra compara quantidade absoluta melhor que a fatia, e é
 * a leitura honesta quando a soma não forma um todo — em "por região" um
 * profissional atua em várias, então a soma passa do total da carteira.
 *
 * As barras são proporcionais ao maior valor da lista, não à soma, para as
 * categorias pequenas continuarem visíveis.
 */
export function BarList({ items, emptyMessage, note }: BarListProps) {
  const max = Math.max(...items.map((item) => item.value), 0);

  if (max === 0) {
    return (
      <p className="py-6 text-sm leading-relaxed text-graphite-500">
        {emptyMessage}
      </p>
    );
  }

  return (
    <div>
      <ul className="space-y-3">
        {items.map((item) => {
          const share = max > 0 ? (item.value / max) * 100 : 0;

          return (
            <li key={item.label}>
              <div className="flex items-baseline justify-between gap-3">
                <span className="truncate text-sm text-graphite-700">
                  {item.label}
                </span>
                <span className="shrink-0 text-sm font-semibold tabular-nums text-graphite-900">
                  {item.value.toLocaleString("pt-BR")}
                </span>
              </div>

              <div
                className="mt-1.5 h-2 overflow-hidden rounded-full bg-graphite-100"
                role="presentation"
              >
                <div
                  className={cn(
                    "h-full rounded-full transition-[width] duration-500",
                    item.value > 0 ? "bg-gold-400" : "bg-transparent",
                  )}
                  style={{ width: `${share}%` }}
                />
              </div>
            </li>
          );
        })}
      </ul>

      {note ? (
        <p className="mt-4 text-xs leading-relaxed text-graphite-500">{note}</p>
      ) : null}
    </div>
  );
}
