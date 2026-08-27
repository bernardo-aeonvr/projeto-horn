"use client";

import Link from "next/link";
import { useState } from "react";

import { ChannelBadge } from "@/components/contacts/channel-badge";
import { Pagination } from "@/components/ui/pagination";
import { formatContactedDate } from "@/lib/contacts/period";
import type { ContactedProfessional } from "@/lib/dashboard/types";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 10;

/**
 * O KPI "Profissionais contatados" aberto nome a nome.
 *
 * Mesma estrutura de "Resultados por loja", de propósito: tabela no desktop,
 * cards abaixo de `lg`, paginação local de dez em dez e rodapé com o total.
 * As duas respondem à mesma pergunta ("o número é esse; de quem é ele?") e
 * dividir o formato faria a segunda parecer de outro produto.
 *
 * UM PROFISSIONAL POR LINHA
 *
 * Contato é evento, profissional é pessoa. Quem foi procurado três vezes no
 * período aparece uma vez, com 3 na coluna "Contatos" — é o que faz a
 * contagem de linhas bater com o KPI, que também conta pessoas distintas.
 *
 * A ordenação (último contato primeiro, nome desempatando) vem pronta do
 * banco; aqui ninguém reordena.
 */
export function ContactedProfessionalsTable({
  rows,
  storeId,
  showStores = true,
}: {
  rows: ContactedProfessional[];
  /** Loja filtrada no dashboard, repassada ao link de Contatos. */
  storeId?: string;
  /**
   * Coluna "Lojas". Fica de fora no dashboard da loja: quantas marcas havia no
   * mesmo contato é informação das concorrentes, não dela.
   */
  showStores?: boolean;
}) {
  const [page, setPage] = useState(1);

  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  /*
    Trocar o filtro de período troca as props sem desmontar a tabela: sem o
    limite, quem estivesse na página 4 cairia numa lista vazia.
  */
  const current = Math.min(page, pageCount);
  const visible = rows.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);

  if (rows.length === 0) {
    return (
      <p className="py-6 text-sm leading-relaxed text-graphite-500">
        Nenhum profissional contatado neste período.
      </p>
    );
  }

  return (
    <>
      {/* Desktop — tabela */}
      <div className="-mx-1 hidden overflow-x-auto lg:block">
        <table className="w-full border-collapse text-sm">
          <caption className="sr-only">
            Profissionais contatados no período
          </caption>
          <thead>
            <tr className="border-b border-graphite-200 text-left">
              <Th>Profissional</Th>
              <Th>Segmento</Th>
              <Th>Último contato</Th>
              <Th>Canal</Th>
              <Th align="right">Contatos</Th>
              {showStores ? <Th align="right">Lojas</Th> : null}
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => (
              <tr
                key={row.professional_id}
                className="border-b border-graphite-100 last:border-0"
              >
                <td className="py-3 pr-4">
                  {/* Só o admin tem a tela de Contatos para onde o nome levaria. */}
                  <ProfessionalName
                    row={row}
                    storeId={storeId}
                    linked={showStores}
                  />
                </td>
                <td className="py-3 pr-4 text-graphite-700">
                  {row.segment_name ?? "—"}
                </td>
                <td className="py-3 pr-4 tabular-nums text-graphite-700">
                  {formatContactedDate(row.last_contact_at)}
                </td>
                <td className="py-3 pr-4">
                  <ChannelBadge channel={row.last_channel} />
                </td>
                <td className="py-3 pl-4 text-right font-semibold tabular-nums text-graphite-900">
                  {row.contacts}
                </td>
                {showStores ? (
                  <td className="py-3 pl-4 text-right tabular-nums text-graphite-700">
                    {row.stores_presented ? row.stores_presented : "—"}
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile e tablet — cards */}
      <ul className="space-y-3 lg:hidden">
        {visible.map((row) => (
          <li
            key={row.professional_id}
            className="rounded-lg border border-graphite-200 p-3.5"
          >
            <div className="flex items-baseline justify-between gap-3">
              <ProfessionalName
                row={row}
                storeId={storeId}
                truncate
                linked={showStores}
              />
              <span className="shrink-0 text-sm tabular-nums text-graphite-500">
                {formatContactedDate(row.last_contact_at)}
              </span>
            </div>

            <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 border-t border-graphite-100 pt-3 text-sm sm:grid-cols-4">
              <Cell label="Segmento" value={row.segment_name ?? "—"} />
              <div>
                <dt className="text-xs text-graphite-500">Canal</dt>
                <dd className="mt-0.5">
                  <ChannelBadge channel={row.last_channel} />
                </dd>
              </div>
              <Cell
                label="Contatos"
                value={row.contacts.toLocaleString("pt-BR")}
              />
              {showStores ? (
                <Cell
                  label="Lojas"
                  value={
                    row.stores_presented
                      ? row.stores_presented.toLocaleString("pt-BR")
                      : "—"
                  }
                />
              ) : null}
            </dl>
          </li>
        ))}
      </ul>

      <Pagination
        page={current}
        pageCount={pageCount}
        totalItems={rows.length}
        pageSize={PAGE_SIZE}
        onPageChange={setPage}
      />

      <p className="mt-4 text-xs text-graphite-500">
        {rows.length}{" "}
        {rows.length === 1
          ? "profissional contatado neste período"
          : "profissionais contatados neste período"}
        . É o mesmo número do indicador no topo da tela.
      </p>
    </>
  );
}

/**
 * O nome leva à ficha do profissional, em Contatos — a tela que já existe para
 * ver o histórico dele. Sem infraestrutura nova: é o mesmo parâmetro de busca
 * que o filtro daquela página usa.
 */
function ProfessionalName({
  row,
  storeId,
  truncate,
  linked = true,
}: {
  row: ContactedProfessional;
  storeId?: string;
  truncate?: boolean;
  /** `false` na visão da loja: /contatos é uma rota exclusiva do admin. */
  linked?: boolean;
}) {
  const params = new URLSearchParams({ q: row.name });
  if (storeId) params.set("loja", storeId);

  const nameClass = cn(
    "font-medium text-graphite-900",
    truncate && "truncate",
  );

  return (
    <span className={cn("inline-flex items-baseline gap-2", truncate && "min-w-0")}>
      {linked ? (
      <Link
        href={`/contatos?${params.toString()}`}
        title={row.name}
        className={cn(
          "font-medium text-graphite-900 transition-colors hover:text-gold-700 hover:underline",
          truncate && "truncate",
        )}
      >
        {row.name}
      </Link>
      ) : (
        <span title={row.name} className={nameClass}>
          {row.name}
        </span>
      )}
      {row.is_active ? null : (
        <span className="shrink-0 text-xs text-graphite-400">inativo</span>
      )}
    </span>
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
        "pb-2 text-xs font-semibold uppercase tracking-[0.06em] text-graphite-500",
        align === "right" ? "pl-4 text-right" : "pr-4",
      )}
    >
      {children}
    </th>
  );
}

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-graphite-500">{label}</dt>
      <dd className="font-medium tabular-nums text-graphite-800">{value}</dd>
    </div>
  );
}
