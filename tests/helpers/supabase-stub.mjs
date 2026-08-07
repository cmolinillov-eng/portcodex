/**
 * Base de datos Supabase FALSA, en memoria, para poder ejecutar el código de
 * producción (`src/app/api/**`, `src/lib/dashboard/**`) bajo `node --test`.
 *
 * Por qué existe: la contabilidad de la ingesta on-chain vive dentro de un
 * route handler que habla con Supabase. Probarla reimplementando su lógica en
 * el test es exactamente el fallo que hace que una prueba pase sin probar
 * nada, y ejecutarla contra la base real es impensable (son datos de
 * clientes). Aquí se sustituye SOLO la capa de datos: el resto —qué filas se
 * escriben, con qué metadata y en qué grupo de operación— es el código real.
 *
 * Cubre el subconjunto del cliente de Supabase que usan esos módulos:
 * select/insert/update/upsert + eq/is/not/in/gte/lte/like/contains/order/limit
 * y maybeSingle/single. No pretende ser Postgres: pretende ser fiel a las
 * consultas concretas que hace este código.
 *
 * Uso: importar este módulo ANTES de cargar el módulo de `src/` (registra la
 * resolución de `@/…` y los sustitutos de auth/fx/next), fijar la base con
 * `setFakeDb({ tabla: [filas] })` y cargar el módulo con `await import(...)`.
 */
import { registerHooks } from "node:module";
import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const SRC_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "src");

// ── Base de datos en memoria ────────────────────────────────────────────────

/** Comparación laxa (los ids viajan como texto en unos sitios y como uuid en otros). */
const same = (a, b) => {
  if (a === b) return true;
  if (a == null || b == null) return false;
  return String(a) === String(b);
};

const cmp = (a, b) => {
  if (a == null && b == null) return 0;
  if (a == null) return -1;
  if (b == null) return 1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0;
};

/** Contención JSONB superficial: `metadata @> {clave: valor}`. */
function jsonContains(value, needle) {
  if (!value || typeof value !== "object") return false;
  return Object.entries(needle).every(([k, v]) => same(value[k], v));
}

class FakeQuery {
  constructor(db, table) {
    this.db = db;
    this.table = table;
    this.op = "select";
    this.payload = null;
    this.upsertOptions = null;
    this.filters = [];
    this.orders = [];
    this.limitN = null;
    this.mode = null; // "maybeSingle" | "single"
    this.returning = false;
  }

  get rows() {
    if (!this.db[this.table]) this.db[this.table] = [];
    return this.db[this.table];
  }

  select() {
    if (this.op === "select") this.op = "select";
    else this.returning = true;
    return this;
  }
  insert(payload) {
    this.op = "insert";
    this.payload = Array.isArray(payload) ? payload : [payload];
    return this;
  }
  update(payload) {
    this.op = "update";
    this.payload = payload;
    return this;
  }
  upsert(payload, options) {
    this.op = "upsert";
    this.payload = Array.isArray(payload) ? payload : [payload];
    this.upsertOptions = options ?? {};
    return this;
  }
  eq(col, value) {
    this.filters.push((r) => same(r[col], value));
    return this;
  }
  neq(col, value) {
    this.filters.push((r) => !same(r[col], value));
    return this;
  }
  is(col, value) {
    if (value === null) this.filters.push((r) => r[col] == null);
    else this.filters.push((r) => r[col] === value);
    return this;
  }
  not(col, operator, value) {
    if (operator === "is" && value === null) this.filters.push((r) => r[col] != null);
    else this.filters.push((r) => !same(r[col], value));
    return this;
  }
  in(col, values) {
    this.filters.push((r) => (values ?? []).some((v) => same(r[col], v)));
    return this;
  }
  gte(col, value) {
    this.filters.push((r) => r[col] != null && cmp(r[col], value) >= 0);
    return this;
  }
  lte(col, value) {
    this.filters.push((r) => r[col] != null && cmp(r[col], value) <= 0);
    return this;
  }
  like(col, pattern) {
    const rx = new RegExp(`^${String(pattern).replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/%/g, ".*")}$`);
    this.filters.push((r) => r[col] != null && rx.test(String(r[col])));
    return this;
  }
  contains(col, needle) {
    this.filters.push((r) => jsonContains(r[col], needle));
    return this;
  }
  order(col, options) {
    this.orders.push({ col, ascending: options?.ascending !== false });
    return this;
  }
  limit(n) {
    this.limitN = n;
    return this;
  }
  maybeSingle() {
    this.mode = "maybeSingle";
    return this;
  }
  single() {
    this.mode = "single";
    return this;
  }

  matching() {
    return this.rows.filter((r) => this.filters.every((f) => f(r)));
  }

