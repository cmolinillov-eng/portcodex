import Link from "next/link";
import { PortCodexLogo } from "@/components/brand/portcodex-logo";
import { Reveal } from "./Reveal";
import { StepsSpine } from "./StepsSpine";
import { CountUpFigure } from "./CountUpFigure";
import { SplitLedger } from "./SplitLedger";
import { ProductPlate } from "./ProductPlate";
import { LEGAL_DOCS } from "@/components/legal/legal-docs";
import styles from "./landing.module.css";

/**
 * PORTADA COMERCIAL
 *
 * Carta de presentación, no embudo. PortCodex no se contrata desde la web: se
 * contrata a través de un gestor. De ahí que no haya precios, ni prueba
 * gratuita, ni urgencia fabricada. El único trabajo de esta página es que quien
 * la lea piense «esta gente sabe lo que hace» y escriba.
 *
 * Reglas que gobiernan el archivo (brief de marca, partes 6 a 8):
 *   · Ancho útil 1200 px. Alineación IZQUIERDA salvo apertura y cierre.
 *   · Ninguna rejilla de tres columnas con icono, título y párrafo.
 *   · Ningún icono decorativo: aquí no hay ni uno.
 *   · Las secciones NO miden lo mismo. Apertura vacía · contabilidad densa ·
 *     fiscal calmada · cierre vacío del todo.
 *   · Un acento por pantalla: el azul solo en el botón principal, en la espina
 *     de los pasos y en el botón del cierre.
 *   · Ni una cifra inventada. Las que aparecen son las de la cartera de
 *     DEMOSTRACIÓN de `/preview`, las mismas que se ven en las capturas.
 *   · Ninguna promesa fiscal: el cálculo es orientativo y lo firma un asesor.
 */

const PASOS = [
  {
    number: "01",
    title: "Conectas tus wallets",
    body: "Basta la dirección pública. Solo lectura: PortCodex nunca puede mover fondos.",
  },
  {
    number: "02",
    title: "Lee tus posiciones",
    body: "Wallets, pools de liquidez, staking y préstamos. En Solana, en Bitcoin y en las principales redes EVM.",
  },
  {
    number: "03",
    title: "Mantiene el libro al día",
    body: "Cada aportación, retirada, rendimiento y cierre queda registrado en su sitio, con su fecha y su plataforma.",
  },
];

