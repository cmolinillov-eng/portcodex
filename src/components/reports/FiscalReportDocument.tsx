/**
 * =============================================================================
 * INFORME FISCAL — DOCUMENTO
 * =============================================================================
 *
 * Este documento es el único punto donde PortCodex se presenta ante el asesor
 * fiscal del cliente: un profesional que no ha usado el producto y que va a
 * juzgarlo en treinta segundos. De ahí las tres decisiones que lo gobiernan:
 *
 *  1. PORTADA EDITORIAL, no cabecera de exportación. Una hoja entera para la
 *     marca, el ejercicio, el titular y la fecha. Una exportación de datos
 *     empieza en la fila 1; un documento de una gestora empieza en una portada.
 *  2. HOJAS EXPLÍCITAS, no flujo. Cada `<section class="sheet">` es una página
 *     A4 de verdad, con su pie y su numeración. Ver `fiscal-report-model.ts`
 *     para el porqué (Chrome no sabe numerar páginas por CSS).
 *  3. ES PAPEL, NO PANTALLA. Márgenes de encuadernación, nada a sangre, cuerpo
 *     de 9,5 pt, cifras en tabular a la derecha y ni un dato que dependa del
 *     color. El color de este documento está medido sobre papel y vive en
 *     `lib/reports/fiscal-report-theme.ts`, no en `globals.css`.
 *
 * El CSS del documento va en un `<style>` de este componente. NO se toca
 * `globals.css`: el tema oscuro del producto y el tema claro del papel no deben
 * compartir hoja, porque comparten nombres de rol y no valores.
 */

import { PortCodexLogo, DESCRIPTOR } from "@/components/brand/portcodex-logo";
import { money, longDate, plural } from "@/lib/format/figures";
import {
  CONTENT_WIDTH,
  DOC,
  FOOTER_HEIGHT,
  LEADING,
  PAGE,
  RUNNING_HEAD_HEIGHT,
  TYPE,
} from "@/lib/reports/fiscal-report-theme";
import type { CasillaReportRow, FiscalReport, OperationRow, Sheet } from "@/lib/reports/fiscal-report-model";

// =============================================================================
// REJILLAS DE TABLA
// =============================================================================
//
// Las columnas NO suman el ancho útil: suman el ancho útil MENOS los huecos
// entre columnas y el relleno lateral de la fila. Se documenta la cuenta porque
// la primera versión sumó 170 a secas, y con seis huecos de 3 mm y 5 mm de
// relleno la tabla se salía 20 mm por la derecha —y con `overflow:hidden` en la
// hoja, la columna de concepto desaparecía sin avisar.
//
//   ancho útil                        170 mm
//   − relleno de fila (2,5 × 2)        −5
//   − huecos entre columnas (n−1)×2,5 −12,5 (6 col) / −15 (7 col)
//   = suma de las columnas           152,5 mm   /  150 mm
//
// Los anchos NO son estimados: se midieron con `measureText` en Public Sans, al
// cuerpo real de cada celda. Los peores casos medidos, en mm:
//
//   «01/01/2026»                        8,5 pt   15,5
//   «Traspaso entre wallets propias»    8,5 pt   42,8  ← rompe en dos líneas
//   «Recompensa de staking»             8,5 pt   33,5  ← rompe en dos líneas
//   «0,00009269 WBTC»                   8,5 pt   26,9
//   «Coinbase Advanced Trade»           7   pt   29,7
//   «Pérdida patrimonial»               8,5 pt   27,5
//   «1800-1814 · General» (mono)        7   pt   28,1
//   «−11.188,67 €»                      8,5 pt   16,3
//
// La primera versión dio 16 mm a la fecha —0,5 mm de holgura— y la fecha acabó
// tocando la etiqueta de operación. De ahí que estas cifras estén escritas.
//
// Dos columnas llevan segunda línea —plataforma bajo el activo, casilla y base
// bajo la clasificación— para no gastar dos columnas más en datos que son
// contexto y no cifra. Es la celda apilada del producto.

const COLUMN_GAP_MM = 2.5;
const ROW_PAD_MM = 2.5;

/** 17+24+28+29+17+17+18 = 150 mm. «Resultado» va un milímetro más ancha que las
 *  otras dos cifras porque es la única que lleva signo. */
const OP_COLUMNS = "17mm 24mm 28mm 29mm 17mm 17mm 18mm";

/** 20+31+15+19+22,5+45 = 152,5 mm. */
const CASILLA_COLUMNS = "20mm 31mm 15mm 19mm 22.5mm 45mm";

// =============================================================================
// DOCUMENTO
// =============================================================================

export function FiscalReportDocument({ report }: { report: FiscalReport }) {
  const total = report.sheets.length;

  return (
    <>
      <style>{DOCUMENT_CSS}</style>
      <div className="pcx-doc">
        {report.sheets.map((sheet, i) => (
          <SheetFrame
            key={`${sheet.kind}-${i}`}
            sheet={sheet}
            report={report}
            page={i + 1}
            total={total}
            last={i === total - 1}
          />
        ))}
      </div>
    </>
  );
}

