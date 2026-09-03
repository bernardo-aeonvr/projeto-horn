"use client";

import { ChartColumn, ChartPie, type LucideIcon } from "lucide-react";
import { useState } from "react";

import { BarList, type BarItem } from "@/components/dashboard/bar-list";
import { cn } from "@/lib/utils";

/**
 * Distribuição por categoria, em pizza ou em barras.
 *
 * A pizza é o padrão porque a leitura pedida é parte-do-todo à primeira vista.
 * As barras continuam disponíveis: elas comparam grandeza absoluta melhor, e
 * são a leitura certa quando duas categorias ficam próximas — numa pizza,
 * 15% e 13% são praticamente indistinguíveis.
 *
 * ATENÇÃO ao percentual: a soma das fatias não é sempre o total de
 * profissionais. Em "por região" um profissional atua em várias, então a soma
 * passa do total da carteira. Por isso `shareOf` é obrigatório e o denominador
 * aparece escrito embaixo do gráfico — sem isso a pizza afirmaria um todo de
 * 100% que não existe.
 */

/**
 * Cores das fatias, validadas com o script do skill de dataviz na superfície
 * branca do card: faixa de luminosidade, piso de croma, separação para
 * daltonismo (protan/deutan/tritan) e contraste, em todos os pares vizinhos —
 * incluindo o par que fecha a volta, da última fatia com a primeira.
 *
 * O slot 1 é o dourado da marca (gold-600). Os acompanhantes são dessaturados
 * de propósito, para o card continuar com a cara do sistema.
 *
 * A ordem é fixa e a cor acompanha a CATEGORIA, não a posição no ranking: a
 * lista chega na ordem do catálogo (segments.sort_order / regions.sort_order),
 * então mudar o período não repinta as fatias.
 */
const SLICE_COLORS = [
  "#b57f2c",
  "#0e9384",
  "#b4532a",
  "#2563a8",
  "#6b8e23",
  "#9c4f7c",
] as const;

const SIZE = 168;
const RADIUS = 78;
const CENTER = SIZE / 2;

type View = "pizza" | "barras";

type DistributionChartProps = {
  items: BarItem[];
  /** Frase exibida quando não há nenhum valor. */
  emptyMessage: string;
  /** Nota de rodapé, ex.: o aviso de múltiplas regiões por profissional. */
  note?: string;
  /**
   * O que a soma das fatias representa, usado para explicar o denominador do
   * percentual. Ex.: "profissionais na carteira".
   */
  shareOf: string;
  defaultView?: View;
};

type Slice = BarItem & {
  color: string;
  share: number;
  start: number;
  end: number;
};

function pointOnCircle(angle: number) {
  const radians = ((angle - 90) * Math.PI) / 180;

  return {
    x: CENTER + RADIUS * Math.cos(radians),
    y: CENTER + RADIUS * Math.sin(radians),
  };
}

function wedgePath(start: number, end: number) {
  const from = pointOnCircle(start);
  const to = pointOnCircle(end);
  const largeArc = end - start > 180 ? 1 : 0;

  return [
    `M ${CENTER} ${CENTER}`,
    `L ${from.x.toFixed(2)} ${from.y.toFixed(2)}`,
    `A ${RADIUS} ${RADIUS} 0 ${largeArc} 1 ${to.x.toFixed(2)} ${to.y.toFixed(2)}`,
    "Z",
  ].join(" ");
}

/**
 * Acima de seis categorias as menores viram "Outros".
 *
 * Não se gera cor nova: além de seis fatias as vizinhas deixam de ser
 * distinguíveis, e uma sétima cor quebraria a validação da paleta. Os catálogos
 * de hoje têm cinco segmentos e seis regiões, então isto é defensivo.
 */
function foldExtras(items: BarItem[]): BarItem[] {
  if (items.length <= SLICE_COLORS.length) return items;

  const kept = items.slice(0, SLICE_COLORS.length - 1);
  const rest = items.slice(SLICE_COLORS.length - 1);

  return [
    ...kept,
    { label: "Outros", value: rest.reduce((sum, item) => sum + item.value, 0) },
  ];
}

function buildSlices(items: BarItem[]): { slices: Slice[]; total: number } {
  const kept = foldExtras(items);
  const total = kept.reduce((sum, item) => sum + item.value, 0);

  let cursor = 0;

  const slices = kept.map((item, index) => {
    const share = total > 0 ? item.value / total : 0;
    const start = cursor;
    cursor += share * 360;

    return { ...item, color: SLICE_COLORS[index], share, start, end: cursor };
  });

  return { slices, total };
}

