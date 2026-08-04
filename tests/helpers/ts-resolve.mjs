/**
 * Resolución de imports para ejecutar los módulos REALES de `src/` bajo
 * `node --test` (Node hace type-stripping de TypeScript, pero no resuelve ni
 * el alias `@/` de tsconfig ni los imports relativos sin extensión).
 *
 * Sin esto, un test sobre el motor fiscal tendría que reimplementar la lógica
 * en el propio fichero de test — exactamente el fallo que hace que una prueba
 * pase sin probar nada. Aquí se importa el código de producción tal cual.
 *
 * Uso: importar este módulo ANTES de cargar el módulo de `src/`, y cargar ese
 * módulo con `await import(...)` dinámico (los imports estáticos se resuelven
 * antes de que corra ningún código del fichero).
 */
import { registerHooks } from "node:module";
import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const SRC_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "src");

function firstExisting(basePath) {
  const candidates = [
    `${basePath}.ts`,
    `${basePath}.tsx`,
    `${basePath}.mjs`,
    `${basePath}.js`,
    path.join(basePath, "index.ts"),
    basePath,
  ];
  return candidates.find((candidate) => existsSync(candidate) && path.extname(candidate) !== "");
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    // Alias "@/..." → <repo>/src/...
    if (specifier.startsWith("@/")) {
      const resolved = firstExisting(path.join(SRC_ROOT, specifier.slice(2)));
      if (resolved) return { url: pathToFileURL(resolved).href, shortCircuit: true };
    }
    // Relativo sin extensión ("./fifo") → "./fifo.ts"
    if ((specifier.startsWith("./") || specifier.startsWith("../")) && path.extname(specifier) === "") {
      const parentPath = context.parentURL ? fileURLToPath(context.parentURL) : null;
      if (parentPath) {
        const resolved = firstExisting(path.resolve(path.dirname(parentPath), specifier));
        if (resolved) return { url: pathToFileURL(resolved).href, shortCircuit: true };
      }
    }
    return nextResolve(specifier, context);
  },
});