export function LandingContent() {
  return (
    <div className={styles.page}>
      {/* ── NAVEGACIÓN ──────────────────────────────────────────────────────
          Barra plana, no flotante y no pegajosa. La identidad pide calma: nada
          debe seguir moviéndose mientras se lee. */}
      <header className={styles.wrap}>
        <nav className={styles.nav}>
          <Link href="/" aria-label="PortCodex, inicio">
            <PortCodexLogo variant="principal" size={26} clearSpace={false} />
          </Link>
          <Link href="/login" className={styles.navAccess}>
            Acceder
          </Link>
        </nav>
      </header>

      {/* Sin JavaScript, `.reveal` se quedaría en `opacity: 0` y la portada
          entera quedaría en blanco: veintisiete bloques invisibles. Esto lo
          neutraliza sin añadir ningún script y sin parpadeo, porque el navegador
          solo aplica el bloque cuando de verdad no hay JS. */}
      <noscript>
        <style
          dangerouslySetInnerHTML={{
            __html: `.${styles.reveal}{opacity:1 !important;transform:none !important}`,
          }}
        />
      </noscript>

      <main>
        {/* ── 1 · APERTURA ─ «¿qué es esto?» ───────────────────────────────
            Muy vacía a propósito. Titular enorme, aire y dos acciones. */}
        <section className={`${styles.wrap} ${styles.secOpen}`} aria-labelledby="apertura">
          <Reveal>
            <h1 id="apertura" className={styles.h1} style={{ maxWidth: "17ch", marginInline: "auto" }}>
              Tu patrimonio digital, bien explicado.
            </h1>
          </Reveal>

          <Reveal delay={90}>
            <p
              className={styles.lead}
              style={{ marginInline: "auto", marginTop: "var(--space-7)" }}
            >
              PortCodex reúne tus posiciones, mantiene la contabilidad al día y anticipa el
              impacto fiscal de cada operación.
            </p>
          </Reveal>

          <Reveal delay={180}>
            <div
              className={`${styles.ctaRow} ${styles.ctaRowCenter}`}
              style={{ marginTop: "var(--space-9)" }}
            >
              <a href="#solicitar" className={styles.ctaPrimary}>
                Solicitar información
              </a>
              <a href="#lectura" className={styles.ctaQuiet}>
                Ver cómo funciona
              </a>
            </div>
          </Reveal>

          {/* La objeción más grande, resuelta antes de que aparezca. No es un
              pie de tres palabras abstractas: es el dato que decide. */}
          <Reveal delay={260}>
            <p className={styles.meta} style={{ marginTop: "var(--space-8)" }}>
              Solo lectura. PortCodex no puede mover fondos.
            </p>
          </Reveal>
        </section>

        {/* ── 2 · EL PROBLEMA ─ «¿por qué me importa?» ─────────────────────
            Lista editorial en columna con numeración discreta y un filo entre
            apuntes. El primero pesa más que los otros dos. */}
        <section className={`${styles.wrap} ${styles.ruleTop} ${styles.secProblem}`} aria-labelledby="problema">
          <Reveal>
            <h2 id="problema" className={styles.h2} style={{ maxWidth: "26ch" }}>
              El patrimonio está repartido. La información, también.
            </h2>
          </Reveal>

          <Reveal delay={80}>
            <p className={styles.body} style={{ marginTop: "var(--space-6)" }}>
              Cada wallet cuenta una parte. Cada protocolo, otra. Y ninguna suma el total, ni
              distingue lo que has ganado de lo que solo has movido de sitio.
            </p>
          </Reveal>

          <ol className={styles.editorialList}>
            <Reveal as="li" className={styles.editorialItem}>
              <span className={styles.editorialIndex}>01</span>
              <div>
                <p className={styles.editorialTitleLead}>
                  Saldos en varias redes que nunca se suman solos.
                </p>
                <p className={styles.editorialNote} style={{ marginTop: "var(--space-3)" }}>
                  El total se hace a mano, en una hoja de cálculo que envejece el mismo día en
                  que se cierra.
                </p>
              </div>
            </Reveal>

            <Reveal as="li" className={styles.editorialItem} delay={90}>
              <span className={styles.editorialIndex}>02</span>
              <div>
                <p className={styles.editorialTitle}>
                  Rendimiento y capital, dentro de la misma cifra.
                </p>
                <p className={styles.editorialNote} style={{ marginTop: "var(--space-2)" }}>
                  Si el saldo sube, no sabes si has ganado o si has metido más.
                </p>
              </div>
            </Reveal>

            {/* Sin explicación: es el apunte que remata. */}
            <Reveal as="li" className={styles.editorialItem} delay={180}>
              <span className={styles.editorialIndex}>03</span>
              <div>
                <p className={styles.editorialTitle}>Y en abril, operaciones sin registrar.</p>
              </div>
            </Reveal>
          </ol>
        </section>

        {/* ── 3 · LA LECTURA ─ «¿cómo lo resuelve?» ────────────────────────
            Aquí sí conviene mover algo: una línea fina de acento recorre los
            tres pasos según avanzas. */}
        <section className={`${styles.wrap} ${styles.secSteps}`} aria-labelledby="lectura">
          <Reveal>
            <h2 id="lectura" className={`${styles.h2} ${styles.stepsHead}`}>
              Se conecta, lee y ordena. Sin que tengas que apuntar nada.
            </h2>
          </Reveal>

          <StepsSpine steps={PASOS} />

          {/* Prueba concreta y comprobable, en el punto exacto donde alguien
              técnico pregunta «¿y esto lee de verdad lo mío?». */}
          <Reveal className={styles.stepsFoot}>
            <p className={styles.meta}>
              Con lectores propios para Kamino, Kamino Lend, Orca, Meteora, Jupiter Lend, Aave,
              Uniswap V3, PancakeSwap V3 y ProjectX. Lo que un lector propio todavía no cubre se
              lee como posición genérica, con su valor.
            </p>
          </Reveal>
        </section>

        {/* ── 4 · EL PRODUCTO ─ «enséñamelo» ───────────────────────────────
            El producto es el héroe. Captura real, un filo fino y nada más: sin
            marco de navegador, sin perspectiva, sin sombra. */}
        <section className={`${styles.wrap} ${styles.secProduct}`} aria-labelledby="producto">
          <div className={styles.productHead}>
            <Reveal>
              <h2 id="producto" className={styles.h2} style={{ maxWidth: "20ch" }}>
                El patrimonio, en una sola pantalla.
              </h2>
              <p className={styles.body} style={{ marginTop: "var(--space-6)" }}>
                Manda una cifra; el resto es su contexto. De dónde viene, en qué estrategias
                está repartido, cómo ha evolucionado frente a lo que aportaste y cuánto
                rendimiento espera sin reclamar.
              </p>
            </Reveal>

            <Reveal delay={120}>
              <CountUpFigure
                value={11191.3}
                unit="US$"
                label="Patrimonio total"
                delta="−754,89 US$ · −6,32 %"
                deltaNote="frente al total depositado"
              />
              <p className={styles.meta} style={{ marginTop: "var(--space-4)" }}>
                Cifras de la cartera de demostración, las mismas de la captura.
              </p>
            </Reveal>
          </div>

          <Reveal>
            <ProductPlate
              src="/landing/capturas/resumen.png"
              width={1440}
              height={1000}
              priority
              alt="Pantalla de Resumen de PortCodex. Arriba, el patrimonio total: 11.191,30 US$, con una variación de −754,89 US$ y −6,32 % frente al total depositado. Debajo, tres cifras en línea: depositado 11.946 US$, rendimiento 432 US$ y P&L −755 US$. Sigue la composición de la cartera, repartida entre Wallet (HODL) con 9.156,95 US$ y Liquidity Pools con 9.397,48 US$, y un gráfico de evolución del patrimonio frente al total depositado desde el 8 de enero al 28 de julio, con TWR +45,85 %, máxima caída −10,68 % y P&L acumulado 4.417,62 US$. Al pie, 28,02 US$ de rendimiento sin reclamar en tres posiciones."
              caption="Resumen · cartera de demostración"
            />
          </Reveal>

          {/* Leyenda de la captura: cuatro columnas de anchos distintos bajo un
              filo. Nombra qué mirar. Sin iconos y sin párrafos. */}
          <Reveal className={styles.legend} delay={60}>
            <p className={styles.legendItem}>Valor total y su evolución frente a lo aportado</p>
            <p className={styles.legendItem}>Reparto por tipo de posición</p>
            <p className={styles.legendItem}>P&amp;L separado del capital</p>
            <p className={styles.legendItem}>Rendimiento sin reclamar</p>
          </Reveal>

          <Reveal delay={120}>
            <ProductPlate
              src="/landing/capturas/cartera.png"
              width={1440}
              height={1100}
              small
              alt="Pantalla de Cartera de PortCodex: 14.217,63 US$ en 17 posiciones. La tabla de Liquidity Pools muestra tres posiciones con su saldo en cada token, lo depositado, el valor actual, el P&L y el rendimiento; por ejemplo pyUSD/USDC en Solana mediante Kamino con 7.960,28 US$ depositados, 7.962,11 US$ de valor actual, +1,83 US$ de P&L y 17,35 US$ sin reclamar. Debajo, la tabla de Hold con BTC, USDC, HYPE, SOL y WETH, cada uno con su red y su P&L, positivo en unos y negativo en otros."
              caption="Cartera · cada posición con su capital, su valor y su P&L. Conviven ganancias y pérdidas."
            />
          </Reveal>
        </section>

        {/* ── 5 · LA CONTABILIDAD ─ «esto es lo que nadie más hace» ────────
            La sección más importante y la más DENSA de la página: es el
            argumento. Banda propia, cuatro piezas de pesos distintos y el
            libro de movimientos como prueba. */}
        <section className={styles.secLedger} aria-labelledby="contabilidad">
          <div className={styles.wrap}>
            <div className={styles.ledgerHead}>
              <Reveal>
                <p className={styles.eyebrow} style={{ marginBottom: "var(--space-4)" }}>
                  La diferencia
                </p>
                <h2 id="contabilidad" className={styles.h2}>
                  No solo ve tus posiciones. Lleva tus cuentas.
                </h2>
              </Reveal>

              <Reveal className={styles.ledgerHeadText} delay={90}>
                <p className={styles.body}>
                  Un visor de carteras te dice cuánto tienes. PortCodex registra{" "}
                  <span className={styles.strong}>cómo has llegado hasta ahí</span>: qué
                  aportaste, qué rindió, qué movimiento fue solo un cambio de sitio y cuál fue
                  una operación real.
                </p>
              </Reveal>
            </div>

            <SplitLedger />

            <div className={styles.pieces}>
              <Reveal className={`${styles.piece} ${styles.pieceWide}`}>
                <h3 className={styles.pieceTitle}>Capital y rendimiento, separados.</h3>
                <p className={styles.pieceBody}>
                  El dinero que metes no se confunde con lo que genera. Son dos columnas del
                  libro, no una.
                </p>
              </Reveal>

              <Reveal className={`${styles.piece} ${styles.pieceNarrow}`} delay={70}>
                <h3 className={styles.pieceTitle}>
                  Los movimientos internos no inflan las cifras.
                </h3>
                <p className={styles.pieceBody}>
                  Pasar de una posición a otra cambia el sitio, no el patrimonio.
                </p>
              </Reveal>

              <Reveal className={`${styles.piece} ${styles.pieceNarrow}`} delay={140}>
                <h3 className={styles.pieceTitle}>Cierres detectados solos.</h3>
                <p className={styles.pieceBody}>
                  Al cerrar una posición, el capital vuelve a su wallet y el libro lo refleja.
                </p>
              </Reveal>

              {/* La única pieza con tarjeta: es la que casi nadie arrastra y la
                  que decide la ganancia el día que cierras. */}
              <Reveal
                className={`${styles.piece} ${styles.pieceStar} ${styles.pieceWide}`}
                delay={210}
              >
                <h3 className={styles.pieceTitle}>El coste de adquisición viaja.</h3>
                <p className={styles.pieceBody}>
                  Cuando rotas una posición, su base contable la acompaña. De eso depende la
                  ganancia el día que cierras, y es lo que se pierde en cuanto el registro se
                  lleva a mano.
                </p>
              </Reveal>
            </div>

            <Reveal delay={80}>
              <ProductPlate
                src="/landing/capturas/movimientos.png"
                width={1440}
                height={900}
                alt="Pantalla de Movimientos de PortCodex: 52 operaciones en 2026, agrupadas por día como un extracto bancario. Cada fila lleva el tipo de operación —harvest rewards, añadir liquidez, retirada, depósito—, la cantidad, el activo, la plataforma y la red, la hora, el valor en euros y su categoría fiscal: RCM staking, movimiento LP, GP permuta, pérdida patrimonial o no imponible."
                caption="Movimientos · el libro, agrupado por día. Cada apunte con su plataforma y su categoría fiscal."
              />
            </Reveal>
          </div>
        </section>

        {/* ── 6 · LO FISCAL ─ «¿y Hacienda?» ──────────────────────────────
            Sin movimiento. Esta sección debe sentirse un documento: filas,
            filos y las casillas como identificadores. */}
        <section className={`${styles.wrap} ${styles.secTax}`} aria-labelledby="fiscal">
          <div className={styles.taxHead}>
            <div>
              <Reveal>
                <h2 id="fiscal" className={styles.h2}>
                  La información fiscal, preparada antes de que la necesites.
                </h2>
                <p className={styles.body} style={{ marginTop: "var(--space-6)" }}>
                  Cada operación queda clasificada según su tratamiento. Consulta el resultado
                  del ejercicio en cualquier momento del año, no en abril.
                </p>
              </Reveal>
            </div>

            <Reveal className={styles.taxDoc} delay={80}>
              <div className={styles.taxRow}>
                <span className={styles.taxCasilla}>1800-1814</span>
                <p className={styles.taxText}>
                  Ganancias y pérdidas por FIFO, en euros al cambio del día.
                  <span className={styles.taxTextNote}>
                    También las permutas entre criptomonedas, que tributan aunque no pases por
                    euros.
                  </span>
                </p>
              </div>

              <div className={styles.taxRow}>
                <span className={styles.taxCasilla}>0027-0033</span>
                <p className={styles.taxText}>
                  Rendimientos identificados según su naturaleza.
                  <span className={styles.taxTextNote}>
                    Un harvest de staking no es lo mismo que una venta, y no va a la misma
                    casilla.
                  </span>
                </p>
              </div>

              <div className={styles.taxRow}>
                <span className={styles.taxCasilla}>Modelo 100</span>
                <p className={styles.taxText}>
                  Resumen por casillas, con el desglose por categoría y el número de operaciones
                  que suma cada una.
                </p>
              </div>

              <div className={styles.taxRow}>
                <span className={styles.taxCasilla}>Modelo 721</span>
                <p className={styles.taxText}>
                  Saldos en plataformas no residentes, con el umbral de 50.000 € a 31 de
                  diciembre.
                  <span className={styles.taxTextNote}>
                    Si no hay obligación de declarar, lo dice en una línea.
                  </span>
                </p>
              </div>

              <div className={styles.taxRow}>
                <span className={styles.taxCasilla}>Exportación</span>
                <p className={styles.taxText}>
                  Historial de operaciones en CSV e informe del ejercicio en PDF, pensado para
                  que lo abra tu asesor.
                </p>
              </div>
            </Reveal>
          </div>

          <ProductPlate
            src="/landing/capturas/fiscalidad.png"
            width={1440}
            height={900}
            alt="Pantalla de Fiscalidad de PortCodex para el ejercicio 2026, con 52 operaciones registradas. Base del ahorro: 161,37 €, de ganancias de transmisión y permuta y rendimientos de capital. Base general: 0,00 €. Debajo, el desglose por casilla del Modelo 100: la casilla 0027-0033 con 15 operaciones de RCM staking por 373,59 €, la 1800-1814 con 4 pérdidas patrimoniales por −225,62 € y 2 ganancias por permuta por 13,40 €. Al pie, el apartado del Modelo 721 indica que no hay obligación de declarar en este ejercicio porque los saldos en plataformas extranjeras no alcanzan el umbral de 50.000 €."
            caption="Fiscalidad · el ejercicio en curso, consultable en cualquier momento del año."
          />

          {/* Aviso obligatorio. En pequeño, sin ámbar y sin dramatismo: informa,
              no asusta ni promete. */}
          <p className={styles.disclaimer}>
            PortCodex organiza la información fiscal de tus operaciones. No sustituye el criterio
            de un asesor. El desglose por casillas es orientativo y se confirma con el modelo del
            año en curso.
          </p>
        </section>

        {/* ── 7 · PARA GESTORES ─ «yo llevo carteras de otros» ─────────────
            Sección corta a propósito: habla a un público concreto y no necesita
            más de lo que dice. */}
        <section className={`${styles.wrap} ${styles.ruleTop} ${styles.secManagers}`} aria-labelledby="gestores">
          <Reveal>
            <h2 id="gestores" className={styles.h2} style={{ maxWidth: "16ch" }}>
              Varias carteras. Un solo sitio.
            </h2>
            <p className={styles.body} style={{ marginTop: "var(--space-6)" }}>
              Supervisa las carteras que gestionas, cada una con su propia lectura, su
              contabilidad y sus informes. Tus clientes acceden solo a la suya, y cada operación
              queda trazada hasta su origen.
            </p>
          </Reveal>
          {/* PENDIENTE — no hay captura de la vista de gestor (`/manager`) en
              `public/landing/capturas/`. Hasta que exista, esta sección no
              enseña producto: prefiero un hueco a una interfaz dibujada. */}
        </section>

        {/* ── 8 · CONFIANZA ─ «¿me puedo fiar?» ───────────────────────────
            Afirmación de solidez, no advertencia. El titular es corto y seco a
            propósito: es lo que le da voz a la página. */}
        <section className={`${styles.wrap} ${styles.ruleTop} ${styles.secTrust}`} aria-labelledby="confianza">
          <div className={styles.trustHead}>
            <Reveal>
              <h2 id="confianza" className={`${styles.h2} ${styles.h2Short}`}>
                Solo lectura. Siempre.
              </h2>
            </Reveal>

            <Reveal className={styles.trustList} delay={80}>
              <div className={styles.trustRow}>
                <p className={styles.trustTerm}>PortCodex nunca puede mover tus fondos.</p>
                <p className={styles.trustDef}>Lee direcciones públicas. No firma nada.</p>
              </div>
              <div className={styles.trustRow}>
                <p className={styles.trustTerm}>Sin claves privadas.</p>
                <p className={styles.trustDef}>No se piden, no se guardan, no hacen falta.</p>
              </div>
              <div className={styles.trustRow}>
                <p className={styles.trustTerm}>Tus datos son tuyos.</p>
                <p className={styles.trustDef}>
                  Cada cartera está aislada de las demás, y quien accede a una no ve las otras.
                </p>
              </div>
              <div className={styles.trustRow}>
                <p className={styles.trustTerm}>Todo movimiento es trazable.</p>
                <p className={styles.trustDef}>
                  Cada apunte del libro guarda la operación de la que salió.
                </p>
              </div>
            </Reveal>
          </div>
        </section>

        {/* ── 9 · CIERRE ──────────────────────────────────────────────────
            Vacío del todo: un titular, el formulario mínimo y nada más. No hay
            registro; esto abre una conversación. */}
        <section className={`${styles.wrap} ${styles.ruleTop} ${styles.secClose}`} id="solicitar">
          <div className={styles.closeInner}>
            <Reveal>
              <h2 className={styles.h1} style={{ maxWidth: "22ch", marginInline: "auto" }}>
                Empieza por saber exactamente qué tienes.
              </h2>
              <p className={styles.lead} style={{ marginInline: "auto", marginTop: "var(--space-6)" }}>
                Cuéntanos cómo tienes repartido el patrimonio y te decimos si PortCodex encaja.
              </p>
            </Reveal>

            {/* PENDIENTE — el formulario no tiene destino. Falta decidir a dónde
                se envía (ruta de API con envío de correo, o buzón propio) y
                escribir la política de privacidad que exige recoger datos
                personales. Hasta entonces el envío queda desactivado: preferimos
                un botón honesto a un formulario que se traga lo que le
                escriban. NO añadir `action` ni `method` sin destino: sin `action`
                el navegador enviaría los datos en la URL de esta misma página. */}
            <form className={styles.form} aria-describedby="solicitar-estado">
              <div className={styles.formPair}>
                <div className={styles.field}>
                  <label className={styles.fieldLabel} htmlFor="nombre">
                    Nombre
                  </label>
                  <input
                    className={styles.input}
                    id="nombre"
                    name="nombre"
                    type="text"
                    autoComplete="name"
                    disabled
                  />
                </div>
                <div className={styles.field}>
                  <label className={styles.fieldLabel} htmlFor="correo">
                    Correo
                  </label>
                  <input
                    className={styles.input}
                    id="correo"
                    name="correo"
                    type="email"
                    autoComplete="email"
                    disabled
                  />
                </div>
              </div>

              <div className={styles.field}>
                <label className={styles.fieldLabel} htmlFor="situacion">
                  En qué situación estás
                </label>
                <textarea
                  className={styles.textarea}
                  id="situacion"
                  name="situacion"
                  rows={3}
                  disabled
                />
              </div>

              <div className={styles.formActions}>
                <button type="submit" className={styles.ctaPrimary} disabled>
                  Solicitar información
                </button>
                <span className={styles.meta} id="solicitar-estado">
                  El envío se activa al publicar la página.
                </span>
              </div>
            </form>
          </div>
        </section>
      </main>

      {/* ── PIE ────────────────────────────────────────────────────────────
          Solo lo que existe. Los cuatro documentos legales ya viven en `/legal`
          y se enlazan desde aquí.

          SIGUE PENDIENTE una dirección de contacto real: no se inventa un
          correo, así que no hay enlace de «Soporte». En cuanto exista el buzón,
          se añade aquí y en `AccessForm`, y se rellenan los marcadores `[[…]]`
          de las páginas legales. */}
      <footer className={styles.wrap}>
        <div className={styles.footer}>
          <div>
            <PortCodexLogo variant="corporativo" size={26} clearSpace={false} />
            <p className={styles.footerNote} style={{ marginTop: "var(--space-5)" }}>
              PortCodex organiza y explica la información de tus operaciones. No presta
              asesoramiento fiscal ni de inversión.
            </p>
          </div>
          <div className={styles.footerLinks}>
            {LEGAL_DOCS.map((doc) => (
              <Link key={doc.href} href={doc.href} className={styles.footerLink}>
                {doc.short}
              </Link>
            ))}
            <Link href="/login" className={styles.navAccess}>
              Acceder
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
