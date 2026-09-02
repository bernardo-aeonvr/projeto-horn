/**
 * Resolve os imports relativos sem extensão dos módulos de `src/`.
 *
 * O TypeScript escreve `from "./format"`; o ESM do Node exige o arquivo com
 * extensão. O Node 22 já remove os tipos sozinho — só falta dizer a ele onde
 * está o arquivo. Este hook acrescenta `.ts` quando o caminho relativo não tem
 * extensão nenhuma, e sai da frente em todo o resto.
 *
 * Registrado por `ts-imports.mjs`, usado só pelos testes.
 */
const SEM_EXTENSAO = /\.[cm]?[jt]sx?$|\.json$/;

export function resolve(specifier, context, nextResolve) {
  const relativo = specifier.startsWith("./") || specifier.startsWith("../");

  if (relativo && !SEM_EXTENSAO.test(specifier)) {
    return nextResolve(`${specifier}.ts`, context);
  }

  return nextResolve(specifier, context);
}
