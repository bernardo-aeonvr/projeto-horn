/**
 * Resolve os imports dos módulos de `src/` para os testes.
 *
 * Duas coisas, as duas por causa do mesmo detalhe: os arquivos são TypeScript e
 * o Node 22 remove os tipos sozinho, mas continua exigindo um caminho de
 * verdade.
 *
 *   1. o TypeScript escreve `from "./format"`; o hook acrescenta `.ts` quando o
 *      caminho relativo não tem extensão nenhuma;
 *   2. o alias `@/...` do tsconfig aponta para `src/...`. Enquanto todo import
 *      com alias na cadeia era `import type` — que some junto com os tipos —
 *      não havia o que resolver; os módulos de exportação trouxeram o primeiro
 *      import de VALOR com alias (`@/lib/xlsx/sheet`), e sem esta tradução o
 *      teste do mapeamento de colunas nem carregaria.
 *
 * Fora esses dois casos, sai da frente.
 *
 * Registrado por `ts-imports.mjs`, usado só pelos testes.
 */
import path from "node:path";
import { pathToFileURL } from "node:url";

const SEM_EXTENSAO = /\.[cm]?[jt]sx?$|\.json$/;
const SRC = path.resolve(import.meta.dirname, "..", "..", "src");

export function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("@/")) {
    const alvo = path.join(SRC, specifier.slice(2));
    const arquivo = SEM_EXTENSAO.test(alvo) ? alvo : `${alvo}.ts`;
    return nextResolve(pathToFileURL(arquivo).href, context);
  }

  const relativo = specifier.startsWith("./") || specifier.startsWith("../");

  if (relativo && !SEM_EXTENSAO.test(specifier)) {
    return nextResolve(`${specifier}.ts`, context);
  }

  return nextResolve(specifier, context);
}