function SheetFrame({
  sheet,
  report,
  page,
  total,
  last,
}: {
  sheet: Sheet;
  report: FiscalReport;
  page: number;
  total: number;
  last: boolean;
}) {
  const { input } = report;

  return (
    <section className={last ? "sheet sheet--last" : "sheet"}>
      {sheet.kind === "cover" ? null : (
        <header className="running">
          <span className="running__t">
            Informe fiscal · Ejercicio {input.year}
          </span>
          <span className="running__b">{input.holderName}</span>
        </header>
      )}

      <div className="live">
        {sheet.kind === "cover" ? <Cover report={report} /> : null}
        {sheet.kind === "summary" ? <Summary report={report} /> : null}
        {sheet.kind === "operations" ? <Operations report={report} sheet={sheet} /> : null}
        {sheet.kind === "legal" ? <Legal /> : null}
        {sheet.kind === "method" ? <Method report={report} /> : null}
      </div>

      {/* El pie es OBLIGATORIO en todas las páginas, portada incluida: es lo que
          permite reconstruir el documento si se descabala en una carpeta. */}
      <footer className="foot">
        <span className="foot__l">
          PortCodex · Informe fiscal · Ejercicio {input.year} · {input.portfolioName}
        </span>
        <span className="foot__r">
          <span className="foot__gen">Generado el {longDate(input.generatedAt.toISOString())}</span>
          <span className="foot__pg">
            Página {page} de {total}
          </span>
        </span>
      </footer>
    </section>
  );
}

// =============================================================================
// 1 · PORTADA
// =============================================================================
//
// Composición editorial: la marca arriba, el titular en el tercio inferior y
// una gran diagonal de aire entre los dos. Es la única página del documento que
// puede permitirse el vacío, y tiene que permitírselo: es lo que la distingue
// de una exportación.

function Cover({ report }: { report: FiscalReport }) {
  const { input } = report;
  const opCount = report.operations.length;

  return (
    <div className="cover">
      <div className="cover__brand">
        {/* Variante corporativa: es material explicativo dirigido a un tercero,
            el único sitio donde el descriptor está permitido. Tono sobre-claro
            —nombre en obsidiana #070B12, 19,71:1 sobre papel.
            Tamaño 32 y no 26: el componente fija el descriptor en 14 px sea cual
            sea el tamaño, así que a 26 el nombre salía a 17,7 px y el descriptor
            casi lo igualaba. A 32 el nombre va a 21,8 px y la jerarquía vuelve.
            Se ajusta desde aquí, no tocando el componente de marca. */}
        <PortCodexLogo variant="corporativo" tone="sobre-claro" size={32} clearSpace={false} />
      </div>

      <div className="cover__title">
        <div className="eyebrow">Informe fiscal</div>
        <h1 className="cover__h1">Ejercicio {input.year}</h1>
        <div className="cover__rule" />
        <p className="cover__lead">
          Cálculo orientativo del impacto en el IRPF de las operaciones con activos digitales
          registradas en la cartera, con la trazabilidad de cada una y su encaje por casillas del
          Modelo 100.
        </p>
      </div>

      <div className="cover__data">
        <Field label="Titular" value={input.holderName} strong />
        <Field label="Cartera" value={input.portfolioName} />
        {/* «Ejercicio 2026» ya está en el titular a 32 pt: repetirlo en el panel
            gasta una fila en no decir nada. El periodo sí informa —acota qué
            entra y qué no, que es la primera pregunta del asesor. */}
        <Field label="Periodo" value={`1 de enero a 31 de diciembre de ${input.year}`} />
        <Field label="Fecha de emisión" value={longDate(input.generatedAt.toISOString())} />
        <Field label="Operaciones del ejercicio" value={plural(opCount, "operación", "operaciones")} />
        <Field label="Moneda de cálculo" value="Euro · tipo de la fecha de cada operación" />
      </div>

      <div className="cover__foot">
        <p>
          Documento emitido por PortCodex a solicitud del titular. Las cifras son un{" "}
          <strong>cálculo orientativo</strong> elaborado a partir de las operaciones registradas y
          no sustituyen el criterio de un asesor fiscal ni constituyen asesoramiento. El detalle
          metodológico y el alcance de esta salvedad están en la última página.
        </p>
      </div>
    </div>
  );
}

function Field({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="field">
      <div className="field__l">{label}</div>
      <div className={strong ? "field__v field__v--strong" : "field__v"}>{value}</div>
    </div>
  );
}

// =============================================================================
// 2 · BASES IMPONIBLES · CASILLAS · MODELO 721
// =============================================================================
//
// La página que el asesor lee de verdad. Las dos bases van ENFRENTADAS, mismo
// tamaño y mismo peso, porque la ley no las jerarquiza: son dos bolsas que
// tributan a tarifas distintas y no se compensan entre sí.

