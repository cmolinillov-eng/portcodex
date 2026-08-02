import { notFound } from "next/navigation";
import { TopNav } from "@/components/shell/TopNav";
import { PageShell, DataProvenance } from "@/components/shell/PageShell";
import { FiscalHeader, YearPicker } from "@/components/dashboard/fiscalidad/FiscalHeader";
import { TaxBases } from "@/components/dashboard/fiscalidad/TaxBases";
import { CasillaBreakdown } from "@/components/dashboard/fiscalidad/CasillaBreakdown";
import { Modelo721 } from "@/components/dashboard/fiscalidad/Modelo721";
import { CASILLA_ROWS, CASILLA_TOTAL } from "./mock-fiscalidad";

/**
 * Banco de pruebas de Fiscalidad.
 *
 * Los datos son EXACTAMENTE los de web/design/04-fiscalidad.html, así que
 * cualquier diferencia visual contra la maqueta es un fallo de implementación y
 * no de datos. Nunca se sirve en producción.
 */
export default function PreviewFiscalidad() {
  if (process.env.NODE_ENV === "production") notFound();

  return (
    <div className="pcx-screen" style={{ minHeight: "100vh" }}>
      <TopNav basePath="/preview" portfolioName="Elena Cortés" />

      <PageShell>
        <FiscalHeader
          section="Fiscalidad"
          title="Ejercicio 2026"
          note="52 operaciones registradas"
          yearControl={<YearPicker year="2026" />}
          action={
            <button type="button" style={{ fontSize: "var(--text-body)", color: "var(--muted)" }}>
              Exportar
            </button>
          }
        />

        <TaxBases
          savings={{
            label: "Base del ahorro",
            amountEur: 161.37,
            explanation: "Ganancias de transmisión y permuta, rendimientos de capital",
          }}
          general={{
            label: "Base general",
            amountEur: 0,
            explanation: "Airdrops, forks, salario y actividad económica",
          }}
        />

        <CasillaBreakdown
          rows={CASILLA_ROWS}
          totalLabel="Total base del ahorro"
          totalOperations={CASILLA_TOTAL.operations}
          totalEur={CASILLA_TOTAL.amountEur}
        />

        <Modelo721
          status="Sin obligación de declarar en este ejercicio"
          explanation="El conjunto de saldos en plataformas extranjeras no alcanza el umbral de 50.000 € a 31 de diciembre."
        />

        <DataProvenance>
          <span style={{ display: "block", maxWidth: 640, lineHeight: 1.7 }}>
            Cálculo orientativo elaborado a partir de las operaciones registradas. No sustituye el
            criterio de un asesor fiscal ni constituye asesoramiento. Generado el 28 de julio de
            2026.
          </span>
        </DataProvenance>
      </PageShell>
    </div>
  );
}
