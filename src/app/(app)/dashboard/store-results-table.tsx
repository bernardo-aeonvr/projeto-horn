import Link from "next/link";

import type { StoreResult } from "@/lib/dashboard/types";
import { formatCurrency } from "@/lib/stores/format";
import { cn } from "@/lib/utils";

/**
 * Comparativo entre lojas.
 *
 * Tabela e não gráfico: são sete números por linha e dezenas de lojas — um
 * gráfico com isso tudo fica ilegível, e a HORN quer comparar valores exatos.
 * A ordenação vem do banco, por comissão gerada.
 *
 * Só lojas com alguma atividade no período aparecem; a contagem completa fica
 * no rodapé para a lista não virar um paredão de zeros.
 */
export function StoreResultsTable({ results }: { results: StoreResult[] }) {
  const withActivity = results.filter(
    (row) =>
      row.professionals_reached > 0 ||
      row.projects_received > 0 ||
      row.proposals_sent > 0 ||
      row.deals_closed > 0,
  );

  if (withActivity.length === 0) {
    return (
      <p className="py-6 text-sm leading-relaxed text-graphite-500">
        Nenhuma loja teve atividade neste período. Assim que houver contatos ou
        projetos, o comparativo aparece aqui.
      </p>
    );
  }

  return (
    <>
      {/* Desktop — tabela */}
      <div className="-mx-1 hidden overflow-x-auto lg:block">
        <table className="w-full border-collapse text-sm">
          <caption className="sr-only">Resultados por loja no período</caption>
          <thead>
            <tr className="border-b border-graphite-200 text-left">
              <Th>Loja</Th>
              <Th align="right">Alcançados</Th>
              <Th align="right">Projetos</Th>
              <Th align="right">Propostas</Th>
              <Th align="right">Fechados</Th>
              <Th align="right">Valor fechado</Th>
              <Th align="right">Comissão</Th>
            </tr>
          </thead>
          <tbody>
            {withActivity.map((row) => (
              <tr
                key={row.store_id}
                className="border-b border-graphite-100 last:border-0"
              >
                <td className="py-3 pr-4">
                  <Link
                    href={`/dashboard?loja=${row.store_id}`}
                    className="font-medium text-graphite-900 transition-colors hover:text-gold-700 hover:underline"
                  >
                    {row.store_name}
                  </Link>
                  {row.is_active ? null : (
                    <span className="ml-2 text-xs text-graphite-400">
                      inativa
                    </span>
                  )}
                </td>
                <Td>{row.professionals_reached}</Td>
                <Td>{row.projects_received}</Td>
                <Td>{row.proposals_sent}</Td>
                <Td>{row.deals_closed}</Td>
                <Td>{row.total_closed_value > 0 ? formatCurrency(row.total_closed_value) : "—"}</Td>
                <td className="py-3 pl-4 text-right font-semibold tabular-nums text-graphite-900">
                  {row.total_commission_value > 0
                    ? formatCurrency(row.total_commission_value)
                    : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile e tablet — cards */}
      <ul className="space-y-3 lg:hidden">
        {withActivity.map((row) => (
          <li
            key={row.store_id}
            className="rounded-lg border border-graphite-200 p-3.5"
          >
            <div className="flex items-baseline justify-between gap-3">
              <Link
                href={`/dashboard?loja=${row.store_id}`}
                className="truncate font-medium text-graphite-900 hover:text-gold-700"
              >
                {row.store_name}
              </Link>
              <span className="shrink-0 text-sm font-semibold tabular-nums text-graphite-900">
                {row.total_commission_value > 0
                  ? formatCurrency(row.total_commission_value)
                  : "—"}
              </span>
            </div>

            <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 border-t border-graphite-100 pt-3 text-sm sm:grid-cols-4">
              <Cell label="Alcançados" value={row.professionals_reached} />
              <Cell label="Projetos" value={row.projects_received} />
              <Cell label="Propostas" value={row.proposals_sent} />
              <Cell label="Fechados" value={row.deals_closed} />
            </dl>

            {row.total_closed_value > 0 ? (
              <p className="mt-2 text-xs text-graphite-500">
                Valor fechado: {formatCurrency(row.total_closed_value)}
              </p>
            ) : null}
          </li>
        ))}
      </ul>

      <p className="mt-4 text-xs text-graphite-500">
        {withActivity.length} de {results.length}{" "}
        {results.length === 1 ? "loja teve" : "lojas tiveram"} atividade neste
        período.
      </p>
    </>
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

function Td({ children }: { children: React.ReactNode }) {
  return (
    <td className="py-3 pl-4 text-right tabular-nums text-graphite-700">
      {children}
    </td>
  );
}

function Cell({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt className="text-xs text-graphite-500">{label}</dt>
      <dd className="font-medium tabular-nums text-graphite-800">{value}</dd>
    </div>
  );
}