function Summary({ report }: { report: FiscalReport }) {
  const { input, savings, general } = report;
  const { modelo721 } = input;

  return (
    <>
      <SectionTitle
        title="Bases imponibles"
        note="Reparto de las rentas del ejercicio entre las dos bases del IRPF"
      />

      <div className="bases">
        <BaseFigure
          label="Base del ahorro"
          amountEur={savings.totalEur}
          detail="Ganancias y pérdidas por transmisión y permuta de activos digitales, resultado de derivados y rendimientos de capital mobiliario procedentes de staking y préstamo."
          operations={savings.operations}
        />
        <BaseFigure
          label="Base general"
          amountEur={general.totalEur}
          detail="Ganancias en especie no derivadas de transmisión —airdrops y forks—, rendimientos del trabajo y rendimientos de actividad económica percibidos en activos digitales."
          operations={general.operations}
          divided
        />
      </div>

      <SectionTitle
        title="Desglose por casilla del Modelo 100"
        note="Agregado por categoría fiscal. La numeración de casillas es de referencia: cambia cada ejercicio y la definitiva la fija el modelo del año en curso."
        spaced
      />

      <CasillaTable
        rows={report.casillaRows}
        savings={{ operations: savings.operations, totalEur: savings.totalEur }}
        general={
          general.rows.length > 0
            ? { operations: general.operations, totalEur: general.totalEur }
            : null
        }
      />

      <SectionTitle title="Modelo 721 · Criptomonedas en el extranjero" spaced />
      <div className="s721">
        {/* Este documento se le entrega a un asesor, así que no puede afirmar
            «sin obligación»: la cifra de abajo es el flujo neto de compraventa a
            coste histórico, no el saldo a valor de mercado que exige el modelo.
            No ve las transferencias entrantes desde wallets propias, ni los
            rendimientos cobrados en la plataforma, ni la revalorización. Sirve
            como suelo —si ya supera el umbral, hay obligación seguro— pero
            nunca para descartarla. Mismo criterio que la pantalla Fiscalidad. */}
        <div className="s721__status">
          {modelo721.obligado
            ? "Con obligación de declarar en este ejercicio"
            : "Pendiente de comprobar con los saldos reales"}
        </div>
        <p className="s721__why">
          El Modelo 721 es una declaración informativa de los saldos mantenidos en plataformas de
          intercambio y custodia <strong>no residentes en España</strong>. La obligación nace cuando
          el conjunto de esos saldos supera{" "}
          <span className="nb">{money(modelo721.thresholdEur, "EUR")}</span> a fecha de{" "}
          <span className="nb">31 de diciembre de {input.year}</span>.
        </p>
        {!modelo721.obligado ? (
          <p className="s721__why">
            <strong>Este cálculo no basta para descartar la obligación.</strong> La cifra siguiente
            se obtiene de las compras y ventas registradas, valoradas a su coste, y por tanto no
            incluye lo transferido desde wallets propias, los rendimientos cobrados en la propia
            plataforma ni la revalorización. Debe contrastarse con los saldos reales a 31 de
            diciembre.
          </p>
        ) : null}
        <div className="s721__grid">
          {/* La etiqueta no repite «a 31/12»: la fecha de corte tiene su propio
              campo al lado, y con dos líneas esta etiqueta desalineaba las
              tres cifras del panel. */}
          <Field
            label="Compraventa neta en custodios no residentes"
            value={money(modelo721.foreignBalanceEur, "EUR")}
            strong
          />
          <Field label="Umbral legal" value={money(modelo721.thresholdEur, "EUR")} />
          <Field label="Fecha de corte" value={`31 de diciembre de ${input.year}`} />
        </div>
      </div>
    </>
  );
}

function BaseFigure({
  label,
  amountEur,
  detail,
  operations,
  divided = false,
}: {
  label: string;
  amountEur: number;
  detail: string;
  operations: number;
  divided?: boolean;
}) {
  const negative = amountEur < 0;
  return (
    <div className={divided ? "base base--divided" : "base"}>
      <div className="base__l">{label}</div>
      <div className={negative ? "base__fig base__fig--loss" : "base__fig"}>
        <EuroAmount value={amountEur} size={TYPE.figure} symbolSize={TYPE.figureSymbol} />
      </div>
      <div className="base__ops">{plural(operations, "operación computada", "operaciones computadas")}</div>
      <p className="base__detail">{detail}</p>
    </div>
  );
}

function CasillaTable({
  rows,
  savings,
  general,
}: {
  rows: CasillaReportRow[];
  savings: { operations: number; totalEur: number };
  general: { operations: number; totalEur: number } | null;
}) {
  if (rows.length === 0) {
    return (
      <p className="empty">
        El ejercicio no registra operaciones con hecho imponible en IRPF. No hay casillas del
        Modelo 100 que cumplimentar por este concepto.
      </p>
    );
  }

  const savingsRows = rows.filter((r) => r.baseLabel === "Ahorro");
  const generalRows = rows.filter((r) => r.baseLabel === "General");

  return (
    <div className="tbl" style={{ gridTemplateColumns: CASILLA_COLUMNS }}>
      <div className="tbl__head" style={{ gridTemplateColumns: CASILLA_COLUMNS }}>
        <span>Casilla</span>
        <span>Categoría fiscal</span>
        <span>Base</span>
        <span className="num">Operaciones</span>
        <span className="num">Importe</span>
        <span>Concepto</span>
      </div>

      {savingsRows.map((r) => (
        <CasillaRow key={r.id} row={r} />
      ))}
      {savingsRows.length > 0 ? (
        <TotalRow
          label="Total base del ahorro"
          operations={savings.operations}
          amountEur={savings.totalEur}
        />
      ) : null}

      {/* Aire entre las dos bases. Sin él, la primera fila de la base general
          queda pegada al total del ahorro y se lee como si sumara a él —y no
          suman: son dos bolsas que no se compensan entre sí. */}
      {generalRows.length > 0 && savingsRows.length > 0 ? <div className="tbl__gap" /> : null}
      {generalRows.map((r) => (
        <CasillaRow key={r.id} row={r} />
      ))}
      {general && generalRows.length > 0 ? (
        <TotalRow
          label="Total base general"
          operations={general.operations}
          amountEur={general.totalEur}
        />
      ) : null}
    </div>
  );
}

