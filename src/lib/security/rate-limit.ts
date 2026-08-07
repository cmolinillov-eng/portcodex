/**
 * LÍMITE DE INTENTOS — dos limitaciones que conviene tener escritas, porque
 * ninguna de las dos se arregla desde este fichero:
 *
 * 1. **El contador vive en memoria del proceso** (`globalThis`). En Vercel cada
 *    instancia lambda tiene el suyo, así que el límite real es
 *    `limit × nº de instancias activas`. Bajo carga —o provocando arranques en
 *    frío a propósito— el techo sube. Arreglarlo DE VERDAD exige un contador
 *    compartido (una tabla en Supabase con una función atómica, o Upstash);
 *    no se monta aquí porque es infraestructura nueva, no una línea de código.
 *    Mientras tanto, esto frena el intento casual y el script tonto, no a un
 *    atacante con recursos.
 *
 * 2. **La IP viene de una cabecera.** No hay socket que consultar en el runtime
 *    de Next, así que hay que fiarse de lo que ponga el proxy de delante. Ver
 *    `getClientIp`: al menos se toma de las cabeceras que pone la plataforma y
 *    que el cliente no puede falsificar, en vez de la primera entrada de
 *    `x-forwarded-for`, que la escribe quien llama.
 */

type RateLimitConfig = {
  limit: number;
  windowMs: number;
};

type RateLimitState = {
  count: number;
  resetAt: number;
};

type RateLimitResult =
  | { allowed: true; remaining: number; resetAt: number }
  | { allowed: false; retryAfterMs: number; resetAt: number };

type GlobalRateLimitStore = {
  __portfolioRateLimitStore?: Map<string, RateLimitState>;
};

function getStore(): Map<string, RateLimitState> {
  const globalStore = globalThis as typeof globalThis & GlobalRateLimitStore;
  if (!globalStore.__portfolioRateLimitStore) {
    globalStore.__portfolioRateLimitStore = new Map<string, RateLimitState>();
  }
  return globalStore.__portfolioRateLimitStore;
}

function pruneExpiredEntries(now: number, store: Map<string, RateLimitState>): void {
  for (const [key, state] of store.entries()) {
    if (state.resetAt <= now) {
      store.delete(key);
    }
  }
}

/**
 * IP del cliente para cubetear el límite de intentos.
 *
 * El código anterior hacía `x-forwarded-for.split(",")[0]`, es decir, tomaba la
 * PRIMERA entrada de la cadena. Esa entrada la escribe quien llama: bastaba con
 * mandar `X-Forwarded-For: <número al azar>` en cada petición para estrenar
 * cubo cada vez y dejar el límite en nada.
 *
 * Orden de preferencia, de más a menos fiable:
 *
 *  1. `x-vercel-forwarded-for` — la pone la red de Vercel en cada petición,
 *     pisando lo que mande el cliente. Es la única que no se puede falsificar
 *     desde fuera.
 *  2. `x-real-ip` — también la fija el proxy de Vercel con la IP real.
 *  3. `x-forwarded-for`, pero la ÚLTIMA entrada, no la primera: cada proxy
 *     AÑADE al final, así que la última es la que escribió el proxy de
 *     confianza; las de delante son las que trae el cliente.
 *
 * Fuera de una plataforma que ponga esas cabeceras (desarrollo local, otro
 * hosting) el valor sigue siendo tan de fiar como el proxy que haya delante.
 * Si algún día se despliega detrás de un proxy propio, hay que revisar esto.
 */
export function getClientIp(request: { headers: Headers }): string {
  const plataforma =
    (request.headers.get("x-vercel-forwarded-for") ?? "").split(",")[0]?.trim() ||
    (request.headers.get("x-real-ip") ?? "").trim();
  if (plataforma) return plataforma;

  const cadena = (request.headers.get("x-forwarded-for") ?? "")
    .split(",")
    .map((parte) => parte.trim())
    .filter(Boolean);
  return cadena[cadena.length - 1] ?? "unknown";
}

export function checkRateLimit(key: string, config: RateLimitConfig): RateLimitResult {
  const now = Date.now();
  const store = getStore();
  pruneExpiredEntries(now, store);

  const existing = store.get(key);
  if (!existing || existing.resetAt <= now) {
    const resetAt = now + config.windowMs;
    store.set(key, { count: 1, resetAt });
    return {
      allowed: true,
      remaining: Math.max(0, config.limit - 1),
      resetAt,
    };
  }

  if (existing.count >= config.limit) {
    return {
      allowed: false,
      retryAfterMs: Math.max(0, existing.resetAt - now),
      resetAt: existing.resetAt,
    };
  }

  existing.count += 1;
  store.set(key, existing);
  return {
    allowed: true,
    remaining: Math.max(0, config.limit - existing.count),
    resetAt: existing.resetAt,
  };
}

