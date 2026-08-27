"use client";

import { useEffect, useRef, useState } from "react";

import { formatBucketLabel } from "@/lib/dashboard/period";
import type { TrendPoint } from "@/lib/dashboard/types";
import { cn } from "@/lib/utils";

/**
 * Evolução da atividade no período.
 *
 * SVG escrito à mão em vez de uma biblioteca de gráficos: são três séries e um
 * eixo, e o projeto inteiro só depende de clsx, lucide e tailwind-merge.
 * Trazer uma dependência de ~500 KB para desenhar isto não se paga.
 *
 * A largura vem de um ResizeObserver, não de um viewBox escalado — assim o
 * texto mantém o mesmo tamanho no celular e no desktop, e o ponto sob o cursor
 * é calculado em pixels reais.
 *
 * LEGENDA QUE LIGA E DESLIGA SÉRIE
 *
 * As séries vivem em escalas muito diferentes — centenas de contatos para uma
 * dezena de fechamentos —, e a maior achata as outras contra o eixo. Clicar na
 * legenda esconde a série, e o teto do eixo é recalculado só com as visíveis:
 * o que sobra volta a ocupar a altura do gráfico.
 *
 * É estado local e puramente visual. Não toca nos dados, que continuam vindo
 * prontos do servidor: trocar período ou loja recarrega `points` sem consultar
 * o que está escondido.
 */

const SERIES = [
  {
    key: "professionals_contacted",
    label: "Profissionais contatados",
    color: "#cd9738",
  },
  { key: "projects_received", label: "Projetos recebidos", color: "#7b858f" },
  { key: "deals_closed", label: "Negócios fechados", color: "#059669" },
] as const;

type SeriesKey = (typeof SERIES)[number]["key"];

const HEIGHT = 260;
const PAD = { top: 16, right: 12, bottom: 28, left: 36 };

/** "a, b e c" — para o rótulo de acessibilidade do SVG. */
const joinLabels = (labels: string[]) =>
  labels.length <= 1
    ? (labels[0] ?? "")
    : `${labels.slice(0, -1).join(", ")} e ${labels[labels.length - 1]}`;

type TrendChartProps = {
  points: TrendPoint[];
  bucket: "day" | "month";
};