function CasillaRow({ row }: { row: CasillaReportRow }) {
  const negative = row.amountEur < 0;
  return (
    <div className="tbl__row" style={{ gridTemplateColumns: CASILLA_COLUMNS }}>
      <span className="mono">{row.casilla}</span>
      {/* Categoría fiscal como TEXTO, nunca como chip de color: con trece
          categorías la tabla se convierte en un semáforo sin significado. */}
      <span className="strong">{row.category}</span>
      <span className="ink3">{row.baseLabel}</span>
      <span className="num">{row.operations}</span>
      <span className={negative ? "num loss" : "num"}>
        <EuroAmount value={row.amountEur} size={TYPE.cell} symbolSize={TYPE.cellMeta} />
      </span>
      <span className="ink3 concept">{row.concept}</span>
    </div>
  );
}

function TotalRow({
  label,
  operations,
  amountEur,
}: {
  label: string;
  operations: number;
  amountEur: number;
}) {
  return (
    <div className="tbl__row tbl__row--total" style={{ gridTemplateColumns: CASILLA_COLUMNS }}>
      <span />
      <span className="strong">{label}</span>
      <span />
      <span className="num strong">{operations}</span>
      <span className={amountEur < 0 ? "num strong loss" : "num strong"}>
        <EuroAmount value={amountEur} size={TYPE.cell + 0.5} symbolSize={TYPE.cellMeta} />
      </span>
      <span />
    </div>
  );
}

// =============================================================================
// 3 · DETALLE DE OPERACIONES
// =============================================================================
//
// La cabecera de tabla se repite en cada hoja: sin ella, la página 5 de un
// listado de 120 filas es una parrilla de números sin nombre. Y como el reparto
// es por número de filas y la fila tiene alto fijo, ninguna queda cortada.

function Operations({ report, sheet }: { report: FiscalReport; sheet: Sheet }) {
  if (sheet.kind !== "operations") return null;
  const first = sheet.part === 1;

  return (
    <>
      {first ? (
        <SectionTitle
          title="Detalle de operaciones"
          note={`Todas las operaciones del ejercicio con su clasificación fiscal, valoradas en euros al tipo de cambio de la fecha de cada una. ${plural(report.operations.length, "operación", "operaciones")} en total.`}
        />
      ) : (
        <SectionTitle title="Detalle de operaciones" note={`Continuación · ${sheet.part} de ${sheet.parts}`} />
      )}

      <div className="tbl" style={{ gridTemplateColumns: OP_COLUMNS }}>
        <div className="tbl__head" style={{ gridTemplateColumns: OP_COLUMNS }}>
          <span>Fecha</span>
          <span>Operación</span>
          <span>Activo y plataforma</span>
          <span>Clasificación fiscal y casilla</span>
          <span className="num">Valor</span>
          <span className="num">Coste</span>
          <span className="num">Resultado</span>
        </div>

        {sheet.rows.map((row) => (
          <OperationTableRow key={row.id} row={row} />
        ))}
      </div>

      <div className="tbl__foot">
        {sheet.to < report.operations.length ? (
          <>
            Operaciones {sheet.from} a {sheet.to} de {report.operations.length} · continúa en la
            página siguiente
          </>
        ) : (
          <>
            Operaciones {sheet.from} a {sheet.to} de {report.operations.length} · fin del detalle
          </>
        )}
      </div>
    </>
  );
}

function OperationTableRow({ row }: { row: OperationRow }) {
  return (
    <div className="tbl__row tbl__row--op" style={{ gridTemplateColumns: OP_COLUMNS }}>
      <span className="num-plain">{row.date}</span>

      {/* La etiqueta de operación rompe en DOS líneas en vez de recortarse:
          «Traspaso entre wallets propias» mide 42,8 mm en una línea y ninguna
          columna de esta tabla puede ser tan ancha, pero el tipo de operación es
          un dato primario y recortado a «Traspaso entr…» deja de serlo. */}
      <span className="op-name">{row.operation}</span>

      <span className="stack">
        <span className="stack__a clip">{row.asset}</span>
        <span className="stack__b clip">{row.platform}</span>
      </span>

      <span className="stack">
        <span className="stack__a clip">{row.fiscalLabel}</span>
        {/* La casilla es un identificador administrativo que se transcribe a un
            modelo, no una cifra que se compare: monoespaciada, como los hashes.
            Cuando no hay casilla no se imprime un «—»: treinta y cinco guiones
            sueltos en columna son ruido, y la clasificación de la línea de
            arriba ya dice que la operación no es imponible. */}
        {row.casilla !== "—" ? (
          <span className="stack__b mono">
            {row.casilla}
            {row.baseLabel !== "—" ? <span className="stack__base"> · {row.baseLabel}</span> : null}
          </span>
        ) : null}
      </span>

      <span className="num">
        <EuroAmount value={row.valueEur} size={TYPE.cell} symbolSize={TYPE.cellMeta} />
      </span>
      <span className="num ink3">
        <EuroAmount value={row.costEur} size={TYPE.cell} symbolSize={TYPE.cellMeta} />
      </span>
      {/* En una operación sin hecho imponible el resultado NO se imprime: un
          «0,00 €» ahí se leería como ganancia nula, que es otra cosa. */}
      <span className={row.resultEur < 0 ? "num loss" : "num"}>
        {row.taxRelevant ? (
          <EuroAmount value={row.resultEur} size={TYPE.cell} symbolSize={TYPE.cellMeta} />
        ) : (
          <span className="ink3">—</span>
        )}
      </span>
    </div>
  );
}

