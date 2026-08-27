import { Trophy } from "lucide-react";
import Link from "next/link";

import type { TopProfessional } from "@/lib/dashboard/types";
import { cn } from "@/lib/utils";

/**
 * Ranking "Top 5 profissionais".
 *
 * Lista, não gráfico. São no máximo cinco linhas com nome e quantidade — uma
 * barra ou uma pizza aqui ocupariam a altura de um bloco inteiro para mostrar
 * o que cabe em cinco linhas, e a comparação que interessa (quem gerou mais)
 * já está na ordem.
 *
 * PÓDIO
 *
 * As três primeiras posições ganham a medalha em cores que já existem no
 * projeto: dourado da marca, grafite e âmbar. Só a bolinha da posição muda de
 * cor; o nome e o número seguem na tipografia de sempre. O troféu aparece uma
 * vez, no primeiro lugar.
 *
 * Da quarta em diante, nada — quatro e cinco são posições neutras.
 */

type TopProfessionalsProps = {
  items: TopProfessional[];
  /**
   * Loja filtrada no dashboard do admin. Viaja para o link de Projetos &
   * Propostas para que a lista abra no mesmo recorte de loja do ranking.
   */
  storeId?: string;
};

/** Ouro, prata e bronze, com as escalas do próprio tema. */
const MEDALS = [
  "border-gold-300 bg-gold-100 text-gold-800",
  "border-graphite-300 bg-graphite-100 text-graphite-700",
  "border-amber-300 bg-amber-100 text-amber-800",
];

const NEUTRAL_MEDAL = "border-graphite-200 bg-white text-graphite-500";

function opportunitiesHref(professionalId: string, storeId?: string): string {
  const params = new URLSearchParams({ profissional: professionalId });
  if (storeId) params.set("loja", storeId);

  return `/projetos-propostas?${params.toString()}`;
}

export function TopProfessionals({ items, storeId }: TopProfessionalsProps) {
  if (items.length === 0) {
    return (
      <p className="py-6 text-sm leading-relaxed text-graphite-500">
        Nenhum projeto registrado neste período.
      </p>
    );
  }

  return (
    <ol className="space-y-2">
      {items.map((item, index) => (
        <li key={item.professional_id} className="flex items-center gap-3">
          {/*
            A posição também está na ordem do <ol>, então a bolinha é
            decorativa para quem usa leitor de tela.
          */}
          <span
            aria-hidden
            className={cn(
              "flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold tabular-nums",
              MEDALS[index] ?? NEUTRAL_MEDAL,
            )}
          >
            {index + 1}
          </span>

          {/*
            min-w-0 + truncate: nome comprido corta na largura do card em vez
            de empurrar a contagem para fora. O nome inteiro fica no title.
          */}
          <Link
            href={opportunitiesHref(item.professional_id, storeId)}
            title={item.name}
            className={cn(
              "min-w-0 flex-1 truncate text-sm text-graphite-700 underline-offset-2 hover:text-gold-700 hover:underline",
              index === 0 && "font-medium text-graphite-900",
            )}
          >
            {item.name}
          </Link>

          {index === 0 ? (
            <Trophy className="size-3.5 shrink-0 text-gold-600" aria-hidden />
          ) : null}

          <span className="shrink-0 text-sm text-graphite-500">
            <span className="font-semibold tabular-nums text-graphite-900">
              {item.projects.toLocaleString("pt-BR")}
            </span>{" "}
            {item.projects === 1 ? "projeto" : "projetos"}
          </span>
        </li>
      ))}
    </ol>
  );
}