export function TrendChart({ points, bucket }: TrendChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [hover, setHover] = useState<number | null>(null);
  const [hidden, setHidden] = useState<ReadonlySet<SeriesKey>>(
    () => new Set<SeriesKey>(),
  );

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;

    const observer = new ResizeObserver(([entry]) => {
      setWidth(entry.contentRect.width);
    });

    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const toggle = (key: SeriesKey) => {
    setHidden((current) => {
      const next = new Set(current);
      // `delete` devolve false quando a série não estava lá: um passo só.
      if (!next.delete(key)) next.add(key);
      return next;
    });
  };

  const visible = SERIES.filter((series) => !hidden.has(series.key));

  // Teto de TODAS as séries: decide se há o que mostrar no período. Separado do
  // teto do eixo para que esconder tudo não caia no vazio de "sem atividade" —
  // ali a legenda some junto, e não haveria como religar as séries.
  const dataMax = Math.max(
    ...points.flatMap((point) =>
      SERIES.map((series) => point[series.key] as number),
    ),
    0,
  );

  if (points.length === 0 || dataMax === 0) {
    return (
      <div
        ref={containerRef}
        className="flex h-[260px] items-center justify-center rounded-lg border border-dashed border-graphite-200 px-6 text-center"
      >
        <p className="text-sm leading-relaxed text-graphite-500">
          Nenhuma atividade registrada neste período.
        </p>
      </div>
    );
  }

  // Teto só das visíveis: é o que faz a escala se ajustar ao esconder a maior.
  const maxValue = Math.max(
    ...points.flatMap((point) =>
      visible.map((series) => point[series.key] as number),
    ),
    0,
  );

  // Teto "redondo" para a régua não terminar num número quebrado.
  const step = Math.max(1, Math.ceil(maxValue / 4));
  const yMax = step * 4;

  const innerWidth = Math.max(0, width - PAD.left - PAD.right);
  const innerHeight = HEIGHT - PAD.top - PAD.bottom;

  const xAt = (index: number) =>
    points.length === 1
      ? PAD.left + innerWidth / 2
      : PAD.left + (index / (points.length - 1)) * innerWidth;

  const yAt = (value: number) =>
    PAD.top + innerHeight - (value / yMax) * innerHeight;

  // Com muitos pontos, rotular todos vira borrão: mostra ~6 marcas.
  const labelEvery = Math.max(1, Math.ceil(points.length / 6));

  const active = hover !== null && visible.length > 0 ? points[hover] : null;

  return (
    <div>
      {/*
        A legenda é o controle. Fora da cor, o estado escondido aparece no risco
        sobre o rótulo e no ponto vazado — quem não distingue as cores continua
        enxergando o que está ligado.
      */}
      <div className="mb-3 flex flex-wrap gap-x-1 gap-y-0.5">
        {SERIES.map((series) => {
          const isHidden = hidden.has(series.key);

          return (
            <button
              key={series.key}
              type="button"
              onClick={() => toggle(series.key)}
              aria-pressed={!isHidden}
              title={
                isHidden ? `Mostrar ${series.label}` : `Ocultar ${series.label}`
              }
              className={cn(
                "inline-flex items-center gap-2 rounded-md px-2 py-1 text-xs transition-colors hover:bg-graphite-50",
                isHidden
                  ? "text-graphite-400 line-through decoration-graphite-300"
                  : "text-graphite-600",
              )}
            >
              <span
                aria-hidden
                className="size-2.5 shrink-0 rounded-full border-2"
                style={{
                  borderColor: series.color,
                  backgroundColor: isHidden ? "transparent" : series.color,
                }}
              />
              {series.label}
            </button>
          );
        })}
      </div>

      <div ref={containerRef} className="relative">
        {visible.length === 0 ? (
          /* Todas desligadas: o gráfico sai, a legenda fica para religar. */
          <div className="flex h-[260px] items-center justify-center rounded-lg border border-dashed border-graphite-200 px-6 text-center">
            <p className="text-sm leading-relaxed text-graphite-500">
              Selecione ao menos uma série para visualizar os dados.
            </p>
          </div>
        ) : width > 0 ? (
          <svg
            width={width}
            height={HEIGHT}
            role="img"
            aria-label={`Evolução por ${bucket === "day" ? "dia" : "mês"}: ${joinLabels(
              visible.map((series) => series.label.toLowerCase()),
            )}.`}
            onMouseLeave={() => setHover(null)}
            onMouseMove={(event) => {
              const bounds = event.currentTarget.getBoundingClientRect();
              const x = event.clientX - bounds.left;
              const ratio = (x - PAD.left) / (innerWidth || 1);
              const index = Math.round(ratio * (points.length - 1));

              setHover(Math.min(points.length - 1, Math.max(0, index)));
            }}
            className="touch-none"
          >
            {/* Régua horizontal */}
            {Array.from({ length: 5 }, (_, i) => {
              const value = (yMax / 4) * i;
              const y = yAt(value);

              return (
                <g key={value}>
                  <line
                    x1={PAD.left}
                    x2={width - PAD.right}
                    y1={y}
                    y2={y}
                    stroke="#eceef0"
                    strokeWidth={1}
                  />
                  <text
                    x={PAD.left - 8}
                    y={y + 4}
                    textAnchor="end"
                    className="fill-graphite-400 text-[10px] tabular-nums"
                  >
                    {value}
                  </text>
                </g>
              );
            })}

            {/* Marcas do eixo horizontal */}
            {points.map((point, index) =>
              index % labelEvery === 0 || index === points.length - 1 ? (
                <text
                  key={point.bucket_start}
                  x={xAt(index)}
                  y={HEIGHT - 8}
                  /*
                    Centralizado no meio, mas ancorado nas pontas: com
                    textAnchor="middle" metade do primeiro e do último rótulo
                    ficava fora do SVG e aparecia cortada.
                  */
                  textAnchor={
                    index === 0
                      ? "start"
                      : index === points.length - 1
                        ? "end"
                        : "middle"
                  }
                  className="fill-graphite-400 text-[10px] tabular-nums"
                >
                  {formatBucketLabel(point.bucket_start, bucket)}
                </text>
              ) : null,
            )}

            {active !== null && hover !== null ? (
              <line
                x1={xAt(hover)}
                x2={xAt(hover)}
                y1={PAD.top}
                y2={PAD.top + innerHeight}
                stroke="#c1c7cd"
                strokeWidth={1}
                strokeDasharray="3 3"
              />
            ) : null}

            {visible.map((series) => {
              const path = points
                .map(
                  (point, index) =>
                    `${index === 0 ? "M" : "L"} ${xAt(index)} ${yAt(point[series.key] as number)}`,
                )
                .join(" ");

              return (
                <g key={series.key}>
                  <path
                    d={path}
                    fill="none"
                    stroke={series.color}
                    strokeWidth={2}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                  />
                  {/* Com poucos pontos a linha sozinha some; o ponto ancora a leitura. */}
                  {points.length <= 31
                    ? points.map((point, index) => (
                        <circle
                          key={point.bucket_start}
                          cx={xAt(index)}
                          cy={yAt(point[series.key] as number)}
                          r={hover === index ? 4 : 2.5}
                          fill="#ffffff"
                          stroke={series.color}
                          strokeWidth={2}
                        />
                      ))
                    : null}
                </g>
              );
            })}
          </svg>
        ) : (
          <div className="h-[260px]" />
        )}

        {active !== null ? (
          <div
            className="pointer-events-none absolute top-2 z-10 min-w-[10rem] rounded-lg border border-graphite-200 bg-white px-3 py-2 shadow-popover"
            style={{
              // Segura o balão dentro do gráfico nas bordas.
              left: Math.min(Math.max(xAt(hover ?? 0) - 80, 0), Math.max(0, width - 170)),
            }}
          >
            <p className="text-xs font-medium text-graphite-900">
              {formatBucketLabel(active.bucket_start, bucket)}
            </p>
            <ul className="mt-1.5 space-y-1">
              {visible.map((series) => (
                <li
                  key={series.key}
                  className="flex items-center justify-between gap-3 text-xs"
                >
                  <span className="inline-flex items-center gap-1.5 text-graphite-600">
                    <span
                      aria-hidden
                      className="size-2 rounded-full"
                      style={{ backgroundColor: series.color }}
                    />
                    {series.label}
                  </span>
                  <span className="font-semibold tabular-nums text-graphite-900">
                    {active[series.key] as number}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </div>
  );
}