const percent = (share: number) =>
  `${(share * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;

export function DistributionChart({
  items,
  emptyMessage,
  note,
  shareOf,
  defaultView = "pizza",
}: DistributionChartProps) {
  const [view, setView] = useState<View>(defaultView);
  const [active, setActive] = useState<string | null>(null);

  const { slices, total } = buildSlices(items);

  if (total === 0) {
    return (
      <p className="py-6 text-sm leading-relaxed text-graphite-500">
        {emptyMessage}
      </p>
    );
  }

  const drawn = slices.filter((slice) => slice.value > 0);

  return (
    <div>
      <div className="mb-4 flex justify-end">
        <div
          role="group"
          aria-label="Formato do gráfico"
          className="inline-flex gap-0.5 rounded-lg border border-graphite-200 p-0.5"
        >
          <ViewButton
            icon={ChartPie}
            label="Pizza"
            active={view === "pizza"}
            onClick={() => setView("pizza")}
          />
          <ViewButton
            icon={ChartColumn}
            label="Barras"
            active={view === "barras"}
            onClick={() => setView("barras")}
          />
        </div>
      </div>

      {view === "barras" ? (
        <BarList items={items} emptyMessage={emptyMessage} note={note} />
      ) : (
        <>
          {/*
            Pizza e legenda andam juntas e centralizadas: nenhuma das duas
            estica para preencher o card, então o par fica no meio em vez de
            deixar um vazio à direita.
          */}
          <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-center sm:justify-center sm:gap-8">
            {/*
              O SVG fica fora da árvore de acessibilidade: a legenda ao lado
              traz rótulo, valor e percentual de cada fatia em texto, então a
              identidade nunca depende só da cor.
            */}
            <svg
              viewBox={`0 0 ${SIZE} ${SIZE}`}
              aria-hidden
              // Cresce com a tela: o espaço que sobra no card vai para o
              // gráfico, não para o vão entre rótulo e número.
              className="size-[168px] shrink-0 lg:size-[200px]"
              onMouseLeave={() => setActive(null)}
            >
              {drawn.length === 1 ? (
                <circle
                  cx={CENTER}
                  cy={CENTER}
                  r={RADIUS}
                  fill={drawn[0].color}
                />
              ) : (
                drawn.map((slice) => (
                  <path
                    key={slice.label}
                    d={wedgePath(slice.start, slice.end)}
                    fill={slice.color}
                    // Folga de 2px entre as fatias, em pixel real: separa as
                    // vizinhas sem depender só da diferença de cor.
                    stroke="#ffffff"
                    strokeWidth={2}
                    vectorEffect="non-scaling-stroke"
                    onMouseEnter={() => setActive(slice.label)}
                    className={cn(
                      "transition-opacity duration-150",
                      active !== null &&
                        active !== slice.label &&
                        "opacity-40",
                    )}
                  >
                    <title>{`${slice.label}: ${slice.value.toLocaleString("pt-BR")} (${percent(slice.share)})`}</title>
                  </path>
                ))
              )}
            </svg>

            {/*
              A legenda não estica junto com o card. Numa tela larga, uma lista
              fluida empurra valor e percentual para a borda direita e desfaz o
              pareamento com o rótulo — a partir de sm a coluna do rótulo mede o
              maior texto e para por aí.

              As colunas são do <ul> e cada <li> as herda por subgrid: os
              números continuam alinhados entre as linhas, e o realce de hover
              continua sendo uma linha só.
            */}
            <ul className="grid w-full min-w-0 grid-cols-[auto_minmax(0,1fr)_auto_3.25rem] gap-y-0.5 sm:w-auto sm:max-w-full">
              {slices.map((slice) => (
                <li
                  key={slice.label}
                  onMouseEnter={() => setActive(slice.label)}
                  onMouseLeave={() => setActive(null)}
                  className={cn(
                    "col-span-4 grid grid-cols-subgrid items-baseline gap-x-2.5 rounded-md px-1.5 py-1 transition-colors",
                    active === slice.label && "bg-graphite-50",
                  )}
                >
                  <span
                    aria-hidden
                    className="size-2.5 translate-y-px rounded-[3px]"
                    style={{ backgroundColor: slice.color }}
                  />
                  <span className="min-w-0 truncate text-sm text-graphite-700">
                    {slice.label}
                  </span>
                  <span className="text-right text-sm font-semibold tabular-nums text-graphite-900">
                    {slice.value.toLocaleString("pt-BR")}
                  </span>
                  <span className="text-right text-xs tabular-nums text-graphite-500">
                    {percent(slice.share)}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {/*
            Diz sobre o que o percentual foi calculado. Em "por região" a soma
            passa do total de profissionais, e sem esta linha a pizza afirmaria
            um todo que não existe.
          */}
          <p className="mt-4 text-xs leading-relaxed text-graphite-500">
            Percentuais sobre {total.toLocaleString("pt-BR")} {shareOf}.
            {note ? ` ${note}` : ""}
          </p>
        </>
      )}
    </div>
  );
}

function ViewButton({
  icon: Icon,
  label,
  active,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      title={`Ver como ${label.toLowerCase()}`}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
        active
          ? "bg-gold-50 text-gold-800"
          : "text-graphite-500 hover:bg-graphite-50 hover:text-graphite-900",
      )}
    >
      <Icon className="size-3.5" aria-hidden />
      {label}
    </button>
  );
}
