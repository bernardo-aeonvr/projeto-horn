import { formatContactedDate } from "@/lib/contacts/period";
import type { ReachedProfessional } from "@/lib/dashboard/types";

/**
 * Profissionais que receberam a marca da loja no período.
 *
 * Mostra só o suficiente para comprovar o trabalho: nome, segmento, região e
 * data. Telefone, e-mail, Instagram, endereço e observações não aparecem —
 * e não é a interface que garante isso: a função `get_store_contact_reach`
 * do banco simplesmente não retorna essas colunas (spec, seção 15.3).
 *
 * A lista também não revela quais OUTRAS lojas foram apresentadas no mesmo
 * contato.
 */
export function ReachedProfessionals({
  reached,
}: {
  reached: ReachedProfessional[];
}) {
  if (reached.length === 0) {
    return (
      <p className="py-6 text-sm leading-relaxed text-graphite-500">
        Nenhum profissional foi alcançado neste período. Quando a HORN
        apresentar sua marca em um contato, ele aparece aqui.
      </p>
    );
  }

  return (
    <>
      {/* Desktop — tabela */}
      <div className="hidden overflow-x-auto lg:block">
        <table className="w-full border-collapse text-sm">
          <caption className="sr-only">
            Profissionais alcançados no período
          </caption>
          <thead>
            <tr className="border-b border-graphite-200 text-left">
              <th
                scope="col"
                className="pb-2 pr-4 text-xs font-semibold uppercase tracking-[0.06em] text-graphite-500"
              >
                Profissional
              </th>
              <th
                scope="col"
                className="pb-2 pr-4 text-xs font-semibold uppercase tracking-[0.06em] text-graphite-500"
              >
                Segmento
              </th>
              <th
                scope="col"
                className="pb-2 pr-4 text-xs font-semibold uppercase tracking-[0.06em] text-graphite-500"
              >
                Regiões
              </th>
              <th
                scope="col"
                className="pb-2 text-right text-xs font-semibold uppercase tracking-[0.06em] text-graphite-500"
              >
                Contato
              </th>
            </tr>
          </thead>
          <tbody>
            {reached.map((row) => (
              <tr
                key={row.contact_id}
                className="border-b border-graphite-100 last:border-0"
              >
                <td className="py-3 pr-4 font-medium text-graphite-900">
                  {row.professional_name}
                </td>
                <td className="py-3 pr-4 text-graphite-600">
                  {row.segment_name ?? "—"}
                </td>
                <td className="py-3 pr-4 text-graphite-600">
                  {row.regions.length > 0 ? row.regions.join(", ") : "—"}
                </td>
                <td className="py-3 text-right tabular-nums text-graphite-600">
                  {formatContactedDate(row.contacted_at)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile e tablet — cards */}
      <ul className="space-y-3 lg:hidden">
        {reached.map((row) => (
          <li
            key={row.contact_id}
            className="rounded-lg border border-graphite-200 p-3.5"
          >
            <div className="flex items-baseline justify-between gap-3">
              <p className="truncate font-medium text-graphite-900">
                {row.professional_name}
              </p>
              <span className="shrink-0 text-xs tabular-nums text-graphite-500">
                {formatContactedDate(row.contacted_at)}
              </span>
            </div>
            <p className="mt-1 text-sm text-graphite-600">
              {row.segment_name ?? "Segmento não informado"}
            </p>
            {row.regions.length > 0 ? (
              <p className="mt-0.5 text-xs text-graphite-500">
                {row.regions.join(", ")}
              </p>
            ) : null}
          </li>
        ))}
      </ul>

      <p className="mt-4 text-xs text-graphite-500">
        {reached.length}{" "}
        {reached.length === 1 ? "contato registrado" : "contatos registrados"}{" "}
        no período. Um mesmo profissional pode aparecer mais de uma vez se foi
        contatado em datas diferentes.
      </p>
    </>
  );
}
