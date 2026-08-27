"use client";

import { ChevronDown } from "lucide-react";
import { useId, useState } from "react";

import { cn } from "@/lib/utils";

/**
 * Card de seção do dashboard.
 *
 * Era uma função idêntica declarada no fim de `admin-dashboard.tsx` e de
 * `store-dashboard.tsx`. Virou componente único quando o recolher entrou: a
 * alternativa era manter a mesma lógica de estado, ícone e rótulo em duas
 * cópias que já tinham divergido uma vez.
 *
 * RECOLHER
 *
 * O gráfico de evolução ocupa 260 px de altura e empurra o resto da tela para
 * baixo numa apresentação. Recolher resolve isso sem esconder o que a seção é:
 * o cabeçalho fica, só o corpo sai.
 *
 * O conteúdo é escondido com o atributo `hidden`, não desmontado. Duas razões:
 *
 *   - o estado interno dos filhos sobrevive — a página do `StoreResultsTable`,
 *     as séries ligadas do `TrendChart`, o modo pizza/barras do
 *     `DistributionChart`. Recolher e abrir devolve a seção como estava;
 *   - os dados vêm prontos do servidor, então remontar não buscaria nada de
 *     novo. Só jogaria fora a escolha do usuário.
 *
 * O `TrendChart` mede a própria largura com ResizeObserver. Escondido ele
 * recebe 0 e desenha o placeholder; ao reabrir, o observer dispara com a
 * largura real e o SVG volta no tamanho certo — inclusive se a janela mudou de
 * tamanho enquanto a seção estava fechada. Nada a sincronizar à mão.
 *
 * Sem animação de altura de propósito: o ResizeObserver do gráfico dispararia a
 * cada quadro da transição, redesenhando o SVG dezenas de vezes. A única
 * transição é a do chevron.
 */

type SectionProps = {
  title: string;
  description?: string;
  children: React.ReactNode;
};

export function Section({ title, description, children }: SectionProps) {
  const [expanded, setExpanded] = useState(true);
  const contentId = useId();

  return (
    <section className="mt-4 rounded-card border border-graphite-200 bg-white p-4 shadow-card sm:p-5">
      <div className="flex items-start justify-between gap-3">
        {/* min-w-0: sem isso o título longo empurra o botão para fora do card. */}
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-graphite-900">{title}</h2>
          {/*
            A descrição sai junto com o conteúdo. Ela explica como ler o que
            está embaixo; recolhida, seriam três linhas de texto no celular
            ocupando o espaço que o usuário acabou de pedir de volta.
          */}
          {description && expanded ? (
            <p className="mt-1 text-xs leading-relaxed text-graphite-500">
              {description}
            </p>
          ) : null}
        </div>

        {/*
          Só o botão recolhe. O cabeçalho inteiro como alvo de clique seria
          arriscado aqui: as seções têm gráfico com hover, alternador de
          pizza/barras, legenda clicável e paginação.
        */}
        <button
          type="button"
          onClick={() => setExpanded((open) => !open)}
          aria-expanded={expanded}
          aria-controls={contentId}
          aria-label={`${expanded ? "Recolher" : "Expandir"} ${title}`}
          className="-mr-1 -mt-1 shrink-0 rounded-md p-1 text-graphite-400 transition-colors hover:bg-graphite-50 hover:text-graphite-700"
        >
          {/*
            A rotação vem do estado do React, não de `group-aria-expanded:`.
            Esse variante composto não gera regra nenhuma no Tailwind v4 deste
            projeto — conferido no CSS servido: nenhum seletor
            `group-aria-expanded` existe. O chevron ficava sempre para baixo.
          */}
          <ChevronDown
            className={cn(
              "size-4 transition-transform duration-150",
              expanded && "rotate-180",
            )}
            aria-hidden
          />
        </button>
      </div>

      {/*
        O respiro entre cabeçalho e conteúdo mora aqui, não embaixo da
        descrição: assim ele some junto com o conteúdo e a seção recolhida não
        fica com uma faixa de padding sobrando.
      */}
      <div id={contentId} hidden={!expanded} className="mt-4">
        {children}
      </div>
    </section>
  );
}
