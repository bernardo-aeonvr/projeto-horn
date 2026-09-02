/**
 * Habilita o import direto dos módulos TypeScript de `src/` nos testes.
 * Uso: node --import ./tests/lib/ts-imports.mjs tests/domain.test.mjs
 */
import { register } from "node:module";

register("./ts-resolver.mjs", import.meta.url);