// =============================================================================
// 4 · AVISO LEGAL Y NOTA METODOLÓGICA
// =============================================================================

function Legal() {
  return (
    <>
      <SectionTitle title="Aviso legal" />
      <div className="legal">
        <p className="legal__lead">
          Este informe es un <strong>cálculo orientativo</strong>. No sustituye el criterio de un
          asesor fiscal, no constituye asesoramiento fiscal ni tributario y no es una declaración
          ni un documento con efectos ante la Administración tributaria.
        </p>
        <p>
          PortCodex es una herramienta de trazabilidad patrimonial: registra las operaciones, les
          asigna una clasificación fiscal y agrega el resultado por bases y casillas de referencia.
          La calificación definitiva de cada renta, la determinación de la base imponible y la
          cumplimentación de cualquier modelo tributario corresponden al titular y a su asesor.
        </p>
        <p>
          Las cifras se han elaborado exclusivamente a partir de las operaciones registradas en la
          cartera a la fecha de emisión. Una operación no registrada no aparece en este informe, y
          su ausencia no equivale a su inexistencia. Del mismo modo, la clasificación fiscal de
          cada operación es una <strong>inferencia</strong> a partir de su naturaleza técnica: es
          revisable, y el asesor puede recalificarla.
        </p>
        <p>
          Los precios empleados para valorar cada operación son precios de referencia de mercado y
          pueden no coincidir con los del mercado concreto en que se ejecutó. La página siguiente
          detalla los criterios aplicados.
        </p>
      </div>
    </>
  );
}

function Method({ report }: { report: FiscalReport }) {
  const { input } = report;

  const FX_NOTE: Record<typeof input.fxSource, string> = {
    historical:
      "Cada operación se ha valorado con el tipo de cambio oficial del Banco Central Europeo correspondiente a su fecha. Es el criterio que exige la Administración: el valor en euros se fija en el momento del devengo, no a día de hoy.",
    current:
      "No se ha podido recuperar la serie histórica de tipos de cambio y se ha aplicado el tipo vigente a la fecha de emisión a todas las operaciones. Las cifras son por tanto una aproximación: para la declaración deben revalorarse con el tipo de la fecha de cada operación.",
    fallback:
      "No se ha podido recuperar ningún tipo de cambio oficial y se ha aplicado un tipo de referencia fijo. Las cifras en euros de este informe NO son aptas para presentar y deben recalcularse antes de usarse.",
  };

  return (
    <>
      <SectionTitle title="Nota metodológica" />
      <div className="legal">
        <NoteItem title="Criterio de imputación de cartera">
          Las ganancias y pérdidas patrimoniales se calculan por el método{" "}
          <strong>FIFO</strong> —primera entrada, primera salida— aplicado por activo sobre todo el
          histórico registrado, no solo sobre el ejercicio. Es el criterio que la Dirección General
          de Tributos considera aplicable a las monedas virtuales homogéneas.
        </NoteItem>
        <NoteItem title="Conversión a euros">{FX_NOTE[input.fxSource]}</NoteItem>
        <NoteItem title="Permuta entre activos digitales">
          El intercambio de un activo digital por otro se trata como una alteración patrimonial que
          tributa en la base del ahorro, conforme al criterio de la DGT. Las aportaciones y
          retiradas de pools de liquidez <strong>no</strong> se computan como permuta en este
          informe: la base de coste se traslada sin duplicarse. Si el asesor aplica el criterio de
          permuta a ese ciclo, debe calcularse aparte.
        </NoteItem>
        <NoteItem title="Casillas del Modelo 100">
          La numeración de casillas cambia con cada ejercicio. Las que figuran en este informe son{" "}
          <strong>rangos de referencia</strong> que indican dónde encaja cada tipo de renta; la
          casilla exacta la fija el modelo del año en curso.
        </NoteItem>
        <NoteItem title="Comisiones">
          Las comisiones registradas se incorporan al coste de adquisición y minoran el valor de
          transmisión, conforme al artículo 35 de la Ley del IRPF.
        </NoteItem>
        {input.unpricedCount > 0 ? (
          <NoteItem title="Operaciones no valoradas">
            {plural(input.unpricedCount, "operación registra", "operaciones registran")} una
            cantidad pero no un precio, de modo que{" "}
            {input.unpricedCount === 1 ? "queda" : "quedan"} fuera del cómputo de este informe. Se
            señalan aquí para que su ausencia no pase por un cero.
          </NoteItem>
        ) : null}
        {/* El aviso que más le importa a quien lea esto. Sin histórico de compra
            no hay coste de adquisición que restar, y la ganancia sale POR
            ENCIMA de la real. La pantalla ya lo enseña; este documento es el que
            acaba en la mesa del asesor, así que es el último sitio donde puede
            faltar. */}
        {input.uncoveredCount > 0 ? (
          <NoteItem title="Ganancias sobrevaloradas por falta de histórico">
            {plural(
              input.uncoveredCount,
              "operación transmite un activo",
              "operaciones transmiten activos",
            )}{" "}
            del que no consta la compra completa. Sin lotes de adquisición que consumir, el coste
            imputable es menor del real —en el peor caso, cero—, de modo que la ganancia declarada
            para {input.uncoveredCount === 1 ? "esa operación" : "esas operaciones"} está{" "}
            <strong>por encima de la verdadera</strong>. Las filas afectadas llevan la marca «Lotes
            FIFO insuficientes» en su nota. Debe completarse el histórico antes de presentar.
          </NoteItem>
        ) : null}
        <NoteItem title="Modelo 721">
          El saldo en custodios no residentes se estima acumulando el flujo neto de adquisiciones y
          transmisiones en plataformas clasificadas como no residentes hasta el 31 de diciembre del
          ejercicio. Es una estimación de flujo, no una certificación de saldo emitida por el
          custodio.
        </NoteItem>
      </div>

      <div className="colophon">
        <div className="colophon__mark">
          <PortCodexLogo variant="principal" tone="sobre-claro" size={20} clearSpace={false} />
        </div>
        <div className="colophon__t">
          <span>{DESCRIPTOR}</span>
          <span className="colophon__file">{report.fileName}</span>
        </div>
      </div>
    </>
  );
}

