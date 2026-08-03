import { type NextRequest, NextResponse } from "next/server";
import { ensurePortfolioAccess, getViewerAccess } from "@/lib/auth/viewer-access";
import { computeTraceability } from "@/lib/tax/compute-traceability";
import { getTaxYear } from "@/lib/tax/eur-conversion";
import { buildCointrackingCsv, buildTraceabilityCsv } from "@/lib/fiscal/csv";

/**
 * Descarga de la información fiscal del ejercicio.
 *
 * Es una RUTA y no un botón con `onClick` a propósito. La alternativa era pasar
 * las operaciones ya calculadas a un componente de cliente y montar el fichero
 * en el navegador, que es lo que hacía la sección vieja; eso obliga a serializar
 * el histórico entero dentro del HTML de la página —cientos de operaciones con
 * su coste FIFO— para que casi nadie pulse el botón. Aquí el cálculo ocurre
 * cuando se pide, y el enlace es un `<a href download>` normal: funciona sin
 * JavaScript, se puede copiar, y el navegador enseña su propio progreso.
 *
 * Las maquetas piden exactamente eso: un enlace discreto, no una pantalla de
 * tarjetas con un formato en cada una.
 */

/** Formatos que se ofrecen, con su nombre de fichero y su tipo MIME. */
const FORMATOS = {
  /** Todas las columnas internas + casilla AEAT. Es lo que se le da al asesor. */
  trazabilidad: {
    nombre: "trazabilidad-fiscal",
    mime: "text/csv; charset=utf-8",
    extension: "csv",
  },
  /** Formato que aceptan la mayoría de gestores fiscales en España. */
  cointracking: {
    nombre: "cointracking",
    mime: "text/csv; charset=utf-8",
    extension: "csv",
  },
  /** Copia de seguridad con todos los campos calculados, sin aplanar. */
  json: {
    nombre: "trazabilidad",
    mime: "application/json; charset=utf-8",
    extension: "json",
  },
} as const;

type Formato = keyof typeof FORMATOS;

function esFormato(valor: string): valor is Formato {
  return valor in FORMATOS;
}

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const portfolioId = (params.get("portfolioId") ?? "").trim();
    const formatoPedido = (params.get("formato") ?? "trazabilidad").trim();
    const ejercicioPedido = (params.get("ejercicio") ?? "").trim();

    if (!portfolioId) {
      return NextResponse.json({ error: "portfolioId es obligatorio." }, { status: 400 });
    }
    if (!esFormato(formatoPedido)) {
      return NextResponse.json(
        { error: `Formato desconocido. Valores válidos: ${Object.keys(FORMATOS).join(", ")}.` },
        { status: 400 },
      );
    }

    // Sin bypass de servicio: esto son datos fiscales nominativos y no hay
    // ningún worker que necesite descargarlos. Solo sesión con acceso.
    const access = await getViewerAccess();
    const accessCheck = ensurePortfolioAccess(access, portfolioId, false);
    if (!accessCheck.ok) {
      return NextResponse.json({ error: accessCheck.error }, { status: accessCheck.status });
    }

    const { entries } = await computeTraceability(portfolioId);

    // El FIFO tiene que correr sobre TODO el histórico para que las bases de
    // coste salgan bien; el ejercicio solo decide qué filas se entregan.
    const ejercicio = Number(ejercicioPedido);
    const filtrarPorAño = Number.isInteger(ejercicio) && ejercicio > 1970;
    const filas = filtrarPorAño
      ? entries.filter((e) => getTaxYear(e.transactionDate) === ejercicio)
      : entries;

    const formato = FORMATOS[formatoPedido];
    const cuerpo =
      formatoPedido === "json"
        ? JSON.stringify(filas, null, 2)
        : formatoPedido === "cointracking"
          ? buildCointrackingCsv(filas)
          : buildTraceabilityCsv(filas);

    const sufijo = filtrarPorAño ? `${ejercicio}` : new Date().toISOString().slice(0, 10);
    const fichero = `${formato.nombre}-${sufijo}.${formato.extension}`;

    return new NextResponse(cuerpo, {
      headers: {
        "Content-Type": formato.mime,
        // `attachment` fuerza la descarga en vez de pintar el CSV en pestaña.
        "Content-Disposition": `attachment; filename="${fichero}"`,
        // Son datos fiscales de una persona: que no queden en ninguna caché
        // intermedia ni en el disco del navegador.
        "Cache-Control": "no-store, max-age=0",
      },
    });
  } catch (error) {
    if (process.env.NODE_ENV !== "production") console.error("fiscal/export error:", error);
    return NextResponse.json({ error: "Error inesperado generando la exportación." }, { status: 500 });
  }
}
