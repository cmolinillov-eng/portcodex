import { notFound } from "next/navigation";
import { TopNav } from "@/components/shell/TopNav";
import { PageShell, DataProvenance } from "@/components/shell/PageShell";
import { ReportsHeader } from "@/components/dashboard/informes/ReportsHeader";
import { ReportRow } from "@/components/dashboard/informes/ReportRow";
import { longDate } from "@/lib/format/figures";

/**
 * Banco de pruebas de Informes.
 *
 * Los datos son los de web/design/05-informes.html. Los dos últimos bloques
 * reproducen la referencia de estados de la maqueta, con la diferencia de que
 * aquí NO son dibujos: son el mismo componente abierto en otro estado, así que
 * se pueden usar. Nunca se sirve en producción.
 */
export default function PreviewInformes() {
  if (process.env.NODE_ENV === "production") notFound();

  return (
    <div className="pcx-screen" style={{ minHeight: "100vh" }}>
      <TopNav basePath="/preview" portfolioName="Elena Cortés" />

      <PageShell>
        <ReportsHeader section="Informes" title="Documentación de la cartera de Elena Cortés" />

        <ReportRow
          title="Informe fiscal del ejercicio"
          description="Bases imponibles y desglose por casilla del Modelo 100"
          period={{ kind: "fixed", label: "2026" }}
          format="PDF"
          action={{ label: "Generar", variant: "primary" }}
          note="El ejercicio fiscal comprende el año natural completo."
          style={{
            marginTop: 44,
            padding: "30px 0 22px",
            borderTop: "1px solid var(--line)",
            borderBottom: "none",
          }}
        />

        <ReportRow
          title="Informe patrimonial"
          description="Valor, evolución, composición y rendimiento del periodo"
          period={{ kind: "selectable" }}
          format="PDF"
          action={{ label: "Generar" }}
        />

        <ReportRow
          title="Historial de operaciones"
          description="Todas las operaciones con su clasificación fiscal"
          period={{ kind: "selectable" }}
          format="CSV"
          action={{ label: "Descargar" }}
        />

        <ReportRow
          title="Posiciones a fecha"
          description="Fotografía de la cartera en un momento concreto"
          period={{ kind: "fixed", label: longDate("2026-07-28") }}
          format="CSV"
          action={{ label: "Descargar" }}
        />

        {/* Sin datos: apagado, nunca oculto. */}
        <ReportRow
          title="Informe fiscal del ejercicio"
          description="Sin operaciones en 2025"
          period={{ kind: "fixed", label: "2025" }}
          format="PDF"
          dimmed
        />

        <div style={{ marginTop: 72, paddingTop: 20, borderTop: "1px solid var(--line)" }}>
          <div style={{ fontSize: "var(--text-body)", fontWeight: 600 }}>
            Estados del selector de periodo
          </div>
          <div style={{ fontSize: "var(--text-label)", color: "var(--faint)", marginTop: 7 }}>
            Referencia de la misma fila «Informe patrimonial» en sus dos estados
          </div>
        </div>

        <div style={{ fontSize: "var(--text-meta)", color: "var(--faint)", marginTop: 34 }}>
          Desplegable abierto
        </div>
        <ReportRow
          title="Informe patrimonial"
          description="Valor, evolución, composición y rendimiento del periodo"
          // En la referencia el menú va en el FLUJO: si flotara, taparía el
          // bloque siguiente y no se podría mirar quieto.
          period={{ kind: "selectable", init: { open: true }, menuInFlow: true }}
          format="PDF"
          action={{ label: "Generar" }}
          align="start"
          style={{ marginTop: 10, padding: "18px 0 0", borderTop: "1px solid var(--line)", borderBottom: "none" }}
        />

        <div style={{ fontSize: "var(--text-meta)", color: "var(--faint)", marginTop: 44 }}>
          Rango personalizado
        </div>
        <ReportRow
          title="Informe patrimonial"
          description="Valor, evolución, composición y rendimiento del periodo"
          period={{ kind: "selectable", init: { mode: "custom" } }}
          format="PDF"
          action={{ label: "Generar" }}
          style={{ marginTop: 10, padding: "22px 0", borderTop: "1px solid var(--line)" }}
        />

        <DataProvenance>
          <span style={{ display: "block", maxWidth: 620, lineHeight: 1.7 }}>
            Los informes fiscales son orientativos y no sustituyen el criterio de un asesor. Los
            documentos se generan con los datos disponibles en el momento de la descarga.
          </span>
        </DataProvenance>
      </PageShell>
    </div>
  );
}
