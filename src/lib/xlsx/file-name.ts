/**
 * Nome de arquivo das exportações.
 *
 * Nasceu repetido: Profissionais e Projetos & Propostas montavam a mesma data
 * em São Paulo cada um por conta própria, e o `slugify` do nome da loja já
 * existia em duas versões. Contatos seria a terceira cópia — daí virar módulo.
 *
 * O formato é sempre o mesmo, e é o que torna os arquivos previsíveis na pasta
 * de downloads: `horn-<módulo>[-<recorte>]-AAAA-MM-DD.xlsx`.
 */

/**
 * Texto legível em pedaço de nome de arquivo.
 *
 * Os acentos são decompostos e removidos e o resto vira hífen: um nome de loja
 * com "ç", espaço ou barra não pode virar um arquivo impossível de salvar.
 * Aplicar em algo que já é slug não muda nada.
 */
export function slugify(value: string): string {
  return value
    .normalize("NFD")
    // Faixa das marcas combinantes: o que sobra do "ç" depois do NFD.
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * "horn-contatos-loja-a-2026-08-26.xlsx"
 *
 * A data é a de hoje em São Paulo, não a do relógio de quem exporta: dois
 * usuários em fusos diferentes geram o mesmo nome para o mesmo dia de trabalho.
 */
export function exportFileName(
  base: string,
  /** Recorte no nome — loja, segmento, status. Vazio quando não há. */
  scope: string | null,
  now = new Date(),
): string {
  const [day, month, year] = new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "America/Sao_Paulo",
  })
    .format(now)
    .split("/");

  const slug = scope ? slugify(scope) : "";
  const suffix = slug ? `-${slug}` : "";

  return `${base}${suffix}-${year}-${month}-${day}.xlsx`;
}