function NoteItem({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="note">
      <div className="note__t">{title}</div>
      <p className="note__b">{children}</p>
    </div>
  );
}

// =============================================================================
// PIEZAS COMUNES
// =============================================================================

function SectionTitle({
  title,
  note,
  spaced = false,
}: {
  title: string;
  note?: string;
  spaced?: boolean;
}) {
  return (
    <div className={spaced ? "sect sect--spaced" : "sect"}>
      <h2 className="sect__t">{title}</h2>
      {note ? <p className="sect__n">{note}</p> : null}
    </div>
  );
}

/**
 * Importe en euros con el símbolo más pequeño que la cifra, igual que
 * `EuroFigure` en pantalla: el dato es el número, el símbolo solo dice la
 * unidad. Se reimplementa aquí en vez de reutilizar el componente porque aquel
 * entinta con tokens de pantalla (`var(--foreground)`), que sobre papel serían
 * un blanco roto invisible.
 */
function EuroAmount({
  value,
  size,
  symbolSize,
}: {
  value: number;
  size: number;
  symbolSize: number;
}) {
  const text = money(value, "EUR");
  const cut = text.lastIndexOf(" ");
  return (
    <span className="eur" style={{ fontSize: `${size}pt` }}>
      {text.slice(0, cut)}
      <span className="eur__s" style={{ fontSize: `${symbolSize}pt` }}>
        {" "}
        {text.slice(cut + 1)}
      </span>
    </span>
  );
}

// =============================================================================
// CSS DEL DOCUMENTO
// =============================================================================
//
// Vive aquí y no en `globals.css` por decisión explícita: el sistema de color de
// la aplicación está calibrado para obsidiana y no vale sobre papel. Mezclarlos
// en la misma hoja invita a reutilizar un token medido contra la superficie
// equivocada, que es exactamente el error que este documento no puede cometer.
//
// `@page { margin: 0 }` + hojas de 210×297 mm con su propio relleno: así el
// margen de encuadernación lo fija el documento y no el diálogo de impresión.

