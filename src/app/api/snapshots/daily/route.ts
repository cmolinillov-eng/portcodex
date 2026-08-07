import { NextResponse, type NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseServiceClient, getSupabaseServerClient } from "@/lib/supabase/server";
import { capturePortfolioSnapshot } from "@/lib/snapshots/capture";
import {
  checkServiceAuth,
  getServicePortfolioIds,
  readServiceSecret,
} from "@/lib/auth/service-auth";

/**
 * GET /api/snapshots/daily
 *
 * Endpoint para cron externo. Captura un snapshot de las carteras declaradas en
 * `SERVICE_PORTFOLIO_IDS`.
 *
 * Antes esta ruta era la única que no pasaba por `lib/auth/service-auth.ts`, y
 * arrastraba tres problemas que ese módulo existe para evitar:
 *
 *  1. Comparaba el secreto con `===` (fuga por tiempo).
 *  2. Recorría TODAS las carteras (`select("id")` sin filtro) en vez de
 *     acotarse a `SERVICE_PORTFOLIO_IDS`, y devolvía en el JSON la lista
 *     completa de UUIDs de cartera de todos los clientes.
 *  3. Aceptaba el secreto de LECTURA para escribir.
 *
 * Los dos primeros están corregidos. El TERCERO se mantiene a sabiendas, y esta
 * es la razón:
 *
 * El planificador de Vercel manda `Authorization: Bearer $CRON_SECRET` y no deja
 * elegir la cabecera ni el valor. Exigir aquí el secreto de escritura convertía
 * el cron nocturno en un 401 silencioso cada noche — y eso reproduce un fallo que
 * ya sufrimos: el patrimonio de las carteras que nadie visita se queda congelado
 * durante semanas, y nadie se entera porque no hay error visible en ninguna
 * pantalla.
 *
 * La separación lectura/escritura existe para que un worker que solo refresca
 * precios no pueda ingerir OPERACIONES en la contabilidad. Lo que escribe esta
 * ruta no es de esa clase: es una fotografía derivada de un estado que quien
 * presenta el secreto ya puede leer. No crea operaciones, no altera bases de
 * coste y no cambia ninguna cifra fiscal; a lo sumo, añade un punto a una curva.
 *
 * Sigue acotada a `SERVICE_PORTFOLIO_IDS`: sin esa lista no se concede nada.
 *
 * Si algún día se mueve el planificador a un worker propio —donde sí se puede
 * elegir la cabecera—, esto debe volver a exigir `canWrite`.
 */

function getClient(): SupabaseClient {
  const serviceClient = getSupabaseServiceClient();
  if (serviceClient) return serviceClient;
  return getSupabaseServerClient();
}

export async function GET(request: NextRequest) {
  try {
    const secret = readServiceSecret(request.headers);
    const portfolioIds = getServicePortfolioIds();

    // `isService`, no `canWrite`: ver la nota de arriba. Cualquiera de los dos
    // secretos vale, pero SOLO sobre las carteras declaradas en
    // `SERVICE_PORTFOLIO_IDS` — sin esa lista, `checkServiceAuth` no concede
    // nada y la ruta responde 401.
    const writable = portfolioIds.filter((id) => checkServiceAuth(secret, id).isService);
    if (writable.length === 0) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const client = getClient();

    let success = 0;
    let failed = 0;
    for (const portfolioId of writable) {
      try {
        const result = await capturePortfolioSnapshot({
          client,
          portfolioId,
          trigger: "daily_cron",
        });
        if (result.ok) success += 1;
        else failed += 1;
      } catch (err) {
        // El detalle va al log del servidor; la respuesta solo lleva contadores.
        // Los identificadores de cartera NO se devuelven: quien llama ya sabe
        // qué carteras ha configurado, y un JSON con UUIDs de clientes es un
        // regalo para cualquiera que consiga disparar la ruta.
        console.error("snapshots/daily: fallo capturando snapshot", err);
        failed += 1;
      }
    }

    return NextResponse.json({
      ok: true,
      total: writable.length,
      success,
      failed,
    });
  } catch (error) {
    console.error("snapshots/daily error:", error);
    return NextResponse.json({ error: "Error inesperado en el cron diario." }, { status: 500 });
  }
}