  run() {
    if (this.op === "insert" || this.op === "upsert") {
      const inserted = [];
      for (const raw of this.payload) {
        const row = { id: raw.id ?? crypto.randomUUID(), deleted_at: null, ...raw };
        if (this.op === "upsert") {
          const keys = String(this.upsertOptions?.onConflict ?? "").split(",").map((k) => k.trim()).filter(Boolean);
          const existing = keys.length
            ? this.rows.find((r) => keys.every((k) => same(r[k], row[k])))
            : undefined;
          if (existing) {
            if (this.upsertOptions?.ignoreDuplicates !== true) Object.assign(existing, raw);
            continue;
          }
        }
        this.rows.push(row);
        inserted.push(row);
      }
      this.db.__inserts.push({ table: this.table, rows: inserted });
      return { data: inserted, error: null };
    }

    if (this.op === "update") {
      const hits = this.matching();
      for (const row of hits) Object.assign(row, this.payload);
      return { data: hits.map((r) => ({ ...r })), error: null };
    }

    let out = this.matching().map((r) => ({ ...r }));
    if (this.orders.length) {
      out.sort((a, b) => {
        for (const { col, ascending } of this.orders) {
          const c = cmp(a[col], b[col]);
          if (c !== 0) return ascending ? c : -c;
        }
        return 0;
      });
    }
    if (this.limitN != null) out = out.slice(0, this.limitN);
    if (this.mode === "maybeSingle") return { data: out[0] ?? null, error: null };
    if (this.mode === "single") {
      if (out.length !== 1) return { data: null, error: { message: "no rows", code: "PGRST116" } };
      return { data: out[0], error: null };
    }
    return { data: out, error: null };
  }

  then(onFulfilled, onRejected) {
    let result;
    try {
      result = this.run();
    } catch (e) {
      return Promise.resolve().then(() => (onRejected ? onRejected(e) : Promise.reject(e)));
    }
    return Promise.resolve(result).then(onFulfilled, onRejected);
  }
}

/** Cliente falso: `from(tabla)` devuelve un constructor de consultas nuevo. */
export function createFakeSupabase(tables = {}) {
  const db = { __inserts: [], ...tables };
  return {
    __db: db,
    from(table) {
      return new FakeQuery(db, table);
    },
  };
}

/** Fija la base que verán los módulos de `src/` en esta prueba. */
export function setFakeDb(tables) {
  const client = createFakeSupabase(tables);
  globalThis.__FAKE_SUPABASE__ = client;
  return client;
}

/** Acceso directo a las tablas (para aserciones). */
export function tableOf(client, name) {
  return client.__db[name] ?? [];
}

// ── Resolución de módulos ───────────────────────────────────────────────────

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

const dataModule = (code) => `data:text/javascript,${encodeURIComponent(code)}`;

/**
 * Sustitutos de las dependencias de INFRAESTRUCTURA (no de contabilidad):
 * cliente de Supabase, sesión del visor, snapshots, tipo de cambio y las
 * utilidades de Next. Todo lo demás se carga de `src/` tal cual.
 */
const STUBS = {
  "@/lib/supabase/server": `
    export const getSupabaseServiceClient = () => globalThis.__FAKE_SUPABASE__ ?? null;
    export const getSupabaseServerClient = () => globalThis.__FAKE_SUPABASE__ ?? null;
  `,
  "@/lib/auth/viewer-access": `
    export const getViewerAccess = async () => globalThis.__FAKE_VIEWER__;
    export const ensurePortfolioAccess = (access, portfolioId, needsWrite) =>
      needsWrite && !access.canOperate
        ? { ok: false, error: "sin permiso", status: 403 }
        : { ok: true };
  `,
  "@/lib/auth/service-auth": `
    export const checkServiceAuth = () => ({ isService: false, canWrite: false });
  `,
  "@/lib/snapshots/capture": `
    export const capturePortfolioSnapshot = async () => ({ ok: true });
  `,
  "@/lib/fx/usd-eur": `
    export const getUsdToEurRate = async () => 0.9;
  `,
  "next/cache": `
    export const unstable_noStore = () => {};
    export const revalidatePath = () => {};
  `,
  // NextResponse.json solo se usa para devolver el resultado del handler: se
  // sustituye por un objeto equivalente para no arrastrar el runtime de Next.
  "next/server": `
    export const NextResponse = {
      json: (body, init) => ({ status: init?.status ?? 200, json: async () => body }),
    };
  `,
};

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (STUBS[specifier]) return { url: dataModule(STUBS[specifier]), shortCircuit: true };
    if (specifier.startsWith("@/")) {
      const resolved = firstExisting(path.join(SRC_ROOT, specifier.slice(2)));
      if (resolved) return { url: pathToFileURL(resolved).href, shortCircuit: true };
    }
    if ((specifier.startsWith("./") || specifier.startsWith("../")) && path.extname(specifier) === "") {
      const parentPath = context.parentURL ? fileURLToPath(context.parentURL) : null;
      if (parentPath && !context.parentURL.startsWith("data:")) {
        const resolved = firstExisting(path.resolve(path.dirname(parentPath), specifier));
        if (resolved) return { url: pathToFileURL(resolved).href, shortCircuit: true };
      }
    }
    return nextResolve(specifier, context);
  },
});

/** Visor por defecto: gestor que puede operar sobre la cartera indicada. */
export function setFakeViewer(portfolioIds, canOperate = true) {
  globalThis.__FAKE_VIEWER__ = {
    role: "manager",
    isSuperAdmin: false,
    canOperate,
    canDeletePosition: canOperate,
    canRefreshPrices: canOperate,
    canManageRoles: false,
    allowedPortfolioIds: portfolioIds,
  };
}
