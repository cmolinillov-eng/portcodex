import { type NextRequest, NextResponse } from "next/server";
import { ensurePortfolioAccess, getViewerAccess } from "@/lib/auth/viewer-access";
import { getDashboardData } from "@/lib/dashboard/get-dashboard-data";
import { buildPortfolioReportHtml } from "@/lib/reports/portfolio-report-html";

/**
 * Informe patrimonial: valor, composición y rendimiento de la cartera.
 *
 * El generador (`buildPortfolioReportHtml`) llevaba tiempo escrito, pero SOLO se
 * podía invocar desde el panel de operación del gestor: no había ninguna ruta
 * por la que un cliente pudiera pedir su propio informe. En la pantalla de
 * Informes el botón «Generar» de esta fila no llevaba a ninguna parte.
 *
 * Devuelve el documento HTML entero —el generador ya lo produce completo— y no
 * un PDF: la impresión del navegador da texto vectorial, se puede seleccionar y
 * buscar, y no arrastra una librería de PDF al servidor.
 *
 * Con `auto=1` se dispara el diálogo de impresión al abrir, que es lo que se
 * espera al pulsar «Generar». Sin él, se ve el informe en pantalla.
 */
export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const portfolioId = (params.get("portfolioId") ?? "").trim();
    const auto = params.get("auto") === "1";

    const access = await getViewerAccess();
    if (!access.isAuthenticated) {
      return NextResponse.json({ error: "Sesión requerida." }, { status: 401 });
    }

    // Con cartera declarada se comprueba el acceso a ESA cartera; sin ella, se
    // sirve la del propio usuario. Un gestor puede pedir la de su cliente, pero
    // solo pasando por la misma puerta que el resto del producto.
    if (portfolioId) {
      const accessCheck = ensurePortfolioAccess(access, portfolioId, false);
      if (!accessCheck.ok) {
        return NextResponse.json({ error: accessCheck.error }, { status: accessCheck.status });
      }
    }

    const data = await getDashboardData(
      portfolioId ? { targetPortfolioId: portfolioId } : undefined,
    );

    const html = buildPortfolioReportHtml({
      summary: data.summary,
      sections: data.sections,
      recentActivity: data.recentActivity,
      portfolioContext: data.portfolioContext
        ? {
            portfolioName: data.portfolioContext.portfolioName ?? null,
            clientName: data.portfolioContext.ownerName ?? null,
          }
        : null,
      generatedAt: new Date(),
    });

    // El script se inyecta AQUÍ y no dentro del generador porque el generador lo
    // comparte con el panel del gestor, que ya imprime por su cuenta desde un
    // iframe: hacerlo imprimir dos veces sería peor que no imprimir.
    const documento = auto
      ? html.replace("</body>", "<script>window.print()</script></body>")
      : html;

    return new NextResponse(documento, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        // Patrimonio de una persona: que no quede en ninguna caché.
        "Cache-Control": "no-store, max-age=0",
      },
    });
  } catch (error) {
    if (process.env.NODE_ENV !== "production") console.error("informes/patrimonial error:", error);
    return NextResponse.json({ error: "Error inesperado generando el informe." }, { status: 500 });
  }
}
