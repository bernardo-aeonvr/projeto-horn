import type { Opportunity } from "./types";

/**
 * Apoio de apresentação do módulo.
 *
 * A formatação de moeda, percentual e data vem de `@/lib/stores/format` e
 * `@/lib/contacts/period` — são as mesmas regras do padrão brasileiro já
 * usadas em Lojas e Contatos, e não faz sentido ter uma segunda cópia.
 */

/** Título da demanda, com uma alternativa legível quando não houver. */
export function opportunityTitle(
  opportunity: Pick<Opportunity, "title" | "store">,
): string {
  const title = opportunity.title?.trim();
  if (title) return title;

  return opportunity.store ? `Projeto — ${opportunity.store.name}` : "Projeto";
}

/**
 * Prévia da comissão exibida enquanto o usuário digita o valor final.
 *
 * Espelha a coluna gerada `opportunities.commission_value`, mas serve só para
 * a interface: o valor que vale é sempre o calculado pelo banco no momento da
 * gravação. Por isso o arredondamento repete o `round(..., 2)` do schema.
 */
export function previewCommission(
  finalValue: number | null,
  percent: number | null,
): number | null {
  if (finalValue === null || percent === null) return null;
  if (!Number.isFinite(finalValue) || !Number.isFinite(percent)) return null;

  return Math.round(((finalValue * percent) / 100) * 100) / 100;
}