const DOCUMENT_CSS = `
@page { size: A4 portrait; margin: 0; }

.pcx-doc {
  /* Public Sans, la única familia. Viene del layout de la aplicación, así que
     no hay fuente que descargar al imprimir. */
  font-family: var(--font-ui), "Public Sans", ui-sans-serif, system-ui, sans-serif;
  font-variant-numeric: lining-nums;
  color: ${DOC.ink};
  background: ${DOC.rule};
  -webkit-font-smoothing: antialiased;
  letter-spacing: -0.005em;
}
.pcx-doc *, .pcx-doc *::before, .pcx-doc *::after { box-sizing: border-box; }
.pcx-doc p, .pcx-doc h1, .pcx-doc h2 { margin: 0; }
.pcx-doc strong { font-weight: 600; }

/* ── HOJA ────────────────────────────────────────────────────────────────── */
.sheet {
  position: relative;
  width: ${PAGE.width}mm;
  height: ${PAGE.height}mm;
  padding: ${PAGE.marginTop}mm ${PAGE.marginRight}mm ${PAGE.marginBottom}mm ${PAGE.marginLeft}mm;
  background: ${DOC.paper};
  overflow: hidden;
  break-after: page;
  page-break-after: always;
  display: flex;
  flex-direction: column;
}
.sheet--last { break-after: auto; page-break-after: auto; }
.live { flex: 1 1 auto; min-height: 0; }

/* En pantalla las hojas se apilan como un documento sobre una mesa. Al imprimir
   se quitan sombra y separación: no hay mesa. */
@media screen {
  .pcx-doc { padding: 24px 0 48px; display: flex; flex-direction: column; align-items: center; gap: 24px; }
  .sheet { box-shadow: 0 1px 3px rgb(7 11 18 / 0.18), 0 8px 24px rgb(7 11 18 / 0.10); }
}
@media print {
  .pcx-doc { background: ${DOC.paper}; padding: 0; display: block; }
  .sheet { box-shadow: none; margin: 0; }
  /* Los tintes de banda y los filos SON información —anclan la cabecera de
     tabla y separan las filas—, así que no se pueden dejar a criterio del
     navegador, que por defecto los elimina para ahorrar tóner. */
  .pcx-doc { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
}

/* ── CABECERILLA Y PIE ───────────────────────────────────────────────────── */
.running {
  height: ${RUNNING_HEAD_HEIGHT}mm;
  flex: 0 0 auto;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  font-size: ${TYPE.footer}pt;
  color: ${DOC.meta};
  border-bottom: 0.3mm solid ${DOC.rule};
  padding-bottom: 2mm;
  margin-bottom: 6mm;
}
.running__b { font-weight: 500; color: ${DOC.ink3}; }

.foot {
  height: ${FOOTER_HEIGHT}mm;
  flex: 0 0 auto;
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 8mm;
  border-top: 0.3mm solid ${DOC.rule};
  padding-top: 2.4mm;
  font-size: ${TYPE.footer}pt;
  color: ${DOC.meta};
}
.foot__l { max-width: 110mm; }
.foot__r { display: flex; gap: 6mm; align-items: baseline; white-space: nowrap; }
.foot__pg { color: ${DOC.ink3}; font-weight: 600; font-variant-numeric: tabular-nums; }

/* ── PORTADA ─────────────────────────────────────────────────────────────── */
.cover { height: 100%; display: flex; flex-direction: column; }
.cover__brand { flex: 0 0 auto; }

/* El aire de la portada es deliberado y es el argumento: una exportación de
   datos no puede permitirse una hoja donde el 40 % está vacío.
   Se alinea al final y no al centro: centrado, el titular deja dos huecos
   iguales y la página se queda sin dirección. Empujado abajo, el vacío es UNO y
   el peso cae en el tercio inferior, que es donde la mirada aterriza. */
.cover__title { flex: 1 1 auto; display: flex; flex-direction: column; justify-content: flex-end; padding-bottom: 14mm; }
.eyebrow {
  font-size: ${TYPE.label}pt;
  font-weight: 600;
  color: ${DOC.blue};
  margin-bottom: 4mm;
}
.cover__h1 {
  font-size: ${TYPE.cover}pt;
  font-weight: 600;
  line-height: ${LEADING.cover};
  letter-spacing: -0.03em;
  color: ${DOC.ink};
}
/* Único filo azul del documento. Corto, no de margen a margen: un filo que
   cruza la hoja es una regla de formulario; uno corto es una firma. */
.cover__rule { width: 38mm; height: 0.9mm; background: ${DOC.blueFill}; margin: 7mm 0 6mm; }
.cover__lead {
  font-size: ${TYPE.body + 1}pt;
  line-height: ${LEADING.body};
  color: ${DOC.ink2};
  max-width: 118mm;
  text-wrap: pretty;
}

.cover__data {
  flex: 0 0 auto;
  margin-top: 10mm;
  background: ${DOC.band};
  padding: 7mm 8mm;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 5.5mm 8mm;
}
.field__l { font-size: ${TYPE.label}pt; color: ${DOC.meta}; margin-bottom: 1.4mm; }
.field__v { font-size: ${TYPE.body}pt; color: ${DOC.ink2}; line-height: 1.3; }
.field__v--strong { font-weight: 600; color: ${DOC.ink}; }

.cover__foot {
  flex: 0 0 auto;
  margin-top: 7mm;
  /* Separa la salvedad del filo del pie: pegadas, la nota legal parecía formar
     parte del pie de página y se leía como un pie más. */
  margin-bottom: 5mm;
  font-size: ${TYPE.label + 0.5}pt;
  line-height: 1.5;
  color: ${DOC.ink3};
  max-width: 150mm;
  text-wrap: pretty;
}

/* ── SECCIÓN ─────────────────────────────────────────────────────────────── */
.sect { margin-bottom: 5mm; }
.sect--spaced { margin-top: 10mm; }
.sect__t {
  font-size: ${TYPE.section}pt;
  font-weight: 600;
  line-height: ${LEADING.section};
  letter-spacing: -0.015em;
  color: ${DOC.ink};
  padding-bottom: 2.2mm;
  border-bottom: 0.5mm solid ${DOC.ink};
}
.sect__n {
  font-size: ${TYPE.sectionNote}pt;
  line-height: 1.45;
  color: ${DOC.ink3};
  margin-top: 2.4mm;
  max-width: 140mm;
  text-wrap: pretty;
}

/* ── BASES IMPONIBLES ────────────────────────────────────────────────────── */
.bases { display: grid; grid-template-columns: 1fr 1fr; margin-bottom: 2mm; }
.base { padding-right: 9mm; }
.base--divided { padding-right: 0; padding-left: 9mm; border-left: 0.3mm solid ${DOC.rule}; }
.base__l { font-size: ${TYPE.sectionNote}pt; color: ${DOC.ink3}; }
.base__fig { margin-top: 3mm; color: ${DOC.ink}; font-weight: 600; letter-spacing: -0.02em; }
.base__fig--loss { color: ${DOC.loss}; }
.base__ops { font-size: ${TYPE.cellMeta}pt; color: ${DOC.meta}; margin-top: 1.8mm; }
.base__detail {
  font-size: ${TYPE.cellMeta + 0.5}pt;
  line-height: 1.5;
  color: ${DOC.ink3};
  margin-top: 3.5mm;
  text-wrap: pretty;
}

/* ── TABLAS ──────────────────────────────────────────────────────────────── */
/* Sin tarjeta contenedora: título, filo, filas. Igual que en el producto. */
.tbl { display: block; width: ${CONTENT_WIDTH}mm; }
.tbl__head {
  display: grid;
  column-gap: ${COLUMN_GAP_MM}mm;
  align-items: end;
  background: ${DOC.band};
  padding: 2.2mm ${ROW_PAD_MM}mm;
  font-size: ${TYPE.cellMeta}pt;
  font-weight: 600;
  color: ${DOC.ink3};
  border-top: 0.3mm solid ${DOC.ruleStrong};
  border-bottom: 0.3mm solid ${DOC.ruleStrong};
}
.tbl__row {
  display: grid;
  column-gap: ${COLUMN_GAP_MM}mm;
  align-items: center;
  padding: 2.2mm ${ROW_PAD_MM}mm;
  font-size: ${TYPE.cell}pt;
  line-height: ${LEADING.cell};
  color: ${DOC.ink2};
  border-bottom: 0.2mm solid ${DOC.rule};
}
/* Alto FIJO. Es lo que hace exacta la paginación por número de filas y lo que
   garantiza que ninguna fila se corte entre dos páginas. Tiene que dar cabida a
   la celda más alta, que son dos líneas de 8,5 pt (7,5 mm) más el relleno. */
.tbl__row--op { height: 9.2mm; }
.op-name {
  font-weight: 500;
  color: ${DOC.ink};
  /* Dos líneas como máximo; la tercera, si llegara, se recorta con puntos. */
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  overflow: hidden;
  line-height: 1.15;
}
.tbl__row--total { border-bottom: none; border-top: 0.4mm solid ${DOC.ink}; background: transparent; }
.tbl__gap { height: 4mm; }
.tbl__foot {
  width: ${CONTENT_WIDTH}mm;
  margin-top: 2.5mm;
  font-size: ${TYPE.cellMeta}pt;
  color: ${DOC.meta};
  font-variant-numeric: tabular-nums;
}

.num, .num-plain, .eur { font-variant-numeric: tabular-nums lining-nums; }
.num { text-align: right; }
.strong { font-weight: 500; color: ${DOC.ink}; }
.ink3 { color: ${DOC.ink3}; }
.loss { color: ${DOC.loss}; }
.eur__s { color: ${DOC.meta}; }
.num.loss .eur__s { color: ${DOC.loss}; }
.nb { white-space: nowrap; }
/* IBM Plex Mono SOLO aquí: la casilla es un identificador administrativo que se
   transcribe a un modelo, del mismo orden que un hash. Nunca las cifras. */
.mono {
  font-family: var(--font-mono), "IBM Plex Mono", ui-monospace, monospace;
  font-size: ${TYPE.cellMeta}pt;
  letter-spacing: -0.01em;
  color: ${DOC.ink3};
  white-space: nowrap;
}
.concept { font-size: ${TYPE.cellMeta}pt; line-height: 1.35; }
/* Nada rompe de línea dentro de una fila de alto fijo: se recorta. Un dato
   recortado se nota; uno que desborda la fila descuadra la página entera. */
.clip { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.stack { display: flex; flex-direction: column; gap: 0.5mm; min-width: 0; }
.stack__a { font-size: ${TYPE.cell}pt; color: ${DOC.ink}; font-weight: 500; }
.stack__b { font-size: ${TYPE.cellMeta}pt; color: ${DOC.meta}; }
.stack__base { color: ${DOC.ink3}; }
.empty {
  font-size: ${TYPE.body}pt;
  line-height: ${LEADING.body};
  color: ${DOC.ink3};
  max-width: 130mm;
  text-wrap: pretty;
}

/* ── MODELO 721 ──────────────────────────────────────────────────────────── */
/* Sin color: no es una alerta, es el resultado de una comprobación. */
.s721__status { font-size: ${TYPE.body + 1.5}pt; font-weight: 600; color: ${DOC.ink}; }
.s721__why {
  font-size: ${TYPE.body}pt;
  line-height: ${LEADING.body};
  color: ${DOC.ink2};
  margin-top: 3mm;
  max-width: 150mm;
  text-wrap: pretty;
}
.s721__grid {
  margin-top: 6mm;
  display: grid;
  grid-template-columns: 1.4fr 1fr 1fr;
  gap: 6mm;
  padding: 5mm 6mm;
  background: ${DOC.band};
}

/* ── AVISO LEGAL Y METODOLOGÍA ───────────────────────────────────────────── */
.legal { max-width: 152mm; }
.legal p { font-size: ${TYPE.body}pt; line-height: ${LEADING.body}; color: ${DOC.ink2}; text-wrap: pretty; }
.legal p + p { margin-top: 3.5mm; }
.legal__lead { border-left: 0.9mm solid ${DOC.blueFill}; padding-left: 5mm; }
.note { margin-top: 5mm; }
.note__t { font-size: ${TYPE.sectionNote}pt; font-weight: 600; color: ${DOC.ink}; margin-bottom: 1.2mm; }
.note__b { font-size: ${TYPE.sectionNote}pt !important; line-height: 1.5 !important; color: ${DOC.ink3} !important; }

.colophon {
  margin-top: 12mm;
  padding-top: 4mm;
  border-top: 0.3mm solid ${DOC.rule};
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8mm;
}
.colophon__t { display: flex; flex-direction: column; align-items: flex-end; gap: 1mm; font-size: ${TYPE.footer}pt; color: ${DOC.meta}; }
.colophon__file { font-family: var(--font-mono), ui-monospace, monospace; color: ${DOC.ink3}; }
`;
