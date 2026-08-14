/**
 * Preservação dos valores digitados quando uma action falha na validação.
 *
 * O React 19 reseta os campos não controlados de um `<form action={...}>`
 * assim que a action termina. Sem isso, qualquer erro de validação apagaria
 * tudo que o usuário escreveu. As actions devolvem o que foi enviado e os
 * formulários repovoam os campos a partir daí.
 */
export type SubmittedValues = Record<string, string | string[]>;

/**
 * Extrai o conteúdo do FormData.
 * `multiFields` são os campos que aceitam vários valores (checkbox, chips).
 */
export function collectFormValues(
  formData: FormData,
  multiFields: readonly string[] = [],
): SubmittedValues {
  const values: SubmittedValues = {};

  for (const key of new Set(formData.keys())) {
    if (multiFields.includes(key)) {
      values[key] = formData.getAll(key).map(String);
      continue;
    }

    const value = formData.get(key);
    if (typeof value === "string") values[key] = value;
  }

  // Campo multi ausente significa nenhum item marcado, não "sem informação".
  for (const key of multiFields) {
    if (!(key in values)) values[key] = [];
  }

  return values;
}

/** Valor de texto enviado, ou o padrão do registro em edição. */
export function submittedText(
  values: SubmittedValues | null | undefined,
  key: string,
  fallback = "",
): string {
  const value = values?.[key];
  return typeof value === "string" ? value : fallback;
}

/** Lista enviada, ou o padrão do registro em edição. */
export function submittedList(
  values: SubmittedValues | null | undefined,
  key: string,
  fallback: string[],
): string[] {
  const value = values?.[key];
  return Array.isArray(value) ? value : fallback;
}

/** Número enviado (campos com máscara), ou o padrão do registro em edição. */
export function submittedNumber(
  values: SubmittedValues | null | undefined,
  key: string,
  fallback: number | null,
): number | null {
  const value = values?.[key];
  if (typeof value !== "string" || value === "") return fallback;

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}
